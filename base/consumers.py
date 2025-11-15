# base/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer


class VideoCallConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user_uid = None  # Сохраняем UID пользователя при подключении
    
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"video_call_{self.room_name}"

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()
        
        # Notify all other users about new user joining
        # We'll send the user-joined message after they send their join message

    async def disconnect(self, close_code):
        # Notify all users that this user left
        # Если у нас есть сохраненный UID, отправляем сообщение user-left
        if self.user_uid:
            try:
                # Отправляем сообщение СИНХРОННО перед удалением из группы
                # Это гарантирует, что сообщение будет доставлено до закрытия соединения
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "webrtc_signal",
                        "message": {
                            "type": "user-left",
                            "uid": self.user_uid,
                            "room": self.room_name
                        },
                        "sender_channel": self.channel_name,
                        "target_id": None,  # Broadcast
                    }
                )
                # Не добавляем задержку - group_send уже асинхронный и обработается
            except Exception as e:
                print(f"Error sending user-left on disconnect (non-critical): {e}")
        
        # Leave room group
        # Handle case when close_code is None or other errors
        try:
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
        except Exception as e:
            # Log error but don't fail - connection is already closing
            print(f"Error in disconnect (non-critical): {e}")

    # Receive WebRTC signaling message from WebSocket
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message_type = text_data_json.get("type")
        sender_id = text_data_json.get("from") or text_data_json.get("uid")
        target_id = text_data_json.get("to")
        
        # Handle 'join' message - convert to 'user-joined' and broadcast
        if message_type == 'join':
            # Сохраняем UID пользователя для использования при disconnect
            self.user_uid = sender_id
            
            # Broadcast user-joined to all other users
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "webrtc_signal",
                    "message": {
                        "type": "user-joined",
                        "uid": sender_id,
                        "room": text_data_json.get("room")
                    },
                    "sender_channel": self.channel_name,
                    "target_id": None,  # Broadcast
                }
            )
        # Handle 'user-left' message - broadcast immediately
        elif message_type == 'user-left':
            # Broadcast user-left immediately to all users
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "webrtc_signal",
                    "message": text_data_json,
                    "sender_channel": self.channel_name,
                    "target_id": None,  # Broadcast
                }
            )
        # For user-joined, mic-active, mic-inactive, camera-enabled, camera-disabled, request-camera-states - broadcast to all
        elif message_type in ['user-joined', 'mic-active', 'mic-inactive', 'camera-enabled', 'camera-disabled', 'request-camera-states'] or not target_id:
            # Broadcast to all (excluding sender)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "webrtc_signal",
                    "message": text_data_json,
                    "sender_channel": self.channel_name,
                    "target_id": None,  # Broadcast
                }
            )
        else:
            # Send to specific target (we'll filter in webrtc_signal)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "webrtc_signal",
                    "message": text_data_json,
                    "sender_channel": self.channel_name,
                    "target_id": target_id,  # Specific target
                }
            )

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
                pass

