# base/consumers.py
import os
import json
import time
import re
import asyncio
from collections import defaultdict
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from channels.exceptions import StopConsumer
import redis
from base.views import cleanup_room_images
from base.screen_sharing_service import ScreenSharingService
from base.screen_sharing_handlers import ScreenSharingHandlers

# Максимальное количество участников в комнате
MAX_ROOM_SIZE = int(os.environ.get('MAX_ROOM_SIZE', '20'))

# Rate limiting: максимум сообщений в секунду
# Увеличено для WebRTC (много ICE кандидатов приходят быстро)
MAX_MESSAGES_PER_SECOND = 30  # Было 10 - недостаточно для WebRTC
RATE_LIMIT_WINDOW = 1.0  # секунды

# Валидные типы сообщений
VALID_MESSAGE_TYPES = {
    'join', 'user-joined', 'user-left', 'offer', 'answer', 'ice-candidate',
    'mic-active', 'mic-inactive', 'camera-enabled', 'camera-disabled',
    'request-camera-states', 'request-audio-states', 'audio-enabled', 'audio-disabled',
    'whiteboard-draw', 'whiteboard-object', 'whiteboard-cursor', 'whiteboard-clear',
    'turn-server-used',  # Для логирования используемых TURN серверов
    'turn-test-start',   # Начало тестирования TURN серверов
    'turn-test-complete', # Завершение тестирования TURN серверов
    'screen-share-start', 'screen-share-stop', 'screen-share-request-state'  # Демонстрация экрана
}

# Валидация UID: только буквы, цифры, дефисы и подчеркивания, максимум 50 символов
UID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')

# Валидация room_name: только буквы, цифры, дефисы и подчеркивания, максимум 100 символов
ROOM_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,100}$')

# Счетчик участников в комнатах (в памяти, для простоты)
# В продакшене лучше использовать Redis
room_user_count = defaultdict(int)

# Redis клиент для хранения состояния доски
def get_redis_client():
    """Получить Redis клиент для хранения состояния доски"""
    try:
        return redis.Redis(host='127.0.0.1', port=6379, db=0, decode_responses=True)
    except Exception as e:
        print(f"[Whiteboard] Error connecting to Redis: {e}")
        return None


class VideoCallConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user_uid = None  # Сохраняем UID пользователя при подключении
        self.message_timestamps = []  # Для rate limiting
        self.channel_layer = get_channel_layer()
        self.pending_messages = []  # Очередь сообщений для батчинга
        self.last_flush_time = time.time()
        self.flush_interval = 0.1  # Флеш каждые 100ms для батчинга
    
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        
        # Валидация имени комнаты
        if not ROOM_NAME_PATTERN.match(self.room_name):
            await self.close(code=4001)  # Invalid room name
            return
        
        self.room_group_name = f"video_call_{self.room_name}"
        
        # Проверка размера комнаты
        # Примечание: точная проверка количества участников требует дополнительной логики
        # (например, хранение счетчика в Redis). Для простоты проверяем при join сообщении.
        # Ограничение будет применяться на уровне rate limiting и валидации.

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()
        
        # Notify all other users about new user joining
        # We'll send the user-joined message after they send their join message

    async def disconnect(self, close_code):
        """⚠️ КРИТИЧНО: Полная очистка всех соединений при отключении"""
        # Сохраняем user_uid ПЕРЕД очисткой для логирования
        user_uid_for_log = self.user_uid
        print(f"[Cleanup] Starting cleanup for user {user_uid_for_log} in room {self.room_name}")
        
        # 1. Очищаем очередь сообщений
        self.pending_messages.clear()
        
        # 2. Уменьшаем счетчик участников при отключении
        if self.room_group_name in room_user_count:
            current_count = room_user_count.get(self.room_group_name, 0)
            if current_count is not None:
                room_user_count[self.room_group_name] = max(0, int(current_count) - 1)
            else:
                room_user_count[self.room_group_name] = 0
            # Удаляем запись если комната пуста
            if room_user_count.get(self.room_group_name, 0) == 0:
                del room_user_count[self.room_group_name]
                print(f"[Cleanup] Room {self.room_name} is now empty")
                # Очищаем состояние доски когда комната становится пустой
                await self._clear_whiteboard_state()
                # Очищаем состояние демонстрации экрана
                ScreenSharingService.cleanup_room(self.room_name)
        
        # 3. Если отключается пользователь, который демонстрировал экран, останавливаем демонстрацию
        if user_uid_for_log:
            sharing_user = ScreenSharingService.get_sharing_user(self.room_name)
            if sharing_user == user_uid_for_log:
                ScreenSharingService.force_stop_sharing(self.room_name)
                # Уведомляем остальных пользователей
                try:
                    await asyncio.wait_for(
                        self.channel_layer.group_send(
                            self.room_group_name,
                            {
                                "type": "webrtc_signal",
                                "message": {
                                    "type": "screen-share-stopped",
                                    "from": user_uid_for_log,
                                    "room": self.room_name,
                                    "sharing_user": user_uid_for_log,
                                    "reason": "user_disconnected"
                                },
                                "sender_channel": self.channel_name,
                                "target_id": None,
                            }
                        ),
                        timeout=0.5
                    )
                except (asyncio.TimeoutError, Exception) as e:
                    print(f"[Cleanup] Error notifying screen share stop (non-critical): {e}")
        
        # 3. Отправляем user-left сообщение (если есть UID) - БЕЗ задержки, с таймаутом
        if user_uid_for_log:
            try:
                # Отправляем сообщение асинхронно, но не ждем долго
                await asyncio.wait_for(
                    self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "webrtc_signal",
                            "message": {
                                "type": "user-left",
                                "uid": user_uid_for_log,
                                "room": self.room_name
                            },
                            "sender_channel": self.channel_name,
                            "target_id": None,  # Broadcast
                        }
                    ),
                    timeout=0.5  # Таймаут 500ms
                )
            except asyncio.TimeoutError:
                print(f"[Cleanup] Timeout sending user-left (non-critical)")
            except Exception as e:
                print(f"[Cleanup] Error sending user-left (non-critical): {e}")
        
        # 4. Удаляем из группы - с таймаутом
        try:
            await asyncio.wait_for(
                self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
                ),
                timeout=0.5  # Таймаут 500ms
            )
            print(f"[Cleanup] Removed channel {self.channel_name} from group {self.room_group_name}")
        except asyncio.TimeoutError:
            print(f"[Cleanup] Timeout in group_discard (non-critical)")
        except Exception as e:
            print(f"[Cleanup] Error in group_discard (non-critical): {e}")
        
        # 5. Redis очистка - выносим в фоновую задачу, чтобы не блокировать disconnect
        # Используем asyncio.create_task для неблокирующего выполнения
        if user_uid_for_log:
            asyncio.create_task(self._cleanup_redis_async(self.channel_name, self.room_group_name))
        
        # 6. Очищаем все локальные данные
        self.message_timestamps.clear()
        self.pending_messages.clear()
        # Очищаем user_uid ПОСЛЕ всех операций
        self.user_uid = None
        
        print(f"[Cleanup] Cleanup completed for user {user_uid_for_log} in room {self.room_name}")
        
        # 7. Явно завершаем consumer
        raise StopConsumer()
    
    async def _cleanup_redis_async(self, channel_name, room_group_name):
        """Асинхронная очистка Redis в фоне"""
        try:
            # Пытаемся использовать асинхронный Redis клиент
            try:
                import redis.asyncio as aioredis
                r = aioredis.Redis(host='127.0.0.1', port=6379, db=0, decode_responses=False)
                
                try:
                    # Удаляем ключи канала
                    channel_key_pattern = f"asgi:channel:{channel_name}*"
                    deleted_count = 0
                    
                    async for key in r.scan_iter(match=channel_key_pattern):
                        try:
                            await r.delete(key)
                            deleted_count += 1
                        except Exception as e:
                            print(f"[Cleanup] Error deleting key {key}: {e}")
                    
                    if deleted_count > 0:
                        print(f"[Cleanup] Deleted {deleted_count} channel keys for {channel_name}")
                    
                    # Очищаем групповые ключи если комната пуста
                    if room_group_name in room_user_count and room_user_count[room_group_name] == 0:
                        group_key_pattern = f"asgi:group:{room_group_name}*"
                        group_deleted = 0
                        async for key in r.scan_iter(match=group_key_pattern):
                            try:
                                await r.delete(key)
                                group_deleted += 1
                            except Exception as e:
                                print(f"[Cleanup] Error deleting group key {key}: {e}")
                        
                        if group_deleted > 0:
                            print(f"[Cleanup] Deleted {group_deleted} group keys for empty room")
                finally:
                    # Закрываем асинхронное соединение
                    await r.aclose()
            except ImportError:
                # Если aioredis не доступен, используем синхронный клиент в executor
                import redis
                loop = asyncio.get_event_loop()
                
                def cleanup_sync():
                    deleted_count = 0
                    r = None
                    try:
                        r = redis.Redis(host='127.0.0.1', port=6379, db=0, decode_responses=False)
                        for key in r.scan_iter(match=f"asgi:channel:{channel_name}*"):
                            try:
                                r.delete(key)
                                deleted_count += 1
                            except:
                                pass
                    except:
                        pass
                    finally:
                        # Синхронный клиент закрывается автоматически, но можно явно закрыть соединение
                        if r:
                            try:
                                r.close()
                            except:
                                pass
                    return deleted_count
                
                try:
                    deleted_count = await loop.run_in_executor(None, cleanup_sync)
                    if deleted_count > 0:
                        print(f"[Cleanup] Deleted {deleted_count} channel keys for {channel_name}")
                except Exception as e:
                    print(f"[Cleanup] Error in async Redis cleanup: {e}")
        except Exception as e:
            print(f"[Cleanup] Error in Redis cleanup (non-critical): {e}")

    def _check_rate_limit(self):
        """Проверка rate limiting с оптимизацией для WebRTC"""
        now = time.time()
        # Удаляем старые записи (старше окна)
        self.message_timestamps = [ts for ts in self.message_timestamps if now - ts < RATE_LIMIT_WINDOW]
        
        # Проверяем лимит
        if len(self.message_timestamps) >= MAX_MESSAGES_PER_SECOND:
            return False
        
        # Добавляем текущее время
        self.message_timestamps.append(now)
        return True
    
    def _validate_message(self, data):
        """Валидация сообщения"""
        # Проверка типа сообщения
        message_type = data.get("type")
        if not message_type or message_type not in VALID_MESSAGE_TYPES:
            return False, "Invalid message type"
        
        # Валидация sender_id/uid
        sender_id = data.get("from") or data.get("uid")
        if sender_id and not UID_PATTERN.match(str(sender_id)):
            return False, "Invalid sender UID"
        
        # Валидация target_id (если есть)
        target_id = data.get("to")
        if target_id and not UID_PATTERN.match(str(target_id)):
            return False, "Invalid target UID"
        
        # Валидация room (если есть)
        room = data.get("room")
        if room and not ROOM_NAME_PATTERN.match(str(room)):
            return False, "Invalid room name"
        
        # Валидация размера данных для специфичных типов
        if message_type in ['offer', 'answer']:
            if 'offer' in data and len(str(data['offer'])) > 10000:
                return False, "Offer/Answer too large"
        
        if message_type == 'ice-candidate':
            if 'candidate' in data and len(str(data['candidate'])) > 1000:
                return False, "ICE candidate too large"
        
        return True, None

    async def _flush_pending_messages(self, force=False):
        """Флеш накопленных сообщений (батчинг для ICE кандидатов)"""
        if not self.pending_messages:
            return
        
        now = time.time()
        # Флешим если принудительно, прошло достаточно времени или накопилось много сообщений
        # При 3+ пользователях уменьшаем порог для более частого флеша
        if not force and now - self.last_flush_time < self.flush_interval and len(self.pending_messages) < 15:
            return
        
        # При множественных соединениях уменьшаем размер батча для более частой отправки
        batch_size = 30  # Было 50 - уменьшено для 3+ пользователей
        messages_to_send = self.pending_messages[:batch_size]
        self.pending_messages = self.pending_messages[batch_size:]
        self.last_flush_time = now
        
        # Отправляем батч сообщений напрямую в channel_layer
        for msg_data in messages_to_send:
            try:
                message_type = msg_data.get("type")
                target_id = msg_data.get("to")
                
                if message_type in ['user-joined', 'mic-active', 'mic-inactive', 'camera-enabled', 'camera-disabled', 
                                   'request-camera-states', 'whiteboard-draw', 'whiteboard-object', 'whiteboard-cursor', 
                                   'whiteboard-clear'] or not target_id:
                    # Broadcast
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "webrtc_signal",
                            "message": msg_data,
                            "sender_channel": self.channel_name,
                            "target_id": None,
                        }
                    )
                else:
                    # Send to specific target
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "webrtc_signal",
                            "message": msg_data,
                            "sender_channel": self.channel_name,
                            "target_id": target_id,
                        }
                    )
            except Exception as e:
                if 'capacity' in str(e).lower() or 'rate limit' in str(e).lower():
                    print(f"[WebRTC] Batched message dropped due to capacity (non-critical)")
                else:
                    print(f"[WebRTC] Error sending batched message: {e}")
    
    async def _send_message_internal(self, message_data):
        """Внутренний метод для отправки сообщения с приоритизацией"""
        message_type = message_data.get("type")
        target_id = message_data.get("to")
        
        # КРИТИЧЕСКИЕ сообщения (offer, answer, user-joined, user-left) отправляем СРАЗУ
        # Батчим только ice-candidate для снижения нагрузки
        if message_type == 'ice-candidate':
            self.pending_messages.append(message_data)
            # Флешим если накопилось много (15 для 3+ пользователей) или прошло время
            # При 3+ пользователях уменьшаем порог для более частого флеша
            flush_threshold = 15  # Было 20
            if len(self.pending_messages) >= flush_threshold:
                await self._flush_pending_messages(force=True)
            return
        
        # КРИТИЧЕСКИЕ сообщения (offer, answer) отправляем СРАЗУ без батчинга
        # Остальные сообщения также отправляем сразу
        if message_type in ['offer', 'answer']:
            # Критические сообщения - отправляем немедленно
            try:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "webrtc_signal",
                        "message": message_data,
                        "sender_channel": self.channel_name,
                        "target_id": target_id,
                    }
                )
            except Exception as e:
                # Для критических сообщений логируем ошибку, но не игнорируем
                print(f"[WebRTC] ERROR sending critical {message_type} to {target_id}: {e}")
                raise  # Пробрасываем ошибку для критических сообщений
        elif message_type in ['user-joined', 'user-left', 'mic-active', 'mic-inactive', 'camera-enabled', 'camera-disabled', 
                           'request-camera-states', 'whiteboard-draw', 'whiteboard-object', 'whiteboard-cursor', 
                           'whiteboard-clear'] or not target_id:
            # Broadcast - отправляем сразу
            try:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "webrtc_signal",
                        "message": message_data,
                        "sender_channel": self.channel_name,
                        "target_id": None,
                    }
                )
            except Exception as e:
                if 'capacity' in str(e).lower() or 'rate limit' in str(e).lower():
                    print(f"[WebRTC] Channel capacity exceeded for {message_type}, message dropped (non-critical)")
                else:
                    raise
        else:
            # Send to specific target
            try:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "webrtc_signal",
                        "message": message_data,
                        "sender_channel": self.channel_name,
                        "target_id": target_id,
                    }
                )
            except Exception as e:
                if 'capacity' in str(e).lower() or 'rate limit' in str(e).lower():
                    print(f"[WebRTC] Channel capacity exceeded for {message_type}, message dropped (non-critical)")
                else:
                    raise

    # Receive WebRTC signaling message from WebSocket
    async def receive(self, text_data):
        # Rate limiting
        if not self._check_rate_limit():
            print(f"Rate limit exceeded for channel {self.channel_name}")
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Rate limit exceeded. Please slow down."
            }))
            return
        
        # Оптимизация: проверяем размер сообщения с учетом типа
        # Ограничиваем размер для предотвращения перегрузки
        # Для изображений на доске нужен больший лимит (до 10MB)
        MAX_MESSAGE_SIZE = 100 * 1024  # По умолчанию 100KB
        text_data_json = None  # Инициализируем переменную
        
        # Сначала пытаемся определить тип сообщения через быстрый парсинг
        # Это нужно для установки правильного лимита размера
        try:
            # Пытаемся распарсить JSON для определения типа
            text_data_json = json.loads(text_data)
            
            # Проверяем тип сообщения и устанавливаем соответствующий лимит
            message_type = text_data_json.get('type', '')
            if message_type == 'whiteboard-object':
                data = text_data_json.get('data', {})
                event_type = data.get('eventType', '')
                obj = data.get('object', {})
                obj_type = obj.get('type', '')
                
                # Если это добавление изображения, увеличиваем лимит
                if event_type == 'object-added' and obj_type in ['image', 'Image']:
                    MAX_MESSAGE_SIZE = 10 * 1024 * 1024  # 10MB для изображений
                    print(f"[Whiteboard] Image detected, allowing up to 10MB")
                elif message_type == 'whiteboard-object':
                    # Для других объектов whiteboard тоже увеличиваем лимит (могут быть большие объекты)
                    MAX_MESSAGE_SIZE = 5 * 1024 * 1024  # 5MB для других объектов whiteboard
            elif message_type == 'whiteboard-draw':
                # Для рисования тоже может быть большой размер (много точек)
                MAX_MESSAGE_SIZE = 2 * 1024 * 1024  # 2MB для рисования
        except (json.JSONDecodeError, KeyError, AttributeError):
            # Если не удалось распарсить, используем стандартный лимит
            # Но сначала проверим размер, чтобы не парсить очень большие невалидные сообщения
            if len(text_data) > 100 * 1024:
                # Пытаемся определить тип через поиск строк (fallback)
                if 'whiteboard-object' in text_data and ('image' in text_data.lower() or 'Image' in text_data):
                    MAX_MESSAGE_SIZE = 10 * 1024 * 1024  # 10MB для изображений
                    print(f"[Whiteboard] Large message detected as image (fallback), allowing up to 10MB")
        
        # Теперь проверяем размер с установленным лимитом
        if len(text_data) > MAX_MESSAGE_SIZE:
            print(f"Message too large: {len(text_data)} bytes (max: {MAX_MESSAGE_SIZE}), ignoring")
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": f"Message too large (max {MAX_MESSAGE_SIZE // 1024}KB)"
            }))
            return
        
        # Флешим накопленные сообщения перед обработкой нового (принудительно)
        await self._flush_pending_messages(force=True)
        
        # Если JSON еще не распарсен, парсим его
        if text_data_json is None:
            try:
                text_data_json = json.loads(text_data)
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON: {e}")
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "message": "Invalid JSON"
                }))
                return
        
        # Валидация сообщения
        is_valid, error_msg = self._validate_message(text_data_json)
        if not is_valid:
            print(f"Invalid message: {error_msg}")
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": error_msg
            }))
            return
        
        message_type = text_data_json.get("type")
        sender_id = text_data_json.get("from") or text_data_json.get("uid")
        target_id = text_data_json.get("to")
        
        # Handle 'join' message - convert to 'user-joined' and broadcast
        if message_type == 'join':
            # Проверка размера комнаты перед присоединением
            if room_user_count[self.room_group_name] >= MAX_ROOM_SIZE:
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "message": "Room is full"
                }))
                await self.close(code=4002)  # Room is full
                return
            
            # Увеличиваем счетчик участников
            room_user_count[self.room_group_name] += 1
            
            # Сохраняем UID пользователя для использования при disconnect
            self.user_uid = sender_id
            
            # Получаем имя пользователя
            user_name = text_data_json.get("name") or "User"
            
            # Логируем подключение пользователя
            print(f"[User Join] User {sender_id} ({user_name}) joined room {self.room_name}")
            print(f"[User Join] Room {self.room_name} now has {room_user_count[self.room_group_name]} users")
            
            # Broadcast user-joined to all other users с именем
            await self._send_message_internal({
                        "type": "user-joined",
                        "uid": sender_id,
                "name": user_name,  # Передаем имя пользователя
                        "room": text_data_json.get("room")
            })
            
            # Отправляем состояние доски новому пользователю
            await self._send_whiteboard_state(sender_id)
            
            # Отправляем состояние демонстрации экрана новому пользователю
            sharing_state = ScreenSharingService.get_sharing_state(self.room_name)
            if sharing_state:
                await self._send_message_internal({
                    "type": "screen-share-state",
                    "from": "system",
                    "to": sender_id,
                    "is_active": True,
                    "sharing_user": sharing_state['sharing_user_uid']
                })
        # Handle 'user-left' message - broadcast immediately
        elif message_type == 'user-left':
            # Broadcast user-left immediately to all users
            await self._send_message_internal(text_data_json)
        elif message_type == 'turn-server-used':
            # Логируем используемый TURN сервер (не пересылаем другим пользователям)
            turn_server = text_data_json.get('turn_server', 'Unknown')
            protocol = text_data_json.get('protocol', 'Unknown')
            address = text_data_json.get('address', 'Unknown')
            target_uid = text_data_json.get('to', 'Unknown')
            sender_uid = text_data_json.get('from', 'Unknown')
            print(f"[TURN Server] User {sender_uid} using {turn_server} ({protocol}) for connection to {target_uid} (address: {address})")
            # Не пересылаем это сообщение другим пользователям - это только для логирования
        elif message_type == 'turn-test-start':
            # Логируем начало тестирования TURN серверов
            sender_uid = text_data_json.get('from', 'Unknown')
            servers_count = text_data_json.get('servers_count', 0)
            servers = text_data_json.get('servers', [])
            print(f"[TURN Test] 🚀 User {sender_uid} starting TURN server tests ({servers_count} servers)")
            if servers:
                print(f"[TURN Test] Servers to test: {', '.join(servers)}")
        elif message_type == 'turn-test-complete':
            # Логируем результаты тестирования TURN серверов
            sender_uid = text_data_json.get('from', 'Unknown')
            success = text_data_json.get('success', False)
            working_servers = text_data_json.get('working_servers', 0)
            total_servers = text_data_json.get('total_servers', 0)
            duration_ms = text_data_json.get('duration_ms', 0)
            selected_server = text_data_json.get('selected_server', 'Unknown')
            selected_latency = text_data_json.get('selected_latency', 0)
            from_cache = text_data_json.get('from_cache', False)
            
            if from_cache:
                print(f"[TURN Test] 💾 User {sender_uid} using cached TURN server configuration")
                print(f"[TURN Test] Cached servers: {working_servers}/{total_servers} servers")
                print(f"[TURN Test] Selected from cache: {selected_server}")
            elif success:
                print(f"[TURN Test] ✅ User {sender_uid} completed tests: {working_servers}/{total_servers} servers working")
                print(f"[TURN Test] Selected: {selected_server} ({selected_latency:.0f}ms) in {duration_ms:.0f}ms")
            else:
                print(f"[TURN Test] ❌ User {sender_uid} tests failed: 0/{total_servers} servers working (fallback used)")
                print(f"[TURN Test] Duration: {duration_ms:.0f}ms")
            
            # Логируем детальные результаты если есть
            all_results = text_data_json.get('all_results', [])
            if all_results:
                print(f"[TURN Test] Detailed results:")
                for result in all_results:
                    status = "✅" if result.get('success') else "❌"
                    reason = f" ({result.get('reason')})" if result.get('reason') else ""
                    latency = result.get('latency', 0)
                    if from_cache and latency == 0:
                        latency_str = "cached"
                    else:
                        latency_str = f"{latency:.0f}ms"
                    print(f"   {status} {result.get('name')}: {latency_str}{reason}")
        elif message_type == 'screen-share-start':
            # Обработка запроса на начало демонстрации экрана
            result = await ScreenSharingHandlers.handle_screen_share_start(self, text_data_json)
            if result.get('type') == 'screen-share-started':
                # Broadcast всем пользователям
                await self._send_message_internal(result)
            elif result.get('type') == 'screen-share-error':
                # Отправляем ошибку только запросившему пользователю
                await self._send_message_internal(result)
        elif message_type == 'screen-share-stop':
            # Обработка запроса на остановку демонстрации экрана
            result = await ScreenSharingHandlers.handle_screen_share_stop(self, text_data_json)
            if result.get('type') == 'screen-share-stopped':
                # Broadcast всем пользователям
                await self._send_message_internal(result)
            elif result.get('type') == 'screen-share-error':
                # Отправляем ошибку только запросившему пользователю
                await self._send_message_internal(result)
        elif message_type == 'screen-share-request-state':
            # Обработка запроса на получение состояния демонстрации экрана
            result = await ScreenSharingHandlers.handle_screen_share_request_state(self, text_data_json)
            # Отправляем состояние только запросившему пользователю
            await self._send_message_internal(result)
        else:
            # Сохраняем состояние доски для whiteboard-object, whiteboard-draw и whiteboard-clear
            if message_type in ['whiteboard-object', 'whiteboard-draw', 'whiteboard-clear']:
                # КРИТИЧНО: Логируем тип объекта перед сохранением и отправкой
                if message_type == 'whiteboard-object':
                    event_data = text_data_json.get("data", {})
                    event_type = event_data.get("eventType")
                    obj_data = event_data.get("object", {})
                    if event_type == 'object-added':
                        obj_type = obj_data.get('type', 'unknown')
                        obj_id = obj_data.get('id', 'no-id')
                        has_src = 'src' in obj_data
                        src_length = len(obj_data.get('src', '')) if has_src else 0
                        src_preview = obj_data.get('src', '')[:100] if has_src else ''  # Первые 100 символов для отладки
                        print(f"[Whiteboard] 📤 Forwarding object-added: type={obj_type}, id={obj_id}, has_src={has_src}, src_length={src_length}, src_preview={src_preview}")
                    elif event_type in ['object-modified', 'object-moving', 'object-scaling']:
                        obj_type = obj_data.get('type', 'unknown')
                        obj_id = obj_data.get('id', 'no-id')
                        has_src = 'src' in obj_data
                        src_length = len(obj_data.get('src', '')) if has_src else 0
                        src_preview = obj_data.get('src', '')[:100] if has_src else ''
                        print(f"[Whiteboard] 📤 Forwarding {event_type}: type={obj_type}, id={obj_id}, has_src={has_src}, src_length={src_length}, src_preview={src_preview}")
                
                await self._save_whiteboard_state(text_data_json)
            
            # Используем внутренний метод для отправки (с батчингом для ice-candidate)
            await self._send_message_internal(text_data_json)

    # Receive message from room group
    async def webrtc_signal(self, event):
        message = event["message"]
        sender_channel = event.get("sender_channel")
        target_id = event.get("target_id")

        # Send message to WebSocket (excluding sender)
        if self.channel_name != sender_channel:
            # If target_id is specified, include it in message for client-side filtering
            if target_id:
                message["_target"] = target_id
            try:
                await self.send(text_data=json.dumps(message))
            except Exception as e:
                # Игнорируем ошибки отправки - соединение может быть уже закрыто
                # Это нормально при отключении пользователя
                pass
    
    async def _save_whiteboard_state(self, message_data):
        """Сохранить состояние доски в Redis"""
        try:
            r = get_redis_client()
            if not r:
                return
            
            room_key = f"whiteboard_state:{self.room_name}"
            message_type = message_data.get("type")
            
            if message_type == 'whiteboard-clear':
                # Очищаем состояние доски
                r.delete(room_key)
                r.delete(f"{room_key}:objects")
                r.delete(f"{room_key}:paths")
                print(f"[Whiteboard] Cleared state for room {self.room_name}")
            elif message_type == 'whiteboard-draw':
                # Сохраняем путь рисования
                draw_data = message_data.get("data", {})
                path_json = json.dumps(draw_data)
                r.lpush(f"{room_key}:paths", path_json)
                r.expire(f"{room_key}:paths", 86400)
                print(f"[Whiteboard] Saved path to state for room {self.room_name}")
            elif message_type == 'whiteboard-object':
                # Сохраняем объект доски
                event_data = message_data.get("data", {})
                event_type = event_data.get("eventType")
                obj_data = event_data.get("object", {})
                
                if event_type == 'object-added':
                    # КРИТИЧНО: Логируем тип объекта перед сохранением
                    obj_type = obj_data.get('type', 'unknown')
                    obj_id = obj_data.get('id', 'no-id')
                    has_src = 'src' in obj_data
                    src_length = len(obj_data.get('src', '')) if has_src else 0
                    src_preview = obj_data.get('src', '')[:100] if has_src else ''  # Первые 100 символов для отладки
                    print(f"[Whiteboard] 📥 Received object-added: type={obj_type}, id={obj_id}, has_src={has_src}, src_length={src_length}, src_preview={src_preview}")
                    
                    # КРИТИЧНО: Если объект - Group с изображением, извлекаем изображение
                    if obj_type.lower() == 'group' and 'objects' in obj_data:
                        objects_in_group = obj_data.get('objects', [])
                        image_in_group = None
                        for obj in objects_in_group:
                            obj_type_lower = (obj.get('type', '') or '').lower()
                            has_image_type = obj_type_lower == 'image'
                            has_src_field = 'src' in obj or '_src' in obj or '_imageUrl' in obj
                            has_url_src = 'src' in obj and (obj['src'].startswith('/media/') or obj['src'].startswith('http://') or obj['src'].startswith('https://'))
                            if has_image_type or has_src_field or has_url_src:
                                image_in_group = obj
                                break
                        
                        if image_in_group:
                            print(f"[Whiteboard] ⚠️ Found image in Group, extracting image object")
                            # Извлекаем изображение из Group
                            image_data = {
                                **image_in_group,
                                'id': obj_id,  # Сохраняем ID группы
                                'left': obj_data.get('left', 0) + (image_in_group.get('left', 0) * obj_data.get('scaleX', 1)),
                                'top': obj_data.get('top', 0) + (image_in_group.get('top', 0) * obj_data.get('scaleY', 1)),
                                'scaleX': (image_in_group.get('scaleX', 1) * obj_data.get('scaleX', 1)),
                                'scaleY': (image_in_group.get('scaleY', 1) * obj_data.get('scaleY', 1)),
                                'angle': (image_in_group.get('angle', 0) + obj_data.get('angle', 0)),
                                'opacity': image_in_group.get('opacity', obj_data.get('opacity', 1))
                            }
                            # Принудительно устанавливаем тип на image
                            image_data['type'] = 'image'
                            # Убеждаемся, что src сохранен
                            if not image_data.get('src'):
                                image_data['src'] = image_in_group.get('_imageUrl') or image_in_group.get('_src') or image_in_group.get('src')
                            obj_data = image_data
                            obj_type = 'image'
                            print(f"[Whiteboard] ✅ Extracted image from Group, type: {obj_type}, has src: {'src' in obj_data}")
                    
                    # КРИТИЧНО: Если объект - изображение (даже если тип не указан явно), убеждаемся, что src сохранен
                    # Проверяем наличие src с URL для определения изображения
                    if obj_data.get('src') and (obj_data['src'].startswith('/media/') or obj_data['src'].startswith('http://') or obj_data['src'].startswith('https://')):
                        # Если это изображение, но тип не указан, устанавливаем тип
                        if obj_type.lower() != 'image':
                            obj_data['type'] = 'image'
                            obj_type = 'image'
                            print(f"[Whiteboard] ✅ Detected image by src URL, setting type to image")
                    
                    # Добавляем объект в список
                    obj_json = json.dumps(obj_data)
                    r.lpush(f"{room_key}:objects", obj_json)
                    # Устанавливаем TTL на 24 часа
                    r.expire(f"{room_key}:objects", 86400)
                    print(f"[Whiteboard] Saved object to state for room {self.room_name}, type: {obj_type}")
                elif event_type == 'object-removed':
                    # Удаляем объект из списка по ID
                    obj_id = obj_data.get("id")
                    if obj_id:
                        # Получаем все объекты, фильтруем и сохраняем обратно
                        objects = r.lrange(f"{room_key}:objects", 0, -1)
                        filtered_objects = [obj for obj in objects if json.loads(obj).get("id") != obj_id]
                        r.delete(f"{room_key}:objects")
                        if filtered_objects:
                            for obj in filtered_objects:
                                r.lpush(f"{room_key}:objects", obj)
                            r.expire(f"{room_key}:objects", 86400)
                        print(f"[Whiteboard] Removed object {obj_id} from state for room {self.room_name}")
                elif event_type in ['object-modified', 'object-moving', 'object-scaling']:
                    # КРИТИЧНО: Логируем получение события модификации
                    obj_type = obj_data.get('type', 'unknown')
                    obj_id = obj_data.get('id', 'no-id')
                    has_src = 'src' in obj_data
                    src_length = len(obj_data.get('src', '')) if has_src else 0
                    src_preview = obj_data.get('src', '')[:100] if has_src else ''
                    print(f"[Whiteboard] 📥 Received {event_type}: type={obj_type}, id={obj_id}, has_src={has_src}, src_length={src_length}, src_preview={src_preview}")
                    
                    # Обновляем объект в списке
                    obj_id = obj_data.get("id")
                    if obj_id:
                        objects = r.lrange(f"{room_key}:objects", 0, -1)
                        updated_objects = []
                        found = False
                        for obj_str in objects:
                            obj = json.loads(obj_str)
                            if obj.get("id") == obj_id:
                                updated_objects.append(json.dumps(obj_data))
                                found = True
                            else:
                                updated_objects.append(obj_str)
                        if found:
                            r.delete(f"{room_key}:objects")
                            for obj in updated_objects:
                                r.lpush(f"{room_key}:objects", obj)
                            r.expire(f"{room_key}:objects", 86400)
                            print(f"[Whiteboard] Updated object {obj_id} in state for room {self.room_name}")
                        else:
                            print(f"[Whiteboard] ⚠️ Object {obj_id} not found in state for {event_type}, cannot update")
        except Exception as e:
            print(f"[Whiteboard] Error saving state: {e}")
    
    async def _send_whiteboard_state(self, user_id):
        """Отправить состояние доски новому пользователю"""
        try:
            r = get_redis_client()
            if not r:
                return
            
            room_key = f"whiteboard_state:{self.room_name}"
            objects = r.lrange(f"{room_key}:objects", 0, -1)
            paths = r.lrange(f"{room_key}:paths", 0, -1)
            
            if not objects and not paths:
                print(f"[Whiteboard] No state to send for room {self.room_name}")
                return
            
            print(f"[Whiteboard] Sending {len(objects)} objects and {len(paths)} paths to new user {user_id} in room {self.room_name}")
            
            # Сначала отправляем пути рисования (они должны быть нарисованы первыми)
            for path_str in reversed(paths):  # reversed чтобы восстановить порядок рисования
                try:
                    path_data = json.loads(path_str)
                    path_id = path_data.get('id', 'no-id')
                    event_type = path_data.get('eventType', 'unknown')
                    has_path = 'path' in path_data
                    path_length = len(path_data.get('path', [])) if has_path else 0
                    print(f"[Whiteboard] 📤 Sending path to {user_id}: id={path_id}, eventType={event_type}, has_path={has_path}, path_length={path_length}")
                    message = {
                        "type": "whiteboard-draw",
                        "room": self.room_name,
                        "from": "system",
                        "data": path_data
                    }
                    await self.send(text_data=json.dumps(message))
                    await asyncio.sleep(0.01)
                except Exception as e:
                    print(f"[Whiteboard] Error sending path to {user_id}: {e}")
            
            # Затем отправляем объекты
            for obj_str in reversed(objects):  # reversed чтобы восстановить порядок добавления
                try:
                    obj_data = json.loads(obj_str)
                    obj_type = obj_data.get('type', 'unknown')
                    obj_id = obj_data.get('id', 'no-id')
                    has_src = 'src' in obj_data
                    src_length = len(obj_data.get('src', '')) if has_src else 0
                    src_preview = obj_data.get('src', '')[:100] if has_src else ''
                    print(f"[Whiteboard] 📤 Sending state object to {user_id}: type={obj_type}, id={obj_id}, has_src={has_src}, src_length={src_length}, src_preview={src_preview}")
                    message = {
                        "type": "whiteboard-object",
                        "room": self.room_name,
                        "from": "system",
                        "data": {
                            "eventType": "object-added",
                            "object": obj_data
                        }
                    }
                    await self.send(text_data=json.dumps(message))
                    # Небольшая задержка между отправками для предотвращения перегрузки
                    await asyncio.sleep(0.01)
                except Exception as e:
                    print(f"[Whiteboard] Error sending object to {user_id}: {e}")
            
            # КРИТИЧНО: Отправляем финальное сообщение о завершении восстановления состояния
            # Это позволяет клиенту знать, что все пути и объекты отправлены
            await asyncio.sleep(0.1)  # Небольшая задержка перед финальным сообщением
            try:
                final_message = {
                    "type": "whiteboard-state-restored",
                    "room": self.room_name,
                    "from": "system",
                    "data": {
                        "objects_count": len(objects),
                        "paths_count": len(paths)
                    }
                }
                await self.send(text_data=json.dumps(final_message))
                print(f"[Whiteboard] ✅ State restoration complete for {user_id}: {len(objects)} objects, {len(paths)} paths")
            except Exception as e:
                print(f"[Whiteboard] Error sending final state message to {user_id}: {e}")
        except Exception as e:
            print(f"[Whiteboard] Error sending state to {user_id}: {e}")
    
    async def _clear_whiteboard_state(self):
        """Очистить состояние доски когда комната становится пустой"""
        try:
            r = get_redis_client()
            if not r:
                return
            
            room_key = f"whiteboard_state:{self.room_name}"
            r.delete(room_key)
            r.delete(f"{room_key}:objects")
            r.delete(f"{room_key}:paths")
            print(f"[Whiteboard] Cleared state for empty room {self.room_name}")
            
            # Очищаем изображения комнаты
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, cleanup_room_images, self.room_name)
            print(f"[Whiteboard] Cleared images for empty room {self.room_name}")
        except Exception as e:
            print(f"[Whiteboard] Error clearing state: {e}")

