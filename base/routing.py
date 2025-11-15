# base/routing.py
from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/video/(?P<room_name>\w+)/$", consumers.VideoCallConsumer.as_asgi()),
]

