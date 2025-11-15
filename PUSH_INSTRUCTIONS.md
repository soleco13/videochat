# Инструкция по отправке кода в GitHub

## Текущий статус
✅ Репозиторий настроен: `https://github.com/soleco13/videochat.git`
✅ Создан файл `.gitignore`
✅ Все изменения закоммичены
✅ База данных удалена из репозитория

## Для отправки кода в GitHub выполните одну из команд:

### Вариант 1: Использование Personal Access Token (рекомендуется)

1. Создайте Personal Access Token на GitHub:
   - Перейдите в Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Создайте новый token с правами `repo`
   - Скопируйте токен

2. Выполните команду:
```bash
cd /root/Video-chat-app-Django
git push -u origin master
```
При запросе username введите: `soleco13`
При запросе password введите: ваш Personal Access Token

### Вариант 2: Использование GitHub CLI

Если установлен GitHub CLI:
```bash
gh auth login
git push -u origin master
```

### Вариант 3: Настройка SSH ключа

1. Создайте SSH ключ (если еще нет):
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
```

2. Добавьте публичный ключ в GitHub:
   - Settings → SSH and GPG keys → New SSH key
   - Вставьте содержимое `~/.ssh/id_ed25519.pub`

3. Измените remote на SSH:
```bash
cd /root/Video-chat-app-Django
git remote set-url origin git@github.com:soleco13/videochat.git
git push -u origin master
```

## Проверка статуса

Проверить текущий статус:
```bash
cd /root/Video-chat-app-Django
git status
git log --oneline -5
```

## Что было добавлено в репозиторий:

- ✅ Все исходные файлы проекта
- ✅ Конфигурационные файлы
- ✅ Frontend код (Vue.js)
- ✅ Backend код (Django)
- ✅ Файл `.gitignore` с правильными исключениями

## Что исключено из репозитория (благодаря .gitignore):

- ❌ `venv/` - виртуальное окружение Python
- ❌ `__pycache__/` - кэш Python
- ❌ `db.sqlite3` - база данных
- ❌ `node_modules/` - зависимости Node.js
- ❌ `*.log` - логи
- ❌ `media/` - загруженные файлы пользователей
- ❌ `staticfiles/` - собранные статические файлы

