#!/bin/bash
# Скрипт запуска приложения

cd /root/Video-chat-app-Django
source venv/bin/activate

# Проверка Redis
if ! docker ps | grep -q redis-chat; then
    echo "Запуск Redis..."
    docker run -d -p 6379:6379 --name redis-chat redis:5
    sleep 2
fi

# Получение IP адреса сервера
SERVER_IP=$(hostname -I | awk '{print $1}')

echo "=========================================="
echo "Запуск Video Chat App..."
echo "=========================================="
echo "Приложение будет доступно по адресу:"
echo "  http://${SERVER_IP}:8000"
echo "  http://localhost:8000"
echo ""
echo "Для остановки нажмите Ctrl+C"
echo "=========================================="
echo ""

# Запуск приложения
daphne -b 0.0.0.0 -p 8000 mysite.asgi:application

