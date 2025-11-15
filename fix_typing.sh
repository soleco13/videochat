#!/bin/bash
# Исправление проблемы с typing_extensions

cd /root/Video-chat-app-Django
source venv/bin/activate

echo "Обновление typing_extensions для совместимости с Python 3.12..."
pip install --upgrade typing_extensions

echo "Проверка установки..."
python -c "import typing_extensions; print(f'typing_extensions версия: {typing_extensions.__version__}')"

echo "Попробуйте снова выполнить: python manage.py migrate"

