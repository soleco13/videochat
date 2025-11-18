"""
Management команда для очистки устаревших каналов Redis.
Запускайте через cron каждые 5 минут:
*/5 * * * * cd /root/Video-chat-app-Django && source venv/bin/activate && python manage.py cleanup_channels
"""
from django.core.management.base import BaseCommand
from channels.layers import get_channel_layer
import redis
import time


class Command(BaseCommand):
    help = 'Очистка устаревших каналов Redis для предотвращения перегрузки'

    def add_arguments(self, parser):
        parser.add_argument(
            '--max-age',
            type=int,
            default=300,  # 5 минут по умолчанию
            help='Максимальный возраст канала в секундах (по умолчанию 300)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Показать что будет удалено без фактического удаления',
        )

    def handle(self, *args, **options):
        max_age = options['max_age']
        dry_run = options['dry_run']
        
        try:
            # Подключаемся к Redis напрямую
            r = redis.Redis(host='127.0.0.1', port=6379, db=0, decode_responses=False)
            
            # Проверяем подключение
            r.ping()
            
            self.stdout.write(f"Очистка каналов старше {max_age} секунд...")
            
            deleted_count = 0
            total_keys = 0
            current_time = time.time()
            
            # Сканируем все ключи каналов (channels_redis использует префикс asgi:)
            for key in r.scan_iter(match="asgi:*"):
                total_keys += 1
                
                # Получаем TTL ключа
                ttl = r.ttl(key)
                
                # Если TTL отрицательный (нет срока истечения) или больше max_age
                if ttl < 0:
                    # Проверяем время последнего обновления через OBJECT IDLETIME
                    try:
                        idle_time = r.object('idletime', key)
                        if idle_time and idle_time > max_age:
                            if not dry_run:
                                r.delete(key)
                            deleted_count += 1
                            self.stdout.write(
                                f"{'[DRY RUN] ' if dry_run else ''}Удален ключ: {key.decode('utf-8')} "
                                f"(idle: {idle_time}s)"
                            )
                    except Exception as e:
                        # Если не поддерживается, просто удаляем ключи без TTL
                        if not dry_run:
                            r.delete(key)
                        deleted_count += 1
                        self.stdout.write(
                            f"{'[DRY RUN] ' if dry_run else ''}Удален ключ без TTL: {key.decode('utf-8')}"
                        )
                elif ttl > max_age:
                    # Ключ существует слишком долго
                    if not dry_run:
                        r.delete(key)
                    deleted_count += 1
                    self.stdout.write(
                        f"{'[DRY RUN] ' if dry_run else ''}Удален ключ: {key.decode('utf-8')} (TTL: {ttl}s)"
                    )
            
            # Статистика Redis
            info = r.info('memory')
            used_memory = info.get('used_memory_human', 'N/A')
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"\n✅ Очистка завершена:\n"
                    f"   Всего ключей: {total_keys}\n"
                    f"   Удалено: {deleted_count}\n"
                    f"   Использовано памяти Redis: {used_memory}"
                )
            )
            
            # Предупреждение если слишком много ключей
            if total_keys > 1000:
                self.stdout.write(
                    self.style.WARNING(
                        f"⚠️ ВНИМАНИЕ: Слишком много ключей каналов ({total_keys})! "
                        f"Рекомендуется увеличить частоту очистки."
                    )
                )
                
        except redis.ConnectionError:
            self.stdout.write(
                self.style.ERROR("❌ Ошибка: Не удалось подключиться к Redis")
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Ошибка при очистке: {e}")
            )

