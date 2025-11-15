#!/bin/bash
# Правильная пересборка статических файлов

cd /root/Video-chat-app-Django

# Активировать виртуальное окружение
source venv/bin/activate

echo "Удаление старых статических файлов..."
rm -rf staticfiles/*

echo "Пересборка статических файлов..."
python3 manage.py collectstatic --noinput

echo "Исправление прав доступа..."
chmod -R 755 staticfiles
find staticfiles -type f -exec chmod 644 {} \;

echo ""
echo "Проверка наличия AgoraRTC в streams.js:"
if grep -q "AgoraRTC" staticfiles/js/streams.js 2>/dev/null; then
    echo "ОШИБКА: В streams.js все еще есть AgoraRTC!"
    echo "Проверьте файл base/static/js/streams.js"
else
    echo "OK: AgoraRTC не найден, WebRTC код на месте"
fi

echo ""
echo "Перезапустите nginx: systemctl restart nginx"

