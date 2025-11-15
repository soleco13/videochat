#!/bin/bash
# Исправление прав доступа для статических файлов

echo "Исправление прав доступа..."

# Установить права на директории
chmod -R 755 /root/Video-chat-app-Django/staticfiles
chmod -R 755 /root/Video-chat-app-Django/media
chmod -R 755 /root/Video-chat-app-Django/static

# Установить права на файлы
find /root/Video-chat-app-Django/staticfiles -type f -exec chmod 644 {} \;
find /root/Video-chat-app-Django/media -type f -exec chmod 644 {} \;
find /root/Video-chat-app-Django/static -type f -exec chmod 644 {} \;

# Установить права на директорию /root для чтения (только для nginx)
chmod 755 /root
chmod 755 /root/Video-chat-app-Django

echo "Права доступа исправлены!"
echo "Перезапустите nginx: systemctl restart nginx"

