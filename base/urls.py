from django.urls import path
from . import views

urlpatterns = [
    path('', views.lobby),
    path('room/<str:room_name>/', views.room),
    path('room/<str:room_name>', views.room),  # Without trailing slash
    path('join/<uuid:room_id>/', views.join_room, name='join_room'),
    path('get_token/', views.getToken),
    path('create_room/', views.create_room),

    path('create_member/', views.createMember),
    path('get_member/', views.getMember),
    path('delete_member/', views.deleteMember),
    path('get_room_members/', views.getRoomMembers),
    path('upload_whiteboard_image/', views.upload_whiteboard_image),
]