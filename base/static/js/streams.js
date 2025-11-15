// WebRTC Video Call Implementation
const CHANNEL = sessionStorage.getItem('room')
let NAME = sessionStorage.getItem('name')
// Generate UID if not exists
let UID = sessionStorage.getItem('UID')
if (!UID) {
    UID = Math.random().toString(36).substring(7)
    sessionStorage.setItem('UID', UID)
}

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
}

let localStream = null
let peerConnections = {}
let socket = null
let isVideoEnabled = true
let isAudioEnabled = true

// Initialize WebSocket connection for signaling
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/video/${CHANNEL}/`
    
    console.log('[WebSocket] Initializing connection to:', wsUrl)
    console.log('[WebSocket] Channel:', CHANNEL, 'UID:', UID, 'Name:', NAME)
    
    socket = new WebSocket(wsUrl)
    
    socket.onopen = () => {
        console.log('[WebSocket] ✅ Connected successfully')
        console.log('[WebSocket] Ready state:', socket.readyState)
        joinRoom()
    }
    
    socket.onmessage = async (event) => {
        console.log('[WebSocket] 📨 Message received:', event.data)
        try {
            const message = JSON.parse(event.data)
            console.log('[WebSocket] Parsed message:', message)
            await handleSignalingMessage(message)
        } catch (error) {
            console.error('[WebSocket] ❌ Error parsing message:', error)
        }
    }
    
    socket.onerror = (error) => {
        console.error('[WebSocket] ❌ Error:', error)
        console.error('[WebSocket] Error details:', error.message || error)
    }
    
    socket.onclose = (event) => {
        console.log('[WebSocket] 🔌 Disconnected. Code:', event.code, 'Reason:', event.reason)
    }
}

// Track connected users
let connectedUsers = new Set()

// Handle WebRTC signaling messages
async function handleSignalingMessage(message) {
    console.log('[Signaling] 🔄 Handling message type:', message.type, 'from:', message.from, 'to:', message.to, '_target:', message._target)
    
    // Filter messages by target - if _target is specified and doesn't match our UID, ignore
    if (message._target && message._target !== UID) {
        console.log('[Signaling] ⏭️ Message not for us (target:', message._target, 'our UID:', UID, ') - ignoring')
        return
    }
    
    // Also check regular 'to' field
    if (message.to && message.to !== UID && message.type !== 'user-joined' && message.type !== 'user-left') {
        console.log('[Signaling] ⏭️ Message not for us (to:', message.to, 'our UID:', UID, ') - ignoring')
        return
    }
    
    switch (message.type) {
        case 'offer':
            console.log('[Signaling] 📤 Received OFFER from:', message.from)
            // Check if we already have a connection for this user
            if (peerConnections[message.from]) {
                const state = peerConnections[message.from].signalingState
                console.log('[Signaling] ⚠️ Already have connection for', message.from, 'state:', state)
                if (state === 'stable' || state === 'have-local-offer') {
                    console.log('[Signaling] Connection already established, ignoring duplicate offer')
                    return
                }
            }
            await handleOffer(message)
            break
        case 'answer':
            console.log('[Signaling] 📥 Received ANSWER from:', message.from)
            await handleAnswer(message)
            break
        case 'ice-candidate':
            console.log('[Signaling] 🧊 Received ICE candidate from:', message.from)
            await handleIceCandidate(message)
            break
        case 'user-joined':
            console.log('[Signaling] 👤 User joined:', message.from)
            if (message.from && message.from !== UID) {
                // Check if we already have a connection or are creating one
                if (peerConnections[message.from]) {
                    console.log('[Signaling] ⚠️ Already have connection for', message.from, '- skipping offer creation')
                    return
                }
                connectedUsers.add(message.from)
                console.log('[Signaling] Creating offer for new user:', message.from)
                // Create offer to the new user
                await createOffer(message.from)
            } else {
                console.log('[Signaling] Ignoring own user-joined message')
            }
            break
        case 'user-left':
            console.log('[Signaling] 👋 User left:', message.from)
            handleUserLeft(message.from)
            break
        default:
            console.warn('[Signaling] ⚠️ Unknown message type:', message.type)
    }
}

// Get user media (camera and microphone)
async function getUserMedia() {
    console.log('[Media] 🎥 Requesting camera and microphone access...')
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true
        })
        
        console.log('[Media] ✅ Media access granted')
        console.log('[Media] Video tracks:', localStream.getVideoTracks().length)
        console.log('[Media] Audio tracks:', localStream.getAudioTracks().length)
        
        // Display local video
        const localVideo = document.getElementById('local-video')
        if (localVideo) {
            localVideo.srcObject = localStream
            console.log('[Media] Using existing local video element')
        } else {
            // Create local video element
            console.log('[Media] Creating new local video element')
            const videoContainer = document.getElementById('video-streams')
            const localPlayer = `
                <div class="video-container" id="user-container-local">
                    <video class="video-player" id="local-video" autoplay muted></video>
                    <div class="username-wrapper">
                        <span class="user-name">${NAME} (You)</span>
                    </div>
                </div>
            `
            videoContainer.insertAdjacentHTML('beforeend', localPlayer)
            const video = document.getElementById('local-video')
            video.srcObject = localStream
        }
        
        return localStream
    } catch (error) {
        console.error('[Media] ❌ Error accessing media devices:', error)
        console.error('[Media] Error name:', error.name)
        console.error('[Media] Error message:', error.message)
        alert('Не удалось получить доступ к камере/микрофону. Проверьте разрешения.')
        return null
    }
}

// Create RTCPeerConnection
function createPeerConnection(userId) {
    console.log('[PeerConnection] 🔗 Creating peer connection for user:', userId)
    const peerConnection = new RTCPeerConnection(configuration)
    
    // Add local tracks
    if (localStream) {
        console.log('[PeerConnection] Adding local tracks to peer connection')
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream)
            console.log('[PeerConnection] Added track:', track.kind, 'enabled:', track.enabled)
        })
    } else {
        console.warn('[PeerConnection] ⚠️ No local stream available!')
    }
    
    // Handle remote tracks
    let trackReceived = false
    peerConnection.ontrack = (event) => {
        console.log('[PeerConnection] 📹 Received remote track from:', userId)
        console.log('[PeerConnection] Track event:', event)
        
        // Prevent duplicate video display
        if (trackReceived) {
            console.log('[PeerConnection] ⚠️ Track already received for', userId, '- skipping duplicate')
            return
        }
        
        const remoteStream = event.streams[0]
        if (remoteStream) {
            console.log('[PeerConnection] Remote stream tracks:', remoteStream.getTracks().length)
            trackReceived = true
            displayRemoteVideo(userId, remoteStream)
        } else {
            console.error('[PeerConnection] ❌ No remote stream in event')
        }
    }
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('[PeerConnection] 🧊 ICE candidate for', userId, ':', event.candidate.candidate.substring(0, 50) + '...')
            sendSignalingMessage({
                type: 'ice-candidate',
                candidate: event.candidate,
                to: userId,
                from: UID
            })
        } else {
            console.log('[PeerConnection] ✅ All ICE candidates gathered for', userId)
        }
    }
    
    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState
        console.log(`[PeerConnection] 🔄 ICE connection state for ${userId}:`, state)
        
        if (state === 'failed') {
            console.warn('[PeerConnection] ⚠️ ICE connection failed for', userId)
            console.warn('[PeerConnection] Attempting to restart ICE...')
            try {
                peerConnection.restartIce()
                console.log('[PeerConnection] ICE restart initiated')
            } catch (error) {
                console.error('[PeerConnection] ❌ Error restarting ICE:', error)
            }
        } else if (state === 'connected' || state === 'completed') {
            console.log('[PeerConnection] ✅ ICE connection established with', userId)
        } else if (state === 'disconnected') {
            console.warn('[PeerConnection] ⚠️ ICE connection disconnected for', userId)
        } else if (state === 'closed') {
            console.log('[PeerConnection] 🔌 ICE connection closed for', userId)
        }
    }
    
    peerConnection.onconnectionstatechange = () => {
        console.log(`[PeerConnection] 🔄 Connection state for ${userId}:`, peerConnection.connectionState)
    }
    
    return peerConnection
}

// Create and send offer
async function createOffer(userId) {
    console.log('[Offer] 📤 Creating offer for user:', userId)
    
    // Double check - prevent duplicate connections
    if (peerConnections[userId]) {
        const state = peerConnections[userId].signalingState
        console.log('[Offer] ⚠️ Peer connection already exists for', userId, 'state:', state, '- skipping')
        return // Already connected
    }
    
    // Mark that we're creating a connection to prevent duplicates
    peerConnections[userId] = null // Placeholder to prevent race conditions
    
    const peerConnection = createPeerConnection(userId)
    peerConnections[userId] = peerConnection
    
    try {
        console.log('[Offer] Creating SDP offer...')
        const offer = await peerConnection.createOffer()
        console.log('[Offer] Offer created:', offer.type, 'sdp length:', offer.sdp?.length)
        
        await peerConnection.setLocalDescription(offer)
        console.log('[Offer] Local description set, signaling state:', peerConnection.signalingState)
        
        sendSignalingMessage({
            type: 'offer',
            offer: offer,
            to: userId,
            from: UID
        })
        console.log('[Offer] ✅ Offer sent to', userId)
    } catch (error) {
        console.error('[Offer] ❌ Error creating offer:', error)
        console.error('[Offer] Error stack:', error.stack)
        // Clean up on error
        if (peerConnections[userId]) {
            peerConnections[userId].close()
            delete peerConnections[userId]
        }
    }
}

// Handle incoming offer
async function handleOffer(message) {
    console.log('[Offer] 📥 Handling incoming offer from:', message.from)
    
    // Check if we already have a connection for this user
    if (peerConnections[message.from]) {
        const existingState = peerConnections[message.from].signalingState
        console.log('[Offer] ⚠️ Peer connection already exists for', message.from, 'state:', existingState)
        
        // If connection is stable or have-local-offer, we might need to recreate
        if (existingState === 'stable' || existingState === 'have-local-offer') {
            console.log('[Offer] Closing existing connection and creating new one')
            peerConnections[message.from].close()
            delete peerConnections[message.from]
        } else {
            console.log('[Offer] Connection in progress, ignoring duplicate offer')
            return
        }
    }
    
    console.log('[Offer] Creating new peer connection for', message.from)
    const peerConnection = createPeerConnection(message.from)
    peerConnections[message.from] = peerConnection
    
    try {
        console.log('[Offer] Setting remote description...')
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer))
        console.log('[Offer] Remote description set, signaling state:', peerConnection.signalingState)
        
        console.log('[Offer] Creating answer...')
        const answer = await peerConnection.createAnswer()
        console.log('[Offer] Answer created:', answer.type)
        
        await peerConnection.setLocalDescription(answer)
        console.log('[Offer] Local description set, signaling state:', peerConnection.signalingState)
        
        sendSignalingMessage({
            type: 'answer',
            answer: answer,
            to: message.from,
            from: UID
        })
        console.log('[Offer] ✅ Answer sent to', message.from)
    } catch (error) {
        console.error('[Offer] ❌ Error handling offer:', error)
        console.error('[Offer] Error stack:', error.stack)
        // Clean up on error
        if (peerConnections[message.from]) {
            peerConnections[message.from].close()
            delete peerConnections[message.from]
        }
    }
}

// Handle incoming answer
async function handleAnswer(message) {
    console.log('[Answer] 📥 Handling incoming answer from:', message.from)
    
    const peerConnection = peerConnections[message.from]
    if (peerConnection) {
        try {
            console.log('[Answer] Setting remote description...')
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer))
            console.log('[Answer] ✅ Remote description set for', message.from)
        } catch (error) {
            console.error('[Answer] ❌ Error handling answer:', error)
            console.error('[Answer] Error stack:', error.stack)
        }
    } else {
        console.error('[Answer] ❌ No peer connection found for', message.from)
        console.error('[Answer] Available connections:', Object.keys(peerConnections))
    }
}

// Handle ICE candidate
async function handleIceCandidate(message) {
    console.log('[ICE] 🧊 Handling ICE candidate from:', message.from)
    
    const peerConnection = peerConnections[message.from]
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
            console.log('[ICE] ✅ ICE candidate added for', message.from)
        } catch (error) {
            console.error('[ICE] ❌ Error handling ICE candidate:', error)
            console.error('[ICE] Error stack:', error.stack)
        }
    } else {
        console.warn('[ICE] ⚠️ No peer connection found for', message.from, '- candidate ignored')
    }
}

// Track displayed videos to prevent duplicates
const displayedVideos = new Set()

// Display remote video
async function displayRemoteVideo(userId, stream) {
    console.log('[DisplayVideo] 📹 Displaying remote video for user:', userId)
    
    // Prevent duplicate display
    if (displayedVideos.has(userId)) {
        console.log('[DisplayVideo] ⚠️ Video already displayed for', userId, '- skipping duplicate')
        return
    }
    
    displayedVideos.add(userId)
    
    let player = document.getElementById(`user-container-${userId}`)
    if (player) {
        console.log('[DisplayVideo] Removing existing player for', userId)
            player.remove()
    }
    
    // Get user name from database
    let userName = `User ${userId}`
    try {
        console.log('[DisplayVideo] Fetching member name for', userId)
        const response = await fetch(`/get_member/?UID=${userId}&room_name=${CHANNEL}`)
        const member = await response.json()
        if (member.name) {
            userName = member.name
            console.log('[DisplayVideo] Member name:', userName)
        }
    } catch (error) {
        console.error('[DisplayVideo] ❌ Error getting member name:', error)
    }
    
    const videoContainer = document.getElementById('video-streams')
    if (!videoContainer) {
        console.error('[DisplayVideo] ❌ Video container not found!')
        displayedVideos.delete(userId) // Reset on error
        return
    }
    
    const remotePlayer = `
        <div class="video-container" id="user-container-${userId}">
            <video class="video-player" id="user-${userId}" autoplay playsinline></video>
            <div class="username-wrapper">
                <span class="user-name">${userName}</span>
            </div>
        </div>
    `
    videoContainer.insertAdjacentHTML('beforeend', remotePlayer)
    
    const video = document.getElementById(`user-${userId}`)
    if (video) {
        video.srcObject = stream
        console.log('[DisplayVideo] ✅ Video element created and stream assigned for', userId)
        
        video.onloadedmetadata = () => {
            console.log('[DisplayVideo] ✅ Video metadata loaded for', userId)
        }
        
        video.onplay = () => {
            console.log('[DisplayVideo] ▶️ Video started playing for', userId)
        }
        
        video.onerror = (e) => {
            console.error('[DisplayVideo] ❌ Video error for', userId, ':', e)
            displayedVideos.delete(userId) // Reset on error
        }
    } else {
        console.error('[DisplayVideo] ❌ Video element not found after creation!')
        displayedVideos.delete(userId) // Reset on error
    }
}

// Handle user left
function handleUserLeft(userId) {
    console.log('[UserLeft] 👋 Handling user left:', userId)
    
    if (peerConnections[userId]) {
        peerConnections[userId].close()
        delete peerConnections[userId]
        console.log('[UserLeft] ✅ Peer connection closed for', userId)
    }
    
    const player = document.getElementById(`user-container-${userId}`)
    if (player) {
        player.remove()
        console.log('[UserLeft] ✅ Video element removed for', userId)
    }
    
    // Remove from displayed videos set
    displayedVideos.delete(userId)
    connectedUsers.delete(userId)
}

// Send signaling message via WebSocket
function sendSignalingMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('[SendMessage] 📤 Sending message:', message.type, 'to:', message.to || 'all', 'from:', message.from || UID)
        socket.send(JSON.stringify(message))
    } else {
        console.error('[SendMessage] ❌ Cannot send message - socket not ready. State:', socket?.readyState)
    }
}

// Join room
async function joinRoom() {
    console.log('[JoinRoom] 🚪 Joining room:', CHANNEL)
    console.log('[JoinRoom] User UID:', UID, 'Name:', NAME)
    
    const roomNameEl = document.getElementById('room-name')
    if (roomNameEl) {
        roomNameEl.innerText = CHANNEL
    }
    
    // Get user media
    console.log('[JoinRoom] Requesting user media...')
    const stream = await getUserMedia()
    if (!stream) {
        console.error('[JoinRoom] ❌ Failed to get user media - aborting')
        return
    }
    
    // Create member in database
    console.log('[JoinRoom] Creating member in database...')
    try {
        await createMember()
        console.log('[JoinRoom] ✅ Member created')
    } catch (error) {
        console.error('[JoinRoom] ❌ Error creating member:', error)
    }
    
    // Get existing members in the room
    console.log('[JoinRoom] Fetching existing room members...')
    try {
        const response = await fetch(`/get_room_members/?room_name=${CHANNEL}`)
        const data = await response.json()
        console.log('[JoinRoom] Room members response:', data)
        
        if (data.members && data.members.length > 0) {
            console.log('[JoinRoom] Found', data.members.length, 'existing members')
            // Create offers for all existing members (but wait a bit for them to be ready)
            setTimeout(async () => {
                for (const member of data.members) {
                    if (member.uid !== UID) {
                        // Check if connection already exists or is being created
                        if (peerConnections[member.uid]) {
                            console.log('[JoinRoom] ⚠️ Already have connection for', member.uid, '- skipping')
                            continue
                        }
                        console.log('[JoinRoom] Creating offer for existing member:', member.uid, member.name)
                        connectedUsers.add(member.uid)
                        await createOffer(member.uid)
                        // Small delay between offers to prevent race conditions
                        await new Promise(resolve => setTimeout(resolve, 100))
                    } else {
                        console.log('[JoinRoom] Skipping self:', member.uid)
                    }
                }
            }, 500) // Wait 500ms for existing users to be ready
        } else {
            console.log('[JoinRoom] No existing members in room')
        }
    } catch (error) {
        console.error('[JoinRoom] ❌ Error getting room members:', error)
        console.error('[JoinRoom] Error stack:', error.stack)
    }
    
    // Notify others that we joined (they will create offers)
    console.log('[JoinRoom] Sending user-joined notification...')
    sendSignalingMessage({
        type: 'user-joined',
        from: UID
    })
    console.log('[JoinRoom] ✅ Join room completed')
}

// Leave room
async function leaveRoom() {
    console.log('[LeaveRoom] 🚪 Leaving room...')
    
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop()
            console.log('[LeaveRoom] Stopped track:', track.kind)
        })
    }
    
    // Close all peer connections
    Object.keys(peerConnections).forEach(userId => {
        console.log('[LeaveRoom] Closing peer connection for', userId)
        peerConnections[userId].close()
    })
    peerConnections = {}
    
    // Clear displayed videos
    displayedVideos.clear()
    connectedUsers.clear()
    
    // Delete member from database
    try {
        await deleteMember()
        console.log('[LeaveRoom] ✅ Member deleted')
    } catch (error) {
        console.error('[LeaveRoom] ❌ Error deleting member:', error)
    }
    
    // Notify others that we left
    sendSignalingMessage({
        type: 'user-left',
        from: UID
    })
    
    // Close WebSocket
    if (socket) {
        socket.close()
        console.log('[LeaveRoom] ✅ WebSocket closed')
    }
    
    // Redirect to lobby
    window.location.href = '/'
}

// Toggle camera
function toggleCamera(e) {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
            isVideoEnabled = !isVideoEnabled
            videoTrack.enabled = isVideoEnabled
            
            if (isVideoEnabled) {
        e.target.style.backgroundColor = '#fff'
            } else {
        e.target.style.backgroundColor = 'rgb(255, 80, 80, 1)'
            }
        }
    }
}

// Toggle microphone
function toggleMic(e) {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled
            audioTrack.enabled = isAudioEnabled
            
            if (isAudioEnabled) {
        e.target.style.backgroundColor = '#fff'
            } else {
        e.target.style.backgroundColor = 'rgb(255, 80, 80, 1)'
            }
        }
    }
}

// API calls
async function createMember() {
    console.log('[API] Creating member:', NAME, 'UID:', UID, 'Room:', CHANNEL)
    try {
        const response = await fetch('/create_member/', {
            method: 'POST',
        headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                'name': NAME,
                'room_name': CHANNEL,
                'UID': UID
            })
        })
        const data = await response.json()
        console.log('[API] ✅ Member created response:', data)
        return data
    } catch (error) {
        console.error('[API] ❌ Error creating member:', error)
        throw error
    }
}

async function deleteMember() {
    try {
        await fetch('/delete_member/', {
            method: 'POST',
        headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                'name': NAME,
                'room_name': CHANNEL,
                'UID': UID
            })
        })
    } catch (error) {
        console.error('Error deleting member:', error)
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebSocket)
} else {
    // DOM already loaded
    initWebSocket()
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    deleteMember()
    if (socket) {
        socket.close()
    }
})

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const leaveBtn = document.getElementById('leave-btn')
    const cameraBtn = document.getElementById('camera-btn')
    const micBtn = document.getElementById('mic-btn')
    
    if (leaveBtn) {
        leaveBtn.addEventListener('click', leaveRoom)
    }
    if (cameraBtn) {
        cameraBtn.addEventListener('click', toggleCamera)
    }
    if (micBtn) {
        micBtn.addEventListener('click', toggleMic)
    }
})
