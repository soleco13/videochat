<template>
  <div class="room-container">
    <!-- Header -->
    <div class="room-header">
      <div class="header-content">
        <h2>Room: <span>{{ roomName }}</span></h2>
        <div v-if="inviteUrl" class="invite-link-container">
          <input 
            type="text" 
            :value="inviteUrl" 
            readonly 
            class="invite-link-input" 
            ref="inviteLinkInput"
          />
          <button @click="copyInviteLink" class="copy-invite-btn">Copy Link</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Video Section -->
      <div class="video-section" :class="{ 'chat-open': showChat }">
        <VideoStream 
          ref="videoStreamRef"
          :local-stream="localStream"
          :user-name="userName"
        />
        
        <!-- Controls -->
        <div class="controls-wrapper">
          <button 
            @click="toggleMic" 
            class="control-btn" 
            :class="{ 'active': isAudioEnabled }"
            title="Toggle Microphone"
          >
            <img src="/images/microphone.svg" alt="Mic" />
          </button>
          <button 
            @click="toggleCamera" 
            class="control-btn" 
            :class="{ 'active': isVideoEnabled }"
            title="Toggle Camera"
          >
            <img src="/images/video.svg" alt="Camera" />
          </button>
          <button 
            @click="showChat = !showChat" 
            class="control-btn chat-btn"
            :class="{ 'active': showChat }"
            title="Toggle Chat"
          >
            <img src="/images/message.svg" alt="Chat" />
            <span v-if="unreadCount > 0 && !showChat" class="chat-badge">{{ unreadCount }}</span>
          </button>
          <button 
            @click="leaveRoom" 
            class="control-btn leave-btn"
            title="Leave Room"
          >
            <img src="/images/leave1.svg" alt="Leave" />
          </button>
        </div>
      </div>

      <!-- Chat Section -->
      <ChatPanel
        :show="showChat"
        :messages="chatMessages"
        :user-name="userName"
        @send="handleSendMessage"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useWebRTC } from '../composables/useWebRTC'
import { useChat } from '../composables/useChat'
import { useAudioDetection } from '../composables/useAudioDetection'
import VideoStream from '../components/VideoStream.vue'
import ChatPanel from '../components/ChatPanel.vue'

const props = defineProps({
  roomName: {
    type: String,
    required: true
  }
})

const router = useRouter()
const route = useRoute()

const roomName = ref(props.roomName || route.params.roomName)
const userName = ref(sessionStorage.getItem('name') || 'Guest')
const uid = ref(sessionStorage.getItem('UID') || generateUID())
const inviteUrl = ref('')
const showChat = ref(false)
const isVideoEnabled = ref(true)
const isAudioEnabled = ref(true)
const localStream = ref(null)
const videoStreamRef = ref(null)

// Initialize composables
const {
  localStream: webrtcStream,
  initVideoWebSocket,
  getUserMedia,
  joinRoom: joinWebRTCRoom,
  leaveRoom: leaveWebRTCRoom,
  handleSignalingMessage,
  createPeerConnection
} = useWebRTC(roomName.value, uid.value, userName.value)

const {
  messages: chatMessages,
  unreadCount,
  initChatWebSocket,
  sendMessage: sendChatMessage,
  resetUnread,
  close: closeChat
} = useChat(roomName.value, userName.value)

// Audio detection for local user
const { isSpeaking: isLocalSpeaking, startDetection: startLocalDetection, stopDetection: stopLocalDetection } = useAudioDetection()

// Watch for remote video streams
const handleRemoteVideo = (userId, stream) => {
  if (videoStreamRef.value) {
    fetch(`/get_member/?UID=${userId}&room_name=${roomName.value}`)
      .then(res => res.json())
      .then(member => {
        videoStreamRef.value.displayRemoteVideo(userId, stream, member.name || `User ${userId}`)
        
        // Start audio detection for remote user
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length > 0 && audioTracks[0].enabled) {
          // Create audio detection for remote stream
          setupRemoteAudioDetection(userId, stream)
        }
      })
      .catch(() => {
        videoStreamRef.value.displayRemoteVideo(userId, stream)
      })
  }
}

// Audio detection instances for remote users
const remoteAudioDetections = new Map()

const setupRemoteAudioDetection = (userId, stream) => {
  // Remove existing detection if any
  if (remoteAudioDetections.has(userId)) {
    const { stopDetection } = remoteAudioDetections.get(userId)
    stopDetection()
  }
  
  // Create new audio detection
  const { isSpeaking, startDetection, stopDetection } = useAudioDetection()
  startDetection(stream)
  
  // Watch for speaking state changes
  watch(isSpeaking, (speaking) => {
    const container = document.getElementById(`user-container-${userId}`)
    if (container) {
      if (speaking) {
        container.classList.add('mic-active')
      } else {
        container.classList.remove('mic-active')
      }
    }
  })
  
  remoteAudioDetections.set(userId, { isSpeaking, startDetection, stopDetection })
}

