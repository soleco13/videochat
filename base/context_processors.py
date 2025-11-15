def static_version(request):
    """
    Добавляет STATIC_VERSION в контекст шаблонов для обхода кэша браузера
    """
    from django.conf import settings
    return {
        'STATIC_VERSION': getattr(settings, 'STATIC_VERSION', '1'),
        'USE_BUILT_STATIC': getattr(settings, 'USE_BUILT_STATIC', False)
    }

