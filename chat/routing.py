# chat/routing.py
from django.urls import re_path

from . import consumers
from base import consumers as base_consumers

websocket_urlpatterns = [
    re_path(r"ws/chat/(?P<room_name>\w+)/$", consumers.ChatConsumer.as_asgi()),
    re_path(r"ws/video/(?P<room_name>\w+)/$", base_consumers.VideoCallConsumer.as_asgi()),
]