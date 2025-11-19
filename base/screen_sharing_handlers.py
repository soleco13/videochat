# base/screen_sharing_handlers.py
"""
Обработчики сообщений для демонстрации экрана.
Интегрируются с VideoCallConsumer для обработки WebSocket сообщений.
"""

import json
import logging
from typing import Dict, Any
from .screen_sharing_service import ScreenSharingService

logger = logging.getLogger(__name__)


class ScreenSharingHandlers:
    """Обработчики для сообщений демонстрации экрана"""
    
    @staticmethod
    async def handle_screen_share_start(consumer, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Обработать запрос на начало демонстрации экрана.
        
        Args:
            consumer: Экземпляр VideoCallConsumer
            message_data: Данные сообщения
            
        Returns:
            Dict с результатом обработки для отправки клиенту
        """
        room_name = consumer.room_name
        user_uid = message_data.get('from') or message_data.get('uid')
        
        if not user_uid:
            return {
                'type': 'error',
                'message': 'UID пользователя не указан'
            }
        
        # Проверяем через сервис
        result = ScreenSharingService.start_sharing(room_name, user_uid)
        
        if result['success']:
            # Уведомляем всех пользователей в комнате
            return {
                'type': 'screen-share-started',
                'from': user_uid,
                'room': room_name,
                'sharing_user': user_uid
            }
        else:
            # Отправляем ошибку только запросившему пользователю
            return {
                'type': 'screen-share-error',
                'from': 'system',
                'to': user_uid,
                'message': result['message'],
                'current_sharing_user': result.get('current_sharing_user')
            }
    
    @staticmethod
    async def handle_screen_share_stop(consumer, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Обработать запрос на остановку демонстрации экрана.
        
        Args:
            consumer: Экземпляр VideoCallConsumer
            message_data: Данные сообщения
            
        Returns:
            Dict с результатом обработки для отправки клиенту
        """
        room_name = consumer.room_name
        user_uid = message_data.get('from') or message_data.get('uid')
        
        if not user_uid:
            return {
                'type': 'error',
                'message': 'UID пользователя не указан'
            }
        
        # Останавливаем через сервис
        result = ScreenSharingService.stop_sharing(room_name, user_uid)
        
        if result['success']:
            # Уведомляем всех пользователей в комнате
            return {
                'type': 'screen-share-stopped',
                'from': user_uid,
                'room': room_name,
                'sharing_user': user_uid
            }
        else:
            # Отправляем ошибку только запросившему пользователю
            return {
                'type': 'screen-share-error',
                'from': 'system',
                'to': user_uid,
                'message': result['message']
            }
    
    @staticmethod
    async def handle_screen_share_request_state(consumer, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Обработать запрос на получение текущего состояния демонстрации экрана.
        
        Args:
            consumer: Экземпляр VideoCallConsumer
            message_data: Данные сообщения
            
        Returns:
            Dict с текущим состоянием
        """
        room_name = consumer.room_name
        user_uid = message_data.get('from') or message_data.get('uid')
        
        sharing_state = ScreenSharingService.get_sharing_state(room_name)
        
        if sharing_state:
            return {
                'type': 'screen-share-state',
                'from': 'system',
                'to': user_uid,
                'is_active': True,
                'sharing_user': sharing_state['sharing_user_uid']
            }
        else:
            return {
                'type': 'screen-share-state',
                'from': 'system',
                'to': user_uid,
                'is_active': False,
                'sharing_user': None
            }
    
    @staticmethod
    def validate_screen_share_message(message_data: Dict[str, Any]) -> tuple[bool, str]:
        """
        Валидировать сообщение демонстрации экрана.
        
        Args:
            message_data: Данные сообщения
            
        Returns:
            Tuple (is_valid, error_message)
        """
        message_type = message_data.get('type')
        
        if message_type not in ['screen-share-start', 'screen-share-stop', 'screen-share-request-state']:
            return False, f'Неизвестный тип сообщения: {message_type}'
        
        # Проверяем наличие обязательных полей
        if not message_data.get('from') and not message_data.get('uid'):
            return False, 'UID пользователя не указан'
        
        return True, ''

