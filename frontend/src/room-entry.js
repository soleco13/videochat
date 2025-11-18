// Entry point for room.html (Django template with existing HTML)
// This file uses plain JavaScript to preserve DOM structure

// NOTE: CSS files are loaded via <link> tags in room.html template
// We don't import them here to avoid duplication and conflicts
// Vite will still process them if needed, but they're loaded separately

// Import Whiteboard Manager
import { WhiteboardManager } from './whiteboard.js';

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
        isProcessingQueue: false
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
                            
                            // Запускаем воспроизведение только если видео приостановлено или еще не загружено
                            // Для локального видео всегда пытаемся запустить при включении камеры
                            const shouldPlay = (shouldUpdate && (video.paused || video.readyState < 2)) || 
                                             (isLocal && shouldShowVideo && video.paused);
                            
                            if (shouldPlay) {
                                const loaderForPlay = !isLocal ? videoContainer.querySelector('.video-loader') : null;
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
                            }
                        }
                        
                        delete state.videoUpdateTimers[uid];
                    }, 150); // Дебаунс 150ms
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
        
        // Синхронизируем состояние с реальным состоянием треков, если стрим доступен
        if (state.localStream) {
            const audioTracks = state.localStream.getAudioTracks();
            const videoTracks = state.localStream.getVideoTracks();
            
            if (audioTracks.length > 0) {
                state.isAudioEnabled = audioTracks[0].enabled;
            }
            
            if (videoTracks.length > 0) {
                state.isVideoEnabled = videoTracks[0].enabled;
            }
        }
        
        if (micBtn) {
            // active = включено (нет перечеркивания), не active = выключено (есть перечеркивание)
            micBtn.classList.toggle('active', state.isAudioEnabled);
            console.log('[Controls] Mic button active:', state.isAudioEnabled, 'state.isAudioEnabled:', state.isAudioEnabled);
        }
        if (cameraBtn) {
            // active = включено (нет перечеркивания), не active = выключено (есть перечеркивание)
            cameraBtn.classList.toggle('active', state.isVideoEnabled);
            console.log('[Controls] Camera button active:', state.isVideoEnabled, 'state.isVideoEnabled:', state.isVideoEnabled);
        }
    }
    
    // Initialize room
    async function initializeRoom() {
        console.log('[Init] Initializing room...');
        
        // Инициализируем состояние кнопок с начальными значениями
        // Они будут обновлены после получения медиа потока
        updateControlButtons();
        
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
            state.localStream = await navigator.mediaDevices.getUserMedia({
                video: state.isVideoEnabled,
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
                if (data.uid && data.uid !== state.uid) {
                    // Сохраняем имя пользователя если передано
                    if (data.name) {
                        state.userNames[data.uid] = data.name;
                        console.log('[WebRTC] User joined:', data.uid, '- name:', data.name);
                    } else {
                        console.log('[WebRTC] User joined:', data.uid, '- name not provided');
                    }
                    
                    // Обновляем отображение имени если видео уже отображается
                    const existingContainer = document.getElementById(`video-${data.uid}`);
                    if (existingContainer && data.name) {
                        const usernameWrapper = existingContainer.querySelector('.username-wrapper');
                        if (usernameWrapper) {
                            usernameWrapper.textContent = data.name;
                            console.log(`[WebRTC] Updated display name for ${data.uid} to: ${data.name}`);
                        }
                    }
                    
                    // Если соединение уже существует, пропускаем
                    if (state.peerConnections[data.uid]) {
                        console.log(`[WebRTC] Connection already exists for ${data.uid}, skipping`);
                        return;
                    }
                    
                    // Если offer pending, но соединения нет - возможно, предыдущий offer не был создан
                    // Очищаем флаг и создаем новый offer
                    if (state.pendingOffers.has(data.uid) && !state.peerConnections[data.uid]) {
                        console.warn(`[WebRTC] Offer pending for ${data.uid} but no connection exists, clearing flag and creating new offer`);
                        state.pendingOffers.delete(data.uid);
                        state.negotiationInProgress.delete(data.uid);
                    }
                    
                    // Проверяем, не идет ли уже переговоры
                    if (state.negotiationInProgress.has(data.uid)) {
                        console.log(`[WebRTC] Negotiation in progress for ${data.uid}, skipping duplicate user-joined`);
                        return;
                    }
                    
                    if (!state.localStream) {
                        console.error('[WebRTC] Cannot create offer - local stream not ready');
                        return;
                    }
                    
                    // НЕ устанавливаем состояние камеры по умолчанию при user-joined
                    // Состояние будет установлено только через явные сообщения camera-enabled/camera-disabled
                    // Это гарантирует, что заглушка будет показана до получения подтверждения, что камера включена
                    if (!state.userCameraStates.hasOwnProperty(data.uid)) {
                        // НЕ устанавливаем состояние - по умолчанию будет показана заглушка
                        console.log('[WebRTC] Waiting for camera state message (will show placeholder by default)');
                    } else {
                        console.log('[WebRTC] Camera state already set for', data.uid, ':', state.userCameraStates[data.uid]);
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
                                to: data.uid,  // Отправляем конкретно новому пользователю
                                room: state.roomName
                            }));
                            console.log('[WebRTC] Sent current camera state to new user', data.uid, ':', isVideoEnabled ? 'enabled' : 'disabled');
                            
                            // Отправляем состояние аудио
                            state.videoSocket.send(JSON.stringify({
                                type: isAudioEnabled ? 'audio-enabled' : 'audio-disabled',
                                from: state.uid,
                                to: data.uid,  // Отправляем конкретно новому пользователю
                                room: state.roomName
                            }));
                            console.log('[WebRTC] Sent current audio state to new user', data.uid, ':', isAudioEnabled ? 'enabled' : 'disabled');
                        }
                    }, 100);
                    
                    // Исправление race condition: проверяем еще раз перед добавлением
                    // Добавляем в очередь для последовательной обработки (стабильность при 3+ пользователях)
                    if (!state.pendingOffers.has(data.uid) && 
                        !state.peerConnections[data.uid] && 
                        !state.negotiationInProgress.has(data.uid)) {
                        console.log(`[WebRTC] Queueing offer creation for new user: ${data.uid}`);
                        queueOfferCreation(data.uid);
                    } else {
                        console.log(`[WebRTC] Skipping offer creation for ${data.uid} - pending: ${state.pendingOffers.has(data.uid)}, connection: ${!!state.peerConnections[data.uid]}, negotiating: ${state.negotiationInProgress.has(data.uid)}`);
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
                
                // Небольшая задержка между соединениями для стабильности
                if (state.connectionQueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 300)); // 300ms между соединениями
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
                
                // Не закрываем соединение если оно уже установлено (connected) или в процессе установки (connecting)
                if (iceState === 'connected' || iceState === 'connecting') {
                    console.log(`[WebRTC] Connection to ${data.from} is ${iceState}, ignoring duplicate offer`);
                    state.negotiationInProgress.delete(data.from);
                    return; // Игнорируем дублирующийся offer
                }
                
                // Если соединение в состоянии, которое не позволяет принять новый offer,
                // закрываем старое соединение и создаем новое
                // НО не закрываем если ICE в процессе установки (checking, connecting)
                if (currentState === 'have-remote-offer' || currentState === 'stable') {
                    // Не закрываем если соединение активно устанавливается
                    if (iceState === 'checking' || iceState === 'connecting') {
                        console.log(`[WebRTC] Connection to ${data.from} is ${iceState}, ignoring duplicate offer`);
                        state.negotiationInProgress.delete(data.from);
                        return; // Игнорируем дублирующийся offer, даем время на установку
                    }
                    
                    console.log(`[WebRTC] Closing existing connection for ${data.from} to handle new offer (state: ${currentState}, ICE: ${iceState})`);
                    peerConnection.close();
                    delete state.peerConnections[data.from];
                    // Очищаем очередь ICE кандидатов
                    if (state.iceCandidateQueue[data.from]) {
                        delete state.iceCandidateQueue[data.from];
                    }
                    peerConnection = null;
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
                    console.log('[WebRTC] Track enabled:', track.enabled, 'readyState:', track.readyState);
                    
                    // НЕ отслеживаем изменения enabled для удаленных пользователей
                    // Состояние камеры управляется только через WebSocket сообщения
                    // Удаленный трек может менять enabled, но это не должно влиять на отображение
                    
                    track.addEventListener('ended', () => {
                        console.log('[WebRTC] Remote video track ended for:', targetUid);
                        // НЕ вызываем updateVideoDisplay для удаленных пользователей
                        // Состояние управляется только через WebSocket сообщения
                    });
                    
                    // НЕ обрабатываем mute/unmute для удаленных пользователей
                    // Состояние камеры управляется только через WebSocket сообщения
                    track.addEventListener('mute', () => {
                        console.log('[WebRTC] Remote video track muted for:', targetUid, '(ignored - state managed via WebSocket)');
                    });
                    
                    track.addEventListener('unmute', () => {
                        console.log('[WebRTC] Remote video track unmuted for:', targetUid, '(ignored - state managed via WebSocket)');
                    });
                });
                
                // Проверяем наличие активных видео треков
                const hasActiveVideo = videoTracks.length > 0 && videoTracks.some(t => t.enabled && t.readyState === 'live');
                console.log('[WebRTC] Has active video:', hasActiveVideo);
                console.log('[WebRTC] Current camera state for', targetUid, ':', state.userCameraStates.hasOwnProperty(targetUid) ? state.userCameraStates[targetUid] : 'not set');
                
                // НЕ устанавливаем состояние камеры по умолчанию при получении стрима
                // Если состояние не установлено, показываем видео если трек активен
                // Состояние будет установлено через WebSocket сообщения
                const cameraStateSet = state.userCameraStates.hasOwnProperty(targetUid);
                if (!cameraStateSet) {
                    // Если состояние не установлено, используем состояние трека как временное
                    // Это позволит показать видео, если трек активен, до получения явного сообщения
                    console.log('[WebRTC] Camera state not set for', targetUid, '- will use track state temporarily:', hasActiveVideo);
                }
                
                addVideoStream(targetUid, remoteStream, false);
                
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
                        
                        // Если состояние установлено как enabled ИЛИ не установлено но трек активен
                        if (currentCameraState === true || (!currentCameraState && hasActiveVideo)) {
                            if (video) {
                                // Убеждаемся, что srcObject установлен
                                if (video.srcObject !== remoteStream) {
                                    video.srcObject = remoteStream;
                                }
                                // Убеждаемся, что аудио не приглушено
                                video.muted = false;
                                video.style.display = 'block';
                                video.style.zIndex = '2';
                                // Проверяем, что элемент все еще в DOM перед воспроизведением
                                if (video.isConnected) {
                                    // НЕ добавляем задержку - пусть видео загружается естественно
                                    // Лоадер скроется автоматически в onloadeddata/oncanplay когда данные загрузятся
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
                                    
                                    // Запускаем воспроизведение только если видео приостановлено
                                    if (existingVideo.paused) {
                                        state.videoPlayPromises[uid] = existingVideo.play().catch(err => {
                                            // Игнорируем AbortError - это нормально, если видео было удалено или приостановлено
                                            if (err.name !== 'AbortError') {
                                                console.error('[Video] Error playing existing video:', err);
                                            }
                                        });
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
            return;
        }
        
        state.displayedVideos.add(uid);
        state.connectedUsers.add(uid);
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video-${uid}`;
        videoContainer.style.position = 'relative';
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = isLocal; // Только локальное видео должно быть приглушено
        video.setAttribute('playsinline', 'true');
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
            // Просто пытаемся воспроизвести видео
            // НЕ добавляем задержку - пусть видео загружается естественно
            // Лоадер скроется автоматически в onloadeddata/oncanplay когда данные загрузятся
            video.play().catch(err => {
                console.error('Error playing video:', err);
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
    
    function removeVideoStream(uid) {
        const videoContainer = document.getElementById(`video-${uid}`);
        if (videoContainer) {
            videoContainer.remove();
        }
        
        stopAudioDetection(uid);
        
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
    let lastLayoutCount = -1;
    
    function updateVideoLayout() {
        // Отменяем предыдущий таймер, если он есть
        if (layoutUpdateTimer) {
            clearTimeout(layoutUpdateTimer);
        }
        
        // Используем requestAnimationFrame для оптимизации рендеринга
        layoutUpdateTimer = requestAnimationFrame(() => {
            const videoStreams = domCache.getVideoStreams();
        if (!videoStreams) {
            console.error('[Layout] video-streams element not found!');
            return;
        }
        
        const count = state.displayedVideos.size;
            
            // Оптимизация: обновляем только если количество изменилось
            if (count === lastLayoutCount) {
                return;
            }
            lastLayoutCount = count;
            
        console.log('[Layout] Updating video layout for', count, 'users');
        
            // Оптимизация: используем classList для более эффективного обновления
        videoStreams.className = 'video-streams';
        
        if (count === 1) {
            videoStreams.classList.add('single-user');
        } else if (count === 2) {
            videoStreams.classList.add('two-users');
        } else if (count <= 4) {
            videoStreams.classList.add('multiple-users');
        } else {
            videoStreams.classList.add('many-users');
        }
        
        // Скрывать хедер на мобильных устройствах при большом количестве пользователей
            const roomHeader = domCache.getRoomHeader();
        if (roomHeader) {
            const isMobile = window.innerWidth <= 768;
            const isTablet = window.innerWidth <= 1024;
            
            if (isMobile && count > 2) {
                roomHeader.classList.add('hidden');
            } else if (isTablet && count > 3) {
                roomHeader.classList.add('hidden');
            } else {
                roomHeader.classList.remove('hidden');
            }
        }
        
        console.log('[Layout] Video layout updated, classes:', videoStreams.className);
        });
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
    
    function toggleMic() {
        if (state.localStream) {
            const audioTracks = state.localStream.getAudioTracks();
            if (audioTracks.length === 0) {
                console.warn('[Controls] No audio tracks available');
                return;
            }
            
            // Переключаем состояние всех аудио треков
            const newState = !audioTracks[0].enabled;
            audioTracks.forEach(track => {
                track.enabled = newState;
            });
            state.isAudioEnabled = newState;
            updateControlButtons();
            console.log('[Controls] Microphone toggled, enabled:', state.isAudioEnabled);
            
            // Отправляем сообщение другим пользователям о состоянии аудио
            if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                state.videoSocket.send(JSON.stringify({
                    type: state.isAudioEnabled ? 'audio-enabled' : 'audio-disabled',
                    from: state.uid,
                    room: state.roomName
                }));
                console.log('[Controls] Sent audio state to other users:', state.isAudioEnabled ? 'enabled' : 'disabled');
            }
        }
    }
    
    async function toggleCamera() {
        const videoTracks = state.localStream ? state.localStream.getVideoTracks() : [];
        const newState = videoTracks.length === 0 || !videoTracks[0].enabled;
        
        // Если включаем камеру и трек в состоянии "ended" или его нет, получаем новый поток
        if (newState && (videoTracks.length === 0 || videoTracks[0].readyState === 'ended')) {
            try {
                // Останавливаем старые треки если есть
                if (state.localStream) {
                    const oldVideoTracks = state.localStream.getVideoTracks();
                    oldVideoTracks.forEach(track => track.stop());
                }
                
                // Получаем новый поток с камерой
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: state.isAudioEnabled
                });
                
                // Заменяем видео треки в существующем потоке
                if (state.localStream) {
                    // Удаляем старые видео треки
                    const oldVideoTracks = state.localStream.getVideoTracks();
                    oldVideoTracks.forEach(track => {
                        state.localStream.removeTrack(track);
                        track.stop();
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
                            const newVideoTrack = state.localStream.getVideoTracks()[0];
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
            // Просто переключаем состояние трека
            const newState = !videoTracks[0].enabled;
            videoTracks.forEach(track => {
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
            console.warn('[Controls] No local stream or video tracks available');
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
                            closeConnections();
                        } else {
                            // Если буфер не пуст, ждем еще немного
                            setTimeout(checkBufferAndClose, 50);
                        }
                    } else {
                        closeConnections();
                    }
                };
                
                // Даем минимальное время на отправку (50мс)
                setTimeout(checkBufferAndClose, 50);
            } catch (error) {
                console.error('[Leave] Error sending user-left message:', error);
                closeConnections();
            }
        } else {
            closeConnections();
        }
        
        function closeConnections() {
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

