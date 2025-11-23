// Entry point for room.html (Django template with existing HTML)
// This file uses plain JavaScript to preserve DOM structure

// NOTE: CSS files are loaded via <link> tags in room.html template
// We don't import them here to avoid duplication and conflicts
// Vite will still process them if needed, but they're loaded separately

// Import Whiteboard Manager
import { WhiteboardManager } from './whiteboard.js';

// Import Adaptive Layout System
import {
    getDeviceType,
    calculateGridLayout,
    applyLayout,
    applyGridLayout,
    getContainerSize
} from './adaptive-layout.js';

// ============================================================================
// TURN Server Testing and Optimization
// ============================================================================

// Список TURN серверов для тестирования
const TURN_SERVERS = [
    // === TIER 1: Ваш локальный сервер (лучшее качество для РФ) ===
    {
        name: 'Local TURN (UDP)',
        urls: 'turn:144.31.75.55:3478?transport=udp',
        username: 'nereus',
        credential: '0686879826b8c82c924cc1f92c1ec5e4',
        priority: 1  // 🥇 UDP быстрее всего + ваш сервер
    },
    {
        name: 'Local TURN (TCP)',
        urls: 'turn:144.31.75.55:3478?transport=tcp',
        username: 'nereus',
        credential: '0686879826b8c82c924cc1f92c1ec5e4',
        priority: 2  // 🥈 TCP медленнее UDP, но надежнее через firewall
    },
    
    // === TIER 2: Metered OpenRelay (хорошее качество, стабильный) ===
    {
        name: 'Metered OpenRelay (HTTPS 443)',
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
        priority: 3  // 🥉 HTTPS проходит через любые firewall
    },
    {
        name: 'Metered OpenRelay (TCP 443)',
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
        priority: 4  // TCP на 443 - второй лучший вариант
    },
    {
        name: 'Metered OpenRelay (UDP 80)',
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
        priority: 5  // UDP на 80 может блокироваться
    },
    
    // === TIER 3: Metered Relay (альтернативный домен, резерв) ===
    {
        name: 'Metered Relay (HTTPS 443)',
        urls: 'turn:relay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
        priority: 6  // Резервный домен
    },
    {
        name: 'Metered Relay (UDP 80)',
        urls: 'turn:relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
        priority: 7
    },
    
    // === TIER 4: Numb (старый, может быть перегружен) ===
    {
        name: 'Numb Viagenie',
        urls: 'turn:numb.viagenie.ca',
        username: 'webrtc@live.com',
        credential: 'muazkh',
        priority: 8  // Последний резерв
    }
];

// Кэш результатов тестирования
const TURN_CACHE_KEY = 'nereus_turn_servers_cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30 минут

/**
 * Получить закэшированные результаты тестирования TURN серверов
 */
function getCachedTURNServers() {
    try {
        const cached = localStorage.getItem(TURN_CACHE_KEY);
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        const now = Date.now();
        
        // Проверяем не устарел ли кэш
        if (now - data.timestamp > CACHE_DURATION) {
            localStorage.removeItem(TURN_CACHE_KEY);
            return null;
        }
        
        console.log('[TURN Test] ✅ Using cached TURN servers (age:', Math.round((now - data.timestamp) / 1000), 's)');
        return data.servers;
    } catch (error) {
        console.error('[TURN Test] Error reading cache:', error);
        return null;
    }
}

/**
 * Сохранить результаты тестирования в кэш
 */
function cacheTURNServers(servers) {
    try {
        const data = {
            servers: servers,
            timestamp: Date.now()
        };
        localStorage.setItem(TURN_CACHE_KEY, JSON.stringify(data));
        console.log('[TURN Test] 💾 Cached TURN servers for 30 minutes');
    } catch (error) {
        console.error('[TURN Test] Error caching results:', error);
    }
}

/**
 * Тестирование одного TURN сервера
 */
async function testTURNServer(turnConfig, timeout = 3000) {
    console.log(`[TURN Test] Testing ${turnConfig.name}...`);
    
    const startTime = performance.now();
    
    return new Promise((resolve) => {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                    urls: turnConfig.urls,
                    username: turnConfig.username,
                    credential: turnConfig.credential
                }
            ]
        };
        
        const pc = new RTCPeerConnection(config);
        let relayFound = false;
        let completed = false;
        
        // Таймаут
        const timeoutId = setTimeout(() => {
            if (!completed) {
                completed = true;
                pc.close();
                const latency = performance.now() - startTime;
                console.log(`[TURN Test] ❌ ${turnConfig.name} - TIMEOUT (${latency.toFixed(0)}ms)`);
                resolve({ 
                    server: turnConfig, 
                    success: false, 
                    latency: latency,
                    reason: 'timeout'
                });
            }
        }, timeout);
        
        pc.onicecandidate = (e) => {
            if (e.candidate && e.candidate.type === 'relay') {
                if (!completed) {
                    completed = true;
                    relayFound = true;
                    const latency = performance.now() - startTime;
                    
                    clearTimeout(timeoutId);
                    pc.close();
                    
                    console.log(`[TURN Test] ✅ ${turnConfig.name} - SUCCESS (${latency.toFixed(0)}ms)`);
                    resolve({ 
                        server: turnConfig, 
                        success: true, 
                        latency: latency 
                    });
                }
            }
        };
        
        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete' && !completed) {
                completed = true;
                clearTimeout(timeoutId);
                pc.close();
                
                const latency = performance.now() - startTime;
                console.log(`[TURN Test] ❌ ${turnConfig.name} - FAILED (no relay candidate, ${latency.toFixed(0)}ms)`);
                resolve({ 
                    server: turnConfig, 
                    success: false, 
                    latency: latency,
                    reason: 'no_relay'
                });
            }
        };
        
        // Обработка ошибок
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed' && !completed) {
                completed = true;
                clearTimeout(timeoutId);
                pc.close();
                
                const latency = performance.now() - startTime;
                console.log(`[TURN Test] ❌ ${turnConfig.name} - FAILED (ICE failed, ${latency.toFixed(0)}ms)`);
                resolve({ 
                    server: turnConfig, 
                    success: false, 
                    latency: latency,
                    reason: 'ice_failed'
                });
            }
        };
        
        // Создаем data channel чтобы запустить ICE gathering
        try {
            pc.createDataChannel('test');
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .catch(err => {
                    if (!completed) {
                        completed = true;
                        clearTimeout(timeoutId);
                        pc.close();
                        const latency = performance.now() - startTime;
                        console.log(`[TURN Test] ❌ ${turnConfig.name} - ERROR:`, err.message, `(${latency.toFixed(0)}ms)`);
                        resolve({ 
                            server: turnConfig, 
                            success: false, 
                            latency: latency,
                            reason: 'error'
                        });
                    }
                });
        } catch (error) {
            if (!completed) {
                completed = true;
                clearTimeout(timeoutId);
                pc.close();
                const latency = performance.now() - startTime;
                console.log(`[TURN Test] ❌ ${turnConfig.name} - ERROR:`, error.message, `(${latency.toFixed(0)}ms)`);
                resolve({ 
                    server: turnConfig, 
                    success: false, 
                    latency: latency,
                    reason: 'error'
                });
            }
        }
    });
}

/**
 * Тестирование всех TURN серверов параллельно и выбор лучших
 */
async function selectBestTURNServers(stateObj = null) {
    const testStartTime = performance.now();
    console.log('[TURN Test] 🚀 Starting parallel TURN server tests...');
    console.log(`[TURN Test] Testing ${TURN_SERVERS.length} TURN servers in parallel`);
    
    // Сохраняем информацию о начале тестирования для отправки после подключения WebSocket
    const testStartInfo = {
        type: 'turn-test-start',
        servers_count: TURN_SERVERS.length,
        servers: TURN_SERVERS.map(s => s.name)
    };
    
    // Отправляем информацию о начале тестирования на бекенд (если WebSocket готов)
    const currentState = stateObj || (typeof state !== 'undefined' ? state : null);
    if (currentState && currentState.videoSocket && currentState.videoSocket.readyState === WebSocket.OPEN) {
        try {
            currentState.videoSocket.send(JSON.stringify({
                ...testStartInfo,
                from: currentState.uid || 'system'
            }));
            console.log('[TURN Test] 📤 Sent test-start log to backend immediately');
        } catch (e) {
            console.warn('[TURN Test] Failed to send test-start log:', e);
        }
    } else {
        // Сохраняем для отправки позже
        if (!turnTestResults) turnTestResults = {};
        turnTestResults.startInfo = testStartInfo;
        console.log('[TURN Test] 💾 Saved test-start info for later (WebSocket not ready)');
    }
    
    // Запускаем все тесты параллельно
    const results = await Promise.all(
        TURN_SERVERS.map(server => testTURNServer(server, 3000))
    );
    
    const testDuration = performance.now() - testStartTime;
    
    // Фильтруем успешные и сортируем
    const workingServers = results
        .filter(r => r.success)
        .sort((a, b) => {
            // Сортируем по latency, затем по priority
            if (Math.abs(a.latency - b.latency) > 100) {
                return a.latency - b.latency; // Разница > 100ms - сортируем по latency
            }
            return a.server.priority - b.server.priority; // Иначе по priority
        });
    
    // Логируем результаты всех тестов
    console.log(`[TURN Test] 📊 Test results (${testDuration.toFixed(0)}ms total):`);
    results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const reason = result.reason ? ` (${result.reason})` : '';
        console.log(`   ${status} ${result.server.name}: ${result.latency.toFixed(0)}ms${reason}`);
    });
    
    if (workingServers.length === 0) {
        console.warn('[TURN Test] ⚠️ No working TURN servers found! Using all servers as fallback.');
        
        // Сохраняем результаты неудачного тестирования
        const testCompleteInfo = {
            type: 'turn-test-complete',
            success: false,
            working_servers: 0,
            total_servers: TURN_SERVERS.length,
            duration_ms: testDuration,
            selected_server: 'fallback (all servers)'
        };
        
        // Отправляем информацию о неудачном тестировании на бекенд (если WebSocket готов)
        const currentStateForFailed = stateObj || (typeof state !== 'undefined' ? state : null);
        if (currentStateForFailed && currentStateForFailed.videoSocket && currentStateForFailed.videoSocket.readyState === WebSocket.OPEN) {
            try {
                currentStateForFailed.videoSocket.send(JSON.stringify({
                    ...testCompleteInfo,
                    from: currentStateForFailed.uid || 'system'
                }));
                console.log('[TURN Test] 📤 Sent test-complete (failed) log to backend immediately');
            } catch (e) {
                console.warn('[TURN Test] Failed to send test-complete (failed) log:', e);
            }
        } else {
            // Сохраняем для отправки позже
            if (!turnTestResults) turnTestResults = {};
            turnTestResults.completeInfo = testCompleteInfo;
            console.log('[TURN Test] 💾 Saved test-complete (failed) info for later (WebSocket not ready)');
        }
        
        return TURN_SERVERS; // Возвращаем все, пусть WebRTC сам выберет
    }
    
    const bestServer = workingServers[0].server;
    console.log(`[TURN Test] ✅ Found ${workingServers.length} working TURN server(s):`);
    workingServers.forEach((result, index) => {
        const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        console.log(`   ${rank} ${result.server.name} (${result.latency.toFixed(0)}ms, priority: ${result.server.priority})`);
    });
    console.log(`[TURN Test] 🎯 Selected best server: ${bestServer.name} (${workingServers[0].latency.toFixed(0)}ms)`);
    
    // Сохраняем результаты для отправки на бекенд
    const testCompleteInfo = {
        type: 'turn-test-complete',
        success: true,
        working_servers: workingServers.length,
        total_servers: TURN_SERVERS.length,
        duration_ms: testDuration,
        selected_server: bestServer.name,
        selected_latency: workingServers[0].latency,
        all_results: results.map(r => ({
            name: r.server.name,
            success: r.success,
            latency: r.latency,
            reason: r.reason || null
        }))
    };
    
    // Отправляем информацию о результатах тестирования на бекенд (если WebSocket готов)
    const currentStateForComplete = stateObj || (typeof state !== 'undefined' ? state : null);
    if (currentStateForComplete && currentStateForComplete.videoSocket && currentStateForComplete.videoSocket.readyState === WebSocket.OPEN) {
        try {
            currentStateForComplete.videoSocket.send(JSON.stringify({
                ...testCompleteInfo,
                from: currentStateForComplete.uid || 'system'
            }));
            console.log('[TURN Test] 📤 Sent test-complete log to backend immediately');
        } catch (e) {
            console.warn('[TURN Test] Failed to send test-complete log:', e);
        }
    } else {
        // Сохраняем для отправки позже
        if (!turnTestResults) turnTestResults = {};
        turnTestResults.completeInfo = testCompleteInfo;
        console.log('[TURN Test] 💾 Saved test-complete info for later (WebSocket not ready)');
    }
    
    // Возвращаем отсортированный список (лучший первый)
    return workingServers.map(r => r.server);
}

/**
 * Создать оптимизированную конфигурацию WebRTC с лучшими TURN серверами
 */
async function createOptimizedConfiguration(maxWait = 2000, stateObj = null) {
    console.log(`[TURN Test] 🔧 Creating optimized configuration (max wait: ${maxWait}ms)...`);
    
    // Проверяем кэш
    const cached = getCachedTURNServers();
    if (cached) {
        console.log(`[TURN Test] ✅ Using cached configuration (${cached.length} servers)`);
        if (cached.length > 0) {
            console.log(`[TURN Test] Cached servers: ${cached.map(s => s.name).join(', ')}`);
        }
        
        // Отправляем информацию о использовании кэша на бекенд
        const cacheInfo = {
            type: 'turn-test-complete',
            success: true,
            working_servers: cached.length,
            total_servers: TURN_SERVERS.length,
            duration_ms: 0, // Кэш - мгновенно
            selected_server: cached[0]?.name || 'Unknown',
            selected_latency: 0,
            from_cache: true,
            all_results: cached.map(s => ({
                name: s.name,
                success: true,
                latency: 0,
                reason: 'cached'
            }))
        };
        
        // Сохраняем для отправки после подключения WebSocket
        if (!turnTestResults) turnTestResults = {};
        turnTestResults.completeInfo = cacheInfo;
        console.log('[TURN Test] 💾 Saved cached test results for later (WebSocket not ready)');
        
        return buildWebRTCConfig(cached);
    }
    
    // Если кэша нет - тестируем с таймаутом
    console.log('[TURN Test] ❌ No cache found, testing TURN servers...');
    console.log(`[TURN Test] ⏱️ Will wait up to ${maxWait}ms for test results`);
    
    const timeoutPromise = new Promise(resolve => {
        setTimeout(() => {
            console.log(`[TURN Test] ⏱️ Timeout (${maxWait}ms) reached - using default configuration`);
            console.log(`[TURN Test] Using all ${TURN_SERVERS.length} servers as fallback`);
            resolve(TURN_SERVERS);
        }, maxWait);
    });
    
    // Гонка: либо тесты завершатся, либо таймаут
    // Передаем stateObj если он передан в createOptimizedConfiguration
    const bestServers = await Promise.race([
        selectBestTURNServers(stateObj),
        timeoutPromise
    ]);
    
    // Кэшируем результат если есть успешные серверы
    if (bestServers.length > 0 && bestServers[0].name !== TURN_SERVERS[0].name) {
        // Проверяем что это не просто fallback
        console.log('[TURN Test] 🔍 Verifying cached servers before saving...');
        const testResults = await Promise.all(
            bestServers.slice(0, 3).map(server => testTURNServer(server, 2000))
        );
        const workingCount = testResults.filter(r => r.success).length;
        if (workingCount > 0) {
            console.log(`[TURN Test] ✅ Verified ${workingCount} working servers, caching results`);
            cacheTURNServers(bestServers);
        } else {
            console.log('[TURN Test] ⚠️ Verification failed, not caching');
        }
    } else {
        console.log('[TURN Test] ⚠️ Using fallback configuration, not caching');
    }
    
    const config = buildWebRTCConfig(bestServers);
    console.log(`[TURN Test] ✅ Configuration created with ${bestServers.length} TURN server(s)`);
    return config;
}

/**
 * Построить конфигурацию WebRTC из списка TURN серверов
 */
function buildWebRTCConfig(turnServers) {
    // Фильтруем серверы без urls и валидируем их
    const validServers = turnServers.filter(server => {
        if (!server.urls) {
            console.warn(`[TURN Config] Skipping server ${server.name} - missing urls`);
            return false;
        }
        return true;
    });
    
    return {
        iceServers: [
            // STUN серверы (для определения публичного IP)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Локальный STUN сервер
            { urls: 'stun:144.31.75.55:3478' },
            // Оптимизированные TURN серверы (отсортированы по качеству)
            ...validServers.map(server => {
                // Валидация: убеждаемся что все поля присутствуют
                if (!server.urls || !server.username || !server.credential) {
                    console.warn(`[TURN Config] Invalid server config:`, server);
                    return null;
                }
                return {
                    urls: server.urls,
                    username: server.username,
                    credential: server.credential
                };
            }).filter(Boolean), // Удаляем null значения
            // Дополнительные резервные TURN серверы (на случай если оптимизированные не работают)
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:numb.viagenie.ca',
                username: 'webrtc@live.com',
                credential: 'muazkh'
            }
        ],
        // Улучшенная конфигурация ICE
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
}

// Глобальная переменная для фонового тестирования
let backgroundTestPromise = null;
let configurationReady = false;
let defaultConfiguration = null;
// Сохраняем результаты тестирования для отправки на бекенд после подключения WebSocket
let turnTestResults = null;

// Начинаем тестирование сразу при загрузке модуля
if (typeof window !== 'undefined') {
    // Проверяем кэш и начинаем тестирование в фоне
    const cached = getCachedTURNServers();
    if (!cached) {
        console.log('[TURN Test] Starting background TURN server testing...');
        backgroundTestPromise = selectBestTURNServers().then(servers => {
            cacheTURNServers(servers);
            return servers;
        });
    } else {
        // Кэш есть - создаем промис который сразу возвращает кэш
        backgroundTestPromise = Promise.resolve(cached);
    }
}

