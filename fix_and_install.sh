#!/bin/bash
# Скрипт для исправления зависимостей и установки проекта

echo "Установка системных библиотек для Pillow..."
apt install -y libjpeg-dev zlib1g-dev libfreetype6-dev liblcms2-dev libopenjp2-7-dev libtiff5-dev libwebp-dev

cd /root/Video-chat-app-Django

echo "Активация виртуального окружения..."
source venv/bin/activate

echo "Установка Pillow..."
pip install Pillow==8.3.2

echo "Установка остальных зависимостей (без twisted-iocpsupport)..."
pip install -r requirements.txt --no-deps twisted-iocpsupport 2>/dev/null || true
pip install $(grep -v "twisted-iocpsupport" requirements.txt | grep -v "^#")

echo "Установка завершена!"

