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
      <div class="video-status-icons">
        <div class="connection-quality-icon" id="connection-quality-local" style="display: none;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 16H4V12H2V16ZM6 16H8V8H6V16ZM10 16H12V4H10V16ZM14 16H16V2H14V16Z" fill="currentColor"/>
          </svg>
        </div>
        <div class="mic-muted-icon" id="mic-muted-local" style="display: none;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="currentColor"/>
            <path d="M19 10V12C19 15.87 15.87 19 12 19M5 10V12C5 15.87 8.13 19 12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 19V23M8 23H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
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
      <div class="video-status-icons">
        <div class="connection-quality-icon" id="connection-quality-${userId}" style="display: none;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 16H4V12H2V16ZM6 16H8V8H6V16ZM10 16H12V4H10V16ZM14 16H16V2H14V16Z" fill="currentColor"/>
          </svg>
        </div>
        <div class="mic-muted-icon" id="mic-muted-${userId}" style="display: none;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="currentColor"/>
            <path d="M19 10V12C19 15.87 15.87 19 12 19M5 10V12C5 15.87 8.13 19 12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 19V23M8 23H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
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

const updateMicMutedIcon = (userId, isMuted) => {
  const iconId = userId === 'local' ? 'mic-muted-local' : `mic-muted-${userId}`
  const icon = document.getElementById(iconId)
  if (icon) {
    icon.style.display = isMuted ? 'flex' : 'none'
  }
}

const updateConnectionQuality = (userId, quality) => {
  const iconId = userId === 'local' ? 'connection-quality-local' : `connection-quality-${userId}`
  const icon = document.getElementById(iconId)
  if (icon) {
    if (quality === 'excellent' || quality === 'good' || quality === 'fair' || quality === 'poor') {
      icon.style.display = 'flex'
      icon.className = `connection-quality-icon quality-${quality}`
      // Обновляем SVG в зависимости от качества
      const svg = icon.querySelector('svg')
      if (svg) {
        svg.innerHTML = getQualityIconSVG(quality)
      }
    } else {
      icon.style.display = 'none'
    }
  }
}

const getQualityIconSVG = (quality) => {
  const colors = {
    excellent: '#4CAF50', // зеленый
    good: '#8BC34A',      // светло-зеленый
    fair: '#FFC107',      // желтый
    poor: '#F44336'       // красный
  }
  
  const color = colors[quality] || colors.fair
  
  // Иконка сигнала с разным количеством полосок в зависимости от качества
  let bars = ''
  if (quality === 'excellent') {
    bars = '<path d="M2 16H4V12H2V16ZM6 16H8V8H6V16ZM10 16H12V4H10V16ZM14 16H16V2H14V16Z" fill="' + color + '"/>'
  } else if (quality === 'good') {
    bars = '<path d="M2 16H4V12H2V16ZM6 16H8V8H6V16ZM10 16H12V4H10V16Z" fill="' + color + '"/>'
  } else if (quality === 'fair') {
    bars = '<path d="M2 16H4V12H2V16ZM6 16H8V8H6V16Z" fill="' + color + '"/>'
  } else {
    bars = '<path d="M2 16H4V12H2V16Z" fill="' + color + '"/>'
  }
  
  return bars
}

defineExpose({
  displayRemoteVideo,
  removeVideo,
  displayLocalVideo,
  updateMicMutedIcon,
  updateConnectionQuality
})
</script>