const handleUserLeft = (userId) => {
  if (videoStreamRef.value) {
    videoStreamRef.value.removeVideo(userId)
  }
  
  // Stop audio detection for remote user
  if (remoteAudioDetections.has(userId)) {
    const { stopDetection } = remoteAudioDetections.get(userId)
    stopDetection()
    remoteAudioDetections.delete(userId)
  }
}

// Override WebRTC composable to handle video display
const originalHandleSignaling = handleSignalingMessage
watch(() => webrtcStream.value, (newStream) => {
  localStream.value = newStream
  if (videoStreamRef.value && newStream) {
    videoStreamRef.value.displayLocalVideo()
    
    // Start audio detection for local stream
    if (isAudioEnabled.value && newStream) {
      startLocalDetection(newStream)
    }
  }
})

// Watch local speaking state
watch(isLocalSpeaking, (speaking) => {
  const localContainer = document.getElementById('user-container-local')
  if (localContainer) {
    if (speaking && isAudioEnabled.value) {
      localContainer.classList.add('mic-active')
    } else {
      localContainer.classList.remove('mic-active')
    }
  }
})

// Watch audio enabled state
watch(isAudioEnabled, (enabled) => {
  if (localStream.value) {
    if (enabled) {
      startLocalDetection(localStream.value)
    } else {
      stopLocalDetection()
      const localContainer = document.getElementById('user-container-local')
      if (localContainer) {
        localContainer.classList.remove('mic-active')
      }
    }
  }
})

onMounted(async () => {
  // Get invite URL if available
  try {
    const response = await fetch(`/room/${roomName.value}/`)
    // Parse invite URL from response if needed
  } catch (error) {
    console.error('Error getting room info:', error)
  }

  // Initialize WebRTC
  initVideoWebSocket()
  initChatWebSocket()

  // Get user media
  try {
    const stream = await getUserMedia()
    localStream.value = stream
    if (videoStreamRef.value) {
      videoStreamRef.value.displayLocalVideo()
    }
  } catch (error) {
    alert('Не удалось получить доступ к камере/микрофону. Проверьте разрешения.')
    return
  }

  // Join room
  await joinWebRTCRoom()

  // Listen for remote tracks
  const peerConnections = {}
  const handleTrack = (userId, event) => {
    const remoteStream = event.streams[0]
    if (remoteStream) {
      handleRemoteVideo(userId, remoteStream)
    }
  }
})

onUnmounted(async () => {
  // Stop all audio detections
  stopLocalDetection()
  remoteAudioDetections.forEach(({ stopDetection }) => {
    stopDetection()
  })
  remoteAudioDetections.clear()
  
  await leaveWebRTCRoom()
  closeChat()
})

const generateUID = () => {
  const uid = Math.random().toString(36).substring(7)
  sessionStorage.setItem('UID', uid)
  return uid
}

const toggleMic = () => {
  if (localStream.value) {
    const audioTrack = localStream.value.getAudioTracks()[0]
    if (audioTrack) {
      isAudioEnabled.value = !isAudioEnabled.value
      audioTrack.enabled = isAudioEnabled.value
      
      // Audio detection will handle mic-active class automatically
      if (isAudioEnabled.value) {
        startLocalDetection(localStream.value)
      } else {
        stopLocalDetection()
        const localContainer = document.getElementById('user-container-local')
        if (localContainer) {
          localContainer.classList.remove('mic-active')
        }
      }
    }
  }
}

const toggleCamera = () => {
  if (localStream.value) {
    const videoTrack = localStream.value.getVideoTracks()[0]
    if (videoTrack) {
      isVideoEnabled.value = !isVideoEnabled.value
      videoTrack.enabled = isVideoEnabled.value
    }
  }
}

const leaveRoom = async () => {
  await leaveWebRTCRoom()
  closeChat()
  router.push('/')
}

const handleSendMessage = (message) => {
  sendChatMessage(message)
}

watch(showChat, (newVal) => {
  if (newVal) {
    resetUnread()
  }
})

const copyInviteLink = () => {
  if (inviteLinkInput.value) {
    inviteLinkInput.value.select()
    inviteLinkInput.value.setSelectionRange(0, 99999)
    document.execCommand('copy')
    
    const btn = event.target
    const originalText = btn.textContent
    btn.textContent = 'Copied!'
    btn.style.backgroundColor = '#4CAF50'
    
    setTimeout(() => {
      btn.textContent = originalText
      btn.style.backgroundColor = ''
    }, 2000)
  }
}

const inviteLinkInput = ref(null)
</script>

<style>
@import '/styles/theme.css';
@import '/styles/room.css';
@import '/styles/chat.css';
</style>

