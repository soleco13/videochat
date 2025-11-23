# chat/consumers.py
import json
import urllib.parse
from channels.generic.websocket import AsyncWebsocketConsumer



class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        # Кодируем имя комнаты для использования в WebSocket группах (только ASCII)
        # Используем base64 для безопасного преобразования (без символов %, которые не разрешены)
        import base64
        # Кодируем в bytes, затем в base64, затем декодируем в строку
        # urlsafe_b64encode использует - и _, которые разрешены в именах групп
        room_name_bytes = self.room_name.encode('utf-8')
        encoded_room_name = base64.urlsafe_b64encode(room_name_bytes).decode('ascii').rstrip('=')
        # urlsafe_b64encode уже использует безопасные символы (- и _), которые разрешены
        self.room_group_name = f"chat_{encoded_room_name}"

        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        # Handle case when close_code is None or other errors
        # Проверяем, что room_group_name был установлен
        if not hasattr(self, 'room_group_name'):
            return
        try:
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        except Exception as e:
            # Log error but don't fail - connection is already closing
            print(f"Error in ChatConsumer disconnect (non-critical): {e}")

    # Receive message from WebSocket
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        username = text_data_json["user_name"]
        message = text_data_json["message"]

        # Send message to room group
        await self.channel_layer.group_send(
            self.room_group_name, {"type": "chat_message", "message": message,"user_name":username}
        )

    # Receive message from room group
    async def chat_message(self, event):
        message = event["message"]
        username = event["user_name"]

        # Send message to WebSocket
        await self.send(text_data=json.dumps({"message": message,"user_name":username}))