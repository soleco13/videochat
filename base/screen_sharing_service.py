# base/screen_sharing_service.py
"""
Сервис для управления демонстрацией экрана в комнатах.
Обеспечивает, что только один пользователь может демонстрировать экран одновременно.
"""

from typing import Optional, Dict
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Хранилище состояния демонстрации экрана по комнатам
# Формат: {room_name: {'sharing_user_uid': str, 'started_at': datetime}}
screen_sharing_state: Dict[str, Dict] = {}


class ScreenSharingService:
    """Сервис для управления демонстрацией экрана"""
    
    @staticmethod
    def start_sharing(room_name: str, user_uid: str) -> Dict:
        """
        Начать демонстрацию экрана пользователем.
        
        Args:
            room_name: Имя комнаты
            user_uid: UID пользователя, который начинает демонстрацию
            
        Returns:
            Dict с результатом операции:
            - success: bool - успешность операции
            - message: str - сообщение
            - current_sharing_user: Optional[str] - кто сейчас демонстрирует (если есть)
        """
        # Проверяем, не демонстрирует ли уже кто-то другой
        if room_name in screen_sharing_state:
            current_sharing = screen_sharing_state[room_name]
            if current_sharing['sharing_user_uid'] != user_uid:
                return {
                    'success': False,
                    'message': f'Демонстрация экрана уже ведется пользователем {current_sharing["sharing_user_uid"]}',
                    'current_sharing_user': current_sharing['sharing_user_uid']
                }
            # Если тот же пользователь пытается начать снова - разрешаем (переподключение)
            logger.info(f'[ScreenSharing] User {user_uid} already sharing in room {room_name}, updating timestamp')
        
        # Начинаем или обновляем демонстрацию
        screen_sharing_state[room_name] = {
            'sharing_user_uid': user_uid,
            'started_at': datetime.now()
        }
        
        logger.info(f'[ScreenSharing] User {user_uid} started sharing in room {room_name}')
        
        return {
            'success': True,
            'message': 'Демонстрация экрана начата',
            'current_sharing_user': user_uid
        }
    
    @staticmethod
    def stop_sharing(room_name: str, user_uid: str) -> Dict:
        """
        Остановить демонстрацию экрана.
        
        Args:
            room_name: Имя комнаты
            user_uid: UID пользователя, который останавливает демонстрацию
            
        Returns:
            Dict с результатом операции
        """
        if room_name not in screen_sharing_state:
            return {
                'success': False,
                'message': 'Демонстрация экрана не активна'
            }
        
        current_sharing = screen_sharing_state[room_name]
        
        # Проверяем, что останавливает тот же пользователь, который начал
        if current_sharing['sharing_user_uid'] != user_uid:
            return {
                'success': False,
                'message': f'Только пользователь {current_sharing["sharing_user_uid"]} может остановить демонстрацию'
            }
        
        # Удаляем состояние
        del screen_sharing_state[room_name]
        
        logger.info(f'[ScreenSharing] User {user_uid} stopped sharing in room {room_name}')
        
        return {
            'success': True,
            'message': 'Демонстрация экрана остановлена'
        }
    
    @staticmethod
    def get_sharing_state(room_name: str) -> Optional[Dict]:
        """
        Получить текущее состояние демонстрации экрана в комнате.
        
        Args:
            room_name: Имя комнаты
            
        Returns:
            Dict с состоянием или None, если демонстрация не активна
        """
        return screen_sharing_state.get(room_name)
    
    @staticmethod
    def is_sharing_active(room_name: str) -> bool:
        """
        Проверить, активна ли демонстрация экрана в комнате.
        
        Args:
            room_name: Имя комнаты
            
        Returns:
            True если демонстрация активна, False иначе
        """
        return room_name in screen_sharing_state
    
    @staticmethod
    def get_sharing_user(room_name: str) -> Optional[str]:
        """
        Получить UID пользователя, который демонстрирует экран.
        
        Args:
            room_name: Имя комнаты
            
        Returns:
            UID пользователя или None
        """
        if room_name in screen_sharing_state:
            return screen_sharing_state[room_name]['sharing_user_uid']
        return None
    
    @staticmethod
    def cleanup_room(room_name: str):
        """
        Очистить состояние демонстрации экрана для комнаты.
        Используется при очистке комнаты.
        
        Args:
            room_name: Имя комнаты
        """
        if room_name in screen_sharing_state:
            del screen_sharing_state[room_name]
            logger.info(f'[ScreenSharing] Cleaned up sharing state for room {room_name}')
    
    @staticmethod
    def force_stop_sharing(room_name: str):
        """
        Принудительно остановить демонстрацию экрана.
        Используется при отключении пользователя или очистке комнаты.
        
        Args:
            room_name: Имя комнаты
        """
        if room_name in screen_sharing_state:
            sharing_user = screen_sharing_state[room_name]['sharing_user_uid']
            del screen_sharing_state[room_name]
            logger.info(f'[ScreenSharing] Force stopped sharing for user {sharing_user} in room {room_name}')

