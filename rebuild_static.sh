#!/bin/bash
cd /root/Video-chat-app-Django
source venv/bin/activate
rm -rf staticfiles/*
python3 manage.py collectstatic --noinput
chmod -R 755 staticfiles
find staticfiles -type f -exec chmod 644 {} \;
echo "Проверка streams.js:"
grep -i "AgoraRTC" staticfiles/js/streams.js 2>/dev/null && echo "ОШИБКА: AgoraRTC найден!" || echo "OK: WebRTC код на месте"
systemctl restart nginx
echo "Готово!"
