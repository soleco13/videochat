from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse, HttpResponse
import random
from .models import RoomMember, Room
import json
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
import os
import uuid
from django.conf import settings
from pathlib import Path
import shutil



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


@csrf_exempt
def upload_whiteboard_image(request):
    """Upload image for whiteboard and return URL"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        room_name = request.POST.get('room_name', '').upper()
        if not room_name:
            return JsonResponse({'error': 'Room name is required'}, status=400)
        
        # Проверяем, что комната существует
        try:
            room_obj = Room.objects.get(name=room_name, is_active=True)
        except Room.DoesNotExist:
            return JsonResponse({'error': 'Room not found'}, status=404)
        
        if 'image' not in request.FILES:
            return JsonResponse({'error': 'No image file provided'}, status=400)
        
        image_file = request.FILES['image']
        
        # Проверяем тип файла
        if not image_file.content_type.startswith('image/'):
            return JsonResponse({'error': 'File is not an image'}, status=400)
        
        # Создаем директорию для комнаты если её нет
        room_images_dir = Path(settings.MEDIA_ROOT) / 'whiteboard' / room_name
        room_images_dir.mkdir(parents=True, exist_ok=True)
        
        # Получаем расширение файла из оригинального имени или content_type
        original_name = image_file.name
        file_extension = os.path.splitext(original_name)[1].lower() if original_name else '.jpg'
        
        # Если расширение не определено, определяем по content_type
        if not file_extension or file_extension == '.':
            content_type = image_file.content_type
            if 'jpeg' in content_type or 'jpg' in content_type:
                file_extension = '.jpg'
            elif 'png' in content_type:
                file_extension = '.png'
            elif 'gif' in content_type:
                file_extension = '.gif'
            elif 'webp' in content_type:
                file_extension = '.webp'
            else:
                file_extension = '.jpg'  # По умолчанию JPEG
        
        # Генерируем уникальное имя файла с сохранением оригинального расширения
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = room_images_dir / unique_filename
        
        # Сохраняем файл без сжатия (изображение уже сжато на клиенте)
        try:
            with open(file_path, 'wb') as destination:
                for chunk in image_file.chunks():
                    destination.write(chunk)
            
            file_size = file_path.stat().st_size
            print(f"[Whiteboard] Image saved: {unique_filename}, file size: {file_size} bytes")
            
        except Exception as e:
            print(f"[Whiteboard] Error saving image: {e}")
            return JsonResponse({'error': f'Failed to save image: {str(e)}'}, status=500)
        
        # Формируем URL для доступа к изображению
        image_url = f"/media/whiteboard/{room_name}/{unique_filename}"
        
        return JsonResponse({
            'success': True,
            'url': image_url,
            'filename': unique_filename
        })
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


def cleanup_room_images(room_name):
    """Удалить все изображения комнаты"""
    try:
        room_images_dir = Path(settings.MEDIA_ROOT) / 'whiteboard' / room_name.upper()
        if room_images_dir.exists():
            shutil.rmtree(room_images_dir)
            return True
    except Exception as e:
        print(f"Error cleaning up room images: {e}")
        return False
    return False