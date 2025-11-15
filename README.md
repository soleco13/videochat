# Video Chat App - Django + Vue.js

Веб-приложение для видеоконференций с чатом в реальном времени, построенное на Django (бэкенд) и Vue.js 3 с Vite (фронтенд).

## Технологии

- **Backend**: Django 5.x, Django Channels, WebSockets, Redis
- **Frontend**: Vue.js 3, Vite, WebRTC
- **База данных**: SQLite (по умолчанию)
- **Сервер приложений**: Daphne (ASGI)

## Быстрый старт

### 1. Установка зависимостей

```bash
# Python зависимости
cd /root/Video-chat-app-Django
source venv/bin/activate
pip install -r requirements.txt

# Node.js зависимости для фронтенда
cd frontend
npm install
```

### 2. Настройка Redis

```bash
# Установка и запуск Redis
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Проверка
redis-cli ping
```

### 3. Настройка Django

```bash
# Применение миграций
python manage.py migrate

# Сбор статических файлов
python manage.py collectstatic --noinput
```

### 4. Разработка

#### Запуск сервера разработки Django
```bash
python manage.py runserver
```

#### Запуск Vite dev server (в отдельном терминале)
```bash
cd frontend
npm run dev
```

Приложение будет доступно на `http://localhost:8000`

### 5. Сборка для продакшена

```bash
# Сборка фронтенда
cd frontend
npm run build

# Сборка статических файлов Django
cd ..
python manage.py collectstatic --noinput
```

### 6. Запуск в продакшене

#### Автоматический запуск через systemd (рекомендуется)

Сервисы настроены на автоматический запуск при загрузке системы и автоматический перезапуск при падении.

```bash
# Проверка статуса
systemctl status video-chat-app
systemctl status redis-server

# Ручной запуск/остановка
systemctl start video-chat-app
systemctl stop video-chat-app
systemctl restart video-chat-app

# Просмотр логов
journalctl -u video-chat-app -f
journalctl -u video-chat-app -n 50

# Перезапуск всех сервисов
/root/Video-chat-app-Django/restart-services.sh
```

#### Ручной запуск (для тестирования)

```bash
# Запуск с Daphne
daphne -b 127.0.0.1 -p 8000 mysite.asgi:application
```

## Структура проекта

```
Video-chat-app-Django/
├── base/              # Основное Django приложение
│   ├── consumers.py   # WebSocket consumers для WebRTC и чата
│   ├── views.py       # Django views
│   └── templates/     # Django шаблоны
├── frontend/          # Vue.js фронтенд
│   ├── src/
│   │   ├── room-entry.js  # Точка входа для комнаты
│   │   ├── styles/        # CSS стили
│   │   └── ...
│   └── vite.config.js     # Конфигурация Vite
├── mysite/            # Настройки Django проекта
├── staticfiles/       # Собранные статические файлы
└── venv/              # Python виртуальное окружение
```

## Основные функции

- ✅ Создание и присоединение к комнатам видеоконференций
- ✅ Видео и аудио связь через WebRTC (P2P)
- ✅ Чат в реальном времени через WebSockets
- ✅ Адаптивный дизайн для всех устройств
- ✅ Обнаружение активности микрофона
- ✅ Управление камерой и микрофоном
- ✅ Пригласительные ссылки для комнат

## WebRTC

Приложение использует WebRTC для прямого соединения между пользователями (P2P). Сигналинг происходит через WebSockets (Django Channels).

### STUN серверы
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

## Разработка

### Горячая перезагрузка

При разработке фронтенда используйте Vite dev server (`npm run dev`), который автоматически перезагружает изменения.

### Статические файлы

В режиме разработки (`DEBUG=True`) статические файлы загружаются с Vite dev server.
В продакшене используются собранные файлы из `staticfiles/`.

## Производство

### Переменные окружения

Убедитесь, что в `mysite/settings.py` правильно настроены:
- `DEBUG = False`
- `ALLOWED_HOSTS`
- `STATIC_ROOT`
- `STATIC_URL`

### Кэширование

Статические файлы версионируются через `STATIC_VERSION` для предотвращения проблем с кэшированием.

## Управление сервисами

### Автозапуск

Все сервисы настроены на автоматический запуск при загрузке системы:
- ✅ Redis - автозапуск включен
- ✅ Video Chat App (Daphne) - автозапуск включен
- ✅ Автоматический перезапуск при падении (Restart=always)

### Полезные команды

```bash
# Статус всех сервисов
systemctl status video-chat-app redis-server

# Перезапуск приложения
systemctl restart video-chat-app

# Просмотр логов в реальном времени
journalctl -u video-chat-app -f

# Последние 50 строк логов
journalctl -u video-chat-app -n 50

# Перезапуск всех сервисов
/root/Video-chat-app-Django/restart-services.sh
```

## Устранение неполадок

### WebSocket не подключается
- Проверьте, что Redis запущен: `systemctl status redis-server` или `redis-cli ping`
- Проверьте настройки Channels в `settings.py`
- Проверьте логи: `journalctl -u video-chat-app -n 50`

### Статические файлы не загружаются
- Выполните `python manage.py collectstatic`
- Проверьте `STATIC_ROOT` и `STATIC_URL` в `settings.py`
- Очистите кэш браузера (Ctrl+Shift+R)

### Видео не отображается
- Проверьте разрешения браузера на доступ к камере/микрофону
- Убедитесь, что используется HTTPS (для продакшена) или localhost

## Лицензия

MIT
