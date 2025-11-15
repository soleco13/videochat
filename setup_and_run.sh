#!/bin/bash
# Скрипт установки и запуска Video-chat-app-Django

cd /root/Video-chat-app-Django

# Создание виртуального окружения
echo "Создание виртуального окружения..."
python3 -m venv venv

# Активация виртуального окружения и установка зависимостей
echo "Установка зависимостей..."
source venv/bin/activate
pip install --upgrade pip setuptools
pip install -r requirements.txt

# Запуск Redis через Docker
echo "Запуск Redis..."
docker run -d -p 6379:6379 --name redis-chat redis:5 2>/dev/null || docker start redis-chat

# Выполнение миграций
echo "Выполнение миграций..."
python manage.py migrate

# Запуск приложения
echo "Запуск приложения на порту 8000..."
echo "Приложение будет доступно по адресу: http://$(hostname -I | awk '{print $1}'):8000"
daphne -b 0.0.0.0 -p 8000 mysite.asgi:application

