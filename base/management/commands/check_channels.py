"""
Management команда для проверки состояния Redis каналов.
Запуск: python manage.py check_channels
"""
from django.core.management.base import BaseCommand
import redis


class Command(BaseCommand):
    help = 'Проверка состояния Redis каналов'

    def handle(self, *args, **options):
        try:
            r = redis.Redis(host='127.0.0.1', port=6379, db=0, decode_responses=False)
            
            # Проверяем подключение
            r.ping()
            
            # Общая информация
            info = r.info()
            used_memory = info.get('used_memory_human', 'N/A')
            connected_clients = info.get('connected_clients', 0)
            
            self.stdout.write("📊 Статистика Redis:")
            self.stdout.write(f"   Использовано памяти: {used_memory}")
            self.stdout.write(f"   Подключенных клиентов: {connected_clients}")
            
            # Количество ключей каналов
            total_keys = 0
            channel_keys = 0
            group_keys = 0
            
            for key in r.scan_iter(match="asgi:*"):
                total_keys += 1
                key_str = key.decode('utf-8')
                if ':channel:' in key_str:
                    channel_keys += 1
                elif ':group:' in key_str:
                    group_keys += 1
            
            self.stdout.write(f"\n📈 Ключи каналов:")
            self.stdout.write(f"   Всего ключей asgi:*: {total_keys}")
            self.stdout.write(f"   Каналы (channel): {channel_keys}")
            self.stdout.write(f"   Группы (group): {group_keys}")
            
            # Предупреждения
            if total_keys > 1000:
                self.stdout.write(
                    self.style.WARNING(
                        f"\n⚠️ ВНИМАНИЕ: Слишком много ключей каналов ({total_keys})! "
                        f"Рекомендуется запустить cleanup_channels."
                    )
                )
            elif total_keys > 500:
                self.stdout.write(
                    self.style.WARNING(
                        f"\n⚠️ Предупреждение: Много ключей каналов ({total_keys}). "
                        f"Рекомендуется периодическая очистка."
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(f"\n✅ Количество ключей в норме ({total_keys})")
                )
            
            # Проверка памяти
            if 'used_memory' in info:
                used_memory_bytes = info['used_memory']
                used_memory_mb = used_memory_bytes / (1024 * 1024)
                if used_memory_mb > 100:
                    self.stdout.write(
                        self.style.WARNING(
                            f"\n⚠️ Использовано много памяти Redis: {used_memory_mb:.2f} MB"
                        )
                    )
            
        except redis.ConnectionError:
            self.stdout.write(
                self.style.ERROR("❌ Ошибка: Не удалось подключиться к Redis")
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Ошибка: {e}")
            )

