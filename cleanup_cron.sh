#!/bin/bash
# Скрипт для периодической очистки каналов Redis
# Добавьте в crontab: */5 * * * * /root/Video-chat-app-Django/cleanup_cron.sh

cd /root/Video-chat-app-Django
source venv/bin/activate
python manage.py cleanup_channels --max-age 300 >> /var/log/channel-cleanup.log 2>&1
