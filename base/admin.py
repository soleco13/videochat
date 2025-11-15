from django.contrib import admin
from .models import Room, RoomMember

# Register your models here.

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'created_at', 'is_active']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'id']

@admin.register(RoomMember)
class RoomMemberAdmin(admin.ModelAdmin):
    list_display = ['name', 'uid', 'room_name', 'room', 'insession']
    list_filter = ['insession', 'room']
    search_fields = ['name', 'room_name', 'uid']
