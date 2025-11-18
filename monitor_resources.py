#!/usr/bin/env python3
"""
Resource monitoring script
"""
import psutil
import redis
import time
import json
from datetime import datetime

def monitor_system():
    """Мониторинг системных ресурсов"""
    try:
        r = redis.Redis(host='127.0.0.1', port=6379, db=0, socket_connect_timeout=1)
        redis_available = True
    except:
        redis_available = False
    
    results = {
        'timestamp': datetime.now().isoformat(),
        'cpu': {},
        'memory': {},
        'redis': {},
        'network': {}
    }
    
    # CPU
    cpu_percent = psutil.cpu_percent(interval=0.5)
    cpu_count = psutil.cpu_count()
    results['cpu'] = {
        'percent': cpu_percent,
        'cores': cpu_count
    }
    
    # Memory
    memory = psutil.virtual_memory()
    results['memory'] = {
        'percent': memory.percent,
        'used_gb': memory.used / 1024**3,
        'total_gb': memory.total / 1024**3,
        'available_gb': memory.available / 1024**3
    }
    
    # Redis
    if redis_available:
        try:
            redis_info = r.info()
            channel_keys = sum(1 for _ in r.scan_iter(match="asgi:*"))
            results['redis'] = {
                'memory': redis_info.get('used_memory_human', 'N/A'),
                'memory_bytes': redis_info.get('used_memory', 0),
                'connections': redis_info.get('connected_clients', 0),
                'channel_keys': channel_keys
            }
        except Exception as e:
            results['redis'] = {'error': str(e)}
    else:
        results['redis'] = {'error': 'Not available'}
    
    # Network
    net_io = psutil.net_io_counters()
    results['network'] = {
        'bytes_sent_mb': net_io.bytes_sent / 1024**2,
        'bytes_recv_mb': net_io.bytes_recv / 1024**2
    }
    
    return results

def print_monitor(results):
    """Вывод результатов мониторинга"""
    print(f"\n📊 System Monitoring - {results['timestamp']}")
    print("="*60)
    print(f"CPU: {results['cpu']['percent']:.1f}% ({results['cpu']['cores']} cores)")
    print(f"Memory: {results['memory']['percent']:.1f}% "
          f"({results['memory']['used_gb']:.2f}GB / {results['memory']['total_gb']:.2f}GB)")
    
    if 'error' not in results['redis']:
        print(f"Redis Memory: {results['redis']['memory']}")
        print(f"Redis Connections: {results['redis']['connections']}")
        print(f"Redis Channel Keys: {results['redis']['channel_keys']}")
    else:
        print(f"Redis: {results['redis']['error']}")
    
    print(f"Network: Sent {results['network']['bytes_sent_mb']:.2f}MB, "
          f"Recv {results['network']['bytes_recv_mb']:.2f}MB")
    print("="*60)

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--once':
        # Однократный запуск
        results = monitor_system()
        print_monitor(results)
    else:
        # Непрерывный мониторинг
        try:
            while True:
                results = monitor_system()
                print_monitor(results)
                time.sleep(5)
        except KeyboardInterrupt:
            print("\nMonitoring stopped")

