#!/bin/bash
# Скрипт для исправления статических файлов

cd /root/Video-chat-app-Django
source venv/bin/activate

echo "Сбор статических файлов..."
python manage.py collectstatic --noinput

echo ""
echo "Статические файлы собраны!"
echo "Теперь перезапустите приложение:"
echo "daphne -b 0.0.0.0 -p 8000 mysite.asgi:application"