// Wait for DOM to be ready
async function initApp() {
    console.log('[App] Initializing app...');
    
    const appElement = document.getElementById('app');
    if (!appElement) {
        console.error('[App] #app element not found');
        return;
    }
    
    console.log('[App] Found #app element');
    console.log('[App] #video-streams exists:', !!document.getElementById('video-streams'));
    
    // Создаем дефолтную конфигурацию (fallback)
    defaultConfiguration = buildWebRTCConfig(TURN_SERVERS);
    
    // Create app state object
    const state = {
        roomName: '',
        roomId: '',
        inviteUrl: '',
        userName: sessionStorage.getItem('name') || 'Guest',
        uid: sessionStorage.getItem('UID') || generateUID(),
        showChat: false,
        messages: [],
        newMessage: '',
        unreadCount: 0,
        isVideoEnabled: true,
        isAudioEnabled: true,
        localStream: null,
        peerConnections: {},
        videoSocket: null,
        chatSocket: null,
        displayedVideos: new Set(),
        connectedUsers: new Set(),
        pendingOffers: new Set(),
        iceCandidateQueue: {},
        lastMicActivityState: false,
        micActivityThrottle: null,
        // Блокировка для предотвращения множественных offer/answer циклов
        negotiationInProgress: new Set(),
        // Дебаунс для обновления видео
        videoUpdateTimers: {},
        videoPlayPromises: {},
        // Состояние камеры для каждого пользователя (по UID)
        userCameraStates: {},
        // Флаг для отслеживания скрытия лоадера (чтобы не скрывать преждевременно)
        loaderHidden: {},
        // Состояние аудио для каждого пользователя (по UID)
        userAudioStates: {},
        // Качество связи для каждого пользователя (по UID)
        connectionQuality: {},
        // Задержка (RTT) для каждого пользователя (по UID) в миллисекундах
        connectionLatency: {},
        // Имена пользователей (по UID)
        userNames: {},
        // Whiteboard
        whiteboard: null,
        showWhiteboard: false,
        // WebSocket переподключение
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        reconnectDelay: 1000,
        isLeaving: false,
        // Конфигурация WebRTC (будет установлена асинхронно)
        configuration: defaultConfiguration,  // Временная конфигурация
        configurationReady: false,  // Флаг готовности оптимизированной конфигурации
        // Очередь для последовательного создания соединений (для стабильности при 3+ пользователях)
        connectionQueue: [],
        isProcessingQueue: false,
        // Демонстрация экрана
        isScreenSharing: false,
        screenShareStream: null,
        screenShareTrack: null,
        screenAudioTrack: null,  // Аудио трек из экрана
        micTrack: null, // Трек микрофона (для использования при демонстрации экрана)
        mixedAudioStream: null,  // Микшированный аудио стрим (микрофон + звук экрана)
        audioContext: null,  // Web Audio API контекст для микширования
        currentSharingUser: null,  // UID пользователя, который демонстрирует экран
        cameraStream: null  // Сохраненный стрим камеры пользователя (для восстановления после screen share)
    };
    
    // Асинхронная инициализация оптимизированной конфигурации
    // Теперь state создан, можем использовать его для логирования
    (async () => {
        try {
            console.log('[App] 🔍 Optimizing TURN server configuration...');
            // Передаем state в функцию тестирования
            const optimizedConfig = await createOptimizedConfiguration(2000, state); // Максимум 2 секунды ожидания
            state.configuration = optimizedConfig;
            state.configurationReady = true;
            configurationReady = true;
            console.log('[App] ✅ Optimized configuration ready');
        } catch (error) {
            console.error('[App] ❌ Error optimizing configuration:', error);
            // Используем дефолтную конфигурацию
            state.configuration = defaultConfiguration;
            state.configurationReady = true;
            configurationReady = true;
        }
    })();
    
    function generateUID() {
        const uid = Math.random().toString(36).substring(7);
        sessionStorage.setItem('UID', uid);
        return uid;
    }
    
    // Палитра цветов для SVG
    const colorPalette = ['#CAD2C5', '#84A98C', '#52796F', '#354F52', '#2F3E46'];
    
    // Генерация случайных цветов для пользователя на основе его UID
    function getUserColors(uid) {
        // Используем UID как seed для генерации детерминированных случайных цветов
        let hash = 0;
        for (let i = 0; i < uid.length; i++) {
            hash = uid.charCodeAt(i) + ((hash << 5) - hash);
        }
        hash = Math.abs(hash);
        
        // Перемешиваем палитру на основе hash
        const shuffled = [...colorPalette];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = (hash + i) % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        return {
            primary: shuffled[hash % colorPalette.length],
            secondary: shuffled[(hash + 1) % colorPalette.length],
            accent: shuffled[(hash + 2) % colorPalette.length]
        };
    }
    
    // Генерация SVG с случайными цветами (без градиентов)
    function generateNoCamSVG(uid) {
        const colors = getUserColors(uid);
        
        return `
            <div style="width: 100%; height: 100%; position: relative; background: ${colors.primary};">
                <svg width="200" height="200" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" 
                     style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                            width: 200px; height: 200px; max-width: 30vw; max-height: 30vh;"
                     preserveAspectRatio="xMidYMid meet">
                    <g fill="${colors.accent}" fill-rule="nonzero">
                        <path d="M17.5,12 C19.9852814,12 22,14.0147186 22,16.5 C22,18.9852814 19.9852814,21 17.5,21 C15.3591076,21 13.5674006,19.5049595 13.1119514,17.5019509 L10.8880486,17.5019509 C10.4325994,19.5049595 8.64089238,21 6.5,21 C4.01471863,21 2,18.9852814 2,16.5 C2,14.0147186 4.01471863,12 6.5,12 C8.81637876,12 10.7239814,13.7501788 10.9725684,16.000297 L13.0274316,16.000297 C13.2760186,13.7501788 15.1836212,12 17.5,12 Z M6.5,13.5 C4.84314575,13.5 3.5,14.8431458 3.5,16.5 C3.5,18.1568542 4.84314575,19.5 6.5,19.5 C8.15685425,19.5 9.5,18.1568542 9.5,16.5 C9.5,14.8431458 8.15685425,13.5 6.5,13.5 Z M17.5,13.5 C15.8431458,13.5 14.5,14.8431458 14.5,16.5 C14.5,18.1568542 15.8431458,19.5 17.5,19.5 C19.1568542,19.5 20.5,18.1568542 20.5,16.5 C20.5,14.8431458 19.1568542,13.5 17.5,13.5 Z M12,9.25 C15.3893368,9.25 18.5301001,9.58954198 21.4217795,10.2699371 C21.8249821,10.3648083 22.0749341,10.7685769 21.9800629,11.1717795 C21.8851917,11.5749821 21.4814231,11.8249341 21.0782205,11.7300629 C18.3032332,11.0771247 15.2773298,10.75 12,10.75 C8.72267018,10.75 5.69676679,11.0771247 2.9217795,11.7300629 C2.51857691,11.8249341 2.11480832,11.5749821 2.01993712,11.1717795 C1.92506593,10.7685769 2.17501791,10.3648083 2.5782205,10.2699371 C5.46989988,9.58954198 8.61066315,9.25 12,9.25 Z M15.7002538,3.25 C16.7230952,3.25 17.6556413,3.81693564 18.1297937,4.71158956 L18.2132356,4.88311922 L19.6853587,8.19539615 C19.8535867,8.57390929 19.683117,9.0171306 19.3046038,9.18535866 C18.9576335,9.33956772 18.5562903,9.20917654 18.3622308,8.89482229 L18.3146413,8.80460385 L16.8425183,5.49232692 C16.6601304,5.08195418 16.2735894,4.80422037 15.8336777,4.75711483 L15.7002538,4.75 L8.29974618,4.75 C7.85066809,4.75 7.43988259,4.99042719 7.21817192,5.37329225 L7.15748174,5.49232692 L5.68535866,8.80460385 C5.5171306,9.18311699 5.07390929,9.35358672 4.69539615,9.18535866 C4.34842577,9.03114961 4.17626965,8.64586983 4.27956492,8.29117594 L4.31464134,8.19539615 L5.78676442,4.88311922 C6.20217965,3.94843495 7.09899484,3.32651789 8.10911143,3.25658537 L8.29974618,3.25 L15.7002538,3.25 Z" />
                    </g>
                </svg>
            </div>
        `;
    }
    
    // Проверка, включена ли камера в стриме
    function isVideoEnabled(stream) {
        if (!stream) return false;
        
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) return false;
        
        // Проверяем, есть ли хотя бы один активный видео трек
        return videoTracks.some(track => track.enabled && track.readyState === 'live');
    }
    
    // Обновление отображения видео/SVG в зависимости от состояния камеры
    // Оптимизация: дебаунсинг для updateVideoDisplay
    const videoDisplayTimers = {};
    const lastVideoDisplayState = {};
    
    function updateVideoDisplay(uid, stream) {
        // Отменяем предыдущий таймер для этого пользователя
        if (videoDisplayTimers[uid]) {
            clearTimeout(videoDisplayTimers[uid]);
        }
        
        // Дебаунсинг: обновляем через небольшую задержку
        videoDisplayTimers[uid] = setTimeout(() => {
            const videoContainer = document.getElementById(`video-${uid}`);
            if (!videoContainer) {
                console.warn('[Video] Video container not found for uid:', uid);
                delete videoDisplayTimers[uid];
                return;
            }
            
            // Оптимизация: проверяем, изменилось ли состояние
            const isLocal = uid === state.uid;
            let hasVideo = false;
            
            // Для удаленных пользователей используем сохраненное состояние, если оно установлено
            // Если состояние не установлено, проверяем стрим (трек может быть активен)
            if (!isLocal) {
                const cameraStateSet = state.userCameraStates.hasOwnProperty(uid);
                if (cameraStateSet) {
                    // Состояние установлено - используем его
                    hasVideo = state.userCameraStates[uid];
                } else {
                    // Состояние не установлено - проверяем стрим
                    hasVideo = stream && stream.getVideoTracks().length > 0 && 
                              stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');
                }
            } else {
                // Для локальных проверяем стрим
                hasVideo = stream && stream.getVideoTracks().length > 0 && 
                          stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');
            }
            
            const currentState = `${hasVideo}-${isLocal}`;
            
            if (lastVideoDisplayState[uid] === currentState) {
                // Состояние не изменилось, пропускаем обновление
                delete videoDisplayTimers[uid];
                return;
            }
            lastVideoDisplayState[uid] = currentState;
            
            updateVideoDisplayInternal(uid, stream, videoContainer, isLocal, hasVideo);
            delete videoDisplayTimers[uid];
        }, 50);
    }
    
    function updateVideoDisplayInternal(uid, stream, videoContainer, isLocal, hasVideoParam) {
        // ВАЖНО: Если это локальный пользователь и включен screen share, ВСЕГДА используем cameraStream вместо localStream
        // Это критично для мобильных устройств, чтобы камера не заменялась на screen share
        if (isLocal && state.isScreenSharing) {
            if (state.cameraStream) {
                // Для камеры пользователя используем сохраненный cameraStream (без screen share)
                stream = state.cameraStream;
                console.log('[Video] Using cameraStream for local user during screen share, videoTracks:', state.cameraStream.getVideoTracks().length);
            } else {
                // Если cameraStream не создан, создаем пустой стрим (камера не будет отображаться)
                stream = new MediaStream();
                console.warn('[Video] cameraStream not found for local user during screen share, using empty stream');
            }
        }
        
        const video = videoContainer.querySelector('video');
        const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
        const loader = !isLocal ? videoContainer.querySelector('.video-loader') : null;
        
        if (!video && !svgPlaceholder) {
            return; // Нет элементов для обновления
        }
        
        // Для удаленных пользователей используем сохраненное состояние из WebSocket
        let shouldShowVideo = hasVideoParam;
        if (!isLocal) {
            const savedState = state.userCameraStates.hasOwnProperty(uid);
            if (savedState) {
                // Если состояние установлено, используем его
                shouldShowVideo = hasVideoParam && state.userCameraStates[uid];
            } else {
                // Если состояние не установлено, показываем видео если трек активен
                // Это временное решение до получения явного сообщения о состоянии
                shouldShowVideo = hasVideoParam;
                console.log('[Video] Camera state not set for', uid, '- showing video based on track state:', hasVideoParam);
            }
        }
        
        console.log('[Video] updateVideoDisplayInternal for', uid, 'shouldShowVideo:', shouldShowVideo, 'isLocal:', isLocal);
        
        // Для удаленных пользователей: убеждаемся, что лоадер виден перед обновлением видео
        if (!isLocal && loader && shouldShowVideo) {
            loader.style.display = 'flex';
            loader.style.visibility = 'visible';
            loader.style.opacity = '1';
            loader.style.transition = 'opacity 0.2s ease-in';
            console.log('[Video] Ensuring loader visible in updateVideoDisplayInternal for', uid);
        }
        
        // Оптимизация: используем requestAnimationFrame для обновления DOM
        requestAnimationFrame(() => {
            if (shouldShowVideo) {
                // Показываем видео, скрываем SVG
                if (video) {
                    // Дебаунс для обновления srcObject - предотвращаем частые обновления
                    if (state.videoUpdateTimers[uid]) {
                        clearTimeout(state.videoUpdateTimers[uid]);
                    }
                    
                    state.videoUpdateTimers[uid] = setTimeout(() => {
                        // Проверяем, изменился ли srcObject перед обновлением
                        if (video.isConnected && stream) {
                            const currentStream = video.srcObject;
                            const streamChanged = currentStream !== stream;
                            
                            // Для локального видео принудительно обновляем srcObject при включении камеры
                            // чтобы избежать зависшей картинки
                            const shouldUpdate = streamChanged || (isLocal && shouldShowVideo && 
                                stream.getVideoTracks().length > 0 && 
                                stream.getVideoTracks()[0].enabled);
                            
                            if (shouldUpdate) {
                                if (streamChanged) {
                                    console.log(`[Video] Stream changed in updateVideoDisplayInternal for ${uid}, updating srcObject`);
                                } else if (isLocal) {
                                    console.log(`[Video] Force updating srcObject for local video ${uid} to refresh display`);
                                }
                                
                                // Отменяем предыдущий play() если он еще выполняется
                                if (state.videoPlayPromises[uid]) {
                                    state.videoPlayPromises[uid].catch(() => {}); // Игнорируем ошибки отмены
                                    state.videoPlayPromises[uid] = null;
                                }
                                
                                // Для локального видео принудительно обновляем srcObject
                                if (isLocal && currentStream === stream) {
                                    // Временно устанавливаем null, чтобы принудительно обновить
                                    video.srcObject = null;
                                    // Используем requestAnimationFrame для обновления в следующем кадре
                                    requestAnimationFrame(() => {
                                        video.srcObject = stream;
                                    });
                                } else {
                                    video.srcObject = stream;
                                }
                                
                                // Оптимизация для мобильных: применяем ограничения качества к удаленным потокам
                                if (!isLocal && isMobile && stream.getVideoTracks().length > 0) {
                                    const videoTrack = stream.getVideoTracks()[0];
                                    if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
                                        // Пытаемся снизить качество для мобильных устройств
                                        videoTrack.applyConstraints({
                                            width: { ideal: 640, max: 1280 },
                                            height: { ideal: 480, max: 720 },
                                            frameRate: { ideal: 15, max: 30 }
                                        }).catch(err => {
                                            // Игнорируем ошибки - не все браузеры поддерживают изменение удаленных треков
                                            console.log('[Video] Could not apply constraints to remote track (expected):', err.message);
                                        });
                                    }
                                }
                            }
                            
                            // Для удаленных пользователей убеждаемся, что аудио не приглушено
                            if (!isLocal) {
                                video.muted = false;
                            }
                            
                            if (video.style.display !== 'block') {
                                video.style.display = 'block';
                                video.style.zIndex = '2';
                                console.log('[Video] Showing video in updateVideoDisplayInternal for', uid);
                            }
                            
                            // Оптимизация для мобильных: последовательное воспроизведение вместо одновременного
                            // Для мобильных устройств добавляем задержку между воспроизведением видео
                            const displayedVideosArray = Array.from(state.displayedVideos);
                            const videoIndex = displayedVideosArray.indexOf(uid);
                            const playDelay = isMobile && !isLocal && videoIndex >= 0 ? 
                                (videoIndex * 200) : 0;
                            
                            // Запускаем воспроизведение только если видео приостановлено или еще не загружено
                            // Для локального видео всегда пытаемся запустить при включении камеры
                            const shouldPlay = (shouldUpdate && (video.paused || video.readyState < 2)) || 
                                             (isLocal && shouldShowVideo && video.paused);
                            
                            if (shouldPlay) {
                                const loaderForPlay = !isLocal ? videoContainer.querySelector('.video-loader') : null;
                                
                                const playVideo = () => {
                                    state.videoPlayPromises[uid] = video.play().catch(err => {
                                        // Игнорируем AbortError - это нормально, если видео было удалено или приостановлено
                                        if (err.name !== 'AbortError') {
                                            console.error('[Video] Error playing video in updateVideoDisplayInternal:', err);
                                        }
                                        // Скрываем лоадер при ошибке
                                        if (loaderForPlay) {
                                            loaderForPlay.style.opacity = '0';
                                            loaderForPlay.style.transition = 'opacity 0.3s ease-out';
                                            setTimeout(() => {
                                                loaderForPlay.style.display = 'none';
                                                loaderForPlay.style.visibility = 'hidden';
                                                state.loaderHidden[uid] = true;
                                            }, 300);
                                        }
                                    });
                                };
                                
                                if (playDelay > 0) {
                                    setTimeout(playVideo, playDelay);
                                    console.log(`[Video] Delaying video play for ${uid} by ${playDelay}ms (mobile optimization)`);
                                } else {
                                    playVideo();
                                }
                            }
                        }
                        
                        delete state.videoUpdateTimers[uid];
                    }, debounceDelay);
                }
                if (svgPlaceholder && svgPlaceholder.style.display !== 'none') {
                    svgPlaceholder.style.display = 'none';
                    console.log('[Video] Hiding placeholder in updateVideoDisplayInternal for', uid);
                }
            } else {
                // Скрываем видео, показываем SVG
                if (video && video.style.display !== 'none') {
                    video.style.display = 'none';
                    video.pause();
                }
                if (svgPlaceholder && svgPlaceholder.style.display !== 'block') {
                    svgPlaceholder.style.display = 'block';
                } else if (!svgPlaceholder) {
                    // Создаем SVG placeholder если его нет
                    const placeholder = document.createElement('div');
                    placeholder.className = 'no-cam-placeholder';
                    placeholder.style.width = '100%';
                    placeholder.style.height = '100%';
                    placeholder.style.position = 'absolute';
                    placeholder.style.top = '0';
                    placeholder.style.left = '0';
                    placeholder.style.display = 'block';
                    placeholder.style.zIndex = '1';
                    placeholder.innerHTML = generateNoCamSVG(uid);
                    videoContainer.appendChild(placeholder);
                    console.log('[Video] Created SVG placeholder for:', uid);
                }
            }
        });
    }
    
    // Update DOM based on state
    function updateRoomName() {
        const roomNameSpan = document.getElementById('room-name-display');
        if (roomNameSpan) {
            roomNameSpan.textContent = state.roomName;
            console.log('[DOM] Updated room name to:', state.roomName);
        } else {
            console.error('[DOM] room-name-display element not found!');
        }
    }
    
    function updateInviteUrl() {
        const inviteInput = document.getElementById('invite-link-input');
        const inviteContainer = document.getElementById('invite-link-container');
        if (inviteInput) {
            inviteInput.value = state.inviteUrl;
        }
        if (inviteContainer) {
            inviteContainer.style.display = state.inviteUrl ? 'block' : 'none';
        }
    }
    
    function updateUnreadCount() {
        const badge = document.getElementById('chat-badge');
        if (badge) {
            badge.textContent = state.unreadCount;
            badge.style.display = state.unreadCount > 0 ? 'block' : 'none';
        }
    }
    
    
    function updateMessages() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        chatMessages.innerHTML = state.messages.map((message, index) => {
            const isOwn = message.user_name === state.userName;
            return `
                <div class="message ${isOwn ? 'own' : ''}" data-index="${index}">
                    <div class="message-avatar"></div>
                    <div class="message-content">
                        <div class="message-author">${isOwn ? 'You' : message.user_name}</div>
                        <div class="message-text">${message.message}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 0);
    }
    
    function updateControlButtons() {
        const micBtn = document.getElementById('toggle-mic-btn');
        const cameraBtn = document.getElementById('toggle-camera-btn');
        
        // ВАЖНО: при демонстрации экрана состояние микрофона берется из state.isAudioEnabled,
        // а не из трека в localStream, так как трек может быть микшированным
        if (!state.isScreenSharing && state.localStream) {
            const audioTracks = state.localStream.getAudioTracks();
            const videoTracks = state.localStream.getVideoTracks();
            
            if (audioTracks.length > 0) {
                // Ищем трек микрофона (не микшированный, не из экрана)
                const micTrack = audioTracks.find(track => 
                    track !== state.mixedAudioStream?.getAudioTracks()[0] &&
                    track !== state.screenAudioTrack
                );
                if (micTrack) {
                    state.isAudioEnabled = micTrack.enabled;
                } else if (audioTracks.length > 0) {
                    // Если не нашли отдельный трек микрофона, используем первый трек
                    state.isAudioEnabled = audioTracks[0].enabled;
                }
            }
            
            if (videoTracks.length > 0) {
                state.isVideoEnabled = videoTracks[0].enabled;
            }
        }
        // При демонстрации экрана используем state.isAudioEnabled напрямую (не синхронизируем с треками)
        
        if (micBtn) {
            // active = включено (нет перечеркивания), не active = выключено (есть перечеркивание)
            micBtn.classList.toggle('active', state.isAudioEnabled);
            // Убеждаемся, что кнопка кликабельна
            micBtn.disabled = false;
            console.log('[Controls] Mic button active:', state.isAudioEnabled, 'state.isAudioEnabled:', state.isAudioEnabled, 'isScreenSharing:', state.isScreenSharing);
        }
        if (cameraBtn) {
            // active = включено (нет перечеркивания), не active = выключено (есть перечеркивание)
            cameraBtn.classList.toggle('active', state.isVideoEnabled);
            console.log('[Controls] Camera button active:', state.isVideoEnabled, 'state.isVideoEnabled:', state.isVideoEnabled);
        }
    }
    
    function updateScreenShareButton() {
        const screenShareBtn = document.getElementById('toggle-screen-share-btn');
        if (!screenShareBtn) return;
        
        // Проверяем, можем ли мы начать демонстрацию экрана
        const canStartSharing = !state.currentSharingUser || state.currentSharingUser === state.uid;
        const isSharing = state.isScreenSharing && state.currentSharingUser === state.uid;
        
        // Обновляем состояние кнопки
        screenShareBtn.classList.toggle('active', isSharing);
        screenShareBtn.classList.toggle('disabled', !canStartSharing && !isSharing);
        
        // Обновляем title для подсказки
        if (isSharing) {
            screenShareBtn.title = 'Остановить демонстрацию экрана';
        } else if (!canStartSharing) {
            screenShareBtn.title = `Демонстрация экрана уже ведется пользователем ${state.userNames[state.currentSharingUser] || state.currentSharingUser}`;
        } else {
            screenShareBtn.title = 'Начать демонстрацию экрана';
        }
    }
    
    // Initialize room
    async function initializeRoom() {
        console.log('[Init] Initializing room...');
        
        // Инициализируем состояние кнопок с начальными значениями
        // Они будут обновлены после получения медиа потока
        updateControlButtons();
        updateScreenShareButton();
        
        const roomNameEl = document.getElementById('room-name');
        if (roomNameEl) {
            state.roomName = JSON.parse(roomNameEl.textContent);
            console.log('[Init] Room name from element:', state.roomName);
        } else {
            state.roomName = sessionStorage.getItem('room') || 'DEFAULT';
            console.log('[Init] Room name from sessionStorage:', state.roomName);
        }
        updateRoomName();
        
        const inviteUrlEl = document.getElementById('invite-url');
        if (inviteUrlEl) {
            state.inviteUrl = JSON.parse(inviteUrlEl.textContent);
            console.log('[Init] Invite URL:', state.inviteUrl);
        }
        updateInviteUrl();
        
        const roomIdEl = document.getElementById('room-id');
        if (roomIdEl) {
            state.roomId = JSON.parse(roomIdEl.textContent);
            console.log('[Init] Room ID:', state.roomId);
        }
        
        console.log('[Init] Starting WebRTC initialization...');
        await initializeWebRTC();
        console.log('[Init] Starting chat initialization...');
        initializeChat();
        console.log('[Init] Starting whiteboard initialization...');
        initializeWhiteboard();
        console.log('[Init] Room initialization complete');
    }
    
    // Initialize Whiteboard
    function initializeWhiteboard() {
        // Обработчики кнопок доски
        const whiteboardToggleBtn = document.getElementById('whiteboard-toggle-btn');
        if (whiteboardToggleBtn) {
            whiteboardToggleBtn.addEventListener('click', () => {
                toggleWhiteboard();
            });
        }
        
        // Обработчики инструментов
        const toolButtons = document.querySelectorAll('.whiteboard-tool-btn[data-tool]');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.getAttribute('data-tool');
                setWhiteboardTool(tool);
            });
        });
        
        // Обработчик цвета
        const colorInput = document.getElementById('whiteboard-color');
        if (colorInput) {
            colorInput.addEventListener('change', (e) => {
                if (state.whiteboard) {
                    state.whiteboard.setBrushColor(e.target.value);
                }
            });
        }
        
        // Обработчик толщины
        const widthInput = document.getElementById('whiteboard-width');
        if (widthInput) {
            widthInput.addEventListener('input', (e) => {
                if (state.whiteboard) {
                    state.whiteboard.setBrushWidth(parseInt(e.target.value));
                }
            });
        }
        
        // Обработчик очистки
        const clearBtn = document.getElementById('whiteboard-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (state.whiteboard) {
                    state.whiteboard.clear();
                }
            });
        }
        
        // Обработчик загрузки изображения
        const imageBtn = document.getElementById('whiteboard-image-btn');
        const imageInput = document.getElementById('whiteboard-image-input');
        if (imageBtn && imageInput) {
            imageBtn.addEventListener('click', () => {
                console.log('[Whiteboard] Image button clicked');
                if (state.whiteboard && state.whiteboard.isActive) {
                    imageInput.click();
                } else {
                    console.warn('[Whiteboard] Cannot add image - whiteboard not active');
                }
            });
            imageInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file && state.whiteboard) {
                    console.log('[Whiteboard] Image file selected:', file.name, file.type, file.size);
                    try {
                        await state.whiteboard.addImageFromFile(file);
                        console.log('[Whiteboard] Image file successfully processed');
                    } catch (error) {
                        console.error('[Whiteboard] Error processing image file:', error);
                    }
                } else {
                    console.warn('[Whiteboard] No file selected or whiteboard not initialized');
                }
                // Сбрасываем input для возможности загрузки того же файла снова
                e.target.value = '';
            });
        } else {
            console.warn('[Whiteboard] Image button or input not found:', { imageBtn: !!imageBtn, imageInput: !!imageInput });
        }
        
        console.log('[Whiteboard] Event handlers attached');
    }
    
    /**
     * Перемещает камеры в header при демонстрации экрана
     */
    function moveCamerasToHeaderForScreenShare() {
        const mainContent = document.querySelector('.main-content');
        const roomHeader = document.querySelector('.room-header');
        const videoStreams = document.getElementById('video-streams');
        const screenShareContainer = document.getElementById(`video-${state.uid}`);
        
        if (!mainContent || !roomHeader || !videoStreams) {
            console.warn('[ScreenShare] Cannot move cameras to header - elements not found');
            return;
        }
        
        // Добавляем класс для режима демонстрации экрана
        mainContent.classList.add('screen-share-mode');
        roomHeader.classList.add('screen-share-mode');
        
        // Создаем контейнер для камер в header
        let headerVideoStreams = roomHeader.querySelector('.video-streams');
        if (!headerVideoStreams) {
            headerVideoStreams = document.createElement('div');
            headerVideoStreams.className = 'video-streams';
            headerVideoStreams.id = 'header-video-streams';
            roomHeader.appendChild(headerVideoStreams);
        }
        
        // Сначала обновляем класс экрана демонстрации (чтобы он был помечен до перемещения)
        if (screenShareContainer) {
            screenShareContainer.classList.add('screen-share');
        }
        
        // Перемещаем все камеры (кроме экрана демонстрации) в header
        // ВАЖНО: получаем все контейнеры ДО начала перемещения, так как DOM будет изменяться
        const allVideoContainers = Array.from(videoStreams.querySelectorAll('.video-container'));
        console.log('[ScreenShare] Found video containers:', allVideoContainers.length);
        
        allVideoContainers.forEach(container => {
            const uid = container.id.replace('video-', '');
            // НЕ перемещаем экран демонстрации (это экран текущего пользователя с классом screen-share)
            // Проверяем и по UID, и по классу screen-share для надежности
            const isScreenShare = (uid === state.uid && state.isScreenSharing && state.currentSharingUser === state.uid) || 
                                  container.classList.contains('screen-share');
            
            if (!isScreenShare) {
                // Перемещаем все камеры (других пользователей и камеру текущего пользователя, если это не экран демонстрации)
                console.log('[ScreenShare] Moving camera to header:', uid);
                container.remove();
                headerVideoStreams.appendChild(container);
            } else {
                console.log('[ScreenShare] Keeping screen share container in main area:', uid);
            }
        });
        
        // Также проверяем, есть ли еще контейнеры, которые нужно переместить
        // (на случай, если они были добавлены после начала демонстрации)
        const remainingContainers = Array.from(videoStreams.querySelectorAll('.video-container'));
        if (remainingContainers.length > 0) {
            remainingContainers.forEach(container => {
                const uid = container.id.replace('video-', '');
                const isScreenShare = (uid === state.uid && state.isScreenSharing && state.currentSharingUser === state.uid) || 
                                      container.classList.contains('screen-share');
                if (!isScreenShare) {
                    console.log('[ScreenShare] Moving remaining camera to header:', uid);
                    container.remove();
                    headerVideoStreams.appendChild(container);
                }
            });
        }
        
        console.log('[ScreenShare] Cameras moved to header');
    }
    
    /**
     * Возвращает камеры обратно в video-section после остановки демонстрации
     */
    function returnCamerasFromHeader() {
        const mainContent = document.querySelector('.main-content');
        const roomHeader = document.querySelector('.room-header');
        const videoStreams = document.getElementById('video-streams');
        const headerVideoStreams = roomHeader?.querySelector('.video-streams');
        
        if (!mainContent || !videoStreams) {
            console.warn('[ScreenShare] Cannot return cameras from header - elements not found');
            return;
        }
        
        // Удаляем класс режима демонстрации экрана
        mainContent.classList.remove('screen-share-mode');
        if (roomHeader) {
            roomHeader.classList.remove('screen-share-mode');
        }
        
        // Перемещаем камеры обратно в video-section
        if (headerVideoStreams) {
            const allVideoContainers = headerVideoStreams.querySelectorAll('.video-container');
            allVideoContainers.forEach(container => {
                container.remove();
                videoStreams.appendChild(container);
            });
            
            // Удаляем контейнер из header
            headerVideoStreams.remove();
        }
        
        // Удаляем класс screen-share с экрана демонстрации
        const screenShareContainer = document.getElementById(`video-${state.uid}`);
        if (screenShareContainer) {
            screenShareContainer.classList.remove('screen-share');
        }
        
        // Обновляем layout
        setTimeout(() => {
            updateVideoLayout();
        }, 100);
        
        console.log('[ScreenShare] Cameras returned from header');
    }
    
    function toggleWhiteboard() {
        state.showWhiteboard = !state.showWhiteboard;
        const whiteboardSection = document.getElementById('whiteboard-section');
        const whiteboardToggleBtn = document.getElementById('whiteboard-toggle-btn');
        const mainContent = document.querySelector('.main-content');
        const roomHeader = document.querySelector('.room-header');
        const videoStreams = document.getElementById('video-streams');
        const controlsWrapper = document.querySelector('.controls-wrapper');
        
        if (whiteboardSection) {
            if (state.showWhiteboard) {
                whiteboardSection.style.display = 'flex';
                if (whiteboardToggleBtn) {
                    whiteboardToggleBtn.classList.add('active');
                }
                if (mainContent) {
                    mainContent.classList.add('whiteboard-open');
                }
                // Перемещаем камеры в header
                if (roomHeader && videoStreams) {
                    roomHeader.classList.add('whiteboard-mode');
                    // Перемещаем video-streams в header
                    const headerContent = roomHeader.querySelector('.header-content');
                    if (headerContent) {
                        roomHeader.insertBefore(videoStreams, headerContent);
                    } else {
                        roomHeader.appendChild(videoStreams);
                    }
                }
                // Убеждаемся, что панель управления видна
                if (controlsWrapper) {
                    const isTablet = window.innerWidth <= 1024 && window.innerWidth > 480;
                    
                    // Для планшета удаляем все inline стили - используем CSS
                    if (isTablet) {
                        controlsWrapper.removeAttribute('style');
                    } else {
                        // Для других устройств применяем стили только если доска открыта
                        updateControlsWrapperStyles();
                    }
                    
                    // Убеждаемся, что панель видна
                    controlsWrapper.style.setProperty('display', 'flex', 'important');
                    controlsWrapper.style.setProperty('visibility', 'visible', 'important');
                    controlsWrapper.style.setProperty('opacity', '1', 'important');
                    
                    console.log('[Whiteboard] Controls wrapper positioned, parent:', controlsWrapper.parentElement);
                }
                // Инициализируем canvas, если еще не инициализирован
                if (!state.whiteboard && state.videoSocket) {
                    const canvasElement = document.getElementById('whiteboard-canvas');
                    if (canvasElement) {
                        state.whiteboard = new WhiteboardManager(state.roomName, state.videoSocket, state.uid);
                        state.whiteboard.init(canvasElement);
                        console.log('[Whiteboard] Canvas initialized');
                    }
                }
                if (state.whiteboard) {
                    state.whiteboard.show();
                }
                
                // Перемещаем панель управления в body, чтобы она была видна поверх доски
                if (controlsWrapper) {
                    // Если панель еще не в body, перемещаем её
                    if (!controlsWrapper.parentElement || controlsWrapper.parentElement.tagName !== 'BODY') {
                        document.body.appendChild(controlsWrapper);
                        console.log('[Whiteboard] Controls wrapper moved to body, parent:', controlsWrapper.parentElement);
                    } else {
                        console.log('[Whiteboard] Controls wrapper already in body');
                    }
                    
                    // Применяем стили еще раз после перемещения
                    setTimeout(() => {
                        controlsWrapper.style.setProperty('display', 'flex', 'important');
                        controlsWrapper.style.setProperty('visibility', 'visible', 'important');
                        controlsWrapper.style.setProperty('opacity', '1', 'important');
                        controlsWrapper.style.setProperty('position', 'fixed', 'important');
                        controlsWrapper.style.setProperty('bottom', '20px', 'important');
                        controlsWrapper.style.setProperty('left', '50%', 'important');
                        controlsWrapper.style.setProperty('transform', 'translateX(-50%)', 'important');
                        controlsWrapper.style.setProperty('z-index', '2004', 'important');
                        console.log('[Whiteboard] Controls wrapper styles reapplied after move');
                    }, 50);
                }
                // Обновляем layout камер
                setTimeout(() => {
                    updateVideoLayout();
                }, 100);
            } else {
                whiteboardSection.style.display = 'none';
                if (whiteboardToggleBtn) {
                    whiteboardToggleBtn.classList.remove('active');
                }
                if (mainContent) {
                    mainContent.classList.remove('whiteboard-open');
                }
                // Возвращаем камеры обратно в video-section
                if (roomHeader && videoStreams) {
                    roomHeader.classList.remove('whiteboard-mode');
                    const videoSection = document.getElementById('video-section');
                    if (videoSection) {
                        videoSection.insertBefore(videoStreams, videoSection.querySelector('.controls-wrapper'));
                    }
                }
                
                // Возвращаем панель управления обратно в video-section
                if (controlsWrapper && controlsWrapper.parentElement === document.body) {
                    const videoSection = document.getElementById('video-section');
                    if (videoSection) {
                        videoSection.appendChild(controlsWrapper);
                        // Удаляем все inline стили - используем CSS
                        controlsWrapper.removeAttribute('style');
                        console.log('[Whiteboard] Controls wrapper returned to video-section');
                    }
                } else if (controlsWrapper) {
                    // Удаляем все inline стили для планшета
                    const isTablet = window.innerWidth <= 1024 && window.innerWidth > 480;
                    if (isTablet) {
                        controlsWrapper.removeAttribute('style');
                    }
                }
                
                if (state.whiteboard) {
                    state.whiteboard.hide();
                }
                // Обновляем layout камер
                setTimeout(() => {
                    updateVideoLayout();
                }, 100);
            }
        }
    }
    
    function setWhiteboardTool(tool) {
        if (!state.whiteboard) return;
        
        // Обновляем активную кнопку
        const toolButtons = document.querySelectorAll('.whiteboard-tool-btn[data-tool]');
        toolButtons.forEach(btn => {
            if (btn.getAttribute('data-tool') === tool) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        state.whiteboard.setTool(tool);
        console.log('[Whiteboard] Tool set to:', tool);
    }
    
    // WebRTC functions
    async function initializeWebRTC() {
        try {
            console.log('[WebRTC] Requesting user media...');
            
            // Определяем тип устройства для адаптивного качества видео
            const deviceType = getDeviceType();
            const isMobile = deviceType.type === 'phone' || deviceType.type === 'tablet';
            
            // Адаптивные настройки качества видео в зависимости от устройства
            let videoConstraints = state.isVideoEnabled;
            if (state.isVideoEnabled && isMobile) {
                // Для мобильных устройств используем более низкое разрешение для экономии ресурсов
                videoConstraints = {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { ideal: 15, max: 30 }, // Снижаем FPS для мобильных
                    facingMode: 'user'
                };
                console.log('[WebRTC] Using mobile-optimized video constraints:', videoConstraints);
            } else if (state.isVideoEnabled) {
                // Для десктопа используем более высокое качество
                videoConstraints = {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30, max: 60 }
                };
                console.log('[WebRTC] Using desktop video constraints:', videoConstraints);
            }
            
            state.localStream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: state.isAudioEnabled
            });
            console.log('[WebRTC] User media obtained, adding video stream...');
            
            // Обновляем состояние на основе реального состояния треков
            const videoTracks = state.localStream.getVideoTracks();
            const audioTracks = state.localStream.getAudioTracks();
            
            // Проверяем состояние треков - если треки есть, они включены по умолчанию
            if (videoTracks.length > 0) {
                // Трек включен, если он существует и enabled === true
                state.isVideoEnabled = videoTracks[0].enabled;
                console.log('[WebRTC] Initial video state from track:', state.isVideoEnabled, 'track enabled:', videoTracks[0].enabled, 'readyState:', videoTracks[0].readyState);
            } else {
                // Если треков нет, значит камера не запрашивалась или недоступна
                state.isVideoEnabled = false;
                console.log('[WebRTC] No video tracks, setting isVideoEnabled to false');
            }
            
            if (audioTracks.length > 0) {
                // Трек включен, если он существует и enabled === true
                state.isAudioEnabled = audioTracks[0].enabled;
                console.log('[WebRTC] Initial audio state from track:', state.isAudioEnabled, 'track enabled:', audioTracks[0].enabled, 'readyState:', audioTracks[0].readyState);
            } else {
                // Если треков нет, значит микрофон не запрашивался или недоступен
                state.isAudioEnabled = false;
                console.log('[WebRTC] No audio tracks, setting isAudioEnabled to false');
            }
            
            // Обновляем состояние кнопок после получения реального состояния
            console.log('[WebRTC] Updating control buttons - video:', state.isVideoEnabled, 'audio:', state.isAudioEnabled);
            updateControlButtons();
            
            addVideoStream(state.uid, state.localStream, true);
            // Обновляем иконку микрофона для локального пользователя после создания элемента
            setTimeout(() => {
                updateMicMutedIcon('local', !state.isAudioEnabled);
            }, 100);
            connectToSignalingServer();
        } catch (error) {
            console.error('Error accessing media devices:', error);
            
            // Улучшенная обработка ошибок с понятными сообщениями для пользователя
            let errorMessage = 'Не удалось получить доступ к камере или микрофону.';
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage = 'Доступ к камере/микрофону запрещён. Пожалуйста, разрешите доступ в настройках браузера.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorMessage = 'Камера или микрофон не найдены. Убедитесь, что устройства подключены.';
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                errorMessage = 'Не удалось начать запись с камеры/микрофона. Возможно, устройство используется другим приложением.';
            } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
                errorMessage = 'Запрошенные настройки камеры/микрофона не поддерживаются.';
            } else if (error.name === 'SecurityError') {
                errorMessage = 'Ошибка безопасности. Убедитесь, что используете HTTPS или localhost.';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Операция была прервана.';
            }
            
            // Показываем сообщение пользователю
            alert(errorMessage + '\n\nПопробуйте обновить страницу и разрешить доступ к устройствам.');
            
            // Пытаемся продолжить без медиа (только аудио или только видео)
            try {
                // Пробуем получить только аудио
                state.localStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                state.isVideoEnabled = false;
                state.isAudioEnabled = true;
                updateControlButtons();
                addVideoStream(state.uid, state.localStream, true);
                connectToSignalingServer();
                console.log('[WebRTC] Connected with audio only');
            } catch (audioError) {
                console.error('[WebRTC] Could not get audio either:', audioError);
                // Если и аудио не получилось, продолжаем без медиа
                connectToSignalingServer();
            }
        }
    }
    
    function connectToSignalingServer() {
        // Не переподключаемся если мы выходим из комнаты
        if (state.isLeaving) {
            console.log('[WebRTC] Not reconnecting - user is leaving');
            return;
        }
        
        // Проверяем количество попыток переподключения
        if (state.reconnectAttempts >= state.maxReconnectAttempts) {
            console.error('[WebRTC] Max reconnect attempts reached, stopping reconnection');
            alert('Не удалось подключиться к серверу. Пожалуйста, обновите страницу.');
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/video/${state.roomName}/`;
        
        console.log(`[WebRTC] Connecting to signaling server (attempt ${state.reconnectAttempts + 1}/${state.maxReconnectAttempts})...`);
        
        try {
        state.videoSocket = new WebSocket(wsUrl);
        
        state.videoSocket.onopen = () => {
            console.log('[WebRTC] Connected to signaling server');
                // Сбрасываем счетчик попыток при успешном подключении
                state.reconnectAttempts = 0;
                state.reconnectDelay = 1000;
                
                // Запрашиваем текущее состояние демонстрации экрана
                state.videoSocket.send(JSON.stringify({
                    type: 'screen-share-request-state',
                    from: state.uid,
                    room: state.roomName
                }));
                
                // Отправляем сохраненные результаты TURN тестирования если есть
                if (turnTestResults) {
                    try {
                        if (turnTestResults.startInfo) {
                            const message = {
                                ...turnTestResults.startInfo,
                                from: state.uid || 'system'
                            };
                            state.videoSocket.send(JSON.stringify(message));
                            console.log('[TURN Test] 📤 Sent delayed test-start log to backend:', message);
                        }
                        if (turnTestResults.completeInfo) {
                            const message = {
                                ...turnTestResults.completeInfo,
                                from: state.uid || 'system'
                            };
                            state.videoSocket.send(JSON.stringify(message));
                            console.log('[TURN Test] 📤 Sent delayed test-complete log to backend:', message);
                        }
                        // Очищаем после отправки
                        turnTestResults = null;
                    } catch (e) {
                        console.warn('[TURN Test] Failed to send delayed logs:', e);
                    }
                } else {
                    console.log('[TURN Test] No saved test results to send (may have been sent already or not started)');
                }
                
                // Отправляем join сообщение с именем пользователя
                if (state.videoSocket.readyState === WebSocket.OPEN) {
            state.videoSocket.send(JSON.stringify({
                type: 'join',
                uid: state.uid,
                name: state.userName,  // Отправляем имя пользователя
                room: state.roomName
            }));
                }
                
                // Получаем список существующих участников комнаты и создаем для них offers
                // Это важно, потому что существующие пользователи не отправят user-joined для нового пользователя
                (async () => {
                    try {
                        const response = await fetch(`/get_room_members/?room_name=${encodeURIComponent(state.roomName)}`);
                        if (response.ok) {
                            const data = await response.json();
                            if (data.members && data.members.length > 0) {
                                console.log(`[WebRTC] Found ${data.members.length} existing members in room, creating offers...`);
                                setTimeout(async () => {
                                    for (const member of data.members) {
                                        if (member.UID && member.UID !== state.uid && !state.peerConnections[member.UID]) {
                                            console.log(`[WebRTC] Creating offer for existing member: ${member.UID} (${member.name || 'unknown'})`);
                                            // Сохраняем имя пользователя если есть
                                            if (member.name) {
                                                state.userNames[member.UID] = member.name;
                                            }
                                            // Добавляем в очередь для создания offer
                                            queueOfferCreation(member.UID);
                                            // Небольшая задержка между offers для стабильности
                                            await new Promise(resolve => setTimeout(resolve, 100));
                                        }
                                    }
                                }, 500); // Задержка для стабилизации соединения
                            }
                        }
                    } catch (error) {
                        console.error('[WebRTC] Error getting room members:', error);
                        // Не критично - продолжаем работу
                    }
                })();
                
                // Отправляем начальное состояние камеры и аудио
                if (state.localStream) {
                    const videoTracks = state.localStream.getVideoTracks();
                    const audioTracks = state.localStream.getAudioTracks();
                    const isVideoEnabled = videoTracks.length > 0 && videoTracks[0]?.enabled;
                    const isAudioEnabled = audioTracks.length > 0 && audioTracks[0]?.enabled;
                    
                    // Отправляем состояние камеры
                    if (state.videoSocket.readyState === WebSocket.OPEN) {
                        state.videoSocket.send(JSON.stringify({
                            type: isVideoEnabled ? 'camera-enabled' : 'camera-disabled',
                            from: state.uid,
                            room: state.roomName
                        }));
                        console.log('[WebRTC] Sent initial camera state:', isVideoEnabled ? 'enabled' : 'disabled');
                    }
                    
                    // Отправляем состояние аудио
                    if (state.videoSocket.readyState === WebSocket.OPEN) {
                        state.videoSocket.send(JSON.stringify({
                            type: isAudioEnabled ? 'audio-enabled' : 'audio-disabled',
                            from: state.uid,
                            room: state.roomName
                        }));
                        console.log('[WebRTC] Sent initial audio state:', isAudioEnabled ? 'enabled' : 'disabled');
                    }
                }
                
                // Запрашиваем состояние камер и аудио всех существующих пользователей
                setTimeout(() => {
                    if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        state.videoSocket.send(JSON.stringify({
                            type: 'request-camera-states',
                            from: state.uid,
                            room: state.roomName
                        }));
                        state.videoSocket.send(JSON.stringify({
                            type: 'request-audio-states',
                            from: state.uid,
                            room: state.roomName
                        }));
                        console.log('[WebRTC] Requested camera and audio states from all users');
                    }
                }, 100);
                
                // Инициализируем whiteboard после подключения к WebSocket
                if (!state.whiteboard) {
                    const canvasElement = document.getElementById('whiteboard-canvas');
                    if (canvasElement) {
                        state.whiteboard = new WhiteboardManager(state.roomName, state.videoSocket, state.uid);
                        state.whiteboard.init(canvasElement);
                        console.log('[Whiteboard] Canvas initialized after WebSocket connection');
                    }
                }
                
                // Принудительная синхронизация изображений после успешного подключения
                setTimeout(() => {
                    if (state.whiteboard) {
                        console.log('[WebRTC] Triggering image synchronization after connection');
                        state.whiteboard.forceImageSynchronization();
                    }
                }, 1000); // 1 секунда после подключения для получения состояния
        };
        
        state.videoSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleSignalingMessage(data);
            } catch (error) {
                console.error('[WebRTC] Error parsing message:', error);
            }
        };
        
        state.videoSocket.onerror = (error) => {
                console.error('[WebRTC] WebSocket error:', error);
            };
            
            state.videoSocket.onclose = (event) => {
                console.log('[WebRTC] Disconnected from signaling server, code:', event.code, 'reason:', event.reason);
                
                // Не переподключаемся если это нормальное закрытие (код 1000) или если мы выходим из комнаты
                if (event.code === 1000 || state.isLeaving) {
                    return;
                }
                
                // Не переподключаемся при ошибках клиента (4001, 4002 - валидация, комната полна)
                if (event.code === 4001 || event.code === 4002) {
                    let errorMsg = 'Не удалось подключиться к комнате.';
                    if (event.code === 4001) {
                        errorMsg = 'Некорректное имя комнаты.';
                    } else if (event.code === 4002) {
                        errorMsg = 'Комната переполнена. Максимальное количество участников достигнуто.';
                    }
                    alert(errorMsg);
                    return;
                }
                
                // Экспоненциальная задержка для переподключения с jitter (случайная задержка для предотвращения синхронизации)
                state.reconnectAttempts++;
                const baseDelay = Math.min(state.reconnectDelay * Math.pow(2, state.reconnectAttempts - 1), 30000);
                // Добавляем jitter: случайная задержка от 0 до 30% от базовой задержки
                const jitter = Math.random() * baseDelay * 0.3;
                const delay = baseDelay + jitter;
                state.reconnectDelay = delay;
                
                console.log(`[WebRTC] Attempting to reconnect in ${Math.round(delay)}ms (attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts})`);
                
            setTimeout(() => {
                    if (!state.isLeaving && (!state.videoSocket || state.videoSocket.readyState === WebSocket.CLOSED)) {
                    connectToSignalingServer();
                }
                }, delay);
            };
        } catch (error) {
            console.error('[WebRTC] Error creating WebSocket:', error);
            // Повторная попытка через задержку с jitter
            state.reconnectAttempts++;
            const baseDelay = Math.min(state.reconnectDelay * Math.pow(2, state.reconnectAttempts - 1), 30000);
            const jitter = Math.random() * baseDelay * 0.3;
            const delay = baseDelay + jitter;
            setTimeout(() => {
                if (!state.isLeaving) {
                    connectToSignalingServer();
                }
            }, delay);
        }
    }
    
    // Оптимизация: кэш для обработки сообщений
    const messageCache = new Map();
    const MESSAGE_CACHE_TTL = 5000; // 5 секунд
    
    // Периодическая очистка messageCache для предотвращения утечек памяти
    setInterval(() => {
        const now = Date.now();
        for (const [key, timestamp] of messageCache.entries()) {
            if (now - timestamp > MESSAGE_CACHE_TTL) {
                messageCache.delete(key);
            }
        }
    }, MESSAGE_CACHE_TTL);
    
    function handleSignalingMessage(data) {
        if (data._target && data._target !== state.uid) {
            return;
        }
        
        // Оптимизация: проверяем размер данных
        const dataSize = JSON.stringify(data).length;
        if (dataSize > 10 * 1024 * 1024) { // 10MB
            console.warn('[WebRTC] Message too large, ignoring:', dataSize);
            return;
        }
        
        // Оптимизация: дедупликация сообщений (для offer/answer/ice-candidate)
        if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice-candidate') {
            const messageKey = `${data.type}-${data.from}-${data.to || 'broadcast'}-${data.offer?.type || data.answer?.type || data.candidate?.candidate || ''}`;
            if (messageCache.has(messageKey)) {
                console.log('[WebRTC] Duplicate message ignored:', messageKey);
                return;
            }
            messageCache.set(messageKey, Date.now());
            
            // Очищаем старые записи из кэша
            setTimeout(() => {
                messageCache.delete(messageKey);
            }, MESSAGE_CACHE_TTL);
        }
        
        switch (data.type) {
            case 'user-joined':
            case 'join':
                // Поддерживаем оба формата: data.uid и data.from
                const joinedUserId = data.uid || data.from;
                if (joinedUserId && joinedUserId !== state.uid) {
                    // Сохраняем имя пользователя если передано
                    if (data.name) {
                        state.userNames[joinedUserId] = data.name;
                        console.log('[WebRTC] User joined:', joinedUserId, '- name:', data.name);
                    } else {
                        console.log('[WebRTC] User joined:', joinedUserId, '- name not provided');
                    }
                    
                    // Обновляем отображение имени если видео уже отображается
                    const existingContainer = document.getElementById(`video-${joinedUserId}`);
                    if (existingContainer && data.name) {
                        const usernameWrapper = existingContainer.querySelector('.username-wrapper');
                        if (usernameWrapper) {
                            usernameWrapper.textContent = data.name;
                            console.log(`[WebRTC] Updated display name for ${joinedUserId} to: ${data.name}`);
                        }
                    }
                    
                    // Если соединение уже существует, пропускаем
                    if (state.peerConnections[joinedUserId]) {
                        console.log(`[WebRTC] Connection already exists for ${joinedUserId}, skipping`);
                        return;
                    }
                    
                    // Если offer pending, но соединения нет - возможно, предыдущий offer не был создан
                    // Очищаем флаг и создаем новый offer
                    if (state.pendingOffers.has(joinedUserId) && !state.peerConnections[joinedUserId]) {
                        console.warn(`[WebRTC] Offer pending for ${joinedUserId} but no connection exists, clearing flag and creating new offer`);
                        state.pendingOffers.delete(joinedUserId);
                        state.negotiationInProgress.delete(joinedUserId);
                    }
                    
                    // Проверяем, не идет ли уже переговоры
                    if (state.negotiationInProgress.has(joinedUserId)) {
                        console.log(`[WebRTC] Negotiation in progress for ${joinedUserId}, skipping duplicate user-joined`);
                        return;
                    }
                    
                    if (!state.localStream) {
                        console.error('[WebRTC] Cannot create offer - local stream not ready');
                        return;
                    }
                    
                    // НЕ устанавливаем состояние камеры по умолчанию при user-joined
                    // Состояние будет установлено только через явные сообщения camera-enabled/camera-disabled
                    // Это гарантирует, что заглушка будет показана до получения подтверждения, что камера включена
                    if (!state.userCameraStates.hasOwnProperty(joinedUserId)) {
                        // НЕ устанавливаем состояние - по умолчанию будет показана заглушка
                        console.log('[WebRTC] Waiting for camera state message (will show placeholder by default)');
                    } else {
                        console.log('[WebRTC] Camera state already set for', joinedUserId, ':', state.userCameraStates[joinedUserId]);
                    }
                    
                    // Оптимизация: отправляем состояние камеры и аудио только один раз с небольшой задержкой
                    // Убрали множественные отправки для уменьшения нагрузки
                    setTimeout(() => {
                        if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN && state.localStream) {
                            const videoTracks = state.localStream.getVideoTracks();
                            const audioTracks = state.localStream.getAudioTracks();
                            const isVideoEnabled = videoTracks.length > 0 && videoTracks[0]?.enabled;
                            const isAudioEnabled = audioTracks.length > 0 && audioTracks[0]?.enabled;
                            
                            // Отправляем состояние камеры
                            state.videoSocket.send(JSON.stringify({
                                type: isVideoEnabled ? 'camera-enabled' : 'camera-disabled',
                                from: state.uid,
                                to: joinedUserId,  // Отправляем конкретно новому пользователю
                                room: state.roomName
                            }));
                            console.log('[WebRTC] Sent current camera state to new user', joinedUserId, ':', isVideoEnabled ? 'enabled' : 'disabled');
                            
                            // Отправляем состояние аудио
                            state.videoSocket.send(JSON.stringify({
                                type: isAudioEnabled ? 'audio-enabled' : 'audio-disabled',
                                from: state.uid,
                                to: joinedUserId,  // Отправляем конкретно новому пользователю
                                room: state.roomName
                            }));
                            console.log('[WebRTC] Sent current audio state to new user', joinedUserId, ':', isAudioEnabled ? 'enabled' : 'disabled');
                        }
                    }, 100);
                    
                    // Исправление race condition: проверяем еще раз перед добавлением
                    // Добавляем в очередь для последовательной обработки (стабильность при 3+ пользователях)
                    if (!state.pendingOffers.has(joinedUserId) && 
                        !state.peerConnections[joinedUserId] && 
                        !state.negotiationInProgress.has(joinedUserId)) {
                        console.log(`[WebRTC] Queueing offer creation for new user: ${joinedUserId}`);
                        queueOfferCreation(joinedUserId);
                    } else {
                        console.log(`[WebRTC] Skipping offer creation for ${joinedUserId} - pending: ${state.pendingOffers.has(joinedUserId)}, connection: ${!!state.peerConnections[joinedUserId]}, negotiating: ${state.negotiationInProgress.has(joinedUserId)}`);
                    }
                }
                break;
            case 'request-camera-states':
                // Получен запрос на отправку состояния камеры
                // Отправляем наше текущее состояние камеры запросившему пользователю
                if (data.from && data.from !== state.uid && state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN && state.localStream) {
                    const videoTracks = state.localStream.getVideoTracks();
                    const isVideoEnabled = videoTracks.length > 0 && videoTracks[0]?.enabled;
                    state.videoSocket.send(JSON.stringify({
                        type: isVideoEnabled ? 'camera-enabled' : 'camera-disabled',
                        from: state.uid,
                        to: data.from,  // Отправляем конкретно запросившему пользователю
                        room: state.roomName
                    }));
                    console.log('[WebRTC] Sent camera state in response to request from', data.from, ':', isVideoEnabled ? 'enabled' : 'disabled');
                }
                break;
            case 'request-audio-states':
                // Получен запрос на отправку состояния аудио
                // Отправляем наше текущее состояние аудио запросившему пользователю
                if (data.from && data.from !== state.uid && state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN && state.localStream) {
                    const audioTracks = state.localStream.getAudioTracks();
                    const isAudioEnabled = audioTracks.length > 0 && audioTracks[0]?.enabled;
                    state.videoSocket.send(JSON.stringify({
                        type: isAudioEnabled ? 'audio-enabled' : 'audio-disabled',
                        from: state.uid,
                        to: data.from,  // Отправляем конкретно запросившему пользователю
                        room: state.roomName
                    }));
                    console.log('[WebRTC] Sent audio state in response to request from', data.from, ':', isAudioEnabled ? 'enabled' : 'disabled');
                }
                break;
            case 'audio-enabled':
                // Получено сообщение о включении аудио от другого пользователя
                const remoteUidAudioOn = data.from;
                if (remoteUidAudioOn && remoteUidAudioOn !== state.uid) {
                    // Оптимизация: проверяем, изменилось ли состояние
                    if (state.userAudioStates[remoteUidAudioOn] === true) {
                        // Состояние не изменилось, пропускаем обработку
                        return;
                    }
                    state.userAudioStates[remoteUidAudioOn] = true;
                    console.log('[Audio] User', remoteUidAudioOn, 'enabled audio');
                    // Обновляем иконку микрофона
                    updateMicMutedIcon(remoteUidAudioOn, false);
                } else if (remoteUidAudioOn === state.uid) {
                    // Обновляем иконку микрофона для локального пользователя
                    updateMicMutedIcon('local', false);
                }
                break;
            case 'audio-disabled':
                // Получено сообщение о выключении аудио от другого пользователя
                const remoteUidAudioOff = data.from;
                if (remoteUidAudioOff && remoteUidAudioOff !== state.uid) {
                    // Оптимизация: проверяем, изменилось ли состояние
                    if (state.userAudioStates[remoteUidAudioOff] === false) {
                        // Состояние не изменилось, пропускаем обработку
                        return;
                    }
                    state.userAudioStates[remoteUidAudioOff] = false;
                    console.log('[Audio] User', remoteUidAudioOff, 'disabled audio');
                    // Обновляем иконку микрофона
                    updateMicMutedIcon(remoteUidAudioOff, true);
                } else if (remoteUidAudioOff === state.uid) {
                    // Обновляем иконку микрофона для локального пользователя
                    updateMicMutedIcon('local', true);
                }
                break;
            case 'offer':
                handleOffer(data);
                break;
            case 'answer':
                handleAnswer(data);
                break;
            case 'ice-candidate':
                handleIceCandidate(data);
                break;
            case 'user-left':
                console.log('[WebRTC] User left:', data.uid);
                // Немедленно удаляем пользователя без задержек
                const leftUid = data.uid;
                
                    // Удаляем сохраненное состояние камеры и аудио
                    if (state.userCameraStates && state.userCameraStates[leftUid]) {
                        delete state.userCameraStates[leftUid];
                    }
                    if (state.userAudioStates && state.userAudioStates[leftUid]) {
                        delete state.userAudioStates[leftUid];
                    }
                    
                    // Удаляем флаг скрытия лоадера
                    if (state.loaderHidden && state.loaderHidden[leftUid]) {
                        delete state.loaderHidden[leftUid];
                    }
                    
                    // Удаляем из всех структур данных
                    state.displayedVideos.delete(leftUid);
                    state.connectedUsers.delete(leftUid);
                
                // Немедленно удаляем видео контейнер и все связанные элементы
                const videoContainer = document.getElementById(`video-${leftUid}`);
                if (videoContainer) {
                    // Останавливаем все видео/аудио элементы перед удалением
                    const video = videoContainer.querySelector('video');
                    if (video) {
                        try {
                            video.pause();
                            video.srcObject = null;
                            video.load(); // Сбрасываем элемент
                        } catch (e) {
                            console.warn(`[WebRTC] Error stopping video for ${leftUid}:`, e);
                        }
                    }
                    
                    // Удаляем контейнер из DOM
                    try {
                        videoContainer.remove();
                        console.log('[WebRTC] Removed video container for user:', leftUid);
                    } catch (e) {
                        console.warn(`[WebRTC] Error removing video container for ${leftUid}:`, e);
                        // Принудительно удаляем через parentNode если обычное удаление не сработало
                        if (videoContainer.parentNode) {
                            videoContainer.parentNode.removeChild(videoContainer);
                            console.log('[WebRTC] Force removed video container for user:', leftUid);
                        }
                    }
                }
                
                // Очищаем все связанные ресурсы
                stopAudioDetection(leftUid);
                
                
                // Очищаем интервалы для удаленных треков
                if (state.remoteTrackIntervals && state.remoteTrackIntervals[leftUid]) {
                    state.remoteTrackIntervals[leftUid].forEach(interval => clearInterval(interval));
                    delete state.remoteTrackIntervals[leftUid];
                }
                
                // Удаляем ссылку на удаленный стрим
                if (state.remoteStreams && state.remoteStreams[leftUid]) {
                    delete state.remoteStreams[leftUid];
                }
                
                // Закрываем peer connection
                if (state.peerConnections[leftUid]) {
                    try {
                        state.peerConnections[leftUid].close();
                    } catch (e) {
                        console.warn(`[WebRTC] Error closing peer connection for ${leftUid}:`, e);
                    }
                    delete state.peerConnections[leftUid];
                }
                
                // Очищаем очередь ICE кандидатов
                if (state.iceCandidateQueue[leftUid]) {
                    delete state.iceCandidateQueue[leftUid];
                }
                
                // Удаляем из очереди соединений если там есть
                const queueIndex = state.connectionQueue.indexOf(leftUid);
                if (queueIndex !== -1) {
                    state.connectionQueue.splice(queueIndex, 1);
                    console.log(`[WebRTC] Removed ${leftUid} from connection queue`);
                }
                
                // Очищаем флаги переговоров
                state.pendingOffers.delete(leftUid);
                state.negotiationInProgress.delete(leftUid);
                
                // Обновляем layout сразу
                updateVideoLayout();
                console.log('[WebRTC] User completely removed:', leftUid);
                break;
            case 'mic-active':
                // Получено сообщение об активности микрофона от другого пользователя
                console.log('[MicActivity] User', data.from, 'is speaking');
                const remoteUidActive = data.from;
                const videoContainerActive = document.getElementById(`video-${remoteUidActive}`);
                if (videoContainerActive) {
                    videoContainerActive.classList.add('mic-active');
                }
                break;
            case 'mic-inactive':
                // Получено сообщение о неактивности микрофона от другого пользователя
                console.log('[MicActivity] User', data.from, 'stopped speaking');
                const remoteUidInactive = data.from;
                const videoContainerInactive = document.getElementById(`video-${remoteUidInactive}`);
                if (videoContainerInactive) {
                    videoContainerInactive.classList.remove('mic-active');
                }
                break;
            case 'camera-disabled':
                // Получено сообщение о выключении камеры от другого пользователя
                const remoteUidCameraOff = data.from;
                
                // Оптимизация: проверяем, изменилось ли состояние
                if (state.userCameraStates[remoteUidCameraOff] === false) {
                    // Состояние не изменилось, пропускаем обработку
                    return;
                }
                
                console.log('[Camera] User', remoteUidCameraOff, 'disabled camera');
                
                // Сохраняем состояние камеры (важно сделать это ДО проверки контейнера)
                state.userCameraStates[remoteUidCameraOff] = false;
                console.log('[Camera] Saved camera state for', remoteUidCameraOff, 'as disabled');
                
                const videoContainerCameraOff = document.getElementById(`video-${remoteUidCameraOff}`);
                
                if (videoContainerCameraOff) {
                    // Принудительно скрываем видео и показываем SVG
                    const video = videoContainerCameraOff.querySelector('video');
                    const svgPlaceholder = videoContainerCameraOff.querySelector('.no-cam-placeholder');
                    
                    if (video) {
                        video.style.display = 'none';
                    }
                    
                    if (!svgPlaceholder) {
                        // Создаем SVG placeholder если его нет
                        const placeholder = document.createElement('div');
                        placeholder.className = 'no-cam-placeholder';
                        placeholder.style.width = '100%';
                        placeholder.style.height = '100%';
                        placeholder.style.position = 'absolute';
                        placeholder.style.top = '0';
                        placeholder.style.left = '0';
                        placeholder.style.display = 'block';
                        placeholder.style.zIndex = '1';
                        placeholder.innerHTML = generateNoCamSVG(remoteUidCameraOff);
                        videoContainerCameraOff.appendChild(placeholder);
                        console.log('[Camera] Created SVG placeholder for user:', remoteUidCameraOff);
                    } else {
                        svgPlaceholder.style.display = 'block';
                        console.log('[Camera] Showed existing SVG placeholder for user:', remoteUidCameraOff);
                    }
                } else {
                    // Контейнер еще не создан - состояние сохранено, будет использовано при создании контейнера
                    console.log('[Camera] Video container not found for user:', remoteUidCameraOff, '- state saved, will be applied when container is created');
                }
                break;
            case 'camera-enabled':
                // Получено сообщение о включении камеры от другого пользователя
                const remoteUidCameraOn = data.from;
                
                // Оптимизация: проверяем, изменилось ли состояние
                if (state.userCameraStates[remoteUidCameraOn] === true) {
                    // Состояние не изменилось, пропускаем обработку
                    return;
                }
                
                console.log('[Camera] User', remoteUidCameraOn, 'enabled camera');
                
                // Сохраняем состояние камеры (важно сделать это ДО проверки контейнера)
                state.userCameraStates[remoteUidCameraOn] = true;
                console.log('[Camera] Saved camera state for', remoteUidCameraOn, 'as enabled');
                
                // Принудительно обновляем отображение независимо от того, есть ли стрим
                const videoContainerCameraOn = document.getElementById(`video-${remoteUidCameraOn}`);
                if (videoContainerCameraOn) {
                    const video = videoContainerCameraOn.querySelector('video');
                    const svgPlaceholder = videoContainerCameraOn.querySelector('.no-cam-placeholder');
                    
                    // Принудительно показываем видео и скрываем заглушку
                    if (video) {
                        // Убеждаемся, что srcObject установлен
                        const remoteStream = state.remoteStreams && state.remoteStreams[remoteUidCameraOn];
                        if (remoteStream && video.srcObject !== remoteStream) {
                            video.srcObject = remoteStream;
                            console.log('[Camera] Updated srcObject for user:', remoteUidCameraOn);
                        }
                        
                        // Убеждаемся, что аудио не приглушено
                        video.muted = false;
                        
                        video.style.display = 'block';
                        video.style.zIndex = '2';
                        
                        // Убеждаемся, что видео воспроизводится
                        // Проверяем, что элемент все еще в DOM перед воспроизведением
                        if (video.isConnected) {
                            if (video.paused || video.readyState < 2) {
                                video.play().catch(err => {
                                    // Игнорируем AbortError - это нормально, если видео было удалено или приостановлено
                                    if (err.name !== 'AbortError') {
                                        console.error('[Camera] Error playing video after camera-enabled:', err);
                                    }
                                });
                            } else {
                                // Если видео уже воспроизводится, перезапускаем для гарантии
                                video.play().catch(() => {}); // Игнорируем ошибки если уже воспроизводится
                            }
                        }
                        console.log('[Camera] Forced video display for user:', remoteUidCameraOn, 'paused:', video.paused, 'readyState:', video.readyState);
                    }
                    
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'none';
                        console.log('[Camera] Hid placeholder for user:', remoteUidCameraOn);
                    }
                    
                    // НЕ скрываем лоадер здесь - он скроется автоматически в onloadeddata/oncanplay
                    // когда видео загрузит первый кадр
                    // Лоадер должен продолжать анимироваться до загрузки изображения
                }
                
                // Также обновляем через функцию для полной синхронизации, если стрим есть
                const remoteStreamCameraOn = state.remoteStreams && state.remoteStreams[remoteUidCameraOn];
                if (remoteStreamCameraOn) {
                    // Используем небольшую задержку для гарантии обновления
                    setTimeout(() => {
                        updateVideoDisplay(remoteUidCameraOn, remoteStreamCameraOn);
                        // Дополнительная проверка через еще одну задержку
                        setTimeout(() => {
                            const videoContainer = document.getElementById(`video-${remoteUidCameraOn}`);
                            if (videoContainer) {
                                const video = videoContainer.querySelector('video');
                                if (video && video.isConnected && (video.paused || video.style.display !== 'block')) {
                                    console.log('[Camera] Video still not playing, forcing again for user:', remoteUidCameraOn);
                                    video.style.display = 'block';
                                    video.muted = false;
                                    video.play().catch(err => {
                                        // Игнорируем AbortError - это нормально, если видео было удалено или приостановлено
                                        if (err.name !== 'AbortError') {
                                            console.error('[Camera] Error forcing video playback:', err);
                                        }
                                    });
                                }
                            }
                        }, 200);
                    }, 50);
                } else {
                    // Стрим еще не получен - состояние сохранено, будет использовано при получении стрима
                    console.log('[Camera] Stream not found for user:', remoteUidCameraOn, '- state saved, will be applied when stream is received');
                }
                break;
            case 'whiteboard-draw':
                // Получено событие рисования от другого пользователя
                console.log('[WebRTC] Received whiteboard-draw from:', data.from, 'data:', data);
                if (state.whiteboard) {
                    console.log('[WebRTC] Whiteboard exists, handling drawing event');
                    state.whiteboard.handleRemoteDrawing(data);
                } else {
                    console.warn('[WebRTC] Whiteboard not initialized, cannot handle drawing event. State:', {
                        whiteboard: state.whiteboard,
                        videoSocket: !!state.videoSocket,
                        roomName: state.roomName
                    });
                    // Пытаемся инициализировать whiteboard, если он еще не инициализирован
                    const canvasElement = document.getElementById('whiteboard-canvas');
                    if (canvasElement && state.videoSocket) {
                        console.log('[WebRTC] Initializing whiteboard on demand');
                        state.whiteboard = new WhiteboardManager(state.roomName, state.videoSocket, state.uid);
                        state.whiteboard.init(canvasElement);
                        state.whiteboard.handleRemoteDrawing(data);
                    }
                }
                break;
            case 'whiteboard-object':
                // Получено событие объекта от другого пользователя
                // ===== ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
                const objData = data.data?.object;
                console.log('[WebRTC] 📨 RAW whiteboard-object received:', {
                    from: data.from,
                    eventType: data.data?.eventType,
                    objectType: objData?.type,
                    objectId: objData?.id,
                    hasSrc: !!objData?.src,
                    srcLength: objData?.src ? objData?.src.length : 0,
                    srcPreview: objData?.src ? objData?.src.substring(0, 100) : 'none',
                    fullObject: objData
                });
                
                // Проверяем, не блокируется ли объект типа 'image'
                if (objData && objData.type === 'image') {
                    console.log('[WebRTC] ✅ IMAGE object detected in RAW message, will process');
                }
                // ===== КОНЕЦ ЛОГИРОВАНИЯ =====
                
                console.log('[WebRTC] Received whiteboard-object from:', data.from, 'data:', data);
                if (state.whiteboard) {
                    console.log('[WebRTC] Whiteboard exists, handling object event');
                    console.log('[WebRTC] About to call handleRemoteObject with:', {
                        eventType: data.data?.eventType,
                        objectType: data.data?.object?.type,
                        objectId: data.data?.object?.id,
                        from: data.from
                    });
                    try {
                        state.whiteboard.handleRemoteObject(data);
                        console.log('[WebRTC] handleRemoteObject call completed');
                    } catch (error) {
                        console.error('[WebRTC] Error in handleRemoteObject:', error, error.stack);
                    }
                } else {
                    console.warn('[WebRTC] Whiteboard not initialized, cannot handle object event. State:', {
                        whiteboard: state.whiteboard,
                        videoSocket: !!state.videoSocket,
                        roomName: state.roomName
                    });
                    // Пытаемся инициализировать whiteboard, если он еще не инициализирован
                    const canvasElement = document.getElementById('whiteboard-canvas');
                    if (canvasElement && state.videoSocket) {
                        console.log('[WebRTC] Initializing whiteboard on demand');
                        state.whiteboard = new WhiteboardManager(state.roomName, state.videoSocket, state.uid);
                        state.whiteboard.init(canvasElement);
                        state.whiteboard.handleRemoteObject(data);
                    }
                }
                break;
            case 'whiteboard-cursor':
                // Получено событие курсора от другого пользователя
                if (state.whiteboard) {
                    state.whiteboard.handleRemoteCursor(data);
                }
                break;
            case 'whiteboard-clear':
                // Получено событие очистки от другого пользователя
                if (state.whiteboard) {
                    state.whiteboard.handleRemoteClear(data);
                }
                break;
            case 'whiteboard-state-restored':
                // Получено финальное сообщение о завершении восстановления состояния
                console.log('[WebRTC] ✅ Whiteboard state restoration complete:', {
                    objects_count: data.data?.objects_count || 0,
                    paths_count: data.data?.paths_count || 0
                });
                if (state.whiteboard) {
                    // Принудительно рендерим canvas после восстановления всех путей и объектов
                    setTimeout(() => {
                        if (state.whiteboard && state.whiteboard.canvas) {
                            state.whiteboard.canvas.renderAll();
                            console.log('[WebRTC] ✅ Canvas rendered after state restoration');
                            // Также вызываем принудительную синхронизацию
                            state.whiteboard.forceImageSynchronization();
                        }
                    }, 300); // Задержка для обработки всех сообщений
                }
                break;
            case 'screen-share-started':
                // Демонстрация экрана начата другим пользователем
                const sharingUser = data.sharing_user || data.from;
                console.log('[ScreenShare] Screen sharing started by user:', sharingUser);
                state.currentSharingUser = sharingUser;
                updateScreenShareButton();
                
                // Обновляем layout для режима screen sharing
                // Layout создаст отдельный контейнер для screen share
                // ВАЖНО: Вызываем updateVideoLayout, который вызовет setupScreenShareLayout
                updateVideoLayout();
                
                // Обновляем stream для screen share контейнера после задержки
                // Используем несколько попыток для надежности на мобильных устройствах
                const setupScreenShareStream = () => {
                    const screenShareContainer = document.querySelector('.screen-share-container');
                    if (screenShareContainer) {
                        let screenShareVideo = screenShareContainer.querySelector('video');
                        if (!screenShareVideo) {
                            // Если video элемент еще не создан, создаем его
                            const screenShareVideoContainer = screenShareContainer.querySelector(`#screen-share-${sharingUser}`);
                            if (!screenShareVideoContainer) {
                                // Создаем контейнер для screen share видео
                                const newContainer = document.createElement('div');
                                newContainer.className = 'video-container screen-share-video';
                                newContainer.id = `screen-share-${sharingUser}`;
                                
                                const videoElement = document.createElement('video');
                                videoElement.autoplay = true;
                                videoElement.playsInline = true;
                                videoElement.muted = false;
                                videoElement.className = 'video-player';
                                newContainer.appendChild(videoElement);
                                
                                const usernameWrapper = document.createElement('div');
                                usernameWrapper.className = 'username-wrapper';
                                usernameWrapper.textContent = state.userNames[sharingUser] || `User ${sharingUser}`;
                                newContainer.appendChild(usernameWrapper);
                                
                                screenShareContainer.appendChild(newContainer);
                                screenShareVideo = videoElement;
                                console.log('[ScreenShare] Created screen share video container for user:', sharingUser);
                            } else {
                                screenShareVideo = screenShareVideoContainer.querySelector('video');
                            }
                        }
                        
                        if (screenShareVideo && !screenShareVideo.srcObject) {
                            const peerConnection = state.peerConnections[sharingUser];
                            if (peerConnection) {
                                peerConnection.getReceivers().forEach(receiver => {
                                    if (receiver.track && receiver.track.kind === 'video' && receiver.track.readyState === 'live') {
                                        const trackLabel = receiver.track.label.toLowerCase();
                                        if (trackLabel.includes('screen') || trackLabel.includes('display') || trackLabel.includes('window')) {
                                            const stream = new MediaStream([receiver.track]);
                                            // Добавляем аудио треки
                                            peerConnection.getReceivers().forEach(audioReceiver => {
                                                if (audioReceiver.track && audioReceiver.track.kind === 'audio' && audioReceiver.track.readyState === 'live') {
                                                    stream.addTrack(audioReceiver.track);
                                                }
                                            });
                                            screenShareVideo.pause();
                                            screenShareVideo.srcObject = stream;
                                            screenShareVideo.muted = false;
                                            setTimeout(() => {
                                                screenShareVideo.play().catch(err => {
                                                    if (err.name !== 'AbortError') {
                                                        console.error('[ScreenShare] Error playing remote screen share:', err);
                                                    }
                                                });
                                            }, 50);
                                            console.log('[ScreenShare] Set screen share stream for user:', sharingUser);
                                        }
                                    }
                                });
                            } else {
                                console.warn('[ScreenShare] Peer connection not found for user:', sharingUser);
                            }
                        }
                    } else {
                        console.warn('[ScreenShare] Screen share container not found, will retry');
                    }
                };
                
                // Вызываем несколько раз для надежности на мобильных устройствах
                setTimeout(setupScreenShareStream, 300);
                setTimeout(setupScreenShareStream, 800);
                setTimeout(setupScreenShareStream, 1500);
                break;
            case 'screen-share-stopped':
                // Демонстрация экрана остановлена
                console.log('[ScreenShare] Screen sharing stopped by user:', data.from);
                state.currentSharingUser = null;
                updateScreenShareButton();
                // Обновляем layout для обычного режима
                updateVideoLayout();
                break;
            case 'screen-share-state':
                // Получено состояние демонстрации экрана (при подключении)
                if (data.is_active && data.sharing_user) {
                    console.log('[ScreenShare] Screen sharing is active, user:', data.sharing_user);
                    state.currentSharingUser = data.sharing_user;
                } else {
                    console.log('[ScreenShare] Screen sharing is not active');
                    state.currentSharingUser = null;
                }
                updateScreenShareButton();
                // Обновляем layout
                updateVideoLayout();
                break;
            case 'screen-share-error':
                // Ошибка при попытке начать демонстрацию экрана
                console.error('[ScreenShare] Error:', data.message);
                alert(data.message || 'Не удалось начать демонстрацию экрана');
                updateScreenShareButton();
                break;
        }
    }
    
    /**
     * Добавляет создание offer в очередь для последовательной обработки
     * Это предотвращает конфликты при одновременном подключении 3+ пользователей
     */
    function queueOfferCreation(targetUid) {
        // Проверяем, не добавлен ли уже в очередь
        if (state.connectionQueue.includes(targetUid)) {
            console.log(`[WebRTC] ${targetUid} already in connection queue, skipping`);
            return;
        }
        
        // Добавляем в очередь
        state.connectionQueue.push(targetUid);
        console.log(`[WebRTC] Added ${targetUid} to connection queue (queue length: ${state.connectionQueue.length})`);
        
        // Запускаем обработку очереди если она еще не обрабатывается
        processConnectionQueue();
    }
    
    /**
     * Обрабатывает очередь соединений последовательно
     */
    async function processConnectionQueue() {
        // Если уже обрабатывается или очередь пуста - выходим
        if (state.isProcessingQueue || state.connectionQueue.length === 0) {
            return;
        }
        
        state.isProcessingQueue = true;
        console.log(`[WebRTC] Processing connection queue (${state.connectionQueue.length} items)`);
        
        while (state.connectionQueue.length > 0) {
            const targetUid = state.connectionQueue.shift();
            
            // Проверяем, не создано ли уже соединение
            if (state.peerConnections[targetUid] || 
                state.pendingOffers.has(targetUid) || 
                state.negotiationInProgress.has(targetUid)) {
                console.log(`[WebRTC] Skipping ${targetUid} - connection already exists or in progress`);
                continue;
            }
            
            try {
                console.log(`[WebRTC] Creating offer for queued user: ${targetUid}`);
                await createOffer(targetUid);
                
                // Задержка между соединениями для стабильности (увеличена для поддержки 10 пользователей)
                if (state.connectionQueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms между соединениями
                }
            } catch (error) {
                console.error(`[WebRTC] Error creating offer for ${targetUid}:`, error);
                state.pendingOffers.delete(targetUid);
                state.negotiationInProgress.delete(targetUid);
            }
        }
        
        state.isProcessingQueue = false;
        console.log(`[WebRTC] Connection queue processed`);
    }
    
    async function createOffer(targetUid) {
        // Проверяем, не идет ли уже переговоры для этого пользователя
        if (state.negotiationInProgress.has(targetUid)) {
            console.log(`[WebRTC] Negotiation already in progress for ${targetUid}, skipping duplicate offer`);
            return;
        }
        
        // Проверяем, не создается ли уже offer
        if (state.pendingOffers.has(targetUid)) {
            console.log(`[WebRTC] Offer already pending for ${targetUid}, skipping duplicate`);
            return;
        }
        
        try {
            if (!state.localStream) {
                state.pendingOffers.delete(targetUid);
                return;
            }
            
            // Устанавливаем флаг переговоров
            state.negotiationInProgress.add(targetUid);
            state.pendingOffers.add(targetUid);
            
            const peerConnection = createPeerConnection(targetUid);
            
            // Оптимизация: проверяем, не добавлены ли треки уже
            const existingSenders = peerConnection.getSenders();
            const existingTrackIds = new Set(existingSenders.map(sender => sender.track?.id).filter(Boolean));
            
            // Добавляем все треки перед созданием offer
            const tracksAdded = [];
            state.localStream.getTracks().forEach(track => {
                // Добавляем трек только если он еще не добавлен
                if (!existingTrackIds.has(track.id)) {
                    try {
                peerConnection.addTrack(track, state.localStream);
                        tracksAdded.push({ kind: track.kind, id: track.id, enabled: track.enabled });
                        console.log(`[WebRTC] Added ${track.kind} track to offer for ${targetUid}:`, track.id);
                    } catch (error) {
                        // Игнорируем ошибку, если трек уже добавлен
                        if (error.name !== 'InvalidAccessError' || !error.message.includes('already exists')) {
                            console.error('[WebRTC] Error adding track:', error);
                        }
                    }
                } else {
                    console.log(`[WebRTC] Track ${track.kind} (${track.id}) already added for ${targetUid}`);
                }
            });
            
            console.log(`[WebRTC] Creating offer for ${targetUid}, tracks added:`, tracksAdded.length, tracksAdded);
            
            // Создаем offer с правильными опциями для лучшей совместимости
            const offerOptions = {
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            };
            
            const offer = await peerConnection.createOffer(offerOptions);
            console.log(`[WebRTC] Offer created for ${targetUid}, SDP type:`, offer.type);
            
            // Устанавливаем local description
            await peerConnection.setLocalDescription(offer);
            console.log(`[WebRTC] Local description set for ${targetUid}, signaling state: ${peerConnection.signalingState}`);
            
            // Отправляем offer
            state.videoSocket.send(JSON.stringify({
                type: 'offer',
                offer: offer,
                from: state.uid,
                to: targetUid
            }));
            console.log(`[WebRTC] Offer sent to ${targetUid}`);
            
            // Удаляем из pending через 10 секунд (увеличено для NAT)
            setTimeout(() => {
                state.pendingOffers.delete(targetUid);
                // Не удаляем negotiationInProgress здесь - он управляется через onsignalingstatechange
            }, 10000);
        } catch (error) {
            console.error('Error creating offer:', error);
            state.pendingOffers.delete(targetUid);
            state.negotiationInProgress.delete(targetUid);
        }
    }
    
    // Функция для перезапуска ICE с iceRestart: true
    async function restartIceForPeer(targetUid, peerConnection) {
        if (!peerConnection || !state.videoSocket || state.videoSocket.readyState !== WebSocket.OPEN) {
            console.warn(`[WebRTC] Cannot restart ICE for ${targetUid} - connection or socket not ready`);
            return;
        }
        
        // Проверяем, не идет ли уже переговоры
        if (state.negotiationInProgress.has(targetUid)) {
            console.log(`[WebRTC] Negotiation already in progress for ${targetUid}, skipping ICE restart`);
            return;
        }
        
        try {
            console.log(`[WebRTC] 🔄 Restarting ICE for ${targetUid} with iceRestart: true`);
            state.negotiationInProgress.add(targetUid);
            
            // Создаем новый offer с iceRestart: true
            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);
            console.log(`[WebRTC] ICE restart offer created for ${targetUid}, signaling state: ${peerConnection.signalingState}`);
            
            // Отправляем offer через WebSocket
            state.videoSocket.send(JSON.stringify({
                type: 'offer',
                offer: offer,
                from: state.uid,
                to: targetUid
            }));
            
            console.log(`[WebRTC] ✅ ICE restart offer sent to ${targetUid}`);
        } catch (error) {
            console.error(`[WebRTC] Error restarting ICE for ${targetUid}:`, error);
            state.negotiationInProgress.delete(targetUid);
            throw error;
        }
    }
    
    async function handleOffer(data) {
        // Проверяем, не идет ли уже переговоры для этого пользователя
        if (state.negotiationInProgress.has(data.from)) {
            console.log(`[WebRTC] Negotiation already in progress for ${data.from}, ignoring duplicate offer`);
            return;
        }
        
        try {
            // Устанавливаем флаг переговоров
            state.negotiationInProgress.add(data.from);
            
            let peerConnection = state.peerConnections[data.from];
            
            // Если соединение уже существует и имеет remoteDescription, проверяем состояние
            if (peerConnection && peerConnection.remoteDescription) {
                const currentState = peerConnection.signalingState;
                const iceState = peerConnection.iceConnectionState;
                
                // Не закрываем соединение если оно уже установлено или в процессе установки
                if (iceState === 'connected' || iceState === 'connecting' || iceState === 'checking') {
                    console.log(`[WebRTC] Connection to ${data.from} is ${iceState}, ignoring duplicate offer`);
                    state.negotiationInProgress.delete(data.from);
                    return; // Игнорируем дублирующийся offer
                }
                
                // Если соединение в состоянии failed или disconnected, закрываем и создаем новое
                if (iceState === 'failed' || iceState === 'disconnected') {
                    console.log(`[WebRTC] Connection to ${data.from} is ${iceState}, closing and recreating`);
                    peerConnection.close();
                    delete state.peerConnections[data.from];
                    if (state.iceCandidateQueue[data.from]) {
                        delete state.iceCandidateQueue[data.from];
                    }
                    peerConnection = null;
                } else if (currentState === 'have-remote-offer') {
                    // Если уже есть remote offer, игнорируем новый (возможно дубликат)
                    console.log(`[WebRTC] Already have remote offer for ${data.from}, ignoring duplicate`);
                    state.negotiationInProgress.delete(data.from);
                    return;
                }
            }
            
            // Создаем новое соединение, если его нет
            if (!peerConnection) {
                peerConnection = createPeerConnection(data.from);
            }
            
            if (state.localStream) {
                // Оптимизация: проверяем, не добавлены ли треки уже
                const existingSenders = peerConnection.getSenders();
                const existingTrackIds = new Set(existingSenders.map(sender => sender.track?.id).filter(Boolean));
                
                const tracksAdded = [];
                state.localStream.getTracks().forEach(track => {
                    // Добавляем трек только если он еще не добавлен
                    if (!existingTrackIds.has(track.id)) {
                        try {
                    peerConnection.addTrack(track, state.localStream);
                            tracksAdded.push({ kind: track.kind, id: track.id });
                            console.log(`[WebRTC] Added ${track.kind} track to answer for ${data.from}:`, track.id);
                        } catch (error) {
                            // Игнорируем ошибку, если трек уже добавлен
                            if (error.name !== 'InvalidAccessError' || !error.message.includes('already exists')) {
                                console.error('[WebRTC] Error adding track:', error);
                            }
                        }
                    } else {
                        console.log(`[WebRTC] Track ${track.kind} (${track.id}) already added for ${data.from}`);
                    }
                });
                console.log(`[WebRTC] Tracks added for answer to ${data.from}:`, tracksAdded.length, tracksAdded);
            }
            
            // Проверяем текущее состояние перед установкой remoteDescription
            const signalingState = peerConnection.signalingState;
            console.log(`[WebRTC] Handling offer from ${data.from}, current signaling state: ${signalingState}`);
            
            // Если уже есть remoteDescription, это может вызвать ошибку
            // В этом случае закрываем соединение и создаем новое
            if (peerConnection.remoteDescription && signalingState !== 'have-remote-offer') {
                console.warn(`[WebRTC] Connection already has remoteDescription, closing and recreating for ${data.from}`);
                peerConnection.close();
                delete state.peerConnections[data.from];
                if (state.iceCandidateQueue[data.from]) {
                    delete state.iceCandidateQueue[data.from];
                }
                peerConnection = createPeerConnection(data.from);
                
                // Добавляем треки заново
                if (state.localStream) {
                    const tracksAdded = [];
                    state.localStream.getTracks().forEach(track => {
                        try {
                            peerConnection.addTrack(track, state.localStream);
                            tracksAdded.push({ kind: track.kind, id: track.id });
                            console.log(`[WebRTC] Added ${track.kind} track after reconnect for ${data.from}:`, track.id);
                        } catch (error) {
                            console.error('[WebRTC] Error adding track after reconnect:', error);
                        }
                    });
                    console.log(`[WebRTC] Tracks added after reconnect for ${data.from}:`, tracksAdded.length);
                }
            }
            
            console.log(`[WebRTC] Setting remote description (offer) from ${data.from}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log(`[WebRTC] Remote description set, signaling state: ${peerConnection.signalingState}`);
            
            await processIceCandidateQueue(data.from);
            
            console.log(`[WebRTC] Creating answer for ${data.from}`);
            const answer = await peerConnection.createAnswer();
            console.log(`[WebRTC] Answer created, SDP type: ${answer.type}`);
            
            await peerConnection.setLocalDescription(answer);
            console.log(`[WebRTC] Local description set, signaling state: ${peerConnection.signalingState}`);
            
            state.videoSocket.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                from: state.uid,
                to: data.from
            }));
            
            console.log(`[WebRTC] Successfully handled offer from ${data.from}`);
            // Снимаем флаг переговоров после успешной обработки
            setTimeout(() => {
                state.negotiationInProgress.delete(data.from);
            }, 2000);
        } catch (error) {
            console.error('[WebRTC] Error handling offer:', error);
            state.negotiationInProgress.delete(data.from);
            
            // Если ошибка связана с порядком m-lines, закрываем соединение и пытаемся переподключиться
            if (error.name === 'InvalidAccessError' && error.message.includes('order of m-lines')) {
                console.warn(`[WebRTC] M-line order mismatch for ${data.from}, closing connection and will retry`);
                const peerConnection = state.peerConnections[data.from];
                if (peerConnection) {
                    peerConnection.close();
                    delete state.peerConnections[data.from];
                }
                if (state.iceCandidateQueue[data.from]) {
                    delete state.iceCandidateQueue[data.from];
                }
                
                // Пытаемся переподключиться через небольшую задержку
                setTimeout(() => {
                    if (!state.peerConnections[data.from] && 
                        !state.negotiationInProgress.has(data.from) &&
                        state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        console.log(`[WebRTC] Retrying connection to ${data.from} after m-line order error`);
                        createOffer(data.from).catch(err => {
                            console.error(`[WebRTC] Error retrying offer to ${data.from}:`, err);
                        });
                    }
                }, 2000);
            }
        }
    }
    
    async function handleAnswer(data) {
        const peerConnection = state.peerConnections[data.from];
        if (!peerConnection) {
            console.warn(`[WebRTC] No peer connection found for ${data.from} when handling answer`);
            return;
        }
        
        try {
            const signalingState = peerConnection.signalingState;
            console.log(`[WebRTC] Handling answer from ${data.from}, current signaling state: ${signalingState}`);
            
            // Проверяем состояние перед установкой answer
            if (signalingState === 'stable') {
                // Если соединение уже в stable, проверяем ICE состояние
                const iceState = peerConnection.iceConnectionState;
                if (iceState === 'connected' || iceState === 'connecting') {
                    console.log(`[WebRTC] Connection to ${data.from} already established (ICE: ${iceState}), ignoring duplicate answer`);
                    return; // Игнорируем дублирующийся answer
                } else if (iceState === 'checking') {
                    // Если ICE в процессе проверки, это нормально - не закрываем соединение
                    console.log(`[WebRTC] Connection to ${data.from} is stable, ICE is checking - this is normal, ignoring duplicate answer`);
                    return; // Игнорируем дублирующийся answer, даем время на установку соединения
                } else if (iceState === 'disconnected' || iceState === 'failed' || iceState === 'closed') {
                    // Только если соединение точно не работает, переподключаемся
                    console.warn(`[WebRTC] Connection to ${data.from} is stable but ICE is ${iceState}, closing and will retry`);
                    peerConnection.close();
                    delete state.peerConnections[data.from];
                    if (state.iceCandidateQueue[data.from]) {
                        delete state.iceCandidateQueue[data.from];
                    }
                    // Пытаемся переподключиться
                    setTimeout(() => {
                        if (!state.peerConnections[data.from] && state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                            console.log(`[WebRTC] Retrying connection to ${data.from} after stable state issue`);
                            createOffer(data.from).catch(err => {
                                console.error(`[WebRTC] Error retrying offer to ${data.from}:`, err);
                            });
                        }
                    }, 2000);
                    return;
                }
            }
            
            // Устанавливаем answer только если в правильном состоянии
            if (signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log(`[WebRTC] Remote answer set for ${data.from}, signaling state: ${peerConnection.signalingState}`);
                await processIceCandidateQueue(data.from);
                // Снимаем флаг переговоров после успешной установки answer
                setTimeout(() => {
                    state.negotiationInProgress.delete(data.from);
                }, 1000);
            } else {
                console.warn(`[WebRTC] Cannot set remote answer for ${data.from}, wrong signaling state: ${signalingState}`);
                state.negotiationInProgress.delete(data.from);
            }
            } catch (error) {
                console.error('[WebRTC] Error setting remote answer:', error);
            
            // Если ошибка связана с неправильным состоянием, пытаемся переподключиться
            if (error.name === 'InvalidStateError') {
                console.warn(`[WebRTC] Invalid state error for ${data.from}, closing connection and will retry`);
                peerConnection.close();
                delete state.peerConnections[data.from];
                if (state.iceCandidateQueue[data.from]) {
                    delete state.iceCandidateQueue[data.from];
                }
                
                setTimeout(() => {
                    if (!state.peerConnections[data.from] && state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        console.log(`[WebRTC] Retrying connection to ${data.from} after InvalidStateError`);
                        createOffer(data.from).catch(err => {
                            console.error(`[WebRTC] Error retrying offer to ${data.from}:`, err);
                        });
                    }
                }, 1000);
            }
        }
    }
    
    async function handleIceCandidate(data) {
        const peerConnection = state.peerConnections[data.from];
        if (!peerConnection) {
            console.warn(`[WebRTC] No peer connection for ${data.from} when handling ICE candidate`);
            return;
        }
        
        if (!state.iceCandidateQueue[data.from]) {
            state.iceCandidateQueue[data.from] = [];
        }
        
        try {
            // Логируем тип кандидата для диагностики
            if (data.candidate && data.candidate.candidate) {
                const candidateStr = data.candidate.candidate;
                const isRelay = candidateStr.includes('typ relay');
                if (isRelay) {
                    console.log(`[WebRTC] ✅ Received TURN (relay) ICE candidate from ${data.from}`);
                }
            }
            
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                // Сохраняем в очередь если remoteDescription еще не установлен
                state.iceCandidateQueue[data.from].push(new RTCIceCandidate(data.candidate));
                console.log(`[WebRTC] Queued ICE candidate for ${data.from} (waiting for remote description)`);
            }
        } catch (error) {
            // Игнорируем ошибки дублирования кандидатов
            if (error.message && error.message.includes('duplicate')) {
                console.log(`[WebRTC] Duplicate ICE candidate ignored for ${data.from}`);
            } else {
            console.error('[WebRTC] Error adding ICE candidate:', error);
                // Пытаемся сохранить в очередь для повторной попытки
                if (peerConnection.remoteDescription) {
            state.iceCandidateQueue[data.from].push(new RTCIceCandidate(data.candidate));
                }
            }
        }
    }
    
    async function processIceCandidateQueue(peerUid) {
        const peerConnection = state.peerConnections[peerUid];
        if (!peerConnection || !peerConnection.remoteDescription) return;
        
        const queue = state.iceCandidateQueue[peerUid];
        if (!queue || queue.length === 0) return;
        
        while (queue.length > 0) {
            const candidate = queue.shift();
            try {
                await peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.error('[WebRTC] Error adding queued ICE candidate:', error);
            }
        }
    }
    
    function createPeerConnection(targetUid) {
        if (state.peerConnections[targetUid]) {
            return state.peerConnections[targetUid];
        }
        
        // Используем оптимизированную конфигурацию если готова, иначе дефолтную
        const config = state.configurationReady ? state.configuration : defaultConfiguration;
        console.log(`[WebRTC] Creating peer connection for ${targetUid} (config ready: ${state.configurationReady})`);
        
        const peerConnection = new RTCPeerConnection(config);
        
        // Таймаут для WebRTC соединения
        // Уменьшено для быстрого обнаружения проблем при множественных соединениях
        const CONNECTION_TIMEOUT = 60000;  // 60 секунд (было 90)
        const connectionTimeout = setTimeout(() => {
            const connState = peerConnection.connectionState;
            const iceState = peerConnection.iceConnectionState;
            
            // Закрываем только если соединение действительно не установилось
            if (connState !== 'connected' && connState !== 'connecting' && 
                iceState !== 'connected' && iceState !== 'completed' && iceState !== 'checking') {
                console.warn(`[WebRTC] Connection timeout for ${targetUid} (state: ${connState}, ICE: ${iceState}), closing connection`);
                peerConnection.close();
                delete state.peerConnections[targetUid];
                // Очищаем флаги
                state.negotiationInProgress.delete(targetUid);
                state.pendingOffers.delete(targetUid);
                if (state.iceCandidateQueue[targetUid]) {
                    delete state.iceCandidateQueue[targetUid];
                }
                // Удаляем видео контейнер
                const videoContainer = document.getElementById(`video-${targetUid}`);
                if (videoContainer) {
                    videoContainer.remove();
                    updateVideoLayout();
                }
                // Пытаемся переподключиться через задержку
                setTimeout(() => {
                    if (!state.peerConnections[targetUid] && 
                        !state.negotiationInProgress.has(targetUid) &&
                        state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        console.log(`[WebRTC] 🔄 Retrying connection to ${targetUid} after timeout`);
                        createOffer(targetUid).catch(err => {
                            console.error(`[WebRTC] Error retrying offer to ${targetUid}:`, err);
                        });
                    }
                }, 2000);
            } else {
                console.log(`[WebRTC] Connection timeout check for ${targetUid} - state OK (${connState}, ICE: ${iceState}), keeping connection`);
            }
        }, CONNECTION_TIMEOUT);
        
        // Очищаем таймаут при успешном подключении
        peerConnection.onconnectionstatechange = () => {
            const connState = peerConnection.connectionState;
            const iceState = peerConnection.iceConnectionState;
            console.log(`[WebRTC] Connection state changed for ${targetUid}:`, connState, `(ICE: ${iceState})`);
            
            if (connState === 'connected') {
                console.log(`[WebRTC] ✅ Connection established for ${targetUid}!`);
                clearTimeout(connectionTimeout);
                // Снимаем флаги переговоров при успешном подключении
                state.negotiationInProgress.delete(targetUid);
                state.pendingOffers.delete(targetUid);
            } else if (connState === 'failed' || connState === 'closed') {
                console.warn(`[WebRTC] Connection ${connState} for ${targetUid}`);
                clearTimeout(connectionTimeout);
                // Снимаем флаги при неудаче
                state.negotiationInProgress.delete(targetUid);
                state.pendingOffers.delete(targetUid);
            } else if (connState === 'connecting') {
                console.log(`[WebRTC] Connection connecting for ${targetUid}...`);
            }
        };
        
        // Храним таймеры для переподключения
        let reconnectTimeout = null;
        let iceCheckingTimeout = null;
        
        // Отслеживание состояния ICE соединения для диагностики
        peerConnection.oniceconnectionstatechange = () => {
            const iceState = peerConnection.iceConnectionState;
            const connState = peerConnection.connectionState;
            const signalingState = peerConnection.signalingState;
            
            console.log(`[WebRTC] ICE connection state for ${targetUid}:`, iceState, `(Connection: ${connState}, Signaling: ${signalingState})`);
            
            // Очищаем таймер переподключения при успешном соединении
            if (iceState === 'connected' || iceState === 'completed') {
                clearTimeout(reconnectTimeout);
                clearTimeout(iceCheckingTimeout);
                reconnectTimeout = null;
                iceCheckingTimeout = null;
                console.log(`[WebRTC] ✅ ICE connection established for ${targetUid}!`);
            } else if (iceState === 'failed') {
                console.warn(`[WebRTC] ❌ ICE connection failed for ${targetUid}, attempting to restart ICE`);
                clearTimeout(reconnectTimeout);
                clearTimeout(iceCheckingTimeout);
                
                // Пытаемся перезапустить ICE через renegotiation с iceRestart
                restartIceForPeer(targetUid, peerConnection).catch(error => {
                    console.error(`[WebRTC] Error restarting ICE for ${targetUid}:`, error);
                    // Если не удалось перезапустить, закрываем и пересоздаем соединение
                    peerConnection.close();
                    delete state.peerConnections[targetUid];
                    if (state.iceCandidateQueue[targetUid]) {
                        delete state.iceCandidateQueue[targetUid];
                    }
                    // Очищаем флаги переговоров
                    state.negotiationInProgress.delete(targetUid);
                    state.pendingOffers.delete(targetUid);
                    
                    // Пытаемся переподключиться через задержку
                    setTimeout(() => {
                        if (!state.peerConnections[targetUid] && 
                            !state.negotiationInProgress.has(targetUid) &&
                            state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                            console.log(`[WebRTC] 🔄 Retrying connection to ${targetUid} after ICE failure`);
                            createOffer(targetUid).catch(err => {
                                console.error(`[WebRTC] Error retrying offer to ${targetUid}:`, err);
                            });
                        }
                    }, 3000);
                });
            } else if (iceState === 'disconnected') {
                console.warn(`[WebRTC] ⚠️ ICE connection disconnected for ${targetUid}, monitoring for recovery...`);
                // При множественных соединениях уменьшаем время ожидания
                clearTimeout(reconnectTimeout);
                clearTimeout(iceCheckingTimeout);
                reconnectTimeout = setTimeout(() => {
                    if (state.peerConnections[targetUid]) {
                        const currentIceState = state.peerConnections[targetUid].iceConnectionState;
                        const currentConnState = state.peerConnections[targetUid].connectionState;
                        
                        // Переподключаемся только если соединение все еще disconnected и не connected
                        if (currentIceState === 'disconnected' && currentConnState !== 'connected') {
                            console.log(`[WebRTC] 🔄 Attempting ICE restart for ${targetUid} after disconnect...`);
                            restartIceForPeer(targetUid, state.peerConnections[targetUid]).catch(err => {
                                console.error(`[WebRTC] Error restarting ICE for ${targetUid}:`, err);
                                // Если не удалось, закрываем и пересоздаем
                                const pc = state.peerConnections[targetUid];
                                if (pc) {
                                    pc.close();
                                    delete state.peerConnections[targetUid];
                                    state.negotiationInProgress.delete(targetUid);
                                    state.pendingOffers.delete(targetUid);
                                    if (state.iceCandidateQueue[targetUid]) {
                                        delete state.iceCandidateQueue[targetUid];
                                    }
                                    // Переподключаемся
                                    setTimeout(() => {
                                        if (!state.peerConnections[targetUid] && 
                                            !state.negotiationInProgress.has(targetUid) &&
                                            state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                                            console.log(`[WebRTC] 🔄 Retrying connection to ${targetUid} after ICE restart failure`);
                                            createOffer(targetUid).catch(error => {
                                                console.error(`[WebRTC] Error retrying offer to ${targetUid}:`, error);
                                            });
                                        }
                                    }, 2000);
                                }
                            });
                        } else if (currentIceState === 'connected' || currentIceState === 'checking') {
                            console.log(`[WebRTC] ✅ ICE connection for ${targetUid} recovered: ${currentIceState}`);
                        }
                    }
                }, 2000); // Уменьшено с 3 до 2 секунд для быстрого восстановления
                } else if (iceState === 'checking') {
                    // Это нормальное состояние - соединение пытается установиться
                    console.log(`[WebRTC] 🔍 ICE connection checking for ${targetUid} - waiting for connection...`);
                    
                    // Таймаут для состояния checking - при множественных соединениях уменьшаем время
                    clearTimeout(iceCheckingTimeout);
                    const checkingTimeout = 12000;  // 12 секунд (было 15) для быстрого обнаружения проблем
                    iceCheckingTimeout = setTimeout(() => {
                        if (state.peerConnections[targetUid]) {
                            const currentIceState = state.peerConnections[targetUid].iceConnectionState;
                            if (currentIceState === 'checking') {
                                console.warn(`[WebRTC] ⏱️ ICE checking timeout (${checkingTimeout/1000}s) for ${targetUid} - restarting ICE...`);
                                restartIceForPeer(targetUid, state.peerConnections[targetUid]).catch(err => {
                                    console.error(`[WebRTC] Error restarting ICE after checking timeout for ${targetUid}:`, err);
                                    // Если не удалось перезапустить, закрываем и пересоздаем соединение
                                    const pc = state.peerConnections[targetUid];
                                    if (pc) {
                                        pc.close();
                                        delete state.peerConnections[targetUid];
                                        if (state.iceCandidateQueue[targetUid]) {
                                            delete state.iceCandidateQueue[targetUid];
                                        }
                                        state.negotiationInProgress.delete(targetUid);
                                        state.pendingOffers.delete(targetUid);
                                        
                                        // Пытаемся переподключиться
                                        setTimeout(() => {
                                            if (!state.peerConnections[targetUid] && 
                                                !state.negotiationInProgress.has(targetUid) &&
                                                state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                                                console.log(`[WebRTC] 🔄 Retrying connection to ${targetUid} after checking timeout`);
                                                createOffer(targetUid).catch(error => {
                                                    console.error(`[WebRTC] Error retrying offer to ${targetUid}:`, error);
                                                });
                                            }
                                        }, 2000);
                                    }
                                });
                            }
                        }
                    }, checkingTimeout);
                }
        };
        
        // Отслеживание состояния signaling для предотвращения одновременных renegotiation
        let isNegotiating = false;
        peerConnection.onsignalingstatechange = () => {
            const signalingState = peerConnection.signalingState;
            isNegotiating = (signalingState !== "stable");
            console.log(`[WebRTC] Signaling state for ${targetUid}: ${signalingState} (isNegotiating: ${isNegotiating})`);
            
            // Сохраняем состояние в глобальном флаге
            if (isNegotiating) {
                state.negotiationInProgress.add(targetUid);
            } else {
                // Не удаляем сразу - даем время на завершение
                setTimeout(() => {
                    if (peerConnection.signalingState === 'stable') {
                        state.negotiationInProgress.delete(targetUid);
                    }
                }, 1000);
            }
        };
        
        // Обработчик onnegotiationneeded - предотвращает автоматические renegotiation
        // которые могут вызывать множественные offer/answer циклы
        peerConnection.onnegotiationneeded = () => {
            // Игнорируем автоматические renegotiation - мы управляем этим вручную
            // через явные вызовы createOffer/handleOffer
            console.log(`[WebRTC] Negotiation needed for ${targetUid}, but ignoring automatic renegotiation (manual control)`);
            
            // Если соединение уже установлено, не инициируем новую переговоры
            if (peerConnection.connectionState === 'connected' || 
                peerConnection.connectionState === 'connecting') {
                console.log(`[WebRTC] Connection to ${targetUid} is ${peerConnection.connectionState}, skipping automatic renegotiation`);
                return;
            }
            
            // Если уже идет переговоры, игнорируем
            if (state.negotiationInProgress.has(targetUid)) {
                console.log(`[WebRTC] Negotiation already in progress for ${targetUid}, ignoring onnegotiationneeded`);
                return;
            }
        };
        
        // Отслеживание сбора ICE кандидатов
        peerConnection.onicegatheringstatechange = () => {
            console.log(`[WebRTC] ICE gathering state for ${targetUid}:`, peerConnection.iceGatheringState);
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Логируем тип кандидата для диагностики
                const candidateType = event.candidate.type;
                const candidateProtocol = event.candidate.protocol;
                const candidateAddress = event.candidate.address || 'N/A';
                const candidatePort = event.candidate.port || 'N/A';
                
                console.log(`[WebRTC] ICE candidate for ${targetUid}: type=${candidateType}, protocol=${candidateProtocol}, address=${candidateAddress}:${candidatePort}`);
                
                // Особое внимание к TURN кандидатам (relay)
                if (candidateType === 'relay') {
                    console.log(`[WebRTC] ✅ TURN candidate received for ${targetUid}! This should help with NAT traversal.`);
                    
                    // Отправляем информацию о TURN сервере на бекенд для логирования
                    if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        // Определяем какой TURN сервер используется по адресу
                        let turnServerName = 'Unknown';
                        if (candidateAddress === '144.31.75.55') {
                            turnServerName = 'Local TURN Server';
                        } else if (candidateAddress.includes('openrelay') || candidateAddress.includes('metered')) {
                            if (candidateAddress.includes('openrelay')) {
                                turnServerName = 'OpenRelay Metered';
                            } else {
                                turnServerName = 'Metered Relay';
                            }
                        } else if (candidateAddress.includes('viagenie') || candidateAddress.includes('numb')) {
                            turnServerName = 'Numb Viagenie';
                        }
                        
                        // Отправляем информацию о TURN сервере (не блокируем, просто логируем)
                        try {
                            state.videoSocket.send(JSON.stringify({
                                type: 'turn-server-used',
                                from: state.uid,
                                to: targetUid,
                                turn_server: turnServerName,
                                protocol: candidateProtocol,
                                address: candidateAddress,
                                port: candidatePort
                            }));
                        } catch (e) {
                            // Игнорируем ошибки отправки - это не критично
                        }
                    }
                }
                
                if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                state.videoSocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    from: state.uid,
                    to: targetUid
                }));
                }
            } else {
                // null candidate означает завершение сбора кандидатов
                console.log(`[WebRTC] ICE candidate gathering completed for ${targetUid}`);
                
                // Проверяем, получили ли мы TURN кандидаты
                // Используем более надежный способ проверки через getStats
                peerConnection.getStats().then(stats => {
                    let hasRelayCandidate = false;
                    let candidateTypes = [];
                    
                    stats.forEach(report => {
                        if (report.type === 'local-candidate') {
                            const candidateType = report.candidateType;
                            candidateTypes.push(candidateType);
                            if (candidateType === 'relay') {
                                hasRelayCandidate = true;
                                console.log(`[WebRTC] ✅ Found TURN (relay) candidate for ${targetUid}:`, {
                                    protocol: report.protocol,
                                    address: report.address,
                                    port: report.port
                                });
                            }
                        }
                    });
                    
                    // Логируем все типы кандидатов для диагностики
                    const uniqueTypes = [...new Set(candidateTypes)];
                    console.log(`[WebRTC] ICE candidate types for ${targetUid}:`, uniqueTypes);
                    
                    if (hasRelayCandidate) {
                        console.log(`[WebRTC] ✅ TURN (relay) candidates available for ${targetUid} - NAT traversal should work!`);
                    } else {
                        console.warn(`[WebRTC] ⚠️ No TURN (relay) candidates for ${targetUid} - connection may fail through strict NAT`);
                        console.warn(`[WebRTC] Available candidate types: ${uniqueTypes.join(', ')}`);
                        console.warn(`[WebRTC] TURN servers may be unavailable or blocked. Check firewall/network settings.`);
                    }
                }).catch(err => {
                    console.error(`[WebRTC] Error checking stats for ${targetUid}:`, err);
                });
            }
        };
        
        // Защита от множественных вызовов ontrack для одного пользователя
        let ontrackProcessed = false;
        peerConnection.ontrack = (event) => {
            // Защита: обрабатываем ontrack только один раз для каждого соединения
            // Это предотвращает множественные вызовы addVideoStream при подключении 3+ пользователей
            if (ontrackProcessed && state.displayedVideos.has(targetUid)) {
                console.log(`[WebRTC] ontrack already processed for ${targetUid}, skipping duplicate`);
                return;
            }
            
            console.log(`[WebRTC] ontrack event for ${targetUid}:`, {
                streams: event.streams.length,
                track: event.track.kind,
                trackId: event.track.id,
                trackEnabled: event.track.enabled,
                trackReadyState: event.track.readyState
            });
            
            const remoteStream = event.streams[0];
            if (remoteStream) {
                // Помечаем как обработанное только после успешного получения стрима
                ontrackProcessed = true;
                
                console.log('[WebRTC] Received remote stream for:', targetUid);
                const videoTracks = remoteStream.getVideoTracks();
                const audioTracks = remoteStream.getAudioTracks();
                console.log('[WebRTC] Video tracks count:', videoTracks.length);
                console.log('[WebRTC] Audio tracks count:', audioTracks.length);
                
                // Логируем информацию о каждом треке
                videoTracks.forEach((track, index) => {
                    console.log(`[WebRTC] Video track ${index} for ${targetUid}:`, {
                        id: track.id,
                        enabled: track.enabled,
                        readyState: track.readyState,
                        muted: track.muted
                    });
                });
                
                audioTracks.forEach((track, index) => {
                    console.log(`[WebRTC] Audio track ${index} for ${targetUid}:`, {
                        id: track.id,
                        enabled: track.enabled,
                        readyState: track.readyState,
                        muted: track.muted
                    });
                });
                
                // Сохраняем ссылку на стрим для периодической проверки
                if (!state.remoteStreams) {
                    state.remoteStreams = {};
                }
                state.remoteStreams[targetUid] = remoteStream;
                
                // Добавляем обработчики для отслеживания изменений треков
                videoTracks.forEach(track => {
                    console.log('[WebRTC] Video track enabled:', track.enabled, 'readyState:', track.readyState);
                    
                    track.addEventListener('ended', () => {
                        console.log('[WebRTC] Remote video track ended for:', targetUid);
                        // Обновляем отображение при завершении трека
                        const videoContainer = document.getElementById(`video-${targetUid}`);
                        if (videoContainer) {
                            const video = videoContainer.querySelector('video');
                            if (video && video.srcObject) {
                                // Проверяем, есть ли еще активные треки в stream
                                const stream = video.srcObject;
                                const activeTracks = stream.getVideoTracks().filter(t => t.readyState === 'live');
                                if (activeTracks.length === 0) {
                                    console.log('[WebRTC] No active video tracks for', targetUid, '- hiding video');
                                    video.style.display = 'none';
                                }
                            }
                        }
                    });
                    
                    track.addEventListener('mute', () => {
                        console.log('[WebRTC] Remote video track muted for:', targetUid);
                    });
                    
                    track.addEventListener('unmute', () => {
                        console.log('[WebRTC] Remote video track unmuted for:', targetUid);
                    });
                });
                
                // Добавляем обработчики для аудио треков (критично для предотвращения потери звука)
                audioTracks.forEach(track => {
                    console.log('[WebRTC] Audio track enabled:', track.enabled, 'readyState:', track.readyState);
                    
                    track.addEventListener('ended', () => {
                        console.warn('[WebRTC] Remote audio track ended for:', targetUid, '- audio may be lost');
                        // Пытаемся найти новый аудио трек в stream
                        const videoContainer = document.getElementById(`video-${targetUid}`);
                        if (videoContainer) {
                            const video = videoContainer.querySelector('video');
                            if (video && video.srcObject) {
                                const stream = video.srcObject;
                                const activeAudioTracks = stream.getAudioTracks().filter(t => t.readyState === 'live');
                                if (activeAudioTracks.length === 0) {
                                    console.warn('[WebRTC] No active audio tracks for', targetUid);
                                    // Проверяем remoteStreams для обновления
                                    if (state.remoteStreams && state.remoteStreams[targetUid]) {
                                        const remoteStream = state.remoteStreams[targetUid];
                                        const newAudioTracks = remoteStream.getAudioTracks().filter(t => t.readyState === 'live');
                                        if (newAudioTracks.length > 0) {
                                            console.log('[WebRTC] Found new audio tracks, updating stream for', targetUid);
                                            // Обновляем stream с новыми аудио треками
                                            const newStream = new MediaStream([...video.srcObject.getVideoTracks(), ...newAudioTracks]);
                                            video.srcObject = newStream;
                                        }
                                    }
                                }
                            }
                        }
                    });
                    
                    track.addEventListener('mute', () => {
                        console.log('[WebRTC] Remote audio track muted for:', targetUid);
                    });
                    
                    track.addEventListener('unmute', () => {
                        console.log('[WebRTC] Remote audio track unmuted for:', targetUid);
                    });
                });
                
                // Проверяем наличие активных видео треков
                const hasActiveVideo = videoTracks.length > 0 && videoTracks.some(t => t.enabled && t.readyState === 'live');
                console.log('[WebRTC] Has active video:', hasActiveVideo);
                console.log('[WebRTC] Current camera state for', targetUid, ':', state.userCameraStates.hasOwnProperty(targetUid) ? state.userCameraStates[targetUid] : 'not set');
                
                // Проверяем, является ли это screen share track
                const screenShareTracks = videoTracks.filter(track => {
                    const label = track.label.toLowerCase();
                    return label.includes('screen') || label.includes('display') || label.includes('window');
                });
                const cameraTracks = videoTracks.filter(track => {
                    const label = track.label.toLowerCase();
                    return !label.includes('screen') && !label.includes('display') && !label.includes('window');
                });
                
                const hasScreenShareTrack = screenShareTracks.length > 0;
                const hasCameraTrack = cameraTracks.length > 0;
                
                // ВАЖНО: Если пользователь делится экраном, используем ту же логику, что и для локального пользователя
                if (hasScreenShareTrack && state.currentSharingUser === targetUid) {
                    console.log('[WebRTC] Screen share track received for user:', targetUid);
                    
                    // ВАЖНО: Обновляем layout ПЕРЕД созданием контейнеров
                    // Это гарантирует, что CSS классы и структура будут правильными для всех устройств
                    console.log('[WebRTC] Updating video layout for screen share from remote user:', targetUid);
                    updateVideoLayout();
                    
                    // Создаем функцию для установки screen share stream
                    // Эта функция будет вызвана после обновления layout
                    const setupRemoteScreenShare = () => {
                        const container = document.querySelector('.video-streams');
                        if (!container) {
                            console.warn('[WebRTC] Video streams container not found');
                            return;
                        }
                        
                        // Убеждаемся, что контейнер в режиме screen sharing
                        if (!container.classList.contains('screen-share-mode')) {
                            container.classList.add('screen-share-mode');
                            console.log('[WebRTC] Added screen-share-mode class to container');
                        }
                        
                        // Создаем или находим screen-share-container
                        let screenShareContainer = container.querySelector('.screen-share-container');
                        if (!screenShareContainer) {
                            screenShareContainer = document.createElement('div');
                            screenShareContainer.className = 'screen-share-container';
                            container.insertBefore(screenShareContainer, container.firstChild);
                            console.log('[WebRTC] Created screen-share-container');
                        }
                        
                        // Создаем или находим контейнер для screen share видео
                        let screenShareVideoContainer = screenShareContainer.querySelector(`#screen-share-${targetUid}`);
                        if (!screenShareVideoContainer) {
                            screenShareVideoContainer = document.createElement('div');
                            screenShareVideoContainer.className = 'video-container screen-share-video';
                            screenShareVideoContainer.id = `screen-share-${targetUid}`;
                            
                            const videoElement = document.createElement('video');
                            videoElement.autoplay = true;
                            videoElement.playsInline = true;
                            videoElement.muted = false; // Для удаленного не muted
                            videoElement.className = 'video-player';
                            screenShareVideoContainer.appendChild(videoElement);
                            
                            const usernameWrapper = document.createElement('div');
                            usernameWrapper.className = 'username-wrapper';
                            usernameWrapper.textContent = state.userNames[targetUid] || `User ${targetUid}`;
                            screenShareVideoContainer.appendChild(usernameWrapper);
                            
                            screenShareContainer.appendChild(screenShareVideoContainer);
                            console.log('[WebRTC] Created screen-share-video container for user:', targetUid);
                        }
                        
                        // Устанавливаем stream
                        const screenShareVideo = screenShareVideoContainer.querySelector('video');
                        if (screenShareVideo) {
                            // Создаем новый stream только с screen share track
                            const screenShareStream = new MediaStream(screenShareTracks);
                            // Добавляем аудио треки из screen share, если есть
                            const audioTracks = remoteStream.getAudioTracks();
                            audioTracks.forEach(track => screenShareStream.addTrack(track));
                            
                            // Останавливаем предыдущий play() если он есть
                            screenShareVideo.pause();
                            screenShareVideo.srcObject = screenShareStream;
                            setTimeout(() => {
                                screenShareVideo.play().catch(err => {
                                    if (err.name !== 'AbortError') {
                                        console.error('[WebRTC] Error playing screen share:', err);
                                    }
                                });
                            }, 50);
                            console.log('[WebRTC] Screen share stream set in container for user:', targetUid);
                        } else {
                            console.warn('[WebRTC] Screen share video element not found in container');
                        }
                    };
                    
                    // Вызываем setupRemoteScreenShare после обновления layout
                    // Используем несколько попыток для надежности на мобильных устройствах
                    setTimeout(() => {
                        setupRemoteScreenShare();
                    }, 200);
                    
                    // Повторная попытка через больший интервал для мобильных устройств
                    setTimeout(() => {
                        setupRemoteScreenShare();
                    }, 600);
                }
                
                // ВАЖНО: Если пользователь делится экраном, его камера должна быть отдельно от screen share
                // Screen share идет в screen-share-container, камера - в participants-panel
                
                // Сначала проверяем и удаляем screen share из контейнера пользователя, если он там есть
                const existingVideoContainer = document.getElementById(`video-${targetUid}`);
                if (existingVideoContainer) {
                    const existingVideo = existingVideoContainer.querySelector('video');
                    if (existingVideo && existingVideo.srcObject) {
                        const existingStream = existingVideo.srcObject;
                        const existingVideoTracks = existingStream.getVideoTracks();
                        const isScreenShareInContainer = existingVideoTracks.some(track => {
                            const label = track.label.toLowerCase();
                            return label.includes('screen') || label.includes('display') || label.includes('window');
                        });
                        
                        if (isScreenShareInContainer) {
                            // В контейнере пользователя отображается screen share - удаляем контейнер
                            console.log('[WebRTC] Removing screen share from user container:', targetUid);
                            existingVideoContainer.remove();
                            // Удаляем из displayedVideos, чтобы можно было создать новый контейнер для камеры
                            state.displayedVideos.delete(targetUid);
                        }
                    }
                }
                
                // Если есть камера (не screen share), добавляем её в обычный контейнер
                // ВАЖНО: Камера пользователя, который делится экраном, будет перемещена в participants-panel через setupScreenShareLayout
                if (hasCameraTrack) {
                    // Создаем stream только с камерой (без screen share)
                    const cameraStream = new MediaStream(cameraTracks);
                    // Добавляем аудио треки (если они не из screen share)
                    const audioTracks = remoteStream.getAudioTracks();
                    audioTracks.forEach(track => {
                        // Проверяем, что это не screen audio
                        const trackLabel = track.label.toLowerCase();
                        if (!trackLabel.includes('screen') && !trackLabel.includes('display')) {
                            cameraStream.addTrack(track);
                        }
                    });
                    
                    console.log('[WebRTC] Camera track found for user:', targetUid, '- adding to regular container');
                    
                    // ВАЖНО: Если пользователь делится экраном, убеждаемся что камера не заменяется на screen share
                    // Проверяем еще раз перед добавлением
                    const checkContainer = document.getElementById(`video-${targetUid}`);
                    if (checkContainer) {
                        const checkVideo = checkContainer.querySelector('video');
                        if (checkVideo && checkVideo.srcObject) {
                            const checkStream = checkVideo.srcObject;
                            const checkTracks = checkStream.getVideoTracks();
                            const hasScreenShare = checkTracks.some(track => {
                                const label = track.label.toLowerCase();
                                return label.includes('screen') || label.includes('display') || label.includes('window');
                            });
                            
                            if (hasScreenShare) {
                                console.log('[WebRTC] Container still has screen share, removing before adding camera:', targetUid);
                                checkContainer.remove();
                                state.displayedVideos.delete(targetUid);
                            }
                        }
                    }
                    
                    // Добавляем камеру в обычный контейнер
                    // Если screen share активен, setupScreenShareLayout переместит её в participants-panel
                    addVideoStream(targetUid, cameraStream, false);
                } else if (!hasScreenShareTrack) {
                    // Нет ни камеры, ни screen share - добавляем весь stream (может быть только аудио)
                    console.log('[WebRTC] No camera or screen share track, adding full stream for user:', targetUid);
                addVideoStream(targetUid, remoteStream, false);
                } else if (!hasCameraTrack && hasScreenShareTrack && state.currentSharingUser === targetUid) {
                    // Только screen share, нет камеры - не добавляем в обычный контейнер
                    console.log('[WebRTC] Only screen share track for user:', targetUid, '- not adding to regular container');
                    
                    // Убеждаемся, что видео контейнер пользователя не отображает screen share
                    // (уже проверили выше, но проверяем еще раз для надежности)
                    if (existingVideoContainer && existingVideoContainer.parentElement) {
                        const existingVideo = existingVideoContainer.querySelector('video');
                        if (existingVideo && existingVideo.srcObject) {
                            const existingStream = existingVideo.srcObject;
                            const existingVideoTracks = existingStream.getVideoTracks();
                            const isScreenShareInContainer = existingVideoTracks.some(track => {
                                const label = track.label.toLowerCase();
                                return label.includes('screen') || label.includes('display') || label.includes('window');
                            });
                            
                            if (isScreenShareInContainer) {
                                // В контейнере пользователя отображается screen share - удаляем его
                                console.log('[WebRTC] Removing screen share from user container (second check):', targetUid);
                                existingVideoContainer.remove();
                                state.displayedVideos.delete(targetUid);
                            }
                        }
                    }
                }
                
                // Запускаем мониторинг качества связи для удаленного пользователя
                // Запускаем с небольшой задержкой, чтобы соединение успело установиться
                setTimeout(() => {
                    if (state.peerConnections[targetUid]) {
                        startConnectionQualityMonitoring(targetUid);
                    }
                }, 2000);
                
                // Показываем лоадер при получении удаленного стрима
                const videoContainer = document.getElementById(`video-${targetUid}`);
                if (videoContainer) {
                    const loader = videoContainer.querySelector('.video-loader');
                    if (loader) {
                        loader.style.display = 'flex';
                        loader.style.visibility = 'visible';
                        loader.style.opacity = '1';
                        console.log('[WebRTC] Showing loader for remote user:', targetUid);
                    } else {
                        console.warn('[WebRTC] Loader not found for remote user:', targetUid);
                    }
                } else {
                    console.warn('[WebRTC] Video container not found for remote user:', targetUid);
                }
                
                // Если состояние камеры установлено как enabled, принудительно показываем видео
                // Если состояние не установлено, но трек активен - показываем видео временно
                setTimeout(() => {
                    const videoContainer = document.getElementById(`video-${targetUid}`);
                    if (videoContainer) {
                        const video = videoContainer.querySelector('video');
                        const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                        const loader = videoContainer.querySelector('.video-loader');
                        const currentCameraState = state.userCameraStates.hasOwnProperty(targetUid) ? state.userCameraStates[targetUid] : null;
                        
                        // Убеждаемся, что лоадер виден перед началом воспроизведения
                        if (loader) {
                            loader.style.display = 'flex';
                            loader.style.visibility = 'visible';
                            loader.style.opacity = '1';
                            loader.style.transition = 'opacity 0.2s ease-in';
                            console.log('[WebRTC] Ensuring loader visible before video play for', targetUid);
                        }
                        
                        // ВАЖНО: Не используем remoteStream напрямую, если он содержит screen share
                        // Проверяем, содержит ли remoteStream screen share track
                        const remoteStreamVideoTracks = remoteStream.getVideoTracks();
                        const remoteStreamHasScreenShare = remoteStreamVideoTracks.some(track => {
                            const label = track.label.toLowerCase();
                            return label.includes('screen') || label.includes('display') || label.includes('window');
                        });
                        
                        // Если remoteStream содержит screen share, и это пользователь, который делится экраном,
                        // не используем remoteStream напрямую - камера должна быть отдельно
                        if (remoteStreamHasScreenShare && state.currentSharingUser === targetUid) {
                            console.log('[WebRTC] Remote stream contains screen share for', targetUid, '- not using it directly, camera should be separate');
                            // Камера должна быть установлена через addVideoStream выше
                            // Здесь просто проверяем, что video.srcObject не содержит screen share
                            if (video && video.srcObject) {
                                const currentStream = video.srcObject;
                                const currentVideoTracks = currentStream.getVideoTracks();
                                const currentHasScreenShare = currentVideoTracks.some(track => {
                                    const label = track.label.toLowerCase();
                                    return label.includes('screen') || label.includes('display') || label.includes('window');
                                });
                                
                                if (currentHasScreenShare) {
                                    console.warn('[WebRTC] Video container still has screen share, removing:', targetUid);
                                    videoContainer.remove();
                                    state.displayedVideos.delete(targetUid);
                                }
                            }
                            return; // Не продолжаем обработку для screen share stream
                        }
                        
                        // Если состояние установлено как enabled ИЛИ не установлено но трек активен
                        if (currentCameraState === true || (!currentCameraState && hasActiveVideo)) {
                            if (video) {
                                // Убеждаемся, что srcObject установлен (только если это не screen share)
                                if (video.srcObject !== remoteStream && !remoteStreamHasScreenShare) {
                                    video.srcObject = remoteStream;
                                }
                                // Убеждаемся, что аудио не приглушено
                                video.muted = false;
                                video.style.display = 'block';
                                video.style.zIndex = '2';
                                // Проверяем, что элемент все еще в DOM перед воспроизведением
                                if (video.isConnected) {
                                    // Оптимизация для мобильных: последовательное воспроизведение
                                    const deviceType = getDeviceType();
                                    const isMobile = deviceType.type === 'phone' || deviceType.type === 'tablet';
                                    const displayedVideosArray = Array.from(state.displayedVideos);
                                    const videoIndex = displayedVideosArray.indexOf(targetUid);
                                    const playDelay = isMobile && videoIndex >= 0 ? (videoIndex * 200) : 0;
                                    
                                    const playVideo = () => {
                                        video.play().catch(err => {
                                            // Игнорируем AbortError - это нормально, если видео было удалено или приостановлено
                                            if (err.name !== 'AbortError') {
                                                console.error('[WebRTC] Error playing video after stream received:', err);
                                            }
                                            // Скрываем лоадер при ошибке
                                            if (loader) {
                                                loader.style.opacity = '0';
                                                loader.style.transition = 'opacity 0.3s ease-out';
                                                setTimeout(() => {
                                                    loader.style.display = 'none';
                                                    loader.style.visibility = 'hidden';
                                                    state.loaderHidden[targetUid] = true;
                                                }, 300);
                                            }
                                        });
                                    };
                                    
                                    if (playDelay > 0) {
                                        setTimeout(playVideo, playDelay);
                                        console.log(`[WebRTC] Delaying video play for ${targetUid} by ${playDelay}ms (mobile optimization)`);
                                    } else {
                                        playVideo();
                                    }
                                }
                                console.log('[WebRTC] Showing video for', targetUid, '- camera state:', currentCameraState === true ? 'enabled' : 'not set (track active)');
                            }
                            if (svgPlaceholder) {
                                svgPlaceholder.style.display = 'none';
                            }
                            // НЕ скрываем лоадер здесь - он скроется в onplay с задержкой
                        } else {
                            // Камера выключена - скрываем лоадер
                            if (loader) {
                                loader.style.opacity = '0';
                                loader.style.transition = 'opacity 0.3s ease-out';
                                setTimeout(() => {
                                    loader.style.display = 'none';
                                    loader.style.visibility = 'hidden';
                                }, 300);
                            }
                        }
                    }
                }, 100);
                
                // updateVideoDisplay вызывается внутри addVideoStream
                // Для удаленных пользователей используется сохраненное состояние из WebSocket сообщений
            }
        };
        
        // УДАЛЕНО: дублирующий обработчик onconnectionstatechange
        // Основной обработчик уже установлен выше в createPeerConnection
        // Это предотвращает конфликты при подключении 3+ пользователей
        
        state.peerConnections[targetUid] = peerConnection;
        return peerConnection;
    }
    
    function addVideoStream(uid, stream, isLocal) {
        console.log('[Video] Adding video stream for:', uid, 'isLocal:', isLocal);
        
        // ВАЖНО: Проверяем, не содержит ли stream screen share track
        // Если содержит и это пользователь, который делится экраном, не добавляем в обычный контейнер
        const videoTracks = stream.getVideoTracks();
        const hasScreenShareTrack = videoTracks.some(track => {
            const label = track.label.toLowerCase();
            return label.includes('screen') || label.includes('display') || label.includes('window');
        });
        
        if (hasScreenShareTrack && state.currentSharingUser === uid && !isLocal) {
            console.warn('[Video] Stream contains screen share track for', uid, '- not adding to regular container');
            // Убеждаемся, что контейнер пользователя не отображает screen share
            const existingContainer = document.getElementById(`video-${uid}`);
            if (existingContainer) {
                const existingVideo = existingContainer.querySelector('video');
                if (existingVideo && existingVideo.srcObject === stream) {
                    console.log('[Video] Removing screen share from user container:', uid);
                    existingContainer.remove();
                    state.displayedVideos.delete(uid);
                }
            }
            return; // Не добавляем screen share в обычный контейнер
        }
        
        // Защита: предотвращаем множественные вызовы для одного пользователя
        // Это критично при подключении 3+ пользователей
        if (state.displayedVideos.has(uid)) {
            console.log('[Video] Video stream already displayed, updating...');
            const videoContainer = document.getElementById(`video-${uid}`);
            if (videoContainer) {
                const existingVideo = videoContainer.querySelector('video');
                if (existingVideo && existingVideo.srcObject === stream) {
                    // Стрим уже установлен, не обновляем
                    console.log('[Video] Stream already set for', uid, '- skipping update');
                    return;
                }
                
                // ВАЖНО: Проверяем, не содержит ли существующий stream screen share
                if (existingVideo && existingVideo.srcObject) {
                    const existingStream = existingVideo.srcObject;
                    const existingVideoTracks = existingStream.getVideoTracks();
                    const existingHasScreenShare = existingVideoTracks.some(track => {
                        const label = track.label.toLowerCase();
                        return label.includes('screen') || label.includes('display') || label.includes('window');
                    });
                    
                    // Если существующий stream содержит screen share, а новый - камера, заменяем
                    if (existingHasScreenShare && !hasScreenShareTrack && state.currentSharingUser === uid) {
                        console.log('[Video] Replacing screen share with camera stream for', uid);
                        // Продолжаем обновление
                    } else if (existingHasScreenShare && hasScreenShareTrack) {
                        // Оба содержат screen share - не обновляем
                        console.log('[Video] Both streams contain screen share, skipping update for', uid);
                        return;
                    }
                }
                
                if (existingVideo) {
                    // Дебаунс для обновления srcObject - предотвращаем частые обновления
                    if (state.videoUpdateTimers[uid]) {
                        clearTimeout(state.videoUpdateTimers[uid]);
                    }
                    
                    state.videoUpdateTimers[uid] = setTimeout(() => {
                        // Проверяем, изменился ли srcObject перед обновлением
                        // Это предотвращает ненужные обновления и AbortError
                        if (existingVideo.isConnected) {
                            const currentStream = existingVideo.srcObject;
                            const streamChanged = currentStream !== stream;
                            
                            if (streamChanged) {
                                console.log(`[Video] Stream changed for ${uid}, updating srcObject`);
                                
                                // Отменяем предыдущий play() если он еще выполняется
                                if (state.videoPlayPromises[uid]) {
                                    state.videoPlayPromises[uid].catch(() => {}); // Игнорируем ошибки отмены
                                    state.videoPlayPromises[uid] = null;
                                }
                                
                                // Обновляем srcObject только если действительно изменился
                existingVideo.srcObject = stream;
                                
                                // Для удаленных пользователей убеждаемся, что аудио не приглушено
                                if (!isLocal) {
                                    existingVideo.muted = false;
                                    // Убеждаемся, что видео показывается
                                    if (existingVideo.style.display !== 'block') {
                                        existingVideo.style.display = 'block';
                                        existingVideo.style.zIndex = '2';
                                    }
                                    
                                    // Оптимизация для мобильных: последовательное воспроизведение
                                    const deviceType = getDeviceType();
                                    const isMobile = deviceType.type === 'phone' || deviceType.type === 'tablet';
                                    const displayedVideosArray = Array.from(state.displayedVideos);
                                    const videoIndex = displayedVideosArray.indexOf(uid);
                                    const playDelay = isMobile && !isLocal && videoIndex >= 0 ? (videoIndex * 200) : 0;
                                    
                                    // Запускаем воспроизведение только если видео приостановлено
                                    if (existingVideo.paused) {
                                        const playVideo = () => {
                                            state.videoPlayPromises[uid] = existingVideo.play().catch(err => {
                                                // Игнорируем AbortError - это нормально, если видео было удалено или приостановлено
                                                if (err.name !== 'AbortError') {
                                                    console.error('[Video] Error playing existing video:', err);
                                                }
                                            });
                                        };
                                        
                                        if (playDelay > 0) {
                                            setTimeout(playVideo, playDelay);
                                            console.log(`[Video] Delaying video play for ${uid} by ${playDelay}ms (mobile optimization)`);
                                        } else {
                                            playVideo();
                                        }
                                    }
                                }
                            } else {
                                console.log(`[Video] Stream unchanged for ${uid}, skipping srcObject update`);
                            }
                        }
                        delete state.videoUpdateTimers[uid];
                    }, 100); // Дебаунс 100ms
                }
            }
            // Обновляем отображение в зависимости от состояния камеры
            // Для удаленных пользователей используем только сохраненное состояние из WebSocket
            updateVideoDisplay(uid, stream);
            
            // Обновляем класс для экрана демонстрации
            const isScreenShare = state.isScreenSharing && state.currentSharingUser === uid;
            if (videoContainer) {
                if (isScreenShare) {
                    videoContainer.classList.add('screen-share');
                } else {
                    videoContainer.classList.remove('screen-share');
                }
                
                // Если идет демонстрация экрана, но это не экран демонстрации, перемещаем в header
                if (state.isScreenSharing && state.currentSharingUser === state.uid && !isScreenShare) {
                    const mainContent = document.querySelector('.main-content');
                    const roomHeader = document.querySelector('.room-header');
                    if (mainContent && mainContent.classList.contains('screen-share-mode') && roomHeader) {
                        let headerVideoStreams = roomHeader.querySelector('.video-streams');
                        if (!headerVideoStreams) {
                            headerVideoStreams = document.createElement('div');
                            headerVideoStreams.className = 'video-streams';
                            headerVideoStreams.id = 'header-video-streams';
                            roomHeader.appendChild(headerVideoStreams);
                        }
                        // Проверяем, не находится ли уже в header
                        if (videoContainer.parentElement !== headerVideoStreams) {
                            videoContainer.remove();
                            headerVideoStreams.appendChild(videoContainer);
                            console.log('[ScreenShare] Moved camera to header during update:', uid);
                        }
                    }
                }
            }
            
            return;
        }
        
        state.displayedVideos.add(uid);
        state.connectedUsers.add(uid);
        
        const videoContainer = document.createElement('div');
        // Определяем, является ли это экраном демонстрации
        const isScreenShare = state.isScreenSharing && state.currentSharingUser === uid;
        videoContainer.className = isScreenShare ? 'video-container screen-share' : 'video-container';
        videoContainer.id = `video-${uid}`;
        videoContainer.style.position = 'relative';
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = isLocal; // Только локальное видео должно быть приглушено
        video.setAttribute('playsinline', 'true');
        
        // Оптимизация для мобильных: добавляем атрибуты для лучшей производительности
        const deviceType = getDeviceType();
        const isMobile = deviceType.type === 'phone' || deviceType.type === 'tablet';
        if (isMobile) {
            // Для мобильных устройств отключаем некоторые оптимизации браузера
            video.preload = 'auto';
            // Добавляем обработчик для оптимизации загрузки
            video.addEventListener('loadstart', () => {
                console.log(`[Video] Load started for ${uid} on mobile device`);
            });
        }
        // Убеждаемся, что аудио не приглушено для удаленных пользователей
        if (!isLocal) {
            video.muted = false;
        }
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.zIndex = '2';
        
        // Для удаленных пользователей: если состояние камеры установлено и выключено, скрываем видео
        // Если состояние не установлено, показываем видео (будет обновлено при получении сообщения)
        if (!isLocal) {
            const cameraStateSet = state.userCameraStates.hasOwnProperty(uid);
            if (cameraStateSet && !state.userCameraStates[uid]) {
                // Состояние установлено и камера выключена - скрываем видео
                video.style.display = 'none';
                console.log('[Video] Hiding video for remote user', uid, '- camera state: disabled');
            } else if (!cameraStateSet) {
                // Состояние не установлено - показываем видео временно
                video.style.display = 'block';
                console.log('[Video] Showing video temporarily for remote user', uid, '- waiting for camera state message');
            }
        }
        
        // Базовая инициализация видео - без автоматических проверок состояния
        // Состояние камеры управляется только через WebSocket сообщения
        video.onloadedmetadata = () => {
            console.log('[Video] Video metadata loaded for:', uid);
            // Для удаленных пользователей: проверяем состояние камеры перед воспроизведением
            if (!isLocal) {
                const cameraStateSet = state.userCameraStates.hasOwnProperty(uid);
                if (cameraStateSet && !state.userCameraStates[uid]) {
                    // Состояние установлено и камера выключена - не воспроизводим видео
                    console.log('[Video] Camera disabled for remote user', uid, '- not playing video, showing placeholder');
                    video.style.display = 'none';
                    const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'block';
                    }
                    // Скрываем лоадер (камера выключена)
                    const loader = videoContainer.querySelector('.video-loader');
                    if (loader) {
                        loader.style.opacity = '0';
                        loader.style.transition = 'opacity 0.3s ease-out';
                        setTimeout(() => {
                            loader.style.display = 'none';
                            loader.style.visibility = 'hidden';
                            state.loaderHidden[uid] = true;
                        }, 300);
                    }
                    return;
                }
            }
            // Оптимизация для мобильных: последовательное воспроизведение видео
            const deviceType = getDeviceType();
            const isMobile = deviceType.type === 'phone' || deviceType.type === 'tablet';
            const displayedVideosArray = Array.from(state.displayedVideos);
            const videoIndex = displayedVideosArray.indexOf(uid);
            // Для мобильных устройств добавляем задержку между воспроизведением видео
            const playDelay = isMobile && !isLocal && videoIndex >= 0 ? (videoIndex * 200) : 0;
            
            const playVideo = () => {
                video.play().catch(err => {
                    // Игнорируем AbortError - это нормально, если видео было удалено или приостановлено
                    if (err.name !== 'AbortError') {
                        console.error('Error playing video:', err);
                    }
                    // Скрываем лоадер при ошибке
                    if (!isLocal) {
                        const loader = videoContainer.querySelector('.video-loader');
                        if (loader) {
                            loader.style.opacity = '0';
                            loader.style.transition = 'opacity 0.3s ease-out';
                            setTimeout(() => {
                                loader.style.display = 'none';
                                loader.style.visibility = 'hidden';
                                state.loaderHidden[uid] = true;
                            }, 300);
                        }
                    }
                });
            };
            
            if (playDelay > 0) {
                setTimeout(playVideo, playDelay);
                console.log(`[Video] Delaying initial video play for ${uid} by ${playDelay}ms (mobile optimization)`);
            } else {
                playVideo();
            }
        };
        
        // Скрываем лоадер только когда видео действительно загрузилось и показывает изображение
        video.onloadeddata = () => {
            console.log('[Video] Video data loaded for:', uid, 'readyState:', video.readyState);
            // Скрываем лоадер когда первый кадр видео загружен
            if (!isLocal && !state.loaderHidden[uid]) {
                // Проверяем, что видео действительно готово показывать изображение
                if (video.readyState >= 2) { // HAVE_CURRENT_DATA или выше
                    setTimeout(() => {
                        // Проверяем еще раз, не был ли лоадер уже скрыт
                        if (state.loaderHidden[uid]) {
                            console.log('[Video] Loader already hidden for', uid, '- skipping');
                            return;
                        }
                        const loader = videoContainer.querySelector('.video-loader');
                        if (loader) {
                            // Плавное скрытие с анимацией
                            loader.style.opacity = '0';
                            loader.style.transition = 'opacity 0.3s ease-out';
                            setTimeout(() => {
                                loader.style.display = 'none';
                                loader.style.visibility = 'hidden';
                                state.loaderHidden[uid] = true;
                                console.log('[Video] Hiding loader for remote user:', uid, '- video data loaded');
                            }, 300); // Ждем окончания анимации
                        }
                    }, 200); // Небольшая задержка для плавности
                }
            }
        };
        
        // Дополнительная проверка на oncanplay (когда достаточно данных для воспроизведения)
        video.oncanplay = () => {
            console.log('[Video] Video can play for:', uid, 'readyState:', video.readyState);
            // Скрываем лоадер когда видео готово к воспроизведению
            if (!isLocal && !state.loaderHidden[uid] && video.readyState >= 3) { // HAVE_FUTURE_DATA или выше
                setTimeout(() => {
                    if (state.loaderHidden[uid]) {
                        return;
                    }
                    const loader = videoContainer.querySelector('.video-loader');
                    if (loader) {
                        loader.style.opacity = '0';
                        loader.style.transition = 'opacity 0.3s ease-out';
                        setTimeout(() => {
                            loader.style.display = 'none';
                            loader.style.visibility = 'hidden';
                            state.loaderHidden[uid] = true;
                            console.log('[Video] Hiding loader for remote user:', uid, '- video can play');
                        }, 300);
                    }
                }, 200);
            }
        };
        
        video.onplay = () => {
            console.log('[Video] Video started playing for:', uid);
            // Для удаленных пользователей: проверяем состояние камеры при воспроизведении
            // Останавливаем видео только если состояние установлено И камера выключена
            if (!isLocal) {
                const cameraStateSet = state.userCameraStates.hasOwnProperty(uid);
                if (cameraStateSet && !state.userCameraStates[uid]) {
                    // Состояние установлено и камера выключена - останавливаем воспроизведение
                    console.log('[Video] Camera disabled for remote user', uid, '- stopping video playback, showing placeholder');
                    video.pause();
                    video.style.display = 'none';
                    const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'block';
                    }
                }
                // Если состояние не установлено, продолжаем воспроизведение
            }
        };
        
        video.onerror = (error) => {
            console.error('[Video] Video error for:', uid, error);
        };
        
        const usernameWrapper = document.createElement('div');
        usernameWrapper.className = 'username-wrapper';
        // Используем сохраненное имя пользователя или fallback
        const displayName = isLocal ? state.userName : (state.userNames[uid] || `User ${uid.substring(0, 6)}`);
        usernameWrapper.textContent = displayName;
        
        // Создаем контейнер для иконок статуса
        const statusIconsContainer = document.createElement('div');
        statusIconsContainer.className = 'video-status-icons';
        statusIconsContainer.style.position = 'absolute';
        statusIconsContainer.style.top = '12px';
        statusIconsContainer.style.right = '12px';
        statusIconsContainer.style.display = 'flex';
        statusIconsContainer.style.flexDirection = 'column';
        statusIconsContainer.style.gap = '8px';
        statusIconsContainer.style.zIndex = '15';
        statusIconsContainer.style.pointerEvents = 'none';
        
        // Иконка качества связи
        const connectionQualityIcon = document.createElement('div');
        const qualityIconId = isLocal ? 'connection-quality-local' : `connection-quality-${uid}`;
        connectionQualityIcon.id = qualityIconId;
        connectionQualityIcon.className = 'connection-quality-icon';
        connectionQualityIcon.style.display = 'none';
        connectionQualityIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 16H4V12H2V16ZM6 16H8V8H6V16ZM10 16H12V4H10V16ZM14 16H16V2H14V16Z" fill="currentColor"/>
            </svg>
        `;
        statusIconsContainer.appendChild(connectionQualityIcon);
        
        // Настраиваем позиционирование tooltip для иконки качества связи
        setTimeout(() => {
            setupTooltipPositioning(connectionQualityIcon);
        }, 100);
        
        // Иконка выключенного микрофона
        const micMutedIcon = document.createElement('div');
        const micIconId = isLocal ? 'mic-muted-local' : `mic-muted-${uid}`;
        micMutedIcon.id = micIconId;
        micMutedIcon.className = 'mic-muted-icon';
        micMutedIcon.style.display = 'none';
        micMutedIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="currentColor"/>
                <path d="M19 10V12C19 15.87 15.87 19 12 19M5 10V12C5 15.87 8.13 19 12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M12 19V23M8 23H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
        statusIconsContainer.appendChild(micMutedIcon);
        
        // Создаем лоадер для удаленных пользователей ПЕРЕД видео (чтобы был поверх)
        if (!isLocal) {
            // Сбрасываем флаг скрытия для нового пользователя
            state.loaderHidden[uid] = false;
            
            const loader = document.createElement('div');
            loader.className = 'video-loader';
            loader.id = `loader-${uid}`;
            loader.style.display = 'flex'; // Показываем по умолчанию для удаленных пользователей
            loader.style.visibility = 'visible';
            loader.style.opacity = '1';
            loader.style.position = 'absolute';
            loader.style.top = '50%';
            loader.style.left = '50%';
            loader.style.transform = 'translate(-50%, -50%)';
            loader.style.zIndex = '10'; // Выше видео (z-index: 2) и placeholder (z-index: 1)
            loader.innerHTML = `
                <svg class="pl" viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="pl-grad1-${uid}" x1="1" y1="0.5" x2="0" y2="0.5">
                            <stop offset="0%" stop-color="#84A98C" />
                            <stop offset="100%" stop-color="#52796F" />
                        </linearGradient>
                        <linearGradient id="pl-grad2-${uid}" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#84A98C" />
                            <stop offset="100%" stop-color="#52796F" />
                        </linearGradient>
                    </defs>
                    <circle class="pl__ring" cx="100" cy="100" r="82" fill="none" stroke="url(#pl-grad1-${uid})" stroke-width="36" stroke-dasharray="0 257 1 257" stroke-dashoffset="0.01" stroke-linecap="round" transform="rotate(-90,100,100)" />
                    <line class="pl__ball" stroke="url(#pl-grad2-${uid})" x1="100" y1="18" x2="100.01" y2="182" stroke-width="36" stroke-dasharray="1 165" stroke-linecap="round" />
                </svg>
            `;
            videoContainer.appendChild(loader);
            console.log('[Video] Created and showing loader for remote user:', uid, 'loader element:', loader);
        }
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(usernameWrapper);
        videoContainer.appendChild(statusIconsContainer);
        
        // Создаем SVG placeholder (будет показан/скрыт в зависимости от состояния камеры)
        const placeholder = document.createElement('div');
        placeholder.className = 'no-cam-placeholder';
        placeholder.style.width = '100%';
        placeholder.style.height = '100%';
        placeholder.style.position = 'absolute';
        placeholder.style.top = '0';
        placeholder.style.left = '0';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.zIndex = '1';
        placeholder.innerHTML = generateNoCamSVG(uid);
        
        // Для удаленных пользователей: показываем заглушку только если состояние установлено И камера выключена
        // Если состояние не установлено, показываем видео (будет обновлено при получении сообщения)
        if (!isLocal) {
            const cameraStateSet = state.userCameraStates.hasOwnProperty(uid);
            if (cameraStateSet && !state.userCameraStates[uid]) {
                // Состояние установлено и камера выключена - показываем заглушку
                placeholder.style.display = 'block';
                console.log('[Video] Showing placeholder for remote user', uid, '- camera state: disabled');
            } else {
                // Состояние не установлено или камера включена - скрываем заглушку
                placeholder.style.display = 'none';
                console.log('[Video] Hiding placeholder for remote user', uid, '- camera state:', cameraStateSet ? 'enabled' : 'not set (showing video)');
            }
        } else {
            placeholder.style.display = 'none';
        }
        
        videoContainer.appendChild(placeholder);
        
        const videoStreams = document.getElementById('video-streams');
        if (videoStreams) {
            console.log('[Video] Adding video container to DOM');
            videoStreams.appendChild(videoContainer);
            
            // Для удаленных пользователей: убеждаемся, что лоадер виден и показываем его
            if (!isLocal) {
                // Небольшая задержка чтобы убедиться что контейнер добавлен в DOM
                setTimeout(() => {
                    const loader = videoContainer.querySelector('.video-loader');
                    if (loader) {
                        // Принудительно показываем лоадер с анимацией
                        loader.style.display = 'flex';
                        loader.style.visibility = 'visible';
                        loader.style.opacity = '1';
                        loader.style.position = 'absolute';
                        loader.style.top = '50%';
                        loader.style.left = '50%';
                        loader.style.transform = 'translate(-50%, -50%)';
                        loader.style.zIndex = '10';
                        loader.style.transition = 'opacity 0.2s ease-in';
                        console.log('[Video] Ensuring loader is visible for remote user:', uid, 'loader element:', loader, 'computed display:', window.getComputedStyle(loader).display);
                    } else {
                        console.error('[Video] Loader not found for remote user:', uid, 'container:', videoContainer);
                    }
                }, 50);
            }
            
            // Обновляем отображение в зависимости от состояния камеры
            // Для удаленных пользователей используем только сохраненное состояние
            updateVideoDisplay(uid, stream);
            
            // Для удаленных пользователей: обновляем отображение только если состояние установлено
            // Если состояние не установлено, видео уже показано выше и будет обновлено при получении сообщения
            if (!isLocal) {
                const cameraStateSet = state.userCameraStates.hasOwnProperty(uid);
                if (cameraStateSet && !state.userCameraStates[uid]) {
                    // Состояние установлено и камера выключена - скрываем видео, показываем заглушку
                    const videoEl = videoContainer.querySelector('video');
                    const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                    if (videoEl) {
                        videoEl.style.display = 'none';
                        videoEl.pause();
                    }
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'block';
                    }
                    console.log('[Video] Camera disabled for remote user', uid, '- hiding video, showing placeholder');
                } else if (cameraStateSet && state.userCameraStates[uid]) {
                    // Состояние установлено и камера включена - показываем видео, скрываем заглушку
                    const videoEl = videoContainer.querySelector('video');
                    const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                    if (videoEl) {
                        videoEl.style.display = 'block';
                        videoEl.style.zIndex = '2';
                        videoEl.play().catch(console.error);
                    }
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'none';
                    }
                    console.log('[Video] Camera enabled for remote user', uid, '- showing video, hiding placeholder');
                }
                // Если состояние не установлено, ничего не делаем - видео уже показано
            }
            
            updateVideoLayout();
            console.log('[Video] Video container added successfully');
            
            // Start audio detection for local stream
            if (isLocal && stream && stream.getAudioTracks().length > 0) {
                startAudioDetection(uid, stream);
                // Обновляем иконку микрофона для локального пользователя
                setTimeout(() => {
                    updateMicMutedIcon('local', !state.isAudioEnabled);
                }, 100);
            }
            
            // Обновляем иконку микрофона для удаленных пользователей, если состояние известно
            if (!isLocal && state.userAudioStates.hasOwnProperty(uid)) {
                setTimeout(() => {
                    // state.userAudioStates[uid] === false означает микрофон выключен (muted)
                    updateMicMutedIcon(uid, state.userAudioStates[uid] === false);
                }, 100);
            }
        } else {
            console.error('[Video] video-streams element not found!');
            console.error('[Video] Available elements:', document.getElementById('app')?.querySelectorAll('*').length || 0);
        }
    }
    
    // Audio detection for microphone activity
    const audioDetectors = {};
    
    function startAudioDetection(uid, stream) {
        if (audioDetectors[uid]) {
            return; // Already detecting
        }
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.85;
            
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const SPEECH_THRESHOLD = 40;
            const MIN_SPEECH_DURATION = 200;
            let lastLevel = 0;
            let speechStartTime = 0;
            let isCurrentlySpeaking = false;
            
            const analyzeAudio = () => {
                if (!audioDetectors[uid]) {
                    return;
                }
                
                analyser.getByteFrequencyData(dataArray);
                
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                const smoothedLevel = lastLevel * 0.85 + average * 0.15;
                lastLevel = smoothedLevel;
                
                const aboveThreshold = smoothedLevel > SPEECH_THRESHOLD;
                
                if (aboveThreshold && !isCurrentlySpeaking) {
                    speechStartTime = Date.now();
                    isCurrentlySpeaking = true;
                } else if (!aboveThreshold && isCurrentlySpeaking) {
                    const speechDuration = Date.now() - speechStartTime;
                    if (speechDuration < MIN_SPEECH_DURATION) {
                        isCurrentlySpeaking = false;
                        updateMicActive(uid, false);
                    } else {
                        isCurrentlySpeaking = false;
                        setTimeout(() => {
                            updateMicActive(uid, false);
                        }, 300);
                    }
                }
                
                if (isCurrentlySpeaking) {
                    const speechDuration = Date.now() - speechStartTime;
                    if (speechDuration >= MIN_SPEECH_DURATION) {
                        updateMicActive(uid, true);
                    }
                }
                
                requestAnimationFrame(analyzeAudio);
            };
            
            audioDetectors[uid] = {
                audioContext,
                analyser,
                stop: () => {
                    if (audioContext) {
                        audioContext.close().catch(console.error);
                    }
                    delete audioDetectors[uid];
                }
            };
            
            analyzeAudio();
        } catch (error) {
            console.error('[AudioDetection] Error starting detection:', error);
        }
    }
    
    function updateMicActive(uid, isActive) {
        const videoContainer = document.getElementById(`video-${uid}`);
        if (videoContainer) {
            if (isActive) {
                videoContainer.classList.add('mic-active');
            } else {
                videoContainer.classList.remove('mic-active');
            }
        }
        
        // Если это локальный пользователь, отправляем состояние другим пользователям
        // Используем throttling чтобы не отправлять слишком много сообщений
        if (uid === state.uid && state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
            // Отправляем только если состояние изменилось
            if (state.lastMicActivityState !== isActive) {
                // Очищаем предыдущий throttle если есть
                if (state.micActivityThrottle) {
                    clearTimeout(state.micActivityThrottle);
                }
                
                // Оптимизация: throttling для отправки состояния микрофона
                // Для активного состояния отправляем сразу
                // Для неактивного - с небольшой задержкой (чтобы не мигать при паузах)
                const delay = isActive ? 0 : 300;
                
                state.micActivityThrottle = setTimeout(() => {
                    if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                    state.videoSocket.send(JSON.stringify({
                        type: isActive ? 'mic-active' : 'mic-inactive',
                        from: state.uid,
                        room: state.roomName
                    }));
                    state.lastMicActivityState = isActive;
                    console.log('[MicActivity] Sent mic activity state:', isActive ? 'active' : 'inactive');
                    }
                    state.micActivityThrottle = null;
                }, delay);
            }
        }
    }
    
    function stopAudioDetection(uid) {
        if (audioDetectors[uid]) {
            audioDetectors[uid].stop();
        }
    }
    
    // Функции для обновления иконок статуса
    function updateMicMutedIcon(userId, isMuted) {
        // Пробуем найти иконку по разным возможным ID
        const isLocal = (userId === state.uid || userId === 'local');
        const iconId = isLocal ? 'mic-muted-local' : `mic-muted-${userId}`;
        let icon = document.getElementById(iconId);
        
        // Если не нашли, пробуем найти через контейнер
        if (!icon) {
            const containerId = isLocal ? 'video-local' : `video-${userId}`;
            const container = document.getElementById(containerId);
            if (container) {
                icon = container.querySelector(`#${iconId}`);
            }
        }
        
        // Если все еще не нашли, пробуем через user-container
        if (!icon) {
            const containerId = isLocal ? 'user-container-local' : `user-container-${userId}`;
            const container = document.getElementById(containerId);
            if (container) {
                icon = container.querySelector(`#${iconId}`);
            }
        }
        
        if (icon) {
            icon.style.display = isMuted ? 'flex' : 'none';
            console.log(`[Icons] Updated mic icon for ${userId}: ${isMuted ? 'muted' : 'unmuted'}, iconId: ${iconId}, found: ${!!icon}`);
        } else {
            // Контейнер еще не создан - отложим обновление на 100мс
            // Это нормально при первом подключении пользователя
            setTimeout(() => {
                updateMicMutedIcon(userId, isMuted);
            }, 100);
        }
    }
    
    function updateConnectionQualityIcon(userId, quality, latency) {
        // Пробуем найти иконку по разным возможным ID
        const isLocal = (userId === state.uid || userId === 'local');
        const iconId = isLocal ? 'connection-quality-local' : `connection-quality-${userId}`;
        let icon = document.getElementById(iconId);
        
        // Если не нашли, пробуем найти через контейнер
        if (!icon) {
            const containerId = isLocal ? 'video-local' : `video-${userId}`;
            const container = document.getElementById(containerId);
            if (container) {
                icon = container.querySelector(`#${iconId}`);
            }
        }
        
        // Если все еще не нашли, пробуем через user-container
        if (!icon) {
            const containerId = isLocal ? 'user-container-local' : `user-container-${userId}`;
            const container = document.getElementById(containerId);
            if (container) {
                icon = container.querySelector(`#${iconId}`);
            }
        }
        
        if (icon) {
            if (quality === 'excellent' || quality === 'good' || quality === 'fair' || quality === 'poor') {
                icon.style.display = 'flex';
                icon.className = `connection-quality-icon quality-${quality}`;
                // Обновляем SVG в зависимости от качества
                const svg = icon.querySelector('svg');
                if (svg) {
                    svg.innerHTML = getQualityIconSVG(quality);
                }
                // Устанавливаем задержку для tooltip
                let latencyValue = null;
                if (latency !== undefined && latency !== null && !isNaN(latency)) {
                    state.connectionLatency[userId] = latency;
                    latencyValue = Math.round(latency);
                    icon.setAttribute('data-latency', `${latencyValue} ms`);
                } else if (state.connectionLatency[userId] !== undefined && state.connectionLatency[userId] !== null && !isNaN(state.connectionLatency[userId])) {
                    latencyValue = Math.round(state.connectionLatency[userId]);
                    icon.setAttribute('data-latency', `${latencyValue} ms`);
                } else {
                    // Если задержка неизвестна, показываем "N/A"
                    icon.setAttribute('data-latency', 'N/A');
                }
                
                // Добавляем обработчики для позиционирования tooltip
                setupTooltipPositioning(icon);
                
                console.log(`[Icons] Updated connection quality for ${userId}: ${quality}, latency: ${latencyValue !== null ? latencyValue + 'ms' : (latency || state.connectionLatency[userId] || 'N/A')}, iconId: ${iconId}, data-latency: ${icon.getAttribute('data-latency')}`);
            } else {
                icon.style.display = 'none';
            }
        } else {
            console.warn(`[Icons] Connection quality icon not found for ${userId}, iconId: ${iconId}`);
        }
    }
    
    function setupTooltipPositioning(icon) {
        if (!icon) {
            console.warn('[Tooltip] Icon is null, cannot setup tooltip positioning');
            return;
        }
        
        // Удаляем старые обработчики если есть
        const oldMouseEnter = icon._tooltipMouseEnter;
        const oldMouseMove = icon._tooltipMouseMove;
        const oldMouseLeave = icon._tooltipMouseLeave;
        
        if (oldMouseEnter) icon.removeEventListener('mouseenter', oldMouseEnter);
        if (oldMouseMove) icon.removeEventListener('mousemove', oldMouseMove);
        if (oldMouseLeave) icon.removeEventListener('mouseleave', oldMouseLeave);
        
        // Создаем новые обработчики
        const updateTooltipPosition = (e) => {
            try {
                const rect = icon.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top;
                icon.style.setProperty('--tooltip-x', `${x}px`);
                icon.style.setProperty('--tooltip-y', `${y}px`);
                
                // Проверяем наличие атрибута data-latency
                const latency = icon.getAttribute('data-latency');
                if (!latency) {
                    console.warn('[Tooltip] No data-latency attribute on icon:', icon.id);
                }
            } catch (error) {
                console.error('[Tooltip] Error updating tooltip position:', error);
            }
        };
        
        const handleMouseEnter = (e) => {
            updateTooltipPosition(e);
            console.log('[Tooltip] Mouse enter on icon:', icon.id, 'data-latency:', icon.getAttribute('data-latency'));
        };
        
        const handleMouseMove = (e) => {
            updateTooltipPosition(e);
        };
        
        const handleMouseLeave = () => {
            // Не нужно ничего делать при уходе
        };
        
        // Сохраняем ссылки для возможного удаления
        icon._tooltipMouseEnter = handleMouseEnter;
        icon._tooltipMouseMove = handleMouseMove;
        icon._tooltipMouseLeave = handleMouseLeave;
        
        // Добавляем обработчики
        icon.addEventListener('mouseenter', handleMouseEnter);
        icon.addEventListener('mousemove', handleMouseMove);
        icon.addEventListener('mouseleave', handleMouseLeave);
        
        console.log('[Tooltip] Setup tooltip positioning for icon:', icon.id);
    }
    
    function getQualityIconSVG(quality) {
        const colors = {
            excellent: '#84A98C', // var(--accent-inactive) - светло-зеленый
            good: '#52796F',      // var(--accent-active) - темно-зеленый
            fair: '#FFC107',      // желтый
            poor: '#F44336'       // красный
        };
        
        const color = colors[quality] || colors.fair;
        
        // Иконка сигнала с разным количеством полосок в зависимости от качества
        let bars = '';
        if (quality === 'excellent') {
            bars = '<path d="M2 16H4V12H2V16ZM6 16H8V8H6V16ZM10 16H12V4H10V16ZM14 16H16V2H14V16Z" fill="' + color + '"/>';
        } else if (quality === 'good') {
            bars = '<path d="M2 16H4V12H2V16ZM6 16H8V8H6V16ZM10 16H12V4H10V16Z" fill="' + color + '"/>';
        } else if (quality === 'fair') {
            bars = '<path d="M2 16H4V12H2V16ZM6 16H8V8H6V16Z" fill="' + color + '"/>';
        } else {
            bars = '<path d="M2 16H4V12H2V16Z" fill="' + color + '"/>';
        }
        
        return bars;
    }
    
    // Отслеживание качества связи через WebRTC статистику
    const qualityMonitoringIntervals = {};
    
    function startConnectionQualityMonitoring(userId) {
        // Очищаем предыдущий интервал если есть
        if (qualityMonitoringIntervals[userId]) {
            clearInterval(qualityMonitoringIntervals[userId]);
        }
        
        const peerConnection = state.peerConnections[userId];
        if (!peerConnection) {
            return;
        }
        
        // Мониторим качество каждые 3 секунды
        qualityMonitoringIntervals[userId] = setInterval(async () => {
            try {
                const stats = await peerConnection.getStats();
                let quality = 'excellent';
                
                // Анализируем статистику для определения качества
                let packetsLost = 0;
                let packetsReceived = 0;
                let jitter = 0;
                let roundTripTime = 0;
                
                stats.forEach(report => {
                    if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                        packetsLost += report.packetsLost || 0;
                        packetsReceived += report.packetsReceived || 0;
                        jitter = Math.max(jitter, report.jitter || 0);
                    }
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        // currentRoundTripTime в секундах, конвертируем в миллисекунды
                        const rtt = (report.currentRoundTripTime || 0) * 1000;
                        roundTripTime = Math.max(roundTripTime, rtt);
                    }
                });
                
                // Если roundTripTime не найден, пробуем найти через remote-inbound-rtp
                if (roundTripTime === 0) {
                    stats.forEach(report => {
                        if (report.type === 'remote-inbound-rtp' && report.mediaType === 'video') {
                            const rtt = (report.roundTripTime || 0) * 1000;
                            roundTripTime = Math.max(roundTripTime, rtt);
                        }
                    });
                }
                
                // Вычисляем процент потерь пакетов
                const totalPackets = packetsLost + packetsReceived;
                const packetLossPercent = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
                
                // Определяем качество на основе метрик
                if (packetLossPercent > 10 || roundTripTime > 500 || jitter > 50) {
                    quality = 'poor';
                } else if (packetLossPercent > 5 || roundTripTime > 300 || jitter > 30) {
                    quality = 'fair';
                } else if (packetLossPercent > 2 || roundTripTime > 150 || jitter > 15) {
                    quality = 'good';
                } else {
                    quality = 'excellent';
                }
                
                // Сохраняем задержку (roundTripTime в миллисекундах)
                state.connectionLatency[userId] = roundTripTime;
                
                // Обновляем качество и задержку
                if (state.connectionQuality[userId] !== quality) {
                    state.connectionQuality[userId] = quality;
                    updateConnectionQualityIcon(userId, quality, roundTripTime);
                    console.log(`[ConnectionQuality] User ${userId}: ${quality} (loss: ${packetLossPercent.toFixed(2)}%, rtt: ${roundTripTime.toFixed(0)}ms, jitter: ${jitter.toFixed(2)}ms)`);
                } else {
                    // Обновляем только задержку если качество не изменилось
                    updateConnectionQualityIcon(userId, quality, roundTripTime);
                }
                
                // Логируем для отладки
                if (roundTripTime === 0) {
                    console.warn(`[ConnectionQuality] RTT is 0 for ${userId}, stats available:`, {
                        hasCandidatePair: Array.from(stats).some(r => r.type === 'candidate-pair'),
                        hasRemoteInboundRtp: Array.from(stats).some(r => r.type === 'remote-inbound-rtp')
                    });
                }
            } catch (error) {
                console.error(`[ConnectionQuality] Error monitoring quality for ${userId}:`, error);
            }
        }, 3000);
    }
    
    function stopConnectionQualityMonitoring(userId) {
        if (qualityMonitoringIntervals[userId]) {
            clearInterval(qualityMonitoringIntervals[userId]);
            delete qualityMonitoringIntervals[userId];
        }
        if (state.connectionQuality[userId]) {
            delete state.connectionQuality[userId];
        }
        if (state.connectionLatency[userId]) {
            delete state.connectionLatency[userId];
        }
    }
    
    function removeVideoStream(uid) {
        const videoContainer = document.getElementById(`video-${uid}`);
        if (videoContainer) {
            videoContainer.remove();
        }
        
        stopAudioDetection(uid);
        stopConnectionQualityMonitoring(uid);
        
        // Очищаем интервалы для удаленных треков
        if (state.remoteTrackIntervals && state.remoteTrackIntervals[uid]) {
            state.remoteTrackIntervals[uid].forEach(interval => clearInterval(interval));
            delete state.remoteTrackIntervals[uid];
        }
        
        // Удаляем ссылку на удаленный стрим
        if (state.remoteStreams && state.remoteStreams[uid]) {
            delete state.remoteStreams[uid];
        }
        
        state.displayedVideos.delete(uid);
        state.connectedUsers.delete(uid);
        
        if (state.peerConnections[uid]) {
            state.peerConnections[uid].close();
            delete state.peerConnections[uid];
        }
        
        if (state.iceCandidateQueue[uid]) {
            delete state.iceCandidateQueue[uid];
        }
        
        updateVideoLayout();
    }
    
    // Оптимизация: кэширование DOM элементов
    const domCache = {
        videoStreams: null,
        roomHeader: null,
        getVideoStreams: () => {
            if (!domCache.videoStreams) {
                domCache.videoStreams = document.getElementById('video-streams');
            }
            return domCache.videoStreams;
        },
        getRoomHeader: () => {
            if (!domCache.roomHeader) {
                domCache.roomHeader = document.querySelector('.room-header');
            }
            return domCache.roomHeader;
        },
        clear: () => {
            domCache.videoStreams = null;
            domCache.roomHeader = null;
        }
    };
    
    // Оптимизация: дебаунсинг для updateVideoLayout
    let layoutUpdateTimer = null;
    let layoutUpdateInProgress = false;
    let lastLayoutCount = -1;
    let lastDeviceType = null;
    let lastContainerSize = null;
    let lastScreenSharing = null;
    
    /**
     * Обновляет layout видео с использованием адаптивной системы
     */
    function updateVideoLayout() {
        // Отменяем предыдущий таймер, если он есть
        if (layoutUpdateTimer) {
            cancelAnimationFrame(layoutUpdateTimer);
            layoutUpdateTimer = null;
        }
        
        // Защита от множественных одновременных вызовов
        if (layoutUpdateInProgress) {
            console.log('[Layout] Update already in progress, skipping');
            return;
        }
        
        // Используем requestAnimationFrame для оптимизации рендеринга
        layoutUpdateTimer = requestAnimationFrame(() => {
            layoutUpdateInProgress = true;
            
            try {
            const videoStreams = domCache.getVideoStreams();
        if (!videoStreams) {
            console.error('[Layout] video-streams element not found!');
            return;
        }
        
        const count = state.displayedVideos.size;
                const deviceInfo = getDeviceType();
                const containerSize = getContainerSize(videoStreams.parentElement);
                const isScreenSharing = state.isScreenSharing && state.currentSharingUser;
                
                // Оптимизация для мобильных: ограничиваем количество одновременно воспроизводимых видео
                const isMobile = deviceInfo.type === 'phone' || deviceInfo.type === 'tablet';
                const MAX_CONCURRENT_VIDEOS_MOBILE = 4; // Максимум 4 видео на мобильных устройствах
                
                if (isMobile && count > MAX_CONCURRENT_VIDEOS_MOBILE) {
                    console.log(`[Layout] Mobile device detected with ${count} videos, limiting to ${MAX_CONCURRENT_VIDEOS_MOBILE} concurrent videos`);
                    // Приостанавливаем видео для пользователей вне видимой области
                    const displayedVideosArray = Array.from(state.displayedVideos);
                    displayedVideosArray.forEach((uid, index) => {
                        const videoContainer = document.getElementById(`video-${uid}`);
                        if (videoContainer) {
                            const video = videoContainer.querySelector('video');
                            if (video && index >= MAX_CONCURRENT_VIDEOS_MOBILE) {
                                // Приостанавливаем видео для пользователей вне лимита
                                if (!video.paused) {
                                    video.pause();
                                    console.log(`[Layout] Paused video for ${uid} (mobile optimization, index ${index})`);
                                }
                            } else if (video && index < MAX_CONCURRENT_VIDEOS_MOBILE && video.paused) {
                                // Возобновляем видео для пользователей в лимите
                                video.play().catch(err => {
                                    if (err.name !== 'AbortError') {
                                        console.error(`[Layout] Error resuming video for ${uid}:`, err);
                                    }
                                });
                            }
                        }
                    });
                }
                
                // Проверяем, нужно ли обновлять layout
                const shouldUpdate = 
                    count !== lastLayoutCount ||
                    JSON.stringify(deviceInfo) !== JSON.stringify(lastDeviceType) ||
                    JSON.stringify(containerSize) !== JSON.stringify(lastContainerSize) ||
                    isScreenSharing !== lastScreenSharing;
                
                if (!shouldUpdate) {
                return;
            }
                
            lastLayoutCount = count;
                lastDeviceType = deviceInfo;
                lastContainerSize = containerSize;
                lastScreenSharing = isScreenSharing;
            
            console.log('[Layout] Updating adaptive video layout for', count, 'users', {
                device: deviceInfo,
                containerSize,
                isScreenSharing
            });
            
            // Вычисляем layout
            const layoutConfig = calculateGridLayout(
                count,
                deviceInfo,
                containerSize,
                isScreenSharing
            );
            
                // Применяем layout
                applyLayout(videoStreams, layoutConfig, isScreenSharing);
                
                // Если режим screen sharing, создаем специальную структуру
                if (isScreenSharing) {
                    setupScreenShareLayout(videoStreams, layoutConfig);
        } else {
                    // Убираем структуру screen sharing если она была
                    // ВАЖНО: сначала очищаем, потом применяем layout
                    cleanupScreenShareLayout(videoStreams);
                    
                    // Проверяем, что screen share контейнер действительно удален
                    const remainingScreenShare = videoStreams.querySelector('.screen-share-container');
                    if (remainingScreenShare) {
                        console.warn('[ScreenShare] Screen share container still exists, forcing removal');
                        // Принудительно удаляем все дочерние элементы
                        while (remainingScreenShare.firstChild) {
                            const child = remainingScreenShare.firstChild;
                            if (child.tagName === 'VIDEO' && child.srcObject) {
                                const stream = child.srcObject;
                                stream.getTracks().forEach(track => track.stop());
                                child.srcObject = null;
                            }
                            remainingScreenShare.removeChild(child);
                        }
                        remainingScreenShare.remove();
                    }
                    
                    // Проверяем наличие screen-share-video элементов
                    const remainingScreenShareVideos = videoStreams.querySelectorAll('.screen-share-video');
                    remainingScreenShareVideos.forEach(videoContainer => {
                        const video = videoContainer.querySelector('video');
                        if (video && video.srcObject) {
                            const stream = video.srcObject;
                            stream.getTracks().forEach(track => track.stop());
                            video.srcObject = null;
                        }
                        videoContainer.remove();
                    });
                    
                    // Применяем обычный grid layout для восстановления размеров
                    applyGridLayout(videoStreams, layoutConfig);
        }
        
        // Скрывать хедер на мобильных устройствах при большом количестве пользователей
            const roomHeader = domCache.getRoomHeader();
        if (roomHeader) {
                    const isMobile = deviceInfo.type === 'phone';
                    const isTablet = deviceInfo.type === 'tablet';
            
            if (isMobile && count > 2) {
                roomHeader.classList.add('hidden');
            } else if (isTablet && count > 3) {
                roomHeader.classList.add('hidden');
            } else {
                roomHeader.classList.remove('hidden');
            }
        }
        
                console.log('[Layout] Adaptive video layout updated', layoutConfig);
            } finally {
                layoutUpdateInProgress = false;
                layoutUpdateTimer = null;
            }
        });
    }
    
    /**
     * Настраивает layout для режима демонстрации экрана
     * Создает отдельный контейнер для screen share, камера пользователя остается на месте
     * Работает для всех устройств: desktop, tablet, phone
     */
    function setupScreenShareLayout(container, layoutConfig) {
        if (!state.currentSharingUser) {
            console.warn('[ScreenShare] setupScreenShareLayout called but currentSharingUser is not set');
            return;
        }
        
        console.log('[ScreenShare] Setting up screen share layout for user:', state.currentSharingUser, 'device:', getDeviceType());
        
        // Убеждаемся, что контейнер в режиме screen sharing
        if (!container.classList.contains('screen-share-mode')) {
            container.classList.add('screen-share-mode');
            console.log('[ScreenShare] Added screen-share-mode class to container');
        }
        
        // Применяем правильные CSS классы для направления панели участников
        const deviceInfo = getDeviceType();
        if (layoutConfig.participantsPanel) {
            if (layoutConfig.participantsPanel.direction === 'vertical') {
                container.classList.add('participants-vertical');
                container.classList.remove('participants-horizontal');
            } else {
                container.classList.add('participants-horizontal');
                container.classList.remove('participants-vertical');
            }
            console.log('[ScreenShare] Participants panel direction:', layoutConfig.participantsPanel.direction);
        }
        
        // Создаем контейнер для экрана демонстрации (отдельный, не используем камеру пользователя)
        let screenShareContainer = container.querySelector('.screen-share-container');
        if (!screenShareContainer) {
            screenShareContainer = document.createElement('div');
            screenShareContainer.className = 'screen-share-container';
            container.insertBefore(screenShareContainer, container.firstChild);
            console.log('[ScreenShare] Created screen-share-container');
        } else {
            console.log('[ScreenShare] Screen-share-container already exists');
        }
        
        // Проверяем, есть ли уже контейнер для screen share видео
        let screenShareVideoContainer = screenShareContainer.querySelector('.video-container.screen-share-video');
        if (!screenShareVideoContainer) {
            // Создаем новый контейнер для screen share
            screenShareVideoContainer = document.createElement('div');
            screenShareVideoContainer.className = 'video-container screen-share-video';
            screenShareVideoContainer.id = `screen-share-${state.currentSharingUser}`;
            
            // Создаем video элемент для screen share
            const videoElement = document.createElement('video');
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.muted = true; // Локально всегда muted
            videoElement.className = 'video-player';
            screenShareVideoContainer.appendChild(videoElement);
            
            // Добавляем username wrapper
            const usernameWrapper = document.createElement('div');
            usernameWrapper.className = 'username-wrapper';
            usernameWrapper.textContent = state.userNames[state.currentSharingUser] || `User ${state.currentSharingUser}`;
            screenShareVideoContainer.appendChild(usernameWrapper);
            
            screenShareContainer.appendChild(screenShareVideoContainer);
            
            // Получаем stream для screen share и устанавливаем его
            if (state.currentSharingUser === state.uid && state.screenShareStream) {
                // Локальный screen share - используем screenShareStream напрямую
                // Создаем новый stream только с screen share track
                const screenShareOnlyStream = new MediaStream([state.screenShareTrack]);
                if (state.screenAudioTrack) {
                    screenShareOnlyStream.addTrack(state.screenAudioTrack);
                }
                videoElement.srcObject = screenShareOnlyStream;
                videoElement.play().catch(err => console.error('[ScreenShare] Error playing local screen share:', err));
                console.log('[ScreenShare] Set local screen share stream in container');
            } else {
                // Удаленный screen share - ищем stream в peer connections
                const peerConnection = state.peerConnections[state.currentSharingUser];
                if (peerConnection) {
                    // Получаем stream из peer connection (screen share track)
                    let screenShareTrackFound = false;
                    peerConnection.getReceivers().forEach(receiver => {
                        if (receiver.track && receiver.track.kind === 'video' && receiver.track.readyState === 'live') {
                            // Проверяем, что это screen share track (не камера)
                            const trackLabel = receiver.track.label.toLowerCase();
                            if (trackLabel.includes('screen') || trackLabel.includes('display') || trackLabel.includes('window')) {
                                const stream = new MediaStream([receiver.track]);
                                // Добавляем аудио треки, если есть
                                peerConnection.getReceivers().forEach(audioReceiver => {
                                    if (audioReceiver.track && audioReceiver.track.kind === 'audio' && audioReceiver.track.readyState === 'live') {
                                        stream.addTrack(audioReceiver.track);
                                    }
                                });
                                videoElement.pause();
                                videoElement.srcObject = stream;
                                videoElement.muted = false; // Для удаленного не muted
                                setTimeout(() => {
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError') {
                                            console.error('[ScreenShare] Error playing remote screen share:', err);
                                        }
                                    });
                                }, 50);
                                console.log('[ScreenShare] Set remote screen share stream for user:', state.currentSharingUser);
                                screenShareTrackFound = true;
                            }
                        }
                    });
                    
                    if (!screenShareTrackFound) {
                        console.warn('[ScreenShare] Screen share track not found in peer connection for user:', state.currentSharingUser);
                        // Попробуем найти в remoteStreams
                        if (state.remoteStreams && state.remoteStreams[state.currentSharingUser]) {
                            const remoteStream = state.remoteStreams[state.currentSharingUser];
                            const videoTracks = remoteStream.getVideoTracks();
                            const screenShareTracks = videoTracks.filter(track => {
                                const label = track.label.toLowerCase();
                                return label.includes('screen') || label.includes('display') || label.includes('window');
                            });
                            
                            if (screenShareTracks.length > 0) {
                                const screenShareStream = new MediaStream(screenShareTracks);
                                const audioTracks = remoteStream.getAudioTracks();
                                audioTracks.forEach(track => screenShareStream.addTrack(track));
                                videoElement.pause();
                                videoElement.srcObject = screenShareStream;
                                videoElement.muted = false;
                                setTimeout(() => {
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError') {
                                            console.error('[ScreenShare] Error playing remote screen share from remoteStreams:', err);
                                        }
                                    });
                                }, 50);
                                console.log('[ScreenShare] Set remote screen share stream from remoteStreams for user:', state.currentSharingUser);
                            }
                        }
                    }
                } else {
                    console.warn('[ScreenShare] Peer connection not found for user:', state.currentSharingUser);
                    // Если peer connection еще не создан, попробуем позже
                    setTimeout(() => {
                        const retryPeerConnection = state.peerConnections[state.currentSharingUser];
                        if (retryPeerConnection && !videoElement.srcObject) {
                            // Повторяем попытку установки stream
                            retryPeerConnection.getReceivers().forEach(receiver => {
                                if (receiver.track && receiver.track.kind === 'video' && receiver.track.readyState === 'live') {
                                    const trackLabel = receiver.track.label.toLowerCase();
                                    if (trackLabel.includes('screen') || trackLabel.includes('display') || trackLabel.includes('window')) {
                                        const stream = new MediaStream([receiver.track]);
                                        retryPeerConnection.getReceivers().forEach(audioReceiver => {
                                            if (audioReceiver.track && audioReceiver.track.kind === 'audio' && audioReceiver.track.readyState === 'live') {
                                                stream.addTrack(audioReceiver.track);
                                            }
                                        });
                                        videoElement.srcObject = stream;
                                        videoElement.muted = false;
                                        videoElement.play().catch(err => {
                                            if (err.name !== 'AbortError') {
                                                console.error('[ScreenShare] Error playing remote screen share on retry:', err);
                                            }
                                        });
                                        console.log('[ScreenShare] Set remote screen share stream on retry for user:', state.currentSharingUser);
                                    }
                                }
                            });
                        }
                    }, 1000);
                }
            }
        }
        
        // Создаем панель участников
        let participantsPanel = container.querySelector('.participants-panel');
        if (!participantsPanel) {
            participantsPanel = document.createElement('div');
            participantsPanel.className = 'participants-panel';
            if (layoutConfig.participantsPanel?.scrollable) {
                participantsPanel.classList.add('participants-scrollable');
            }
            container.appendChild(participantsPanel);
        }
        
        // Перемещаем ВСЕ видео (включая камеру пользователя) в панель участников
        // Камера пользователя остается квадратной 1:1
        const allVideos = Array.from(container.querySelectorAll('.video-container:not(.screen-share-video)'));
        allVideos.forEach(videoContainer => {
            const uid = videoContainer.id.replace('video-', '');
            
            // ВАЖНО: Если это камера пользователя, который делится экраном, обновляем её stream
            // Для локального пользователя используем cameraStream, для удаленного - проверяем, что это не screen share
            if (uid === state.currentSharingUser) {
                // Это пользователь, который делится экраном - убеждаемся, что в его контейнере камера, а не screen share
                const video = videoContainer.querySelector('video');
                if (video) {
                    let needsUpdate = false;
                    let cameraStreamToUse = null;
                    
                    if (video.srcObject) {
                        const stream = video.srcObject;
                        const videoTracks = stream.getVideoTracks();
                        const isScreenShare = videoTracks.some(track => {
                            const label = track.label.toLowerCase();
                            return label.includes('screen') || label.includes('display') || label.includes('window');
                        });
                        
                        if (isScreenShare) {
                            // В контейнере пользователя screen share - нужно заменить на камеру
                            console.log('[ScreenShare] User', uid, 'container has screen share, need to replace with camera');
                            needsUpdate = true;
                        }
                    } else {
                        // Если нет srcObject, нужно установить камеру
                        needsUpdate = true;
                    }
                    
                    if (needsUpdate) {
                        // Если это локальный пользователь, используем cameraStream
                        if (uid === state.uid && state.cameraStream && state.cameraStream.getVideoTracks().length > 0) {
                            cameraStreamToUse = state.cameraStream;
                            console.log('[ScreenShare] Using cameraStream for local user');
                        } else if (uid !== state.uid) {
                            // Для удаленного пользователя ищем камеру в peer connection
                            const peerConnection = state.peerConnections[uid];
                            if (peerConnection) {
                                const cameraTracks = [];
                                peerConnection.getReceivers().forEach(receiver => {
                                    if (receiver.track && receiver.track.kind === 'video' && receiver.track.readyState === 'live') {
                                        const trackLabel = receiver.track.label.toLowerCase();
                                        if (!trackLabel.includes('screen') && !trackLabel.includes('display') && !trackLabel.includes('window')) {
                                            cameraTracks.push(receiver.track);
                                        }
                                    }
                                });
                                
                                if (cameraTracks.length > 0) {
                                    cameraStreamToUse = new MediaStream(cameraTracks);
                                    // Добавляем аудио треки
                                    peerConnection.getReceivers().forEach(receiver => {
                                        if (receiver.track && receiver.track.kind === 'audio' && receiver.track.readyState === 'live') {
                                            cameraStreamToUse.addTrack(receiver.track);
                                        }
                                    });
                                    console.log('[ScreenShare] Created cameraStream from peer connection for remote user:', uid);
                                } else {
                                    // Если камера не найдена в peer connection, проверяем remoteStreams
                                    if (state.remoteStreams && state.remoteStreams[uid]) {
                                        const remoteStream = state.remoteStreams[uid];
                                        const videoTracks = remoteStream.getVideoTracks();
                                        const cameraTracksFromRemote = videoTracks.filter(track => {
                                            const label = track.label.toLowerCase();
                                            return !label.includes('screen') && !label.includes('display') && !label.includes('window');
                                        });
                                        
                                        if (cameraTracksFromRemote.length > 0) {
                                            cameraStreamToUse = new MediaStream(cameraTracksFromRemote);
                                            const audioTracks = remoteStream.getAudioTracks();
                                            audioTracks.forEach(track => {
                                                const trackLabel = track.label.toLowerCase();
                                                if (!trackLabel.includes('screen') && !trackLabel.includes('display')) {
                                                    cameraStreamToUse.addTrack(track);
                                                }
                                            });
                                            console.log('[ScreenShare] Created cameraStream from remoteStreams for remote user:', uid);
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (cameraStreamToUse && cameraStreamToUse.getVideoTracks().length > 0) {
                            video.pause();
                            video.srcObject = cameraStreamToUse;
                            video.muted = uid === state.uid; // Локальный muted, удаленный не muted
                            setTimeout(() => {
                                video.play().catch(err => {
                                    if (err.name !== 'AbortError') {
                                        console.error('[ScreenShare] Error playing camera stream:', err);
                                    }
                                });
                            }, 50);
                            console.log('[ScreenShare] Replaced screen share with camera stream for user:', uid);
                        } else {
                            console.warn('[ScreenShare] No camera stream available for user:', uid);
                        }
                    }
                }
            }
            
            // ВАЖНО: Если это камера локального пользователя, обновляем её stream на cameraStream (без screen share)
            // Это критично для мобильных устройств, чтобы камера не заменялась на screen share
            if (uid === state.uid) {
                const video = videoContainer.querySelector('video');
                if (video) {
                    // Если cameraStream существует и содержит видео треки, используем его
                    if (state.cameraStream && state.cameraStream.getVideoTracks().length > 0) {
                        const currentStream = video.srcObject;
                        const needsUpdate = !currentStream || 
                                          currentStream !== state.cameraStream ||
                                          state.cameraStream.getVideoTracks().length !== (currentStream.getVideoTracks?.()?.length || 0);
                        
                        if (needsUpdate) {
                            // Останавливаем предыдущий play() если он есть
                            video.pause();
                            // Обновляем stream на камеру (без screen share)
                            video.srcObject = state.cameraStream;
                            // Используем небольшую задержку для избежания AbortError
                            setTimeout(() => {
                                video.play().catch(err => {
                                    // Игнорируем AbortError - это нормально при быстрых обновлениях
                                    if (err.name !== 'AbortError') {
                                        console.error('[ScreenShare] Error playing camera stream:', err);
                                    }
                                });
                            }, 50);
                            console.log('[ScreenShare] Updated user camera container with camera stream (without screen share)');
                        }
                    } else {
                        // Если cameraStream пустой, но есть localStream, проверяем что это не screen share
                        if (state.localStream) {
                            const videoTracks = state.localStream.getVideoTracks();
                            const cameraTrack = videoTracks.find(track => {
                                const label = track.label.toLowerCase();
                                return !label.includes('screen') && !label.includes('display') && !label.includes('window');
                            });
                            
                            // Если есть камера в localStream, создаем cameraStream
                            if (cameraTrack) {
                                const audioTracks = state.localStream.getAudioTracks().filter(track => {
                                    return track !== state.screenAudioTrack && 
                                           track !== state.mixedAudioStream?.getAudioTracks()[0];
                                });
                                state.cameraStream = new MediaStream([cameraTrack, ...audioTracks]);
                                video.srcObject = state.cameraStream;
                                video.play().catch(err => {
                                    if (err.name !== 'AbortError') {
                                        console.error('[ScreenShare] Error playing camera stream:', err);
                                    }
                                });
                                console.log('[ScreenShare] Created cameraStream from localStream for user display');
                            }
                        }
                    }
                }
            }
            
            // Перемещаем видео в панель участников
            if (videoContainer.parentElement !== participantsPanel &&
                videoContainer.parentElement !== screenShareContainer) {
                participantsPanel.appendChild(videoContainer);
            }
        });
        
        console.log('[ScreenShare] Setup completed - screen share container and participants panel created');
    }
    
    /**
     * Убирает структуру screen sharing layout
     * Удаляет отдельный контейнер для screen share, возвращает все видео в основной контейнер
     */
    function cleanupScreenShareLayout(container) {
        if (!container) return;
        
        console.log('[ScreenShare] Cleaning up screen share layout');
        
        // Находим все элементы screen share
        const screenShareContainer = container.querySelector('.screen-share-container');
        const participantsPanel = container.querySelector('.participants-panel');
        const screenShareVideos = container.querySelectorAll('.screen-share-video');
        
        // Удаляем контейнер screen share полностью (он был создан отдельно)
        if (screenShareContainer) {
            console.log('[ScreenShare] Removing screen share container');
            
            // Останавливаем все треки во всех video элементах в контейнере
            const allVideos = screenShareContainer.querySelectorAll('video');
            allVideos.forEach(video => {
                if (video.srcObject) {
                    const stream = video.srcObject;
                    stream.getTracks().forEach(track => {
                        console.log('[ScreenShare] Stopping track:', track.kind, track.id);
                        track.stop();
                    });
                    video.srcObject = null;
                }
                // Очищаем video элемент
                video.pause();
                video.removeAttribute('src');
                video.removeAttribute('srcObject');
            });
            
            // Удаляем все дочерние элементы
            while (screenShareContainer.firstChild) {
                screenShareContainer.removeChild(screenShareContainer.firstChild);
            }
            
            // Удаляем сам контейнер
            screenShareContainer.remove();
            console.log('[ScreenShare] Screen share container removed');
        }
        
        // Удаляем все оставшиеся screen-share-video элементы (на случай если они не были в контейнере)
        screenShareVideos.forEach(videoContainer => {
            const video = videoContainer.querySelector('video');
            if (video && video.srcObject) {
                const stream = video.srcObject;
                stream.getTracks().forEach(track => {
                    track.stop();
                });
                video.srcObject = null;
            }
            videoContainer.remove();
        });
        
        // Возвращаем все видео из панели участников обратно в основной контейнер
        if (participantsPanel) {
            console.log('[ScreenShare] Returning videos from participants panel');
            const videos = Array.from(participantsPanel.querySelectorAll('.video-container'));
            videos.forEach(video => {
                // Убираем все inline стили для восстановления квадратного формата
                video.style.width = '';
                video.style.height = '';
                video.style.aspectRatio = '';
                video.style.maxWidth = '';
                video.style.maxHeight = '';
                video.style.flexBasis = '';
                
                // Восстанавливаем video элемент внутри контейнера
                const videoElement = video.querySelector('video');
                if (videoElement) {
                    videoElement.style.aspectRatio = '';
                    videoElement.style.objectFit = 'cover';
                }
                
                container.appendChild(video);
            });
            participantsPanel.remove();
            console.log('[ScreenShare] Participants panel removed');
        }
        
        // Убираем класс screen-share-mode с контейнера
        container.classList.remove('screen-share-mode');
        container.classList.remove('participants-vertical');
        container.classList.remove('participants-horizontal');
        
        // Убираем все CSS переменные связанные со screen share
        container.style.removeProperty('--screen-share-width');
        container.style.removeProperty('--screen-share-height');
        container.style.removeProperty('--participants-panel-width');
        container.style.removeProperty('--participants-panel-height');
        container.style.removeProperty('--participants-video-size');
        container.style.removeProperty('--participants-gap');
        
        console.log('[ScreenShare] Cleanup completed');
    }
    
    // Оптимизация: throttling для resize события
    let resizeTimeout;
    let lastResizeTime = 0;
    const RESIZE_THROTTLE = 200; // Минимум 200ms между обновлениями
    
    // Функция для обновления стилей панели управления
    function updateControlsWrapperStyles() {
        const controlsWrapper = document.querySelector('.controls-wrapper');
        if (!controlsWrapper) return;
        
        const isTablet = window.innerWidth <= 1024 && window.innerWidth > 480;
        const isPhone = window.innerWidth <= 480;
        const isLandscape = window.innerHeight < window.innerWidth;
        
        // Для планшета не применяем inline стили - используем CSS
        if (isTablet) {
            // Удаляем все inline стили, чтобы CSS работал
            controlsWrapper.removeAttribute('style');
            return;
        }
        
        // Для доски применяем специальные стили только на телефоне и ПК
        if (state.showWhiteboard) {
            if (isPhone) {
                controlsWrapper.style.setProperty('bottom', 'max(env(safe-area-inset-bottom, 0), 6px)', 'important');
                controlsWrapper.style.setProperty('left', '50%', 'important');
                controlsWrapper.style.setProperty('transform', 'translateX(-50%)', 'important');
                controlsWrapper.style.setProperty('width', 'calc(100% - 20px)', 'important');
                controlsWrapper.style.setProperty('max-width', '100%', 'important');
                controlsWrapper.style.setProperty('background', 'var(--bg-secondary)', 'important');
                controlsWrapper.style.setProperty('padding', '10px 16px', 'important');
                controlsWrapper.style.setProperty('border-radius', '8px', 'important');
                controlsWrapper.style.setProperty('box-shadow', 'var(--shadow-lg)', 'important');
                controlsWrapper.style.setProperty('border', '1px solid var(--border-color)', 'important');
            } else {
                // Для ПК
                controlsWrapper.style.setProperty('bottom', '20px', 'important');
                controlsWrapper.style.setProperty('left', '50%', 'important');
                controlsWrapper.style.setProperty('transform', 'translateX(-50%)', 'important');
                controlsWrapper.style.setProperty('background', 'var(--bg-secondary)', 'important');
                controlsWrapper.style.setProperty('padding', '12px 20px', 'important');
                controlsWrapper.style.setProperty('border-radius', '12px', 'important');
                controlsWrapper.style.setProperty('box-shadow', 'var(--shadow-lg)', 'important');
                controlsWrapper.style.setProperty('border', '1px solid var(--border-color)', 'important');
                controlsWrapper.style.setProperty('width', 'auto', 'important');
            }
        } else {
            // Когда доска закрыта, удаляем inline стили
            controlsWrapper.removeAttribute('style');
        }
    }
    
    window.addEventListener('resize', () => {
        const now = Date.now();
        if (now - lastResizeTime < RESIZE_THROTTLE) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
                lastResizeTime = Date.now();
            updateVideoLayout();
                updateControlsWrapperStyles();
            }, RESIZE_THROTTLE - (now - lastResizeTime));
        } else {
            lastResizeTime = now;
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                updateVideoLayout();
                updateControlsWrapperStyles();
            }, 100);
        }
    });
    
    // Обработчик изменения ориентации
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            updateVideoLayout();
            updateControlsWrapperStyles();
        }, 100);
    });
    
    // Chat functions
    function initializeChat() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/chat/${state.roomName}/`;
        
        state.chatSocket = new WebSocket(wsUrl);
        
        // Оптимизация: батчинг сообщений для уменьшения количества обновлений DOM
        let messageBatch = [];
        let messageBatchTimer = null;
        const MESSAGE_BATCH_DELAY = 50; // Собираем сообщения в батчи по 50ms
        
        state.chatSocket.onmessage = (event) => {
            try {
            const data = JSON.parse(event.data);
                
                // Оптимизация: проверяем размер данных
                if (JSON.stringify(data).length > 100000) {
                    console.warn('[Chat] Message too large, ignoring');
                    return;
                }
                
                messageBatch.push(data);
                
                // Отменяем предыдущий таймер
                if (messageBatchTimer) {
                    clearTimeout(messageBatchTimer);
                }
                
                // Обрабатываем батч сообщений
                messageBatchTimer = setTimeout(() => {
                    // Добавляем все сообщения из батча
                    messageBatch.forEach(msg => {
                        state.messages.push(msg);
                        
                        if (!state.showChat && msg.user_name !== state.userName) {
                state.unreadCount++;
                        }
                    });
                    
                    // Обновляем DOM один раз для всего батча
                    if (messageBatch.length > 0) {
                        updateMessages();
                updateUnreadCount();
                    }
                    
                    // Очищаем батч
                    messageBatch = [];
                    messageBatchTimer = null;
                }, MESSAGE_BATCH_DELAY);
            } catch (error) {
                console.error('[Chat] Error parsing message:', error);
            }
        };
        
        state.chatSocket.onerror = (error) => {
            console.error('Chat WebSocket error:', error);
        };
    }
    
    // Оптимизация: дебаунсинг для отправки сообщений
    let sendMessageTimer = null;
    
    function sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !input.value.trim()) return;
        
        // Отменяем предыдущий таймер, если есть
        if (sendMessageTimer) {
            clearTimeout(sendMessageTimer);
        }
        
        // Дебаунсинг: отправляем сообщение через небольшую задержку
        // Это предотвращает множественные отправки при быстром вводе
        sendMessageTimer = setTimeout(() => {
        if (state.chatSocket && state.chatSocket.readyState === WebSocket.OPEN) {
                const message = input.value.trim();
                if (message) {
                    // Оптимизация: проверяем размер сообщения
                    if (message.length > 10000) {
                        console.warn('[Chat] Message too long, truncating');
                        return;
                    }
                    
            state.chatSocket.send(JSON.stringify({
                        message: message,
                user_name: state.userName
            }));
            input.value = '';
        }
            }
            sendMessageTimer = null;
        }, 50);
    }
    
    function toggleChat() {
        console.log('[Chat] Toggling chat, current state:', state.showChat);
        state.showChat = !state.showChat;
        updateChatVisibility();
        if (state.showChat) {
            state.unreadCount = 0;
            updateUnreadCount();
            setTimeout(() => {
                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }, 0);
        }
    }
    
    function updateChatVisibility() {
        const chatSection = document.getElementById('chat-section');
        const videoSection = document.getElementById('video-section');
        if (chatSection) {
            if (state.showChat) {
                chatSection.style.display = 'flex';
                chatSection.style.flexDirection = 'column';
                chatSection.classList.add('open');
                console.log('[Chat] Chat section opened, display:', chatSection.style.display);
            } else {
                chatSection.style.display = 'none';
                chatSection.classList.remove('open');
                console.log('[Chat] Chat section closed');
            }
        } else {
            console.error('[Chat] Chat section element NOT FOUND!');
        }
        if (videoSection) {
            videoSection.classList.toggle('chat-open', state.showChat);
        }
    }
    
    async function toggleMic() {
        // ВАЖНО: кнопка микрофона управляет ТОЛЬКО микрофоном, не звуком демонстрации экрана
        console.log('[Controls] Toggle microphone. isScreenSharing:', state.isScreenSharing);
        
        // Если идет демонстрация экрана, обрабатываем микрофон отдельно от звука экрана
        if (state.isScreenSharing) {
            await toggleMicDuringScreenShare();
                return;
            }
            
        // Обычная логика для случая без демонстрации экрана
        const audioTracks = state.localStream ? state.localStream.getAudioTracks() : [];
        const newState = audioTracks.length === 0 || !audioTracks[0].enabled;
        
        // Если включаем микрофон и трек в состоянии "ended" или его нет, получаем новый поток
        if (newState && (audioTracks.length === 0 || audioTracks[0].readyState === 'ended')) {
            try {
                // Получаем новый поток с аудио (и видео если оно включено)
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: state.isVideoEnabled,
                    audio: true
                });
                
                // Обновляем локальный стрим
                if (state.localStream) {
                    // Удаляем старые аудио треки
                    const oldAudioTracks = state.localStream.getAudioTracks();
                    oldAudioTracks.forEach(track => {
                        state.localStream.removeTrack(track);
                        track.stop();
                    });
                    
                    // Добавляем новые аудио треки
                    const newAudioTracks = newStream.getAudioTracks();
                    newAudioTracks.forEach(track => {
                        state.localStream.addTrack(track);
                    });
                    
                    // Если видео тоже было запрошено, обновляем видео треки
                    if (state.isVideoEnabled) {
                        const oldVideoTracks = state.localStream.getVideoTracks();
                        const newVideoTracks = newStream.getVideoTracks();
                        
                        // Удаляем старые видео треки
                        oldVideoTracks.forEach(track => {
                            state.localStream.removeTrack(track);
                            track.stop();
                        });
                        
                        // Добавляем новые видео треки
                        newVideoTracks.forEach(track => {
                            state.localStream.addTrack(track);
                        });
                        
                        // Обновляем все peer connections с новым видео треком
                        Object.values(state.peerConnections).forEach(pc => {
                            if (pc.signalingState !== 'closed') {
                                const senders = pc.getSenders();
                                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                                if (videoSender && newVideoTracks.length > 0) {
                                    videoSender.replaceTrack(newVideoTracks[0]).catch(err => {
                                        console.error('[Controls] Error replacing video track:', err);
                                    });
                                }
                            }
                        });
                    }
                    
                    // Останавливаем новый поток (треки уже добавлены в state.localStream)
                    newStream.getTracks().forEach(track => {
                        if (track.kind === 'audio') {
                            // Аудио треки уже добавлены, не останавливаем их
                        } else if (track.kind === 'video' && !state.isVideoEnabled) {
                            track.stop(); // Останавливаем видео треки если видео выключено
                        }
                    });
                } else {
                    // Если локального потока нет, используем новый
                    state.localStream = newStream;
                }
                
                state.isAudioEnabled = true;
                updateControlButtons();
                updateVideoDisplay(state.uid, state.localStream);
                console.log('[Controls] Microphone enabled with new stream');
                
                // Обновляем аудио трек во всех peer connections
                const newAudioTracks = state.localStream.getAudioTracks();
                if (newAudioTracks.length > 0) {
                    await replaceAudioTrackInAllConnections(newAudioTracks[0]);
                }
                
                // Отправляем сообщение другим пользователям
                if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                    state.videoSocket.send(JSON.stringify({
                        type: 'audio-enabled',
                        from: state.uid,
                        room: state.roomName
                    }));
                }
            } catch (error) {
                console.error('[Controls] Error enabling microphone:', error);
                state.isAudioEnabled = false;
                updateControlButtons();
                alert('Не удалось включить микрофон. Пожалуйста, проверьте разрешения браузера.');
            }
        } else if (state.localStream && audioTracks.length > 0) {
            // Просто переключаем состояние трека
            const newState = !audioTracks[0].enabled;
            audioTracks.forEach(track => {
                track.enabled = newState;
            });
            state.isAudioEnabled = newState;
            updateControlButtons();
            console.log('[Controls] Microphone toggled, enabled:', state.isAudioEnabled);
            
            // Обновляем аудио трек во всех peer connections
            if (newState) {
                // Если включаем, убеждаемся что трек отправляется
                const audioTracks = state.localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    await replaceAudioTrackInAllConnections(audioTracks[0]);
                }
            }
            
            // Отправляем сообщение другим пользователям о состоянии аудио
            if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                state.videoSocket.send(JSON.stringify({
                    type: state.isAudioEnabled ? 'audio-enabled' : 'audio-disabled',
                    from: state.uid,
                    room: state.roomName
                }));
                console.log('[Controls] Sent audio state to other users:', state.isAudioEnabled ? 'enabled' : 'disabled');
            }
        } else {
            console.warn('[Controls] No local stream or audio tracks available');
        }
    }
    
    /**
     * Управление микрофоном во время демонстрации экрана
     * ВАЖНО: микрофон и звук экрана управляются независимо
     */
    async function toggleMicDuringScreenShare() {
        console.log('[Controls] Toggling microphone during screen share');
        
        const newMicState = !state.isAudioEnabled;
        state.isAudioEnabled = newMicState;
        
        // Получаем или находим трек микрофона
        // Сначала проверяем сохраненный трек микрофона в state
        let micTrack = state.micTrack;
        
        // Если трек микрофона есть, но он в состоянии "ended", сбрасываем его
        if (micTrack && micTrack.readyState === 'ended') {
            console.log('[Controls] Microphone track ended, resetting...');
            micTrack = null;
            state.micTrack = null;
        }
        
        // Если трека нет в state, ищем в локальном стриме
        if (!micTrack && state.localStream) {
            const allAudioTracks = state.localStream.getAudioTracks();
            micTrack = allAudioTracks.find(track => {
                return track !== state.screenAudioTrack && 
                       track !== state.mixedAudioStream?.getAudioTracks()[0] &&
                       track.readyState === 'live';
            });
            // Сохраняем найденный трек в state
            if (micTrack) {
                state.micTrack = micTrack;
                console.log('[Controls] Found and saved microphone track from local stream');
            }
        }
        
        // Если включаем микрофон и трека нет, получаем новый
        if (newMicState && !micTrack) {
            try {
                console.log('[Controls] Getting new microphone track for screen share...');
                const micStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                micTrack = micStream.getAudioTracks()[0];
                micTrack.enabled = true;
                // Сохраняем трек микрофона в state
                state.micTrack = micTrack;
                console.log('[Controls] New microphone track obtained and saved');
            } catch (error) {
                console.error('[Controls] Error getting microphone:', error);
                state.isAudioEnabled = false;
                state.micTrack = null;
                updateControlButtons();
                alert('Не удалось включить микрофон. Пожалуйста, проверьте разрешения браузера.');
                return;
            }
        } else if (!newMicState && micTrack) {
            // Если выключаем микрофон, НЕ останавливаем трек, только отключаем его
            // Это нужно для того, чтобы можно было включить его снова без получения нового трека
            micTrack.enabled = false;
            console.log('[Controls] Microphone track disabled (not stopped)');
        }
        
        // Создаем или обновляем аудио трек для отправки
        let audioTrackToSend = null;
        
        if (newMicState && micTrack && state.screenAudioTrack) {
            // Есть и микрофон, и звук экрана - создаем микшированный трек
            try {
                console.log('[Controls] Creating mixed audio (microphone + screen audio)');
                // Убеждаемся, что трек микрофона включен
                if (!micTrack.enabled) {
                    micTrack.enabled = true;
                }
                audioTrackToSend = await createMixedAudioTrack(micTrack, state.screenAudioTrack);
            } catch (error) {
                console.error('[Controls] Error creating mixed audio:', error);
                // Fallback: используем только микрофон
                if (micTrack.enabled) {
                    audioTrackToSend = micTrack;
                } else {
                    // Если микрофон выключен, используем только звук экрана
                    audioTrackToSend = state.screenAudioTrack;
                }
            }
        } else if (newMicState && micTrack) {
            // Есть только микрофон (нет звука экрана)
            console.log('[Controls] Using microphone only (no screen audio)');
            // Убеждаемся, что трек микрофона включен
            if (!micTrack.enabled) {
                micTrack.enabled = true;
            }
            audioTrackToSend = micTrack;
        } else if (state.screenAudioTrack) {
            // Есть только звук экрана (микрофон выключен)
            console.log('[Controls] Using screen audio only (microphone disabled)');
            audioTrackToSend = state.screenAudioTrack;
        } else {
            console.warn('[Controls] No audio track available for screen share');
        }
        
        // Обновляем локальный стрим
        if (state.localStream && audioTrackToSend) {
            // Удаляем старые аудио треки (кроме микрофона, который используется для микширования)
            const oldAudioTracks = state.localStream.getAudioTracks();
            oldAudioTracks.forEach(track => {
                // Не удаляем трек микрофона если он используется для микширования
                if (track === micTrack && audioTrackToSend !== micTrack && audioTrackToSend !== state.screenAudioTrack) {
                    // Микрофон используется в микшированном треке, не удаляем его
                    return;
                }
                // Не удаляем трек микрофона, даже если он выключен (для возможности включения позже)
                if (track === micTrack) {
                    return;
                }
                state.localStream.removeTrack(track);
                // Не останавливаем трек микрофона если он используется для микширования
                if (track !== micTrack && track !== audioTrackToSend) {
                    track.stop();
                }
            });
            
            // Добавляем новый аудио трек
            state.localStream.addTrack(audioTrackToSend);
        }
        
        // Обновляем аудио трек во всех peer connections
        if (audioTrackToSend) {
            await replaceAudioTrackInAllConnections(audioTrackToSend);
        }
        
        updateControlButtons();
        console.log('[Controls] Microphone toggled during screen share, enabled:', state.isAudioEnabled);
        
        // Отправляем сообщение другим пользователям
        if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
            state.videoSocket.send(JSON.stringify({
                type: state.isAudioEnabled ? 'audio-enabled' : 'audio-disabled',
                from: state.uid,
                room: state.roomName
            }));
        }
    }
    
    async function toggleCamera() {
        // ВАЖНО: Если включен screen share, кнопка камеры не должна его останавливать
        if (state.isScreenSharing && state.currentSharingUser === state.uid) {
            // Во время screen share камера управляется отдельно через cameraStream
            // Проверяем состояние камеры в cameraStream
            const cameraVideoTracks = state.cameraStream ? state.cameraStream.getVideoTracks() : [];
            const newState = cameraVideoTracks.length === 0 || !cameraVideoTracks[0]?.enabled;
            
            if (newState && (cameraVideoTracks.length === 0 || cameraVideoTracks[0].readyState === 'ended')) {
                // Включаем камеру во время screen share
                try {
                    const newStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false // Аудио уже в localStream
                    });
                    
                    // Обновляем cameraStream для отображения камеры
                    const videoTrack = newStream.getVideoTracks()[0];
                    if (videoTrack) {
                        const audioTracks = state.localStream ? state.localStream.getAudioTracks().filter(track => {
                            return track !== state.screenAudioTrack && 
                                   track !== state.mixedAudioStream?.getAudioTracks()[0];
                        }) : [];
                        state.cameraStream = new MediaStream([videoTrack, ...audioTracks]);
                        state.isVideoEnabled = true;
                        state.userCameraStates[state.uid] = true;
                        updateVideoDisplay(state.uid, state.cameraStream);
                        console.log('[Controls] Camera enabled during screen share');
                    }
                    
                    // Останавливаем новый поток (треки уже в cameraStream)
                    newStream.getTracks().forEach(track => track.stop());
                    
                    updateControlButtons();
                    
                    // Отправляем сообщение другим пользователям
                    if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        state.videoSocket.send(JSON.stringify({
                            type: 'camera-enabled',
                            from: state.uid,
                            room: state.roomName
                        }));
                    }
                } catch (error) {
                    console.error('[Controls] Error enabling camera during screen share:', error);
                    alert('Не удалось включить камеру. Пожалуйста, проверьте разрешения браузера.');
                }
            } else if (cameraVideoTracks.length > 0) {
                // Переключаем состояние камеры (включить/выключить)
                const newState = !cameraVideoTracks[0].enabled;
                cameraVideoTracks.forEach(track => {
                    track.enabled = newState;
                });
                state.isVideoEnabled = newState;
                state.userCameraStates[state.uid] = newState;
                updateVideoDisplay(state.uid, state.cameraStream);
                updateControlButtons();
                
                // Отправляем сообщение другим пользователям
                if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                    state.videoSocket.send(JSON.stringify({
                        type: newState ? 'camera-enabled' : 'camera-disabled',
                        from: state.uid,
                        room: state.roomName
                    }));
                }
                console.log('[Controls] Camera toggled during screen share, enabled:', state.isVideoEnabled);
            }
            return; // ВАЖНО: Выходим из функции, не трогая screen share
        }
        
        // Обычная логика для камеры (когда screen share не активен)
        const videoTracks = state.localStream ? state.localStream.getVideoTracks() : [];
        const newState = videoTracks.length === 0 || !videoTracks[0].enabled;
        
        // Если включаем камеру и трек в состоянии "ended" или его нет, получаем новый поток
        if (newState && (videoTracks.length === 0 || videoTracks[0].readyState === 'ended')) {
            try {
                // Останавливаем старые треки если есть (только камеру, не screen share)
                if (state.localStream) {
                    const oldVideoTracks = state.localStream.getVideoTracks();
                    oldVideoTracks.forEach(track => {
                        // НЕ останавливаем screen share треки
                        const label = track.label.toLowerCase();
                        if (!label.includes('screen') && !label.includes('display') && !label.includes('window')) {
                            track.stop();
                        }
                    });
                }
                
                // Получаем новый поток с камерой
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: state.isAudioEnabled
                });
                
                // Заменяем видео треки в существующем потоке
                if (state.localStream) {
                    // Удаляем только камеру, НЕ screen share
                    const oldVideoTracks = state.localStream.getVideoTracks();
                    oldVideoTracks.forEach(track => {
                        const label = track.label.toLowerCase();
                        // Удаляем только камеру, не screen share
                        if (!label.includes('screen') && !label.includes('display') && !label.includes('window')) {
                        state.localStream.removeTrack(track);
                        track.stop();
                        }
                    });
                    
                    // Добавляем новые видео треки
                    const newVideoTracks = newStream.getVideoTracks();
                    newVideoTracks.forEach(track => {
                        state.localStream.addTrack(track);
                    });
                    
                    // Останавливаем новый поток (треки уже добавлены в state.localStream)
                    newStream.getTracks().forEach(track => {
                        if (track.kind === 'video') {
                            // Видео треки уже добавлены, не останавливаем их
                        } else {
                            track.stop(); // Останавливаем аудио треки из нового потока
                        }
                    });
                } else {
                    // Если локального потока нет, используем новый
                    state.localStream = newStream;
                }
                
                state.isVideoEnabled = true;
                state.userCameraStates[state.uid] = true;
                
                // Обновляем отображение для локального пользователя
                updateVideoDisplay(state.uid, state.localStream);
                
                // Обновляем все peer connections с новым треком
                Object.values(state.peerConnections).forEach(pc => {
                    if (pc.signalingState !== 'closed') {
                        const senders = pc.getSenders();
                        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                        if (videoSender) {
                            // Находим камеру (не screen share)
                            const newVideoTrack = state.localStream.getVideoTracks().find(track => {
                                const label = track.label.toLowerCase();
                                return !label.includes('screen') && !label.includes('display') && !label.includes('window');
                            });
                            if (newVideoTrack) {
                                videoSender.replaceTrack(newVideoTrack).catch(err => {
                                    console.error('[Controls] Error replacing video track:', err);
                                });
                            }
                        }
                    }
                });
                
                updateControlButtons();
                console.log('[Controls] Camera enabled with new stream');
                
                // Отправляем сообщение другим пользователям
                if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                    state.videoSocket.send(JSON.stringify({
                        type: 'camera-enabled',
                        from: state.uid,
                        room: state.roomName
                    }));
                }
            } catch (error) {
                console.error('[Controls] Error enabling camera:', error);
                state.isVideoEnabled = false;
                state.userCameraStates[state.uid] = false;
                updateControlButtons();
                alert('Не удалось включить камеру. Пожалуйста, проверьте разрешения браузера.');
            }
        } else if (state.localStream && videoTracks.length > 0) {
            // ВАЖНО: Если включен screen share, работаем только с cameraStream
            if (state.isScreenSharing && state.currentSharingUser === state.uid) {
                // Во время screen share переключаем только камеру в cameraStream
                const cameraVideoTracks = state.cameraStream ? state.cameraStream.getVideoTracks() : [];
                if (cameraVideoTracks.length > 0) {
                    const newState = !cameraVideoTracks[0].enabled;
                    cameraVideoTracks.forEach(track => {
                        track.enabled = newState;
                    });
                    state.isVideoEnabled = newState;
                    state.userCameraStates[state.uid] = newState;
                    updateVideoDisplay(state.uid, state.cameraStream);
                    updateControlButtons();
                    
                    // Отправляем сообщение другим пользователям
                    if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        state.videoSocket.send(JSON.stringify({
                            type: newState ? 'camera-enabled' : 'camera-disabled',
                            from: state.uid,
                            room: state.roomName
                        }));
                    }
                    console.log('[Controls] Camera toggled during screen share, enabled:', state.isVideoEnabled);
                } else {
                    console.warn('[Controls] No camera tracks in cameraStream during screen share');
                }
                return; // ВАЖНО: Выходим, не трогая screen share
            }
            
            // Обычная логика переключения камеры (когда screen share не активен)
            // Находим только камеру (не screen share)
            const cameraTracks = videoTracks.filter(track => {
                const label = track.label.toLowerCase();
                return !label.includes('screen') && !label.includes('display') && !label.includes('window');
            });
            
            if (cameraTracks.length > 0) {
                const newState = !cameraTracks[0].enabled;
                cameraTracks.forEach(track => {
                track.enabled = newState;
            });
            state.isVideoEnabled = newState;
            state.userCameraStates[state.uid] = newState;
            
            updateControlButtons();
            console.log('[Controls] Camera toggled, enabled:', state.isVideoEnabled);
            
            // Обновляем отображение для локального пользователя
            updateVideoDisplay(state.uid, state.localStream);
            
            // Отправляем сообщение другим пользователям о состоянии камеры
            if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                state.videoSocket.send(JSON.stringify({
                    type: state.isVideoEnabled ? 'camera-enabled' : 'camera-disabled',
                    from: state.uid,
                    room: state.roomName
                }));
                console.log('[Controls] Sent camera state to other users:', state.isVideoEnabled ? 'enabled' : 'disabled');
                }
            } else {
                console.warn('[Controls] No camera tracks found in local stream');
            }
        } else {
            console.warn('[Controls] No local stream or video tracks available');
        }
    }
    
    // ============================================================================
    // Screen Sharing Functions
    // ============================================================================
    
    async function toggleScreenShare() {
        if (state.isScreenSharing && state.currentSharingUser === state.uid) {
            // Останавливаем демонстрацию экрана
            await stopScreenShare();
        } else {
            // Начинаем демонстрацию экрана
            await startScreenShare();
        }
    }
    
    async function startScreenShare() {
        // Проверяем, не демонстрирует ли уже кто-то другой
        if (state.currentSharingUser && state.currentSharingUser !== state.uid) {
            alert(`Демонстрация экрана уже ведется пользователем ${state.userNames[state.currentSharingUser] || state.currentSharingUser}`);
            return;
        }
        
        try {
            console.log('[ScreenShare] Requesting screen share...');
            
            // Запрашиваем доступ к экрану
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor'
                },
                audio: true  // Включаем системный звук если доступен
            });
            
            console.log('[ScreenShare] Screen share stream obtained');
            
            // Сохраняем стрим и трек
            state.screenShareStream = screenStream;
            const videoTracks = screenStream.getVideoTracks();
            const audioTracks = screenStream.getAudioTracks();
            
            console.log('[ScreenShare] Screen stream tracks:', {
                videoTracks: videoTracks.length,
                audioTracks: audioTracks.length
            });
            
            if (videoTracks.length === 0) {
                throw new Error('Не удалось получить видео трек экрана');
            }
            
            state.screenShareTrack = videoTracks[0];
            
            // Обработка остановки демонстрации пользователем через браузер
            state.screenShareTrack.onended = () => {
                console.log('[ScreenShare] Screen share track ended by user');
                stopScreenShare();
            };
            
            // Сохраняем аудио трек экрана если есть
            state.screenAudioTrack = audioTracks.length > 0 ? audioTracks[0] : null;
            
            if (state.screenAudioTrack) {
                console.log('[ScreenShare] ✅ Screen audio track obtained:', {
                    id: state.screenAudioTrack.id,
                    enabled: state.screenAudioTrack.enabled,
                    readyState: state.screenAudioTrack.readyState,
                    label: state.screenAudioTrack.label
                });
                // Убеждаемся, что трек включен
                if (!state.screenAudioTrack.enabled) {
                    state.screenAudioTrack.enabled = true;
                    console.log('[ScreenShare] Enabled screen audio track');
                }
            } else {
                console.warn('[ScreenShare] ⚠️ No screen audio track available. User may not have selected "Share audio" in browser.');
            }
            
            // Получаем или создаем аудио трек микрофона
            // Сначала проверяем сохраненный трек микрофона в state
            let micTrack = state.micTrack;
            
            // Если трек микрофона есть, но он в состоянии "ended", сбрасываем его
            if (micTrack && micTrack.readyState === 'ended') {
                console.log('[ScreenShare] Microphone track ended, resetting...');
                micTrack = null;
                state.micTrack = null;
            }
            
            // Если трека нет в state, ищем в локальном стриме
            if (!micTrack && state.localStream) {
                const currentAudioTracks = state.localStream.getAudioTracks();
                console.log('[ScreenShare] Current audio tracks in local stream:', currentAudioTracks.length);
                
                // Ищем трек микрофона (не из экрана, и не микшированный)
                // ВАЖНО: ищем даже если трек выключен (enabled = false), так как его можно включить
                micTrack = currentAudioTracks.find(track => {
                    // Проверяем, что это не трек из экрана и не микшированный трек
                    const isScreenTrack = track === state.screenAudioTrack;
                    const isMixedTrack = track === state.mixedAudioStream?.getAudioTracks()[0];
                    const isLive = track.readyState === 'live';
                    const result = !isScreenTrack && !isMixedTrack && isLive;
                    
                    if (result) {
                        console.log('[ScreenShare] Found potential microphone track:', {
                            id: track.id,
                            enabled: track.enabled,
                            readyState: track.readyState
                        });
                    }
                    
                    return result;
                });
                
                // Сохраняем найденный трек в state
                if (micTrack) {
                    state.micTrack = micTrack;
                    console.log('[ScreenShare] Found and saved existing microphone track, enabled:', micTrack.enabled);
                    // Убеждаемся, что трек включен если микрофон должен быть включен
                    if (state.isAudioEnabled && !micTrack.enabled) {
                        micTrack.enabled = true;
                        console.log('[ScreenShare] Enabled microphone track');
                    }
                } else {
                    console.log('[ScreenShare] No microphone track found in local stream');
                }
            }
            
            // Если микрофон был выключен или трек не найден, но пользователь хочет его использовать
            // (state.isAudioEnabled = true), получаем новый трек микрофона
            // ВАЖНО: даже если микрофон был выключен, если state.isAudioEnabled = true, 
            // значит пользователь хочет его включить, поэтому получаем новый трек
            if (!micTrack && state.isAudioEnabled) {
                try {
                    console.log('[ScreenShare] Microphone track not found or disabled, requesting new microphone stream...');
                    console.log('[ScreenShare] isAudioEnabled:', state.isAudioEnabled);
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        video: false,
                        audio: true
                    });
                    micTrack = micStream.getAudioTracks()[0];
                    // Включаем трек микрофона
                    micTrack.enabled = true;
                    // Сохраняем трек микрофона в state
                    state.micTrack = micTrack;
                    console.log('[ScreenShare] New microphone track obtained and saved:', {
                        id: micTrack.id,
                        enabled: micTrack.enabled,
                        readyState: micTrack.readyState
                    });
                    
                    // Если локального стрима нет, создаем его
                    if (!state.localStream) {
                        state.localStream = new MediaStream();
                    }
                    
                    // ВАЖНО: НЕ добавляем трек микрофона в локальный стрим сейчас
                    // Он будет использоваться только для микширования через AudioContext
                    // В локальный стрим добавим только микшированный трек
                } catch (error) {
                    console.error('[ScreenShare] Error getting microphone:', error);
                    micTrack = null;
                    state.micTrack = null;
                    // Если не удалось получить микрофон, продолжаем без него
                }
            } else if (!micTrack) {
                console.log('[ScreenShare] No microphone track available. isAudioEnabled:', state.isAudioEnabled);
            }
            
            // Создаем микшированный аудио стрим (микрофон + звук экрана)
            // ВАЖНО: используем микрофон только если state.isAudioEnabled === true
            let mixedAudioTrack = null;
            console.log('[ScreenShare] Audio mixing decision:', {
                hasScreenAudio: !!state.screenAudioTrack,
                hasMicTrack: !!micTrack,
                isAudioEnabled: state.isAudioEnabled,
                micTrackEnabled: micTrack ? micTrack.enabled : false
            });
            
            // Используем микрофон только если он включен (state.isAudioEnabled === true)
            const useMic = state.isAudioEnabled && micTrack;
            
            if (state.screenAudioTrack && useMic) {
                // Есть и звук экрана, и микрофон включен - создаем микшированный трек
                try {
                    console.log('[ScreenShare] Creating mixed audio track (microphone + screen audio)...');
                    // Убеждаемся, что трек микрофона включен
                    if (!micTrack.enabled) {
                        micTrack.enabled = true;
                    }
                    mixedAudioTrack = await createMixedAudioTrack(micTrack, state.screenAudioTrack);
                    console.log('[ScreenShare] ✅ Created mixed audio track (microphone + screen audio)');
                } catch (error) {
                    console.error('[ScreenShare] ❌ Error creating mixed audio track:', error);
                    // Если не удалось создать микшированный трек, используем только звук экрана
                    mixedAudioTrack = state.screenAudioTrack;
                    console.warn('[ScreenShare] Falling back to screen audio only');
                }
            } else if (state.screenAudioTrack) {
                // Если есть только звук экрана (микрофон выключен или отсутствует)
                // ВАЖНО: используем звук экрана напрямую, не микшируем
                mixedAudioTrack = state.screenAudioTrack;
                console.log('[ScreenShare] ✅ Using screen audio only (microphone disabled or not available)');
                // Убеждаемся, что трек звука экрана включен
                if (!state.screenAudioTrack.enabled) {
                    state.screenAudioTrack.enabled = true;
                    console.log('[ScreenShare] Enabled screen audio track');
                }
            } else if (useMic) {
                // Если есть только микрофон (нет звука экрана), но микрофон включен
                if (!micTrack.enabled) {
                    micTrack.enabled = true;
                }
                mixedAudioTrack = micTrack;
                console.log('[ScreenShare] Using microphone only (no screen audio)');
            } else {
                console.warn('[ScreenShare] ⚠️ No audio track available (neither microphone nor screen audio)');
            }
            
            // ВАЖНО: Сохраняем камеру пользователя ОТДЕЛЬНО ПЕРЕД заменой на screen share
            // Камера должна оставаться на месте, а screen share будет в отдельном контейнере
            // Это критично для мобильных устройств!
            if (state.localStream) {
                const oldVideoTracks = state.localStream.getVideoTracks();
                // Сохраняем камеру пользователя (если есть) для отображения в панели участников
                const cameraVideoTrack = oldVideoTracks.find(track => {
                    const label = track.label.toLowerCase();
                    // Это камера, а не screen share
                    return !label.includes('screen') && !label.includes('display') && !label.includes('window');
                });
                
                if (cameraVideoTrack) {
                    // Создаем отдельный стрим для камеры пользователя
                    // ВАЖНО: НЕ останавливаем трек камеры, только клонируем ссылки
                    const cameraAudioTracks = state.localStream.getAudioTracks().filter(track => {
                        // Исключаем screen audio и mixed audio
                        return track !== state.screenAudioTrack && 
                               track !== state.mixedAudioStream?.getAudioTracks()[0];
                    });
                    state.cameraStream = new MediaStream([cameraVideoTrack, ...cameraAudioTracks]);
                    console.log('[ScreenShare] ✅ Saved camera stream for user display BEFORE updating localStream:', {
                        videoTracks: 1,
                        audioTracks: cameraAudioTracks.length,
                        cameraTrackId: cameraVideoTrack.id
                    });
                    
                    // ВАЖНО: Сразу обновляем отображение камеры пользователя с cameraStream
                    // Это предотвращает замену камеры на screen share
                    updateVideoDisplay(state.uid, state.cameraStream);
                    console.log('[ScreenShare] Updated user camera display immediately with cameraStream');
                } else {
                    // Если камеры нет, создаем пустой стрим
                    state.cameraStream = new MediaStream();
                    console.log('[ScreenShare] ⚠️ No camera track found, created empty cameraStream');
                }
            } else {
                // Если localStream не существует, создаем пустой cameraStream
                state.cameraStream = new MediaStream();
                console.log('[ScreenShare] ⚠️ No localStream, created empty cameraStream');
            }
            
            // Теперь обновляем localStream - удаляем старые треки и добавляем screen share
            if (state.localStream) {
                // Удаляем старые видео треки из localStream (но не останавливаем камеру)
                const oldVideoTracks = state.localStream.getVideoTracks();
                oldVideoTracks.forEach(track => {
                    state.localStream.removeTrack(track);
                    // НЕ останавливаем камеру - она будет использоваться в cameraStream
                    const label = track.label.toLowerCase();
                    if (label.includes('screen') || label.includes('display') || label.includes('window')) {
                        // Останавливаем только screen share треки
                    track.stop();
                    }
                });
                
                // Удаляем старые аудио треки
                const oldAudioTracks = state.localStream.getAudioTracks();
                oldAudioTracks.forEach(track => {
                    state.localStream.removeTrack(track);
                    // НЕ останавливаем трек микрофона если он используется для микширования
                    // Микрофон будет использоваться в микшированном треке через AudioContext
                    if (track === micTrack && mixedAudioTrack && mixedAudioTrack !== micTrack) {
                        // Микрофон используется в микшированном треке, не останавливаем его
                        // Он будет продолжать работать через AudioContext
                        console.log('[ScreenShare] Keeping microphone track for mixing (not stopping)');
                    } else if (track !== mixedAudioTrack) {
                        // Останавливаем все треки кроме микшированного
                        // (микрофон уже не в стриме, он используется только для микширования)
                        track.stop();
                    }
                });
                
                // Добавляем новый видео трек (экран)
                state.localStream.addTrack(state.screenShareTrack);
                
                // Добавляем микшированный аудио трек (микрофон + звук экрана) или только звук экрана
                if (mixedAudioTrack) {
                    state.localStream.addTrack(mixedAudioTrack);
                    console.log('[ScreenShare] ✅ Added audio track to local stream:', {
                        isMixed: mixedAudioTrack === state.mixedAudioStream?.getAudioTracks()[0],
                        isScreenAudio: mixedAudioTrack === state.screenAudioTrack,
                        enabled: mixedAudioTrack.enabled,
                        readyState: mixedAudioTrack.readyState
                    });
                } else if (state.screenAudioTrack) {
                    // Если mixedAudioTrack не создан, но есть звук экрана, добавляем его
                    state.localStream.addTrack(state.screenAudioTrack);
                    console.log('[ScreenShare] ✅ Added screen audio track directly to local stream');
                } else {
                    console.warn('[ScreenShare] ⚠️ No audio track to add to local stream');
                }
            } else {
                // Создаем новый стрим с экраном
                // ВАЖНО: Если камера была сохранена, она уже в cameraStream
                // Не добавляем камеру в localStream - она должна остаться в cameraStream
                const tracks = [state.screenShareTrack];
                if (mixedAudioTrack) {
                    tracks.push(mixedAudioTrack);
                } else if (state.screenAudioTrack) {
                    // Если mixedAudioTrack не создан, но есть звук экрана, добавляем его
                    tracks.push(state.screenAudioTrack);
                    console.log('[ScreenShare] ✅ Added screen audio track to new stream');
                }
                state.localStream = new MediaStream(tracks);
                console.log('[ScreenShare] Created new local stream with', tracks.length, 'tracks (camera is in cameraStream)');
            }
            
            // Теперь заменяем видео и аудио треки во всех peer connections и переинициируем переговоры
            await replaceVideoTrackInAllConnections(state.screenShareTrack);
            
            // Заменяем аудио трек на микшированный (микрофон + звук экрана) или только звук экрана
            if (mixedAudioTrack) {
                console.log('[ScreenShare] Replacing audio track with:', {
                    isMixed: mixedAudioTrack === state.mixedAudioStream?.getAudioTracks()[0],
                    isScreenAudio: mixedAudioTrack === state.screenAudioTrack,
                    isMic: mixedAudioTrack === micTrack,
                    enabled: mixedAudioTrack.enabled,
                    readyState: mixedAudioTrack.readyState
                });
                await replaceAudioTrackInAllConnections(mixedAudioTrack);
            } else if (state.screenAudioTrack) {
                // Если mixedAudioTrack не создан, но есть звук экрана, используем его
                console.log('[ScreenShare] Using screen audio track directly (no mixed track)');
                await replaceAudioTrackInAllConnections(state.screenAudioTrack);
            } else {
                console.warn('[ScreenShare] ⚠️ No audio track to send to peers');
            }
            
            // ВАЖНО: НЕ обновляем камеру пользователя здесь - она уже обновлена выше
            // Если cameraStream был создан, отображение уже обновлено
            // НЕ вызываем updateVideoDisplay(state.uid, state.localStream) - это заменит камеру на screen share!
            if (state.cameraStream && state.cameraStream.getVideoTracks().length > 0) {
                console.log('[ScreenShare] Camera already updated with cameraStream, skipping update');
            } else {
                console.log('[ScreenShare] ⚠️ Camera stream is empty, user camera will not be displayed');
            }
            
            // Отправляем запрос на сервер
            if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                state.videoSocket.send(JSON.stringify({
                    type: 'screen-share-start',
                    from: state.uid,
                    room: state.roomName
                }));
            }
            
            state.isScreenSharing = true;
            state.currentSharingUser = state.uid;
            updateScreenShareButton();
            // ВАЖНО: обновляем кнопки управления после начала демонстрации
            updateControlButtons();
            
            // Обновляем layout для режима screen sharing (новая адаптивная система)
            // Layout создаст отдельный контейнер для screen share
            updateVideoLayout();
            
            console.log('[ScreenShare] Screen sharing started successfully');
            
        } catch (error) {
            console.error('[ScreenShare] Error starting screen share:', error);
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                alert('Доступ к экрану запрещен. Пожалуйста, разрешите доступ в настройках браузера.');
            } else if (error.name === 'NotFoundError') {
                alert('Не удалось найти источник экрана для демонстрации.');
            } else {
                alert('Ошибка при начале демонстрации экрана: ' + error.message);
            }
            
            state.isScreenSharing = false;
            updateScreenShareButton();
        }
    }
    
    async function stopScreenShare() {
        if (!state.isScreenSharing) {
            return;
        }
        
        try {
            console.log('[ScreenShare] Stopping screen share...');
            
            // Останавливаем микшированный аудио стрим
            if (state.mixedAudioStream) {
                state.mixedAudioStream.getTracks().forEach(track => track.stop());
                state.mixedAudioStream = null;
            }
            
            // Закрываем AudioContext если был создан
            if (state.audioContext && state.audioContext.state !== 'closed') {
                await state.audioContext.close();
                state.audioContext = null;
            }
            
            // Останавливаем трек экрана
            if (state.screenShareTrack) {
                state.screenShareTrack.stop();
                state.screenShareTrack = null;
            }
            
            // Останавливаем аудио трек экрана
            if (state.screenAudioTrack) {
                state.screenAudioTrack.stop();
                state.screenAudioTrack = null;
            }
            
            if (state.screenShareStream) {
                state.screenShareStream.getTracks().forEach(track => track.stop());
                state.screenShareStream = null;
            }
            
            // ВАЖНО: сохраняем ссылку на трек микрофона ДО удаления треков из стрима
            // Это нужно для того, чтобы не потерять микрофон при остановке демонстрации
            let savedMicTrack = null;
            if (state.localStream) {
                const allAudioTracks = state.localStream.getAudioTracks();
                // Ищем трек микрофона (не из экрана, не микшированный)
                savedMicTrack = allAudioTracks.find(track => {
                    return track !== state.screenAudioTrack && 
                           track !== state.mixedAudioStream?.getAudioTracks()[0] &&
                           track.readyState === 'live';
                });
                if (savedMicTrack) {
                    console.log('[ScreenShare] Found microphone track to preserve:', savedMicTrack.id);
                }
            }
            
            // Восстанавливаем камеру или создаем новый стрим
            // Проверяем, нужно ли вообще запрашивать медиа (хотя бы одно должно быть true)
            if (state.isVideoEnabled || state.isAudioEnabled) {
                try {
                    // Используем сохраненный cameraStream если он есть, иначе запрашиваем новый
                    let cameraStream = state.cameraStream;
                    
                    if (!cameraStream || cameraStream.getVideoTracks().length === 0) {
                        // Если cameraStream не сохранен или не содержит видео, запрашиваем новый
                        cameraStream = await navigator.mediaDevices.getUserMedia({
                        video: state.isVideoEnabled,
                        audio: state.isAudioEnabled
                    });
                        state.cameraStream = cameraStream;
                        console.log('[ScreenShare] Obtained new camera stream after screen share');
                    } else {
                        // Восстанавливаем треки из сохраненного cameraStream
                        console.log('[ScreenShare] Restoring camera from saved cameraStream');
                        // Проверяем, что треки еще активны
                        const videoTrack = cameraStream.getVideoTracks()[0];
                        if (videoTrack && videoTrack.readyState === 'ended') {
                            // Трек завершен, запрашиваем новый
                            cameraStream = await navigator.mediaDevices.getUserMedia({
                                video: state.isVideoEnabled,
                                audio: state.isAudioEnabled
                            });
                            state.cameraStream = cameraStream;
                            console.log('[ScreenShare] Camera track ended, obtained new stream');
                        }
                    }
                    
                    // Заменяем видео трек во всех peer connections (если есть видео)
                    if (state.isVideoEnabled) {
                        const videoTracks = cameraStream.getVideoTracks();
                        if (videoTracks.length > 0) {
                            await replaceVideoTrackInAllConnections(videoTracks[0]);
                        }
                    }
                    
                    // Заменяем аудио трек во всех peer connections (если есть аудио)
                    // ВАЖНО: восстанавливаем микрофон, который был до демонстрации
                    if (state.isAudioEnabled) {
                        const audioTracks = cameraStream.getAudioTracks();
                        if (audioTracks.length > 0) {
                            // Используем новый трек микрофона из камеры
                            await replaceAudioTrackInAllConnections(audioTracks[0]);
                            console.log('[ScreenShare] Restored microphone track after screen share');
                        }
                    } else {
                        // Если микрофон был выключен, удаляем только микшированный трек и звук экрана
                        console.log('[ScreenShare] Microphone was disabled, removing screen audio only');
                        if (state.localStream) {
                            const oldAudioTracks = state.localStream.getAudioTracks();
                            oldAudioTracks.forEach(track => {
                                // Удаляем только микшированный трек и звук экрана
                                if (track === state.mixedAudioStream?.getAudioTracks()[0] || track === state.screenAudioTrack) {
                                    state.localStream.removeTrack(track);
                                    track.stop();
                                }
                            });
                        }
                    }
                    
                    // Обновляем локальный стрим
                    if (state.localStream) {
                        // Удаляем старые видео треки (экран)
                        const oldVideoTracks = state.localStream.getVideoTracks();
                        oldVideoTracks.forEach(track => {
                            state.localStream.removeTrack(track);
                            track.stop();
                        });
                        
                        // Удаляем старые аудио треки (микшированный трек и звук экрана)
                        const oldAudioTracks = state.localStream.getAudioTracks();
                        oldAudioTracks.forEach(track => {
                            // Удаляем только микшированный трек и звук экрана
                            // НЕ удаляем трек микрофона, если он был сохранен
                            if (track === state.mixedAudioStream?.getAudioTracks()[0] || 
                                track === state.screenAudioTrack) {
                                state.localStream.removeTrack(track);
                                track.stop();
                            }
                        });
                        
                        // Добавляем новые треки из камеры
                        cameraStream.getVideoTracks().forEach(track => {
                            state.localStream.addTrack(track);
                        });
                        if (state.isAudioEnabled) {
                            cameraStream.getAudioTracks().forEach(track => {
                                state.localStream.addTrack(track);
                            });
                        }
                    } else {
                        state.localStream = cameraStream;
                    }
                    
                    // Обновляем cameraStream
                    state.cameraStream = cameraStream;
                    
                    // Обновляем отображение камеры пользователя
                    updateVideoDisplay(state.uid, cameraStream);
                    console.log('[ScreenShare] Camera and microphone restored after screen share');
                    
                } catch (cameraError) {
                    console.warn('[ScreenShare] Could not restore camera:', cameraError);
                    // Продолжаем без камеры/микрофона
                    if (state.localStream) {
                        const videoTracks = state.localStream.getVideoTracks();
                        videoTracks.forEach(track => {
                            state.localStream.removeTrack(track);
                            track.stop();
                        });
                        // Удаляем микшированный трек и звук экрана, но сохраняем микрофон если был
                        const oldAudioTracks = state.localStream.getAudioTracks();
                        oldAudioTracks.forEach(track => {
                            if (track === state.mixedAudioStream?.getAudioTracks()[0] || 
                                track === state.screenAudioTrack) {
                                state.localStream.removeTrack(track);
                                track.stop();
                            }
                        });
                        updateVideoDisplay(state.uid, state.localStream);
                    }
                }
            } else {
                // Если и видео и аудио выключены, просто удаляем видео трек экрана и звук экрана
                console.log('[ScreenShare] Video and audio are disabled, removing screen share track only');
                if (state.localStream) {
                    // Удаляем видео трек экрана
                    const videoTracks = state.localStream.getVideoTracks();
                    videoTracks.forEach(track => {
                        state.localStream.removeTrack(track);
                        track.stop();
                    });
                    
                    // Удаляем только микшированный трек и звук экрана
                    const oldAudioTracks = state.localStream.getAudioTracks();
                    oldAudioTracks.forEach(track => {
                        if (track === state.mixedAudioStream?.getAudioTracks()[0] || 
                            track === state.screenAudioTrack) {
                            state.localStream.removeTrack(track);
                            track.stop();
                        }
                    });
                    
                    updateVideoDisplay(state.uid, state.localStream);
                }
                
                // Важно: если нет локального стрима или он пуст, создаем минимальный стрим для поддержания соединений
                // Это нужно для того, чтобы можно было включить микрофон/камеру позже
                if (!state.localStream || (state.localStream.getTracks().length === 0)) {
                    state.localStream = new MediaStream();
                    console.log('[ScreenShare] Created empty local stream for future media');
                }
            }
            
            // Отправляем запрос на сервер
            if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                state.videoSocket.send(JSON.stringify({
                    type: 'screen-share-stop',
                    from: state.uid,
                    room: state.roomName
                }));
            }
            
            state.isScreenSharing = false;
            state.currentSharingUser = null;
            updateScreenShareButton();
            
            // Принудительно очищаем screen share layout перед обновлением
            const videoStreams = domCache.getVideoStreams();
            if (videoStreams) {
                cleanupScreenShareLayout(videoStreams);
                
                // Дополнительная проверка и принудительное удаление
                const remainingScreenShare = videoStreams.querySelector('.screen-share-container');
                if (remainingScreenShare) {
                    console.warn('[ScreenShare] Force removing remaining screen share container');
                    remainingScreenShare.remove();
                }
                
                const remainingScreenShareVideos = videoStreams.querySelectorAll('.screen-share-video');
                remainingScreenShareVideos.forEach(videoContainer => {
                    const video = videoContainer.querySelector('video');
                    if (video && video.srcObject) {
                        const stream = video.srcObject;
                        stream.getTracks().forEach(track => track.stop());
                        video.srcObject = null;
                    }
                    videoContainer.remove();
                });
            }
            
            // Обновляем отображение камеры пользователя (восстанавливаем в формат 1:1)
            if (state.localStream) {
                updateVideoDisplay(state.uid, state.localStream);
            }
            
            // Обновляем layout для обычного режима (новая адаптивная система)
            // Это удалит screen share контейнер и вернет все видео в обычную сетку
            updateVideoLayout();
            
            console.log('[ScreenShare] Screen sharing stopped successfully');
            
        } catch (error) {
            console.error('[ScreenShare] Error stopping screen share:', error);
            state.isScreenSharing = false;
            updateScreenShareButton();
        }
    }
    
    async function replaceVideoTrackInAllConnections(newTrack) {
        const replacePromises = [];
        const needsRenegotiation = new Set();
        
        Object.entries(state.peerConnections).forEach(([uid, pc]) => {
            if (pc.signalingState !== 'closed') {
                const senders = pc.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                
                if (videoSender) {
                    replacePromises.push(
                        videoSender.replaceTrack(newTrack).then(() => {
                            // После успешной замены трека, нужно переинициировать переговоры
                            needsRenegotiation.add(uid);
                        }).catch(err => {
                            console.error(`[ScreenShare] Error replacing video track for ${uid}:`, err);
                        })
                    );
                } else {
                    // Если нет видео сендера, добавляем трек
                    // addTrack не возвращает Promise, поэтому оборачиваем в try-catch
                    if (state.localStream) {
                        try {
                            pc.addTrack(newTrack, state.localStream);
                            // После добавления трека нужно переинициировать переговоры
                            needsRenegotiation.add(uid);
                            // Создаем resolved promise для совместимости с Promise.all
                            replacePromises.push(Promise.resolve());
                        } catch (err) {
                            console.error(`[ScreenShare] Error adding video track for ${uid}:`, err);
                            replacePromises.push(Promise.resolve()); // Все равно резолвим, чтобы не блокировать другие
                        }
                    }
                }
            }
        });
        
        await Promise.all(replacePromises);
        console.log('[ScreenShare] Video track replaced in all connections');
        
        // Переинициируем переговоры для всех соединений, где был заменен трек
        await renegotiateConnections(Array.from(needsRenegotiation));
    }
    
    /**
     * Создает микшированный аудио трек из микрофона и звука экрана
     * @param {MediaStreamTrack} micTrack - Трек микрофона
     * @param {MediaStreamTrack} screenAudioTrack - Трек звука экрана
     * @returns {MediaStreamTrack} - Микшированный аудио трек
     */
    async function createMixedAudioTrack(micTrack, screenAudioTrack) {
        if (!micTrack && !screenAudioTrack) {
            throw new Error('No audio sources available');
        }
        
        // Если есть только один источник, возвращаем его
        if (!micTrack && screenAudioTrack) {
            return screenAudioTrack;
        }
        if (micTrack && !screenAudioTrack) {
            return micTrack;
        }
        
        // Убеждаемся, что оба трека включены
        if (micTrack && !micTrack.enabled) {
            micTrack.enabled = true;
            console.log('[ScreenShare] Enabled microphone track for mixing');
        }
        if (screenAudioTrack && !screenAudioTrack.enabled) {
            screenAudioTrack.enabled = true;
            console.log('[ScreenShare] Enabled screen audio track for mixing');
        }
        
        // Закрываем предыдущий AudioContext если есть
        if (state.audioContext && state.audioContext.state !== 'closed') {
            try {
                await state.audioContext.close();
            } catch (e) {
                console.warn('[ScreenShare] Error closing previous AudioContext:', e);
            }
        }
        
        // Создаем AudioContext для микширования
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[ScreenShare] AudioContext created, state:', state.audioContext.state);
        
        // Создаем источники для обоих аудио треков
        const micSource = state.audioContext.createMediaStreamSource(new MediaStream([micTrack]));
        const screenSource = state.audioContext.createMediaStreamSource(new MediaStream([screenAudioTrack]));
        
        // Создаем destination для микшированного потока
        const destination = state.audioContext.createMediaStreamDestination();
        
        // Подключаем оба источника к destination (микширование)
        micSource.connect(destination);
        screenSource.connect(destination);
        
        // Сохраняем микшированный стрим
        state.mixedAudioStream = destination.stream;
        
        const mixedTrack = destination.stream.getAudioTracks()[0];
        console.log('[ScreenShare] ✅ Mixed audio created: microphone + screen audio', {
            mixedTrackId: mixedTrack.id,
            enabled: mixedTrack.enabled,
            readyState: mixedTrack.readyState
        });
        
        // Возвращаем микшированный аудио трек
        return mixedTrack;
    }
    
    async function replaceAudioTrackInAllConnections(newTrack) {
        const replacePromises = [];
        const needsRenegotiation = new Set();
        
        Object.entries(state.peerConnections).forEach(([uid, pc]) => {
            if (pc.signalingState !== 'closed') {
                const senders = pc.getSenders();
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                
                if (audioSender) {
                    replacePromises.push(
                        audioSender.replaceTrack(newTrack).then(() => {
                            // После успешной замены трека, нужно переинициировать переговоры
                            needsRenegotiation.add(uid);
                        }).catch(err => {
                            console.error(`[ScreenShare] Error replacing audio track for ${uid}:`, err);
                        })
                    );
                } else {
                    // Если нет аудио сендера, добавляем трек
                    if (state.localStream) {
                        try {
                            pc.addTrack(newTrack, state.localStream);
                            // После добавления трека нужно переинициировать переговоры
                            needsRenegotiation.add(uid);
                            replacePromises.push(Promise.resolve());
                        } catch (err) {
                            console.error(`[ScreenShare] Error adding audio track for ${uid}:`, err);
                            replacePromises.push(Promise.resolve());
                        }
                    }
                }
            }
        });
        
        await Promise.all(replacePromises);
        console.log('[ScreenShare] Audio track replaced in all connections');
        
        // Переинициируем переговоры для всех соединений, где был заменен трек
        await renegotiateConnections(Array.from(needsRenegotiation));
    }
    
    async function renegotiateConnections(uids) {
        // Переинициируем переговоры для всех соединений, где был заменен трек
        // Используем Set для дедупликации, если один и тот же uid нуждается в renegotiation
        const uniqueUids = [...new Set(uids)];
        
        for (const uid of uniqueUids) {
            try {
                const pc = state.peerConnections[uid];
                if (pc && pc.signalingState !== 'closed') {
                    // Проверяем, не идет ли уже переговоры
                    if (state.negotiationInProgress.has(uid)) {
                        console.log(`[ScreenShare] Negotiation already in progress for ${uid}, skipping`);
                        continue;
                    }
                    
                    // Устанавливаем флаг переговоров
                    state.negotiationInProgress.add(uid);
                    
                    // Создаем новый offer для переинициации переговоров
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    
                    // Отправляем новый offer через WebSocket
                    if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        state.videoSocket.send(JSON.stringify({
                            type: 'offer',
                            offer: offer,
                            from: state.uid,
                            to: uid
                        }));
                        console.log(`[ScreenShare] Sent renegotiation offer to ${uid}`);
                    }
                    
                    // Снимаем флаг переговоров через небольшую задержку
                    setTimeout(() => {
                        state.negotiationInProgress.delete(uid);
                    }, 5000);
                }
            } catch (err) {
                console.error(`[ScreenShare] Error renegotiating with ${uid}:`, err);
                state.negotiationInProgress.delete(uid);
            }
        }
    }
    
    function leaveRoom() {
        console.log('[Leave] User leaving room, UID:', state.uid);
        
        // Устанавливаем флаг выхода, чтобы предотвратить переподключение
        state.isLeaving = true;
        
        // Немедленно скрываем локальное видео для других пользователей
        const localVideoContainer = document.getElementById(`video-${state.uid}`);
        if (localVideoContainer) {
            localVideoContainer.style.display = 'none';
        }
        
        // Отправляем сообщение о выходе перед закрытием соединений
        if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
            try {
                // Отправляем сообщение синхронно
                const message = JSON.stringify({
                    type: 'user-left',
                    uid: state.uid,
                    room: state.roomName
                });
                state.videoSocket.send(message);
                console.log('[Leave] Sent user-left message');
                
                // Используем событие отправки для гарантии доставки
                // Проверяем, что буфер отправки пуст перед закрытием
                const checkBufferAndClose = () => {
                    // Если буфер пуст (readyState все еще OPEN), закрываем
                    if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                        // Проверяем буфер отправки (если доступно)
                        if (state.videoSocket.bufferedAmount === 0) {
                            closeConnections().catch(err => console.error('[Leave] Error closing connections:', err));
                        } else {
                            // Если буфер не пуст, ждем еще немного
                            setTimeout(checkBufferAndClose, 50);
                        }
                    } else {
                        closeConnections().catch(err => console.error('[Leave] Error closing connections:', err));
                    }
                };
                
                // Даем минимальное время на отправку (50мс)
                setTimeout(checkBufferAndClose, 50);
            } catch (error) {
                console.error('[Leave] Error sending user-left message:', error);
                closeConnections().catch(err => console.error('[Leave] Error closing connections:', err));
            }
        } else {
            closeConnections().catch(err => console.error('[Leave] Error closing connections:', err));
        }
        
        async function closeConnections() {
        // Останавливаем демонстрацию экрана если активна
        if (state.isScreenSharing) {
            await stopScreenShare();
        }
        
        if (state.localStream) {
            state.localStream.getTracks().forEach(track => track.stop());
        }
        
        Object.values(state.peerConnections).forEach(pc => pc.close());
        
            // Закрываем соединения с кодом нормального закрытия
        if (state.videoSocket) {
                try {
                    state.videoSocket.close(1000, 'User left room');
                } catch (e) {
                    console.error('[Leave] Error closing video socket:', e);
                }
        }
        if (state.chatSocket) {
                try {
                    state.chatSocket.close(1000, 'User left room');
                } catch (e) {
                    console.error('[Leave] Error closing chat socket:', e);
                }
            }
            
            // Перенаправляем на главную страницу
        window.location.href = '/';
        }
    }
    
    function copyInviteLink() {
        const input = document.getElementById('invite-link-input');
        if (input) {
            input.select();
            input.setSelectionRange(0, 99999);
            document.execCommand('copy');
        }
    }
    
    // Attach event listeners
    function attachEventListeners() {
        console.log('[Events] Attaching event listeners...');
        
        const chatToggleBtn = document.getElementById('chat-toggle-btn');
        if (chatToggleBtn) {
            console.log('[Events] Chat toggle button found, attaching listener');
            
            // Remove old listeners by cloning
            const newChatBtn = chatToggleBtn.cloneNode(true);
            chatToggleBtn.parentNode.replaceChild(newChatBtn, chatToggleBtn);
            
            // Update the ID reference
            const btnId = 'chat-toggle-btn';
            
            // Attach click handler
            newChatBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Events] Chat toggle button clicked!');
                console.log('[Events] Current showChat state:', state.showChat);
                toggleChat();
                console.log('[Events] After toggle, showChat state:', state.showChat);
                return false;
            }, true); // Use capture phase
            
            // Also attach mousedown for better compatibility
            newChatBtn.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Events] Chat toggle button mousedown');
                return false;
            }, true);
            
            // Ensure pointer events are enabled
            newChatBtn.style.pointerEvents = 'auto';
            newChatBtn.style.cursor = 'pointer';
            newChatBtn.style.zIndex = '1001';
            newChatBtn.style.position = 'relative';
            
            console.log('[Events] Chat toggle button listeners attached, pointer-events:', newChatBtn.style.pointerEvents);
        } else {
            console.error('[Events] Chat toggle button NOT FOUND!');
        }
        
        // Close chat button removed - chat closes by clicking toggle button again
        
        const micBtn = document.getElementById('toggle-mic-btn');
        if (micBtn) {
            console.log('[Events] Mic button found, attaching listener');
            micBtn.addEventListener('click', toggleMic);
        } else {
            console.error('[Events] Mic button NOT FOUND!');
        }
        
        const cameraBtn = document.getElementById('toggle-camera-btn');
        if (cameraBtn) {
            console.log('[Events] Camera button found, attaching listener');
            cameraBtn.addEventListener('click', toggleCamera);
        } else {
            console.error('[Events] Camera button NOT FOUND!');
        }
        
        const screenShareBtn = document.getElementById('toggle-screen-share-btn');
        if (screenShareBtn) {
            console.log('[Events] Screen share button found, attaching listener');
            screenShareBtn.addEventListener('click', toggleScreenShare);
        } else {
            console.error('[Events] Screen share button NOT FOUND!');
        }
        
        const leaveBtn = document.getElementById('leave-room-btn');
        if (leaveBtn) {
            console.log('[Events] Leave button found, attaching listener');
            leaveBtn.addEventListener('click', leaveRoom);
        } else {
            console.error('[Events] Leave button NOT FOUND!');
        }
        
        const copyBtn = document.getElementById('copy-invite-btn');
        if (copyBtn) {
            console.log('[Events] Copy button found, attaching listener');
            copyBtn.addEventListener('click', copyInviteLink);
        } else {
            console.error('[Events] Copy button NOT FOUND!');
        }
        
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            console.log('[Events] Chat input found, attaching listener');
            chatInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        } else {
            console.error('[Events] Chat input NOT FOUND!');
        }
        
        const sendBtn = document.getElementById('send-message-btn');
        if (sendBtn) {
            console.log('[Events] Send button found, attaching listener');
            sendBtn.addEventListener('click', sendMessage);
        } else {
            console.error('[Events] Send button NOT FOUND!');
        }
        
        console.log('[Events] Event listeners attached');
    }
    
    // Attach listeners immediately
    attachEventListeners();
    
    // Обработчик закрытия вкладки/окна - отправляем user-left
    window.addEventListener('beforeunload', () => {
        if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
            try {
                // Используем sendBeacon для надежной отправки при закрытии
                const message = JSON.stringify({
                    type: 'user-left',
                    uid: state.uid,
                    room: state.roomName
                });
                // WebSocket не поддерживает sendBeacon, но можем попробовать синхронную отправку
                state.videoSocket.send(message);
            } catch (error) {
                console.error('[BeforeUnload] Error sending user-left:', error);
            }
        }
    });
    
    // Обработчик закрытия страницы
    window.addEventListener('unload', () => {
        if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
            try {
                const message = JSON.stringify({
                    type: 'user-left',
                    uid: state.uid,
                    room: state.roomName
                });
                state.videoSocket.send(message);
            } catch (error) {
                // Игнорируем ошибки при закрытии
            }
        }
    });
    
    // Initialize
    console.log('[App] Starting room initialization...');
    initializeRoom().then(() => {
        console.log('[App] Room initialization completed');
    }).catch(err => {
        console.error('[App] Room initialization error:', err);
    });
    
    // Mark that app is initialized
    window.__VUE_APP_MOUNTED__ = true;
    console.log('[App] App initialized successfully');
    
    // Re-attach listeners after a short delay to ensure DOM is ready
    setTimeout(() => {
        console.log('[App] Re-attaching event listeners after delay...');
        attachEventListeners();
    }, 500);
}

// Initialize when DOM is ready
console.log('[App] Script loaded, document ready state:', document.readyState);

function tryInitApp(retries = 10) {
    const appElement = document.getElementById('app');
    if (appElement && appElement.innerHTML.trim().length > 0) {
        console.log('[App] #app element found with content, initializing...');
        initApp();
    } else if (retries > 0) {
        console.log(`[App] #app element not ready, retrying... (${retries} attempts left)`);
        setTimeout(() => tryInitApp(retries - 1), 100);
    } else {
        console.error('[App] Failed to find #app element after multiple attempts');
        initApp();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        tryInitApp();
    });
} else {
    tryInitApp();
}

