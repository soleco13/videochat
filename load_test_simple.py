#!/usr/bin/env python3
"""
Упрощенный тест нагрузки через HTTP запросы и анализ метрик
"""
import requests
import time
import psutil
import redis
from concurrent.futures import ThreadPoolExecutor, as_completed
import json

SERVER_URL = "http://127.0.0.1:8000"
NUM_REQUESTS = 100
CONCURRENT_REQUESTS = 20

def make_request(url):
    """Выполняет HTTP запрос"""
    try:
        start = time.time()
        response = requests.get(url, timeout=5)
        latency = time.time() - start
        return {
            'status': response.status_code,
            'latency': latency,
            'success': response.status_code == 200
        }
    except Exception as e:
        return {
            'status': 0,
            'latency': 0,
            'success': False,
            'error': str(e)
        }

def test_http_load():
    """Тест HTTP нагрузки"""
    print("🌐 HTTP Load Test")
    print("="*60)
    
    url = f"{SERVER_URL}/room/TEST2"
    results = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=CONCURRENT_REQUESTS) as executor:
        futures = [executor.submit(make_request, url) for _ in range(NUM_REQUESTS)]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    elapsed = time.time() - start_time
    
    # Статистика
    successful = sum(1 for r in results if r['success'])
    failed = NUM_REQUESTS - successful
    latencies = [r['latency'] for r in results if r['success']]
    
    print(f"Requests: {NUM_REQUESTS}")
    print(f"Concurrent: {CONCURRENT_REQUESTS}")
    print(f"Duration: {elapsed:.2f}s")
    print(f"Successful: {successful}/{NUM_REQUESTS}")
    print(f"Failed: {failed}")
    print(f"Requests/sec: {NUM_REQUESTS/elapsed:.2f}")
    
    if latencies:
        print(f"Avg latency: {sum(latencies)/len(latencies)*1000:.2f}ms")
        print(f"Min latency: {min(latencies)*1000:.2f}ms")
        print(f"Max latency: {max(latencies)*1000:.2f}ms")
    
    print("="*60)
    return results

def check_system_resources():
    """Проверка системных ресурсов"""
    print("\n💻 System Resources")
    print("="*60)
    
    # CPU
    cpu = psutil.cpu_percent(interval=1)
    print(f"CPU: {cpu}%")
    
    # Memory
    mem = psutil.virtual_memory()
    print(f"Memory: {mem.percent}% ({mem.used/1024**3:.2f}GB / {mem.total/1024**3:.2f}GB)")
    
    # Redis
    try:
        r = redis.Redis(host='127.0.0.1', port=6379, db=0, socket_connect_timeout=1)
        info = r.info()
        print(f"Redis Memory: {info.get('used_memory_human', 'N/A')}")
        print(f"Redis Connections: {info.get('connected_clients', 0)}")
        
        # Ключи
        channel_keys = sum(1 for _ in r.scan_iter(match="asgi:*"))
        print(f"Redis Channel Keys: {channel_keys}")
    except Exception as e:
        print(f"Redis: Error - {e}")
    
    print("="*60)

if __name__ == "__main__":
    check_system_resources()
    test_http_load()
    check_system_resources()

