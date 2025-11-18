#!/usr/bin/env python3
"""
Load test for multiple rooms
"""
import asyncio
import websockets
import json
import random
import string
import time

SERVER_URL = "ws://127.0.0.1:8000"
NUM_ROOMS = 5
USERS_PER_ROOM = 4
TEST_DURATION = 20

stats = {
    'rooms_created': 0,
    'users_connected': 0,
    'users_disconnected': 0,
    'errors': 0,
    'errors_list': []
}

async def user_in_room(room_id, user_id):
    """Симуляция пользователя в комнате"""
    uid = f"user_{room_id}_{user_id}"
    room_name = f"LOAD_TEST_ROOM_{room_id}"
    ws_url = f"{SERVER_URL}/ws/video/{room_name}/"
    
    try:
        async with websockets.connect(ws_url, ping_interval=None) as websocket:
            stats['users_connected'] += 1
            
            # Join
            await websocket.send(json.dumps({
                "type": "join",
                "from": uid,
                "room": room_name
            }))
            
            # Слушаем сообщения
            start_time = time.time()
            while time.time() - start_time < TEST_DURATION:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    # Игнорируем сообщения
                except asyncio.TimeoutError:
                    pass
                except Exception as e:
                    break
                
            stats['users_disconnected'] += 1
                
    except Exception as e:
        stats['errors'] += 1
        error_msg = f"User {uid} in room {room_name}: {str(e)}"
        stats['errors_list'].append(error_msg)

async def simulate_room(room_id):
    """Симуляция комнаты с несколькими пользователями"""
    room_name = f"LOAD_TEST_ROOM_{room_id}"
    print(f"🏠 Creating room: {room_name}")
    stats['rooms_created'] += 1
    
    # Создаем пользователей в комнате
    tasks = [user_in_room(room_id, i) for i in range(USERS_PER_ROOM)]
    await asyncio.gather(*tasks, return_exceptions=True)
    
    print(f"✅ Room {room_name} completed")

async def main():
    print(f"🚀 Testing {NUM_ROOMS} rooms with {USERS_PER_ROOM} users each")
    print(f"Total users: {NUM_ROOMS * USERS_PER_ROOM}")
    print()
    
    start_time = time.time()
    
    tasks = [simulate_room(i) for i in range(NUM_ROOMS)]
    await asyncio.gather(*tasks, return_exceptions=True)
    
    elapsed = time.time() - start_time
    
    print("\n" + "="*60)
    print("📊 MULTIPLE ROOMS TEST RESULTS")
    print("="*60)
    print(f"Duration: {elapsed:.2f}s")
    print(f"Rooms created: {stats['rooms_created']}/{NUM_ROOMS}")
    print(f"Users connected: {stats['users_connected']}/{NUM_ROOMS * USERS_PER_ROOM}")
    print(f"Users disconnected: {stats['users_disconnected']}")
    print(f"Errors: {stats['errors']}")
    
    if stats['errors_list']:
        print(f"\nErrors ({len(stats['errors_list'])}):")
        for error in stats['errors_list'][:10]:
            print(f"  - {error}")
    
    print("="*60)

if __name__ == "__main__":
    asyncio.run(main())

