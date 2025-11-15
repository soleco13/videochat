# mysite/urls.py
from django.contrib import admin
from django.urls import include, path, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("chat/", include("chat.urls")),
    path("api/", include("base.urls")),
    path("", include("base.urls")),
    path("", include("shareapp.urls")),
    # SPA fallback - serve index.html for all non-API routes (must be last)
    # Exclude room, join, and other base.urls patterns
    re_path(r'^(?!api|admin|chat|static|media|ws|room|join|get_token|create_room|create_member|get_member|delete_member|get_room_members).*$', TemplateView.as_view(template_name='spa.html'), name='spa'),
]
# Раздаем статические файлы (в продакшене обычно используется веб-сервер)
# Но для совместимости добавляем и здесь
urlpatterns += static(settings.STATIC_URL,
                      document_root=settings.STATIC_ROOT)

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL,
                          document_root=settings.MEDIA_ROOT)
    # Для разработки также используем STATICFILES_DIRS
    from django.contrib.staticfiles.urls import staticfiles_urlpatterns
    urlpatterns += staticfiles_urlpatterns()