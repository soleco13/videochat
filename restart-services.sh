#!/bin/bash
# Скрипт для перезапуска всех сервисов Video Chat App

echo "🔄 Перезапуск сервисов Video Chat App..."

# Остановка сервисов
echo "⏹ Остановка сервисов..."
systemctl stop video-chat-app 2>/dev/null

# Ожидание завершения процессов
sleep 2

# Запуск Redis (если не запущен)
if ! systemctl is-active --quiet redis-server; then
    echo "🔴 Запуск Redis..."
    systemctl start redis-server
    sleep 1
fi

# Запуск Video Chat App
echo "🟢 Запуск Video Chat App..."
systemctl start video-chat-app
sleep 2

# Проверка статуса
echo ""
echo "📊 Статус сервисов:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
systemctl status redis-server --no-pager | head -3
echo ""
systemctl status video-chat-app --no-pager | head -3
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if systemctl is-active --quiet redis-server && systemctl is-active --quiet video-chat-app; then
    echo "✅ Все сервисы успешно запущены!"
else
    echo "❌ Ошибка при запуске сервисов. Проверьте логи:"
    echo "   journalctl -u video-chat-app -n 50"
    exit 1
fi

