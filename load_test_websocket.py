#!/usr/bin/env python3
"""
Load test script for WebSocket connections
"""
import asyncio
import websockets
import json
import time
import random
import string
from collections import defaultdict

# Конфигурация
SERVER_URL = "ws://127.0.0.1:8000"
ROOM_NAME = "LOAD_TEST"
NUM_CLIENTS = 30  # Количество одновременных соединений
MESSAGE_RATE = 5  # Сообщений в секунду на клиент
TEST_DURATION = 30  # Длительность теста в секундах

stats = {
    'connected': 0,
    'disconnected': 0,
    'messages_sent': 0,
    'messages_received': 0,
    'errors': 0,
    'latency': [],
    'errors_list': [],
    'connection_times': []
}

def generate_uid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))

async def simulate_client(client_id, room_name):
    """Симуляция одного клиента"""
    uid = generate_uid()
    ws_url = f"{SERVER_URL}/ws/video/{room_name}/"
    
    try:
        connect_start = time.time()
        # Используем правильный способ подключения для websockets
        async with websockets.connect(ws_url, ping_interval=None) as websocket:
            connect_time = time.time() - connect_start
            stats['connection_times'].append(connect_time)
            stats['connected'] += 1
            print(f"[Client {client_id}] Connected as {uid} ({connect_time*1000:.0f}ms)")
            
            # Отправляем join сообщение
            join_msg = {
                "type": "join",
                "from": uid,
                "room": room_name
            }
            await websocket.send(json.dumps(join_msg))
            
            # Отправляем сообщения с заданной частотой
            start_time = time.time()
            message_count = 0
            last_send_time = time.time()
            
            while time.time() - start_time < TEST_DURATION:
                current_time = time.time()
                
                # Отправляем сообщения с заданной частотой
                if current_time - last_send_time >= (1.0 / MESSAGE_RATE):
                    # Симулируем ICE кандидат
                    ice_msg = {
                        "type": "ice-candidate",
                        "from": uid,
                        "to": "target_user",
                        "candidate": {
                            "candidate": f"candidate:1 1 UDP 2130706431 192.168.1.{random.randint(1,255)} 54321 typ host",
                            "sdpMLineIndex": 0,
                            "sdpMid": "0"
                        }
                    }
                    send_start = time.time()
                    try:
                        await websocket.send(json.dumps(ice_msg))
                        stats['messages_sent'] += 1
                        message_count += 1
                        last_send_time = current_time
                    except Exception as e:
                        stats['errors'] += 1
                        stats['errors_list'].append(f"Send error: {str(e)}")
                
                # Получаем сообщения
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                    recv_time = time.time()
                    stats['messages_received'] += 1
                    
                    try:
                        data = json.loads(message)
                        if 'type' in data:
                            # Измеряем задержку для ответов
                            if data['type'] in ['user-joined', 'offer', 'answer']:
                                latency = recv_time - send_start
                                stats['latency'].append(latency)
                    except json.JSONDecodeError:
                        pass
                except asyncio.TimeoutError:
                    pass
                except Exception as e:
                    stats['errors'] += 1
                    stats['errors_list'].append(f"Recv error: {str(e)}")
                
                await asyncio.sleep(0.01)  # Небольшая задержка
            
            stats['disconnected'] += 1
            print(f"[Client {client_id}] Disconnected")
            
    except Exception as e:
        stats['errors'] += 1
        error_msg = f"Client {client_id}: {str(e)}"
        stats['errors_list'].append(error_msg)
        print(f"[Client {client_id}] Error: {e}")

async def run_load_test():
    """Запуск нагрузочного теста"""
    print(f"🚀 Starting load test:")
    print(f"   Server: {SERVER_URL}")
    print(f"   Room: {ROOM_NAME}")
    print(f"   Clients: {NUM_CLIENTS}")
    print(f"   Message rate: {MESSAGE_RATE} msg/s per client")
    print(f"   Duration: {TEST_DURATION}s")
    print()
    
    start_time = time.time()
    
    # Создаем задачи для всех клиентов
    tasks = [
        simulate_client(i, ROOM_NAME)
        for i in range(NUM_CLIENTS)
    ]
    
    # Запускаем все клиенты
    await asyncio.gather(*tasks, return_exceptions=True)
    
    elapsed = time.time() - start_time
    
    # Выводим статистику
    print("\n" + "="*60)
    print("📊 LOAD TEST RESULTS")
    print("="*60)
    print(f"Duration: {elapsed:.2f}s")
    print(f"Connected: {stats['connected']}/{NUM_CLIENTS}")
    print(f"Disconnected: {stats['disconnected']}")
    print(f"Messages sent: {stats['messages_sent']}")
    print(f"Messages received: {stats['messages_received']}")
    print(f"Errors: {stats['errors']}")
    
    if stats['connection_times']:
        avg_conn = sum(stats['connection_times']) / len(stats['connection_times'])
        print(f"Average connection time: {avg_conn*1000:.2f}ms")
        print(f"Min connection time: {min(stats['connection_times'])*1000:.2f}ms")
        print(f"Max connection time: {max(stats['connection_times'])*1000:.2f}ms")
    
    if stats['latency']:
        avg_latency = sum(stats['latency']) / len(stats['latency'])
        print(f"Average latency: {avg_latency*1000:.2f}ms")
        print(f"Min latency: {min(stats['latency'])*1000:.2f}ms")
        print(f"Max latency: {max(stats['latency'])*1000:.2f}ms")
    
    if stats['errors_list']:
        print(f"\nErrors ({len(stats['errors_list'])}):")
        for error in stats['errors_list'][:10]:  # Первые 10 ошибок
            print(f"  - {error}")
    
    print("="*60)
    
    return stats

if __name__ == "__main__":
    asyncio.run(run_load_test())

