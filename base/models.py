from django.db import models
import uuid
from django.utils import timezone

# Create your models here.

class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        unique_together = [['name', 'is_active']]
    
    def __str__(self):
        return f"{self.name} ({self.id})"
    
    def get_invite_url(self, request):
        """Generate invite URL for the room"""
        return request.build_absolute_uri(f'/join/{self.id}/')

class RoomMember(models.Model):
    name = models.CharField(max_length=200)
    uid = models.CharField(max_length=1000)
    room_name = models.CharField(max_length=200)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, null=True, blank=True, related_name='members')
    insession = models.BooleanField(default=True)

    def __str__(self):
        return self.name