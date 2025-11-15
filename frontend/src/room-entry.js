// Entry point for room.html (Django template with existing HTML)
// This file uses plain JavaScript to preserve DOM structure

// NOTE: CSS files are loaded via <link> tags in room.html template
// We don't import them here to avoid duplication and conflicts
// Vite will still process them if needed, but they're loaded separately

// Wait for DOM to be ready
function initApp() {
    console.log('[App] Initializing app...');
    
    const appElement = document.getElementById('app');
    if (!appElement) {
        console.error('[App] #app element not found');
        return;
    }
    
    console.log('[App] Found #app element');
    console.log('[App] #video-streams exists:', !!document.getElementById('video-streams'));
    
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
        // Состояние камеры для каждого пользователя (по UID)
        userCameraStates: {},
        configuration: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    };
    
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
    function updateVideoDisplay(uid, stream) {
        const videoContainer = document.getElementById(`video-${uid}`);
        if (!videoContainer) {
            console.warn('[Video] Video container not found for uid:', uid);
            return;
        }
        
        const video = videoContainer.querySelector('video');
        const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
        
        // Определяем, локальный это пользователь или удаленный
        const isLocal = uid === state.uid;
        
        // Проверяем наличие видео треков и их состояние
        let hasVideo = false;
        
        // Для удаленных пользователей используем ТОЛЬКО сохраненное состояние
        // Для локальных пользователей проверяем стрим
        if (!isLocal) {
            // Удаленный пользователь - используем только сохраненное состояние
            // ВАЖНО: Если состояние не установлено, по умолчанию показываем заглушку (hasVideo = false)
            // Это предотвращает показ видео до получения явного подтверждения, что камера включена
            if (state.userCameraStates.hasOwnProperty(uid)) {
                hasVideo = state.userCameraStates[uid];
                console.log('[Video] Using saved camera state for remote user', uid, ':', hasVideo);
            } else {
                // Если нет сохраненного состояния, по умолчанию показываем заглушку
                // Это безопаснее, чем показывать видео, которое может быть черным экраном
                hasVideo = false;
                console.log('[Video] No saved state for remote user', uid, ', defaulting to placeholder (camera off) - FORCING PLACEHOLDER');
            }
            
            // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Если состояние не установлено или камера выключена,
            // принудительно устанавливаем hasVideo = false
            const cameraState = state.userCameraStates.hasOwnProperty(uid) ? state.userCameraStates[uid] : false;
            if (!cameraState) {
                hasVideo = false;
                console.log('[Video] FORCING hasVideo=false for remote user', uid, '- camera state:', cameraState);
            }
        } else {
            // Локальный пользователь - проверяем стрим
            if (stream) {
                const videoTracks = stream.getVideoTracks();
                
                // Если нет видео треков вообще - точно нет видео
                if (videoTracks.length === 0) {
                    hasVideo = false;
                } else {
                    // Проверяем, есть ли хотя бы один активный трек
                    const hasActiveTrack = videoTracks.some(t => t.enabled && t.readyState === 'live');
                    hasVideo = hasActiveTrack;
                }
            } else {
                hasVideo = false;
            }
        }
        
        console.log('[Video] updateVideoDisplay for', uid, 'hasVideo:', hasVideo, 'isLocal:', isLocal);
        
        if (hasVideo) {
            // Показываем видео, скрываем SVG
            if (video) {
                video.style.display = 'block';
                video.style.zIndex = '2';
                if (stream && video.srcObject !== stream) {
                    video.srcObject = stream;
                }
            }
            if (svgPlaceholder) {
                svgPlaceholder.style.display = 'none';
            }
        } else {
            // Скрываем видео, показываем SVG
            if (video) {
                video.style.display = 'none';
            }
            if (svgPlaceholder) {
                svgPlaceholder.style.display = 'block';
            } else {
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
        console.log('[Init] Room initialization complete');
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
        }
    }
    
    function connectToSignalingServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/video/${state.roomName}/`;
        
        state.videoSocket = new WebSocket(wsUrl);
        
        state.videoSocket.onopen = () => {
            console.log('[WebRTC] Connected to signaling server');
            state.videoSocket.send(JSON.stringify({
                type: 'join',
                uid: state.uid,
                room: state.roomName
            }));
            
            // Отправляем начальное состояние камеры
            if (state.localStream) {
                const videoTracks = state.localStream.getVideoTracks();
                const isVideoEnabled = videoTracks.length > 0 && videoTracks[0]?.enabled;
                state.videoSocket.send(JSON.stringify({
                    type: isVideoEnabled ? 'camera-enabled' : 'camera-disabled',
                    from: state.uid,
                    room: state.roomName
                }));
                console.log('[WebRTC] Sent initial camera state:', isVideoEnabled ? 'enabled' : 'disabled');
            }
            
            // Запрашиваем состояние камер всех существующих пользователей
            // Это гарантирует, что мы получим состояние камер при входе в комнату
            // Отправляем с небольшой задержкой, чтобы убедиться, что join сообщение обработано
            setTimeout(() => {
                if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                    state.videoSocket.send(JSON.stringify({
                        type: 'request-camera-states',
                        from: state.uid,
                        room: state.roomName
                    }));
                    console.log('[WebRTC] Requested camera states from all users');
                }
            }, 100);
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
            console.error('WebSocket error:', error);
        };
        
        state.videoSocket.onclose = (event) => {
            console.log('Disconnected from signaling server, code:', event.code);
            // Не переподключаемся если это нормальное закрытие (код 1000) или если мы выходим из комнаты
            if (event.code === 1000) {
                console.log('[WebRTC] Normal disconnect, not reconnecting');
                return;
            }
            setTimeout(() => {
                if (state.videoSocket && state.videoSocket.readyState === WebSocket.CLOSED) {
                    connectToSignalingServer();
                }
            }, 3000);
        };
    }
    
    function handleSignalingMessage(data) {
        if (data._target && data._target !== state.uid) {
            return;
        }
        
        switch (data.type) {
            case 'user-joined':
            case 'join':
                if (data.uid && 
                    data.uid !== state.uid && 
                    !state.peerConnections[data.uid] && 
                    !state.pendingOffers.has(data.uid)) {
                    if (!state.localStream) {
                        console.error('[WebRTC] Cannot create offer - local stream not ready');
                        return;
                    }
                    // НЕ устанавливаем состояние камеры по умолчанию при user-joined
                    // Состояние будет установлено только через явные сообщения camera-enabled/camera-disabled
                    // Это гарантирует, что заглушка будет показана до получения подтверждения, что камера включена
                    if (!state.userCameraStates.hasOwnProperty(data.uid)) {
                        // НЕ устанавливаем состояние - по умолчанию будет показана заглушка
                        console.log('[WebRTC] User joined:', data.uid, '- waiting for camera state message (will show placeholder by default)');
                    } else {
                        console.log('[WebRTC] Camera state already set for', data.uid, ':', state.userCameraStates[data.uid]);
                    }
                    
                    // Отправляем новому пользователю наше текущее состояние камеры
                    // Отправляем несколько раз с задержками для надежности
                    const sendCameraState = (delay = 0) => {
                        setTimeout(() => {
                            if (state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN && state.localStream) {
                                const videoTracks = state.localStream.getVideoTracks();
                                const isVideoEnabled = videoTracks.length > 0 && videoTracks[0]?.enabled;
                                state.videoSocket.send(JSON.stringify({
                                    type: isVideoEnabled ? 'camera-enabled' : 'camera-disabled',
                                    from: state.uid,
                                    to: data.uid,  // Отправляем конкретно новому пользователю
                                    room: state.roomName
                                }));
                                console.log('[WebRTC] Sent current camera state to new user', data.uid, ':', isVideoEnabled ? 'enabled' : 'disabled', delay ? `(delayed ${delay}ms)` : '');
                            }
                        }, delay);
                    };
                    
                    // Отправляем сразу и с задержками для надежности
                    sendCameraState(0);
                    sendCameraState(100);
                    sendCameraState(300);
                    sendCameraState(500);
                    
                    state.pendingOffers.add(data.uid);
                    createOffer(data.uid).catch(error => {
                        console.error('[WebRTC] Error creating offer:', error);
                        state.pendingOffers.delete(data.uid);
                    });
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
                
                // Удаляем сохраненное состояние камеры
                if (state.userCameraStates && state.userCameraStates[leftUid]) {
                    delete state.userCameraStates[leftUid];
                }
                
                // Удаляем из всех структур данных
                state.displayedVideos.delete(leftUid);
                state.connectedUsers.delete(leftUid);
                
                // Немедленно удаляем видео контейнер
                const videoContainer = document.getElementById(`video-${leftUid}`);
                if (videoContainer) {
                    videoContainer.remove();
                    console.log('[WebRTC] Removed video container for user:', leftUid);
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
                    state.peerConnections[leftUid].close();
                    delete state.peerConnections[leftUid];
                }
                
                // Очищаем очередь ICE кандидатов
                if (state.iceCandidateQueue[leftUid]) {
                    delete state.iceCandidateQueue[leftUid];
                }
                
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
                console.log('[Camera] User', data.from, 'disabled camera');
                const remoteUidCameraOff = data.from;
                
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
                console.log('[Camera] User', data.from, 'enabled camera');
                const remoteUidCameraOn = data.from;
                
                // Сохраняем состояние камеры (важно сделать это ДО проверки контейнера)
                state.userCameraStates[remoteUidCameraOn] = true;
                console.log('[Camera] Saved camera state for', remoteUidCameraOn, 'as enabled');
                
                // Принудительно обновляем отображение независимо от того, есть ли стрим
                const videoContainerCameraOn = document.getElementById(`video-${remoteUidCameraOn}`);
                if (videoContainerCameraOn) {
                    const video = videoContainerCameraOn.querySelector('video');
                    const svgPlaceholder = videoContainerCameraOn.querySelector('.no-cam-placeholder');
                    
                    if (video) {
                        video.style.display = 'block';
                        video.style.zIndex = '2';
                    }
                    
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'none';
                    }
                    
                    console.log('[Camera] Showed video for user:', remoteUidCameraOn);
                }
                
                // Также обновляем через функцию для полной синхронизации, если стрим есть
                const remoteStreamCameraOn = state.remoteStreams && state.remoteStreams[remoteUidCameraOn];
                if (remoteStreamCameraOn) {
                    // Используем setTimeout для гарантии, что DOM обновлен
                    setTimeout(() => {
                        updateVideoDisplay(remoteUidCameraOn, remoteStreamCameraOn);
                    }, 100);
                } else {
                    // Стрим еще не получен - состояние сохранено, будет использовано при получении стрима
                    console.log('[Camera] Stream not found for user:', remoteUidCameraOn, '- state saved, will be applied when stream is received');
                }
                break;
        }
    }
    
    async function createOffer(targetUid) {
        try {
            if (!state.localStream) {
                state.pendingOffers.delete(targetUid);
                return;
            }
            
            const peerConnection = createPeerConnection(targetUid);
            state.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, state.localStream);
            });
            
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            state.videoSocket.send(JSON.stringify({
                type: 'offer',
                offer: offer,
                from: state.uid,
                to: targetUid
            }));
            
            setTimeout(() => {
                state.pendingOffers.delete(targetUid);
            }, 5000);
        } catch (error) {
            console.error('Error creating offer:', error);
            state.pendingOffers.delete(targetUid);
        }
    }
    
    async function handleOffer(data) {
        try {
            const peerConnection = createPeerConnection(data.from);
            
            if (state.localStream) {
                state.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, state.localStream);
                });
            }
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            await processIceCandidateQueue(data.from);
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            state.videoSocket.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                from: state.uid,
                to: data.from
            }));
        } catch (error) {
            console.error('[WebRTC] Error handling offer:', error);
        }
    }
    
    async function handleAnswer(data) {
        const peerConnection = state.peerConnections[data.from];
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                await processIceCandidateQueue(data.from);
            } catch (error) {
                console.error('[WebRTC] Error setting remote answer:', error);
            }
        }
    }
    
    async function handleIceCandidate(data) {
        const peerConnection = state.peerConnections[data.from];
        if (!peerConnection) return;
        
        if (!state.iceCandidateQueue[data.from]) {
            state.iceCandidateQueue[data.from] = [];
        }
        
        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                state.iceCandidateQueue[data.from].push(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('[WebRTC] Error adding ICE candidate:', error);
            state.iceCandidateQueue[data.from].push(new RTCIceCandidate(data.candidate));
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
        
        const peerConnection = new RTCPeerConnection(state.configuration);
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && state.videoSocket && state.videoSocket.readyState === WebSocket.OPEN) {
                state.videoSocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    from: state.uid,
                    to: targetUid
                }));
            }
        };
        
        peerConnection.ontrack = (event) => {
            const remoteStream = event.streams[0];
            if (remoteStream) {
                console.log('[WebRTC] Received remote stream for:', targetUid);
                const videoTracks = remoteStream.getVideoTracks();
                console.log('[WebRTC] Video tracks count:', videoTracks.length);
                
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
                
                // Если нет активных видео треков, сразу показываем SVG
                const hasActiveVideo = videoTracks.length > 0 && videoTracks.some(t => t.enabled && t.readyState === 'live');
                console.log('[WebRTC] Has active video:', hasActiveVideo);
                console.log('[WebRTC] Current camera state for', targetUid, ':', state.userCameraStates.hasOwnProperty(targetUid) ? state.userCameraStates[targetUid] : 'not set (will show placeholder)');
                
                // ПРИНУДИТЕЛЬНО устанавливаем состояние камеры как false, если оно не установлено
                // Это гарантирует, что заглушка будет показана до получения подтверждения
                if (!state.userCameraStates.hasOwnProperty(targetUid)) {
                    state.userCameraStates[targetUid] = false;
                    console.log('[WebRTC] Set default camera state to false for', targetUid, '- will show placeholder until camera-enabled message received');
                }
                
                addVideoStream(targetUid, remoteStream, false);
                
                // Дополнительная проверка после добавления стрима
                // Если состояние камеры не установлено или камера выключена, принудительно показываем заглушку
                // Используем несколько проверок с разными задержками для надежности
                [0, 50, 100, 200, 500].forEach(delay => {
                    setTimeout(() => {
                        const cameraState = state.userCameraStates.hasOwnProperty(targetUid) ? state.userCameraStates[targetUid] : false;
                        if (!cameraState) {
                            const videoContainer = document.getElementById(`video-${targetUid}`);
                            if (videoContainer) {
                                const video = videoContainer.querySelector('video');
                                const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                                if (video && video.style.display !== 'none') {
                                    console.log('[WebRTC] Forcing placeholder for', targetUid, '- camera state:', cameraState, 'delay:', delay);
                                    video.style.display = 'none';
                                    video.pause();
                                }
                                if (svgPlaceholder && svgPlaceholder.style.display === 'none') {
                                    svgPlaceholder.style.display = 'block';
                                    console.log('[WebRTC] Showing placeholder for', targetUid, 'delay:', delay);
                                }
                            }
                        }
                    }, delay);
                });
                
                // updateVideoDisplay вызывается внутри addVideoStream
                // Для удаленных пользователей используется сохраненное состояние из WebSocket сообщений
            }
        };
        
        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
                setTimeout(() => {
                    if (state.peerConnections[targetUid] && 
                        (state.peerConnections[targetUid].connectionState === 'failed' || 
                         state.peerConnections[targetUid].connectionState === 'disconnected')) {
                        removeVideoStream(targetUid);
                        if (!state.pendingOffers.has(targetUid)) {
                            state.pendingOffers.add(targetUid);
                            createOffer(targetUid);
                        }
                    }
                }, 2000);
            }
        };
        
        state.peerConnections[targetUid] = peerConnection;
        return peerConnection;
    }
    
    function addVideoStream(uid, stream, isLocal) {
        console.log('[Video] Adding video stream for:', uid, 'isLocal:', isLocal);
        
        if (state.displayedVideos.has(uid)) {
            console.log('[Video] Video stream already displayed, updating...');
            const existingVideo = document.querySelector(`#video-${uid} video`);
            if (existingVideo && existingVideo.srcObject !== stream) {
                existingVideo.srcObject = stream;
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
        video.muted = isLocal;
        video.setAttribute('playsinline', 'true');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.zIndex = '2';
        
        // Для удаленных пользователей: если состояние камеры не установлено или камера выключена,
        // скрываем видео с самого начала
        if (!isLocal) {
            const cameraState = state.userCameraStates.hasOwnProperty(uid) ? state.userCameraStates[uid] : false;
            if (!cameraState) {
                video.style.display = 'none';
                console.log('[Video] Hiding video for remote user', uid, '- camera state not set or disabled');
            }
        }
        
        // Базовая инициализация видео - без автоматических проверок состояния
        // Состояние камеры управляется только через WebSocket сообщения
        video.onloadedmetadata = () => {
            console.log('[Video] Video metadata loaded for:', uid);
            // Для удаленных пользователей: проверяем состояние камеры перед воспроизведением
            if (!isLocal) {
                const cameraState = state.userCameraStates.hasOwnProperty(uid) ? state.userCameraStates[uid] : false;
                if (!cameraState) {
                    // Камера выключена - не воспроизводим видео, показываем заглушку
                    console.log('[Video] Camera disabled for remote user', uid, '- not playing video, showing placeholder');
                    video.style.display = 'none';
                    const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'block';
                    }
                    return;
                }
            }
            // Просто пытаемся воспроизвести видео
            video.play().catch(err => {
                console.error('Error playing video:', err);
            });
        };
        
        video.onplay = () => {
            console.log('[Video] Video started playing for:', uid);
            // Для удаленных пользователей: проверяем состояние камеры при воспроизведении
            if (!isLocal) {
                const cameraState = state.userCameraStates.hasOwnProperty(uid) ? state.userCameraStates[uid] : false;
                if (!cameraState) {
                    // Камера выключена - останавливаем воспроизведение и показываем заглушку
                    console.log('[Video] Camera disabled for remote user', uid, '- stopping video playback, showing placeholder');
                    video.pause();
                    video.style.display = 'none';
                    const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'block';
                    }
                }
            }
        };
        
        video.onerror = (error) => {
            console.error('[Video] Video error for:', uid, error);
        };
        
        const usernameWrapper = document.createElement('div');
        usernameWrapper.className = 'username-wrapper';
        usernameWrapper.textContent = isLocal ? state.userName : `User ${uid.substring(0, 6)}`;
        
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
        
        // Для удаленных пользователей: если состояние камеры не установлено или камера выключена,
        // показываем заглушку сразу
        if (!isLocal) {
            const cameraState = state.userCameraStates.hasOwnProperty(uid) ? state.userCameraStates[uid] : false;
            if (!cameraState) {
                placeholder.style.display = 'block';
                console.log('[Video] Showing placeholder immediately for remote user', uid, '- camera state:', cameraState);
            } else {
                placeholder.style.display = 'none';
            }
        } else {
            placeholder.style.display = 'none';
        }
        
        videoContainer.appendChild(placeholder);
        
        const videoStreams = document.getElementById('video-streams');
        if (videoStreams) {
            console.log('[Video] Adding video container to DOM');
            videoStreams.appendChild(videoContainer);
            
            // Обновляем отображение в зависимости от состояния камеры
            // Для удаленных пользователей используем только сохраненное состояние
            updateVideoDisplay(uid, stream);
            
            // Для удаленных пользователей: если сохраненное состояние говорит, что камера выключена,
            // ИЛИ состояние еще не установлено (по умолчанию показываем заглушку),
            // убеждаемся, что заглушка видна сразу
            if (!isLocal) {
                const cameraState = state.userCameraStates.hasOwnProperty(uid) ? state.userCameraStates[uid] : false;
                console.log('[Video] Checking camera state for remote user', uid, ':', cameraState, 'hasOwnProperty:', state.userCameraStates.hasOwnProperty(uid));
                if (!cameraState) {
                    const videoEl = videoContainer.querySelector('video');
                    const svgPlaceholder = videoContainer.querySelector('.no-cam-placeholder');
                    console.log('[Video] FORCING placeholder - video display:', videoEl?.style.display, 'placeholder display:', svgPlaceholder?.style.display);
                    if (videoEl) {
                        videoEl.style.display = 'none';
                        videoEl.pause();
                    }
                    if (svgPlaceholder) {
                        svgPlaceholder.style.display = 'block';
                    }
                    console.log('[Video] Ensured SVG placeholder is visible for remote user', uid, '- camera state:', state.userCameraStates.hasOwnProperty(uid) ? 'disabled' : 'not set (defaulting to placeholder)');
                    
                    // Дополнительная проверка через небольшую задержку
                    setTimeout(() => {
                        const videoEl2 = videoContainer.querySelector('video');
                        const svgPlaceholder2 = videoContainer.querySelector('.no-cam-placeholder');
                        if (videoEl2 && videoEl2.style.display !== 'none') {
                            console.log('[Video] FORCING placeholder again after delay - video was visible!');
                            videoEl2.style.display = 'none';
                            videoEl2.pause();
                        }
                        if (svgPlaceholder2 && svgPlaceholder2.style.display === 'none') {
                            console.log('[Video] FORCING placeholder again after delay - placeholder was hidden!');
                            svgPlaceholder2.style.display = 'block';
                        }
                    }, 100);
                }
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
                
                // Для активного состояния отправляем сразу
                // Для неактивного - с небольшой задержкой (чтобы не мигать при паузах)
                const delay = isActive ? 0 : 300;
                
                state.micActivityThrottle = setTimeout(() => {
                    state.videoSocket.send(JSON.stringify({
                        type: isActive ? 'mic-active' : 'mic-inactive',
                        from: state.uid,
                        room: state.roomName
                    }));
                    state.lastMicActivityState = isActive;
                    console.log('[MicActivity] Sent mic activity state:', isActive ? 'active' : 'inactive');
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
    
    function updateVideoLayout() {
        const videoStreams = document.getElementById('video-streams');
        if (!videoStreams) {
            console.error('[Layout] video-streams element not found!');
            return;
        }
        
        const count = state.displayedVideos.size;
        console.log('[Layout] Updating video layout for', count, 'users');
        
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
        const roomHeader = document.querySelector('.room-header');
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
    }
    
    // Обновлять видимость хедера при изменении размера окна
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            updateVideoLayout();
        }, 100);
    });
    
    // Chat functions
    function initializeChat() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/chat/${state.roomName}/`;
        
        state.chatSocket = new WebSocket(wsUrl);
        
        state.chatSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            state.messages.push(data);
            updateMessages();
            
            if (!state.showChat && data.user_name !== state.userName) {
                state.unreadCount++;
                updateUnreadCount();
            }
        };
        
        state.chatSocket.onerror = (error) => {
            console.error('Chat WebSocket error:', error);
        };
    }
    
    function sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !input.value.trim()) return;
        
        if (state.chatSocket && state.chatSocket.readyState === WebSocket.OPEN) {
            state.chatSocket.send(JSON.stringify({
                message: input.value,
                user_name: state.userName
            }));
            input.value = '';
        }
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
            audioTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            state.isAudioEnabled = audioTracks[0]?.enabled ?? false;
            updateControlButtons();
            console.log('[Controls] Microphone toggled, enabled:', state.isAudioEnabled);
        }
    }
    
    function toggleCamera() {
        if (state.localStream) {
            const videoTracks = state.localStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            state.isVideoEnabled = videoTracks[0]?.enabled ?? false;
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
        }
    }
    
    function leaveRoom() {
        console.log('[Leave] User leaving room, UID:', state.uid);
        
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
