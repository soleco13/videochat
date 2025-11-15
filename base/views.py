from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
import random
from .models import RoomMember, Room
import json
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone



# Create your views here.

def lobby(request):
    return render(request, 'base/lobby.html')

def room(request, room_name):
    # Get or create room
    room_obj, created = Room.objects.get_or_create(
        name=room_name.upper(),
        defaults={'created_at': timezone.now()}
    )
    
    invite_url = room_obj.get_invite_url(request)
    
    return render(request, 'base/room.html', {
        "room_name": room_name,
        "room_id": str(room_obj.id),
        "invite_url": invite_url
    })

def join_room(request, room_id):
    """Join room by invite link"""
    try:
        room_obj = get_object_or_404(Room, id=room_id, is_active=True)
        return render(request, 'base/join_room.html', {
            "room_name": room_obj.name,
            "room_id": str(room_obj.id)
        })
    except:
        return render(request, 'base/join_room.html', {
            "error": "Room not found or inactive"
        })


def getToken(request):
    # WebRTC doesn't need tokens, but we keep this endpoint for compatibility
    # Generate a random UID for the user
    uid = random.randint(1, 230)
    return JsonResponse({'token': None, 'uid': uid}, safe=False)


@csrf_exempt
def createMember(request):
    data = json.loads(request.body)
    room_name = data['room_name']
    
    # Get or create room
    room_obj, _ = Room.objects.get_or_create(
        name=room_name.upper(),
        defaults={'created_at': timezone.now()}
    )
    
    member, created = RoomMember.objects.get_or_create(
        name=data['name'],
        uid=data['UID'],
        room_name=room_name,
        defaults={'room': room_obj}
    )
    
    # Update room reference if member already existed
    if not created and not member.room:
        member.room = room_obj
        member.save()

    return JsonResponse({'name': data['name']}, safe=False)


def getMember(request):
    uid = request.GET.get('UID')
    room_name = request.GET.get('room_name')

    try:
        member = RoomMember.objects.get(
            uid=uid,
            room_name=room_name,
        )
        return JsonResponse({'name':member.name}, safe=False)
    except RoomMember.DoesNotExist:
        return JsonResponse({'name': ''}, safe=False)

@csrf_exempt
def deleteMember(request):
    data = json.loads(request.body)
    try:
        member = RoomMember.objects.get(
            name=data['name'],
            uid=data['UID'],
            room_name=data['room_name']
        )
        member.delete()
        return JsonResponse('Member deleted', safe=False)
    except RoomMember.DoesNotExist:
        return JsonResponse('Member not found', safe=False, status=404)

def getRoomMembers(request):
    room_name = request.GET.get('room_name')
    try:
        members = RoomMember.objects.filter(room_name=room_name, insession=True)
        members_list = [{'uid': member.uid, 'name': member.name} for member in members]
        return JsonResponse({'members': members_list}, safe=False)
    except Exception as e:
        return JsonResponse({'members': [], 'error': str(e)}, safe=False)

@csrf_exempt
def create_room(request):
    """Create a new room and return invite link"""
    if request.method == 'POST':
        data = json.loads(request.body)
        room_name = data.get('room_name', '').upper()
        user_name = data.get('name', '')
        
        if not room_name:
            return JsonResponse({'error': 'Room name is required'}, status=400)
        
        # Get or create room (use active room if exists)
        try:
            room_obj = Room.objects.filter(name=room_name, is_active=True).first()
            if not room_obj:
                room_obj = Room.objects.create(
                    name=room_name,
                    created_at=timezone.now()
                )
                created = True
            else:
                created = False
        except Exception as e:
            # If unique constraint fails, get existing room
            room_obj = Room.objects.filter(name=room_name, is_active=True).first()
            if not room_obj:
                return JsonResponse({'error': 'Failed to create room'}, status=500)
            created = False
        
        invite_url = room_obj.get_invite_url(request)
        
        return JsonResponse({
            'room_id': str(room_obj.id),
            'room_name': room_obj.name,
            'invite_url': invite_url,
            'created': created
        })
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)