# base/routing.py
from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Match base64-encoded room names (alphanumeric, -, _, and =)
    # The consumer will decode and validate the room name
    re_path(r"ws/video/(?P<room_name>[A-Za-z0-9_-]+)/$", consumers.VideoCallConsumer.as_asgi()),
]

