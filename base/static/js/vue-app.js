// Vue.js Application for Video Chat and Chat
import { createApp } from 'vue'

const app = createApp({
    data() {
        return {
            roomName: '',
            roomId: '',
            inviteUrl: '',
            userName: sessionStorage.getItem('name') || 'Guest',
            uid: sessionStorage.getItem('UID') || this.generateUID(),
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
            configuration: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        };
    },
    mounted() {
        this.initializeRoom();
    },
    methods: {
        generateUID() {
            const uid = Math.random().toString(36).substring(7);
            sessionStorage.setItem('UID', uid);
            return uid;
        },
        
        async initializeRoom() {
            // Get room name from Django template
            const roomNameEl = document.getElementById('room-name');
            if (roomNameEl) {
                this.roomName = JSON.parse(roomNameEl.textContent);
            } else {
                this.roomName = sessionStorage.getItem('room') || 'DEFAULT';
            }
            
            // Get invite URL from Django template if available
            const inviteUrlEl = document.getElementById('invite-url');
            if (inviteUrlEl) {
                this.inviteUrl = JSON.parse(inviteUrlEl.textContent);
            }
            
            // Get room ID from Django template if available
            const roomIdEl = document.getElementById('room-id');
            if (roomIdEl) {
                this.roomId = JSON.parse(roomIdEl.textContent);
            }
            
            console.log('[Vue] Initializing room:', this.roomName, 'ID:', this.roomId);
            
            // Initialize WebRTC WebSocket
            this.initVideoWebSocket();
            
            // Initialize Chat WebSocket
            this.initChatWebSocket();
            
            // Get user media
            await this.getUserMedia();
            
            // Join room
            await this.joinRoom();
        },
        
        copyInviteLink() {
            if (this.inviteUrl && this.$refs.inviteLinkInput) {
                this.$refs.inviteLinkInput.select();
                this.$refs.inviteLinkInput.setSelectionRange(0, 99999);
                document.execCommand('copy');
                
                // Show feedback
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.backgroundColor = '#4CAF50';
                
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.backgroundColor = '';
                }, 2000);
            }
        },
        
        initVideoWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/video/${this.roomName}/`;
            
            console.log('[Vue] Connecting to video WebSocket:', wsUrl);
            
            this.videoSocket = new WebSocket(wsUrl);
            
            this.videoSocket.onopen = () => {
                console.log('[Vue] Video WebSocket connected');
            };
            
            this.videoSocket.onmessage = async (event) => {
                const message = JSON.parse(event.data);
                await this.handleSignalingMessage(message);
            };
            
            this.videoSocket.onerror = (error) => {
                console.error('[Vue] Video WebSocket error:', error);
            };
            
            this.videoSocket.onclose = () => {
                console.log('[Vue] Video WebSocket disconnected');
            };
        },
        
        initChatWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/chat/${this.roomName}/`;
            
            console.log('[Vue] Connecting to chat WebSocket:', wsUrl);
            
            this.chatSocket = new WebSocket(wsUrl);
            
            this.chatSocket.onopen = () => {
                console.log('[Vue] Chat WebSocket connected');
            };
            
            this.chatSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.messages.push({
                    user_name: data.user_name,
                    message: data.message
                });
                this.scrollChatToBottom();
                
                // Update unread count if chat is closed
                if (!this.showChat && data.user_name !== this.userName) {
                    this.unreadCount++;
                }
            };
            
            this.chatSocket.onerror = (error) => {
                console.error('[Vue] Chat WebSocket error:', error);
            };
            
            this.chatSocket.onclose = () => {
                console.log('[Vue] Chat WebSocket disconnected');
            };
        },
        
        async getUserMedia() {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 1280, height: 720 },
                    audio: true
                });
                
                this.displayLocalVideo();
                console.log('[Vue] Media access granted');
            } catch (error) {
                console.error('[Vue] Error accessing media:', error);
                alert('Не удалось получить доступ к камере/микрофону. Проверьте разрешения.');
            }
        },
        
        displayLocalVideo() {
            const videoContainer = document.getElementById('video-streams');
            if (!videoContainer) return;
            
            const localPlayer = `
                <div class="video-container" id="user-container-local">
                    <video class="video-player" id="local-video" autoplay muted playsinline></video>
                    <div class="username-wrapper">
                        <span class="user-name">${this.userName} (You)</span>
                    </div>
                </div>
            `;
            videoContainer.insertAdjacentHTML('beforeend', localPlayer);
            
            const video = document.getElementById('local-video');
            if (video) {
                video.srcObject = this.localStream;
            }
        },
        
        async joinRoom() {
            // Create member in database
            await this.createMember();
            
            // Get existing members
            try {
                const response = await fetch(`/get_room_members/?room_name=${this.roomName}`);
                const data = await response.json();
                
                if (data.members && data.members.length > 0) {
                    setTimeout(async () => {
                        for (const member of data.members) {
                            if (member.uid !== this.uid && !this.peerConnections[member.uid]) {
                                this.connectedUsers.add(member.uid);
                                await this.createOffer(member.uid);
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                        }
                    }, 500);
                }
            } catch (error) {
                console.error('[Vue] Error getting room members:', error);
            }
            
            // Notify others
            this.sendSignalingMessage({
                type: 'user-joined',
                from: this.uid
            });
        },
        
        async handleSignalingMessage(message) {
            // Filter messages by target
            if (message._target && message._target !== this.uid) {
                return;
            }
            if (message.to && message.to !== this.uid && message.type !== 'user-joined' && message.type !== 'user-left') {
                return;
            }
            
            switch (message.type) {
                case 'offer':
                    if (!this.peerConnections[message.from]) {
                        await this.handleOffer(message);
                    }
                    break;
                case 'answer':
                    await this.handleAnswer(message);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(message);
                    break;
                case 'user-joined':
                    if (message.from && message.from !== this.uid && !this.peerConnections[message.from]) {
                        this.connectedUsers.add(message.from);
                        await this.createOffer(message.from);
                    }
                    break;
                case 'user-left':
                    this.handleUserLeft(message.from);
                    break;
            }
        },
        
        createPeerConnection(userId) {
            const peerConnection = new RTCPeerConnection(this.configuration);
            
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
            }
            
            let trackReceived = false;
            peerConnection.ontrack = (event) => {
                if (trackReceived) return;
                trackReceived = true;
                
                const remoteStream = event.streams[0];
                if (remoteStream) {
                    this.displayRemoteVideo(userId, remoteStream);
                }
            };
            
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingMessage({
                        type: 'ice-candidate',
                        candidate: event.candidate,
                        to: userId,
                        from: this.uid
                    });
                }
            };
            
            peerConnection.oniceconnectionstatechange = () => {
                const state = peerConnection.iceConnectionState;
                if (state === 'failed') {
                    try {
                        peerConnection.restartIce();
                    } catch (error) {
                        console.error('[Vue] Error restarting ICE:', error);
                    }
                }
            };
            
            return peerConnection;
        },
        
        async createOffer(userId) {
            if (this.peerConnections[userId]) {
                return;
            }
            
            this.peerConnections[userId] = null; // Placeholder
            
            const peerConnection = this.createPeerConnection(userId);
            this.peerConnections[userId] = peerConnection;
            
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                this.sendSignalingMessage({
                    type: 'offer',
                    offer: offer,
                    to: userId,
                    from: this.uid
                });
            } catch (error) {
                console.error('[Vue] Error creating offer:', error);
                if (this.peerConnections[userId]) {
                    this.peerConnections[userId].close();
                    delete this.peerConnections[userId];
                }
            }
        },
        
        async handleOffer(message) {
            if (!this.peerConnections[message.from]) {
                const peerConnection = this.createPeerConnection(message.from);
                this.peerConnections[message.from] = peerConnection;
            }
            
            const peerConnection = this.peerConnections[message.from];
            
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                this.sendSignalingMessage({
                    type: 'answer',
                    answer: answer,
                    to: message.from,
                    from: this.uid
                });
            } catch (error) {
                console.error('[Vue] Error handling offer:', error);
            }
        },
        
        async handleAnswer(message) {
            const peerConnection = this.peerConnections[message.from];
            if (peerConnection) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                } catch (error) {
                    console.error('[Vue] Error handling answer:', error);
                }
            }
        },
        
        async handleIceCandidate(message) {
            const peerConnection = this.peerConnections[message.from];
            if (peerConnection) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (error) {
                    console.error('[Vue] Error handling ICE candidate:', error);
                }
            }
        },
        
        async displayRemoteVideo(userId, stream) {
            if (this.displayedVideos.has(userId)) {
                return;
            }
            this.displayedVideos.add(userId);
            
            let player = document.getElementById(`user-container-${userId}`);
            if (player) {
                player.remove();
            }
            
            let userName = `User ${userId}`;
            try {
                const response = await fetch(`/get_member/?UID=${userId}&room_name=${this.roomName}`);
                const member = await response.json();
                if (member.name) {
                    userName = member.name;
                }
            } catch (error) {
                console.error('[Vue] Error getting member name:', error);
            }
            
            const videoContainer = document.getElementById('video-streams');
            if (!videoContainer) return;
            
            const remotePlayer = `
                <div class="video-container" id="user-container-${userId}">
                    <video class="video-player" id="user-${userId}" autoplay playsinline></video>
                    <div class="username-wrapper">
                        <span class="user-name">${userName}</span>
                    </div>
                </div>
            `;
            videoContainer.insertAdjacentHTML('beforeend', remotePlayer);
            
            const video = document.getElementById(`user-${userId}`);
            if (video) {
                video.srcObject = stream;
            }
        },
        
        handleUserLeft(userId) {
            if (this.peerConnections[userId]) {
                this.peerConnections[userId].close();
                delete this.peerConnections[userId];
            }
            
            const player = document.getElementById(`user-container-${userId}`);
            if (player) {
                player.remove();
            }
            
            this.displayedVideos.delete(userId);
            this.connectedUsers.delete(userId);
        },
        
        sendSignalingMessage(message) {
            if (this.videoSocket && this.videoSocket.readyState === WebSocket.OPEN) {
                this.videoSocket.send(JSON.stringify(message));
            }
        },
        
        async createMember() {
            try {
                await fetch('/create_member/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: this.userName,
                        room_name: this.roomName,
                        UID: this.uid
                    })
                });
            } catch (error) {
                console.error('[Vue] Error creating member:', error);
            }
        },
        
        async deleteMember() {
            try {
                await fetch('/delete_member/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: this.userName,
                        room_name: this.roomName,
                        UID: this.uid
                    })
                });
            } catch (error) {
                console.error('[Vue] Error deleting member:', error);
            }
        },
        
        toggleMic() {
            if (this.localStream) {
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    this.isAudioEnabled = !this.isAudioEnabled;
                    audioTrack.enabled = this.isAudioEnabled;
                }
            }
        },
        
        toggleCamera() {
            if (this.localStream) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    this.isVideoEnabled = !this.isVideoEnabled;
                    videoTrack.enabled = this.isVideoEnabled;
                }
            }
        },
        
        async leaveRoom() {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            Object.keys(this.peerConnections).forEach(userId => {
                this.peerConnections[userId].close();
            });
            this.peerConnections = {};
            
            this.displayedVideos.clear();
            this.connectedUsers.clear();
            
            await this.deleteMember();
            
            this.sendSignalingMessage({
                type: 'user-left',
                from: this.uid
            });
            
            if (this.videoSocket) this.videoSocket.close();
            if (this.chatSocket) this.chatSocket.close();
            
            window.location.href = '/';
        },
        
        toggleChat() {
            this.showChat = !this.showChat;
            if (this.showChat) {
                this.unreadCount = 0;
                this.$nextTick(() => {
                    this.scrollChatToBottom();
                });
            }
        },
        
        sendMessage() {
            if (!this.newMessage.trim()) return;
            
            if (this.chatSocket && this.chatSocket.readyState === WebSocket.OPEN) {
                this.chatSocket.send(JSON.stringify({
                    user_name: this.userName,
                    message: this.newMessage
                }));
                this.newMessage = '';
                this.$nextTick(() => {
                    this.scrollChatToBottom();
                });
            }
        },
        
        scrollChatToBottom() {
            const chatMessages = this.$refs.chatMessages;
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
    },
    
    beforeUnmount() {
        this.leaveRoom();
    }
});

app.mount('#app');
