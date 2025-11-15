#!/bin/bash
cd /root/Video-chat-app-Django

# Активация виртуального окружения
source venv/bin/activate

# Запуск Redis если не запущен
docker ps | grep redis-chat || docker run -d -p 6379:6379 --name redis-chat redis:5

# Запуск приложения
daphne -b 0.0.0.0 -p 8000 mysite.asgi:application

