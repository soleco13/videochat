<template>
  <div class="video-streams" id="video-streams" :class="streamsClass">
    <!-- Videos will be dynamically added here -->
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  localStream: {
    type: MediaStream,
    default: null
  },
  userName: {
    type: String,
    required: true
  }
})

const streamsClass = ref('single-user')

const updateStreamsClass = () => {
  const videoContainer = document.getElementById('video-streams')
  if (!videoContainer) return
  
  const containers = videoContainer.querySelectorAll('.video-container')
  const count = containers.length
  
  // Удаляем все классы
  videoContainer.classList.remove('single-user', 'two-users', 'multiple-users', 'many-users')
  
  // Добавляем нужный класс
  if (count === 1) {
    videoContainer.classList.add('single-user')
    streamsClass.value = 'single-user'
  } else if (count === 2) {
    videoContainer.classList.add('two-users')
    streamsClass.value = 'two-users'
  } else if (count >= 3 && count <= 4) {
    videoContainer.classList.add('multiple-users')
    streamsClass.value = 'multiple-users'
  } else if (count >= 5) {
    videoContainer.classList.add('many-users')
    streamsClass.value = 'many-users'
  }
}

// Наблюдаем за изменениями в DOM
const observer = new MutationObserver(() => {
  updateStreamsClass()
})

onMounted(() => {
  if (props.localStream) {
    displayLocalVideo()
  }
  
  const videoContainer = document.getElementById('video-streams')
  if (videoContainer) {
    observer.observe(videoContainer, {
      childList: true,
      subtree: true
    })
    updateStreamsClass()
  }
})

onUnmounted(() => {
  observer.disconnect()
})

const displayLocalVideo = () => {
  const videoContainer = document.getElementById('video-streams')
  if (!videoContainer) return
  
  // Remove existing local video if any
  const existing = document.getElementById('user-container-local')
  if (existing) existing.remove()
  
  const localPlayer = `
    <div class="video-container" id="user-container-local">
      <video class="video-player" id="local-video" autoplay muted playsinline></video>
      <div class="username-wrapper">
        <span class="user-name">${props.userName} (You)</span>
      </div>
    </div>
  `
  videoContainer.insertAdjacentHTML('beforeend', localPlayer)
  
  const video = document.getElementById('local-video')
  if (video && props.localStream) {
    video.srcObject = props.localStream
    // mic-active class will be managed by audio detection in Room.vue
  }
  
  updateStreamsClass()
}

const displayRemoteVideo = (userId, stream, userName) => {
  const videoContainer = document.getElementById('video-streams')
  if (!videoContainer) return
  
  // Remove existing video if any
  const existing = document.getElementById(`user-container-${userId}`)
  if (existing) existing.remove()
  
  const remotePlayer = `
    <div class="video-container" id="user-container-${userId}">
      <video class="video-player" id="user-${userId}" autoplay playsinline></video>
      <div class="username-wrapper">
        <span class="user-name">${userName || `User ${userId}`}</span>
      </div>
    </div>
  `
  videoContainer.insertAdjacentHTML('beforeend', remotePlayer)
  
  const video = document.getElementById(`user-${userId}`)
  if (video) {
    video.srcObject = stream
    // mic-active class will be managed by audio detection in Room.vue
  }
  
  updateStreamsClass()
}

const removeVideo = (userId) => {
  const player = document.getElementById(`user-container-${userId}`)
  if (player) {
    player.remove()
    updateStreamsClass()
  }
}

defineExpose({
  displayRemoteVideo,
  removeVideo,
  displayLocalVideo
})
</script>

