#!/bin/bash
# Исправление проблемы с tkinter

cd /root/Video-chat-app-Django

echo "Вариант 1: Установить python3-tk (если нужен ImageTk)"
echo "apt install -y python3-tk"

echo ""
echo "Вариант 2: Удалить неиспользуемый импорт ImageTk (уже сделано)"
echo "Импорт ImageTk удален из shareapp/views.py, так как он не используется"

echo ""
echo "Теперь попробуйте снова:"
echo "python manage.py migrate"

