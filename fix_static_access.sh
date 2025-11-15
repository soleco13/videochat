#!/bin/bash
# Исправление прав доступа для статических файлов nginx

echo "Исправление прав доступа для статических файлов..."

# Установить права на директории (755 = rwxr-xr-x)
chmod 755 /root
chmod 755 /root/Video-chat-app-Django
chmod -R 755 /root/Video-chat-app-Django/staticfiles
chmod -R 755 /root/Video-chat-app-Django/media
chmod -R 755 /root/Video-chat-app-Django/static

# Установить права на файлы (644 = rw-r--r--)
find /root/Video-chat-app-Django/staticfiles -type f -exec chmod 644 {} \;
find /root/Video-chat-app-Django/media -type f -exec chmod 644 {} \;
find /root/Video-chat-app-Django/static -type f -exec chmod 644 {} \;

echo "Права доступа исправлены!"
echo ""
echo "Теперь выполните:"
echo "  nginx -t"
echo "  systemctl restart nginx"

