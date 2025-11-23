<template>
  <div class="device-check-container">
    <!-- Header -->
    <header class="device-check-header">
      <h2 class="room-title">{{ title || 'Подготовка к встрече' }}</h2>
      <div class="header-actions" v-if="showHeaderActions">
        <button class="icon-btn" @click="copyInviteLink" title="Копировать ссылку">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>
        <button class="icon-btn" @click="openInNewWindow" title="Открыть в новом окне">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="device-check-content">
      <!-- Left Panel - Camera Preview -->
      <div class="camera-panel">
        <div class="camera-preview-container">
          <video 
            ref="cameraPreview" 
            autoplay 
            playsinline 
            class="camera-preview"
            :class="{ 'camera-off': !isCameraEnabled }"
          ></video>
          
          <!-- Camera Off Overlay -->
          <div v-if="!isCameraEnabled" class="camera-off-overlay">
            <div class="camera-off-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 1l22 22"></path>
                <path d="M23 23L1 1"></path>
                <path d="M21 21l-2-2"></path>
                <path d="M16.16 16.16L12 12m-4-4l-4.16-4.16"></path>
                <path d="M1 1l22 22"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </div>
          </div>

          <!-- Camera Status -->
          <div class="camera-status">
            <span class="status-text">{{ isCameraEnabled ? 'Камера включена' : 'Камера выключена' }}</span>
            <span class="device-name" v-if="selectedCameraLabel">{{ selectedCameraLabel }}</span>
          </div>

          <!-- Camera Controls -->
          <div class="camera-controls">
            <button 
              class="control-icon-btn" 
              @click="toggleCamera"
              :class="{ 'active': isCameraEnabled }"
              title="Включить/выключить камеру"
            >
              <svg v-if="isCameraEnabled" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 1l22 22"></path>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <line x1="9" y1="13" x2="15" y2="13"></line>
              </svg>
            </button>
            <button 
              class="control-icon-btn" 
              @click="toggleMicrophone"
              :class="{ 'active': isMicrophoneEnabled }"
              title="Включить/выключить микрофон"
            >
              <svg v-if="isMicrophoneEnabled" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </button>
            <button 
              class="control-icon-btn" 
              @click="showSettings = !showSettings"
              title="Настройки"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Right Panel - Audio Settings -->
      <div class="settings-panel">
        <!-- User Name Input -->
        <div class="device-section" v-if="showNameInput">
          <div class="device-header">
            <h3>Ваше имя</h3>
          </div>
          <input 
            :value="userName" 
            @input="updateUserName"
            type="text"
            placeholder="Введите ваше имя..."
            class="name-input"
            style="text-transform: uppercase"
            required
          />
        </div>

        <!-- Microphone Section -->
        <div class="device-section">
          <div class="device-header">
            <h3>{{ isMicrophoneEnabled ? 'Микрофон включен' : 'Микрофон выключен' }}</h3>
            <button 
              class="device-toggle"
              @click="toggleMicrophone"
              :class="{ 'enabled': isMicrophoneEnabled }"
            >
              <svg v-if="isMicrophoneEnabled" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </button>
          </div>

          <div class="device-selector">
            <select 
              :value="selectedMicrophone" 
              @change="changeMicrophone"
              class="device-select"
            >
              <option v-for="mic in microphones" :key="mic.deviceId" :value="mic.deviceId">
                {{ mic.label || `Микрофон ${mic.deviceId.substring(0, 8)}` }}
              </option>
            </select>
          </div>

          <!-- Volume Visualization -->
          <div class="volume-visualization">
            <div class="volume-bars">
              <div 
                v-for="(bar, index) in volumeBars" 
                :key="index"
                class="volume-bar"
                :style="{ height: `${bar}%` }"
                :class="{ 'active': bar > 20 }"
              ></div>
            </div>
          </div>

          <div class="device-controls">
            <button class="device-icon-btn" @click="toggleMicrophone">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </button>
            <button class="device-icon-btn" @click="showSettings = !showSettings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Speakers Section -->
        <div class="device-section">
          <div class="device-header">
            <h3>Динамики</h3>
          </div>

          <div class="device-selector">
            <select 
              :value="selectedSpeaker" 
              @change="changeSpeaker"
              class="device-select"
            >
              <option v-for="speaker in speakers" :key="speaker.deviceId" :value="speaker.deviceId">
                {{ speaker.label || `Динамики ${speaker.deviceId.substring(0, 8)}` }}
              </option>
            </select>
          </div>

          <!-- Test Sound Button -->
          <button class="test-sound-btn" @click="testSpeaker">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            Проверить звук
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: 'Подготовка к встрече'
  },
  userName: {
    type: String,
    default: ''
  },
  showNameInput: {
    type: Boolean,
    default: true
  },
  showHeaderActions: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:userName', 'device-ready'])

// Device states
const isCameraEnabled = ref(true)
const isMicrophoneEnabled = ref(true)
const selectedCamera = ref(null)
const selectedMicrophone = ref(null)
const selectedSpeaker = ref(null)
const selectedCameraLabel = ref('')

// Device lists
const cameras = ref([])
const microphones = ref([])
const speakers = ref([])

// Media streams
const cameraPreview = ref(null)
let localStream = null
let audioContext = null
let analyser = null
let dataArray = null
let animationFrame = null

// Volume visualization
const volumeBars = ref(Array(20).fill(0))

// UI states
const showSettings = ref(false)

onMounted(async () => {
  // Request permissions first to get device labels
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    tempStream.getTracks().forEach(track => track.stop())
  } catch (err) {
    console.warn('Could not get permissions:', err)
  }

  // Initialize devices
  await loadDevices()
  await initializeMedia()
})

onUnmounted(() => {
  stopMedia()
  stopVolumeVisualization()
})

watch(() => props.userName, (newVal) => {
  if (newVal) {
    emit('update:userName', newVal)
  }
})

function updateUserName(event) {
  emit('update:userName', event.target.value)
}

async function loadDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    
    cameras.value = devices
      .filter(device => device.kind === 'videoinput')
      .map(device => ({ deviceId: device.deviceId, label: device.label || `Camera ${device.deviceId.substring(0, 8)}` }))
    
    microphones.value = devices
      .filter(device => device.kind === 'audioinput')
      .map(device => ({ deviceId: device.deviceId, label: device.label || `Microphone ${device.deviceId.substring(0, 8)}` }))
    
    speakers.value = devices
      .filter(device => device.kind === 'audiooutput')
      .map(device => ({ deviceId: device.deviceId, label: device.label || `Speaker ${device.deviceId.substring(0, 8)}` }))

    // Set defaults
    if (cameras.value.length > 0 && !selectedCamera.value) {
      selectedCamera.value = cameras.value[0].deviceId
      selectedCameraLabel.value = cameras.value[0].label
    }
    if (microphones.value.length > 0 && !selectedMicrophone.value) {
      selectedMicrophone.value = microphones.value[0].deviceId
    }
    if (speakers.value.length > 0 && !selectedSpeaker.value) {
      selectedSpeaker.value = speakers.value[0].deviceId
    }
  } catch (err) {
    console.error('Error loading devices:', err)
  }
}

async function initializeMedia() {
  try {
    const constraints = {
      video: isCameraEnabled.value && selectedCamera.value ? {
        deviceId: { exact: selectedCamera.value }
      } : false,
      audio: isMicrophoneEnabled.value && selectedMicrophone.value ? {
        deviceId: { exact: selectedMicrophone.value }
      } : false
    }

    localStream = await navigator.mediaDevices.getUserMedia(constraints)
    
    if (cameraPreview.value && localStream.getVideoTracks().length > 0) {
      cameraPreview.value.srcObject = localStream
    }

    if (isMicrophoneEnabled.value && localStream.getAudioTracks().length > 0) {
      startVolumeVisualization(localStream)
    }

    emit('device-ready', {
      stream: localStream,
      cameraEnabled: isCameraEnabled.value,
      microphoneEnabled: isMicrophoneEnabled.value
    })
  } catch (err) {
    console.error('Error accessing media:', err)
  }
}

async function toggleCamera() {
  isCameraEnabled.value = !isCameraEnabled.value
  
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = isCameraEnabled.value
    } else if (isCameraEnabled.value && selectedCamera.value) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedCamera.value } }
        })
        const newVideoTrack = videoStream.getVideoTracks()[0]
        localStream.addTrack(newVideoTrack)
        if (cameraPreview.value) {
          cameraPreview.value.srcObject = localStream
        }
      } catch (err) {
        console.error('Error enabling camera:', err)
        isCameraEnabled.value = false
      }
    }
  } else if (isCameraEnabled.value) {
    await initializeMedia()
  }

  emit('device-ready', {
    stream: localStream,
    cameraEnabled: isCameraEnabled.value,
    microphoneEnabled: isMicrophoneEnabled.value
  })
}

async function toggleMicrophone() {
  isMicrophoneEnabled.value = !isMicrophoneEnabled.value
  
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = isMicrophoneEnabled.value
      if (isMicrophoneEnabled.value) {
        startVolumeVisualization(localStream)
      } else {
        stopVolumeVisualization()
        volumeBars.value = Array(20).fill(0)
      }
    } else if (isMicrophoneEnabled.value && selectedMicrophone.value) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedMicrophone.value } }
        })
        const newAudioTrack = audioStream.getAudioTracks()[0]
        localStream.addTrack(newAudioTrack)
        startVolumeVisualization(localStream)
      } catch (err) {
        console.error('Error enabling microphone:', err)
        isMicrophoneEnabled.value = false
      }
    }
  } else if (isMicrophoneEnabled.value) {
    await initializeMedia()
  }

  emit('device-ready', {
    stream: localStream,
    cameraEnabled: isCameraEnabled.value,
    microphoneEnabled: isMicrophoneEnabled.value
  })
}

async function changeCamera(event) {
  selectedCamera.value = event.target.value
  const camera = cameras.value.find(c => c.deviceId === selectedCamera.value)
  selectedCameraLabel.value = camera ? camera.label : ''
  
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.stop()
      localStream.removeTrack(videoTrack)
    }
  }

  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: selectedCamera.value } }
    })
    const newVideoTrack = videoStream.getVideoTracks()[0]
    
    if (localStream) {
      localStream.addTrack(newVideoTrack)
    } else {
      localStream = new MediaStream([newVideoTrack])
    }
    
    if (cameraPreview.value) {
      cameraPreview.value.srcObject = localStream
    }
  } catch (err) {
    console.error('Error changing camera:', err)
  }
}

async function changeMicrophone(event) {
  selectedMicrophone.value = event.target.value
  
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.stop()
      localStream.removeTrack(audioTrack)
      stopVolumeVisualization()
    }
  }

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: selectedMicrophone.value } }
    })
    const newAudioTrack = audioStream.getAudioTracks()[0]
    
    if (localStream) {
      localStream.addTrack(newAudioTrack)
    } else {
      localStream = new MediaStream([newAudioTrack])
    }
    
    if (isMicrophoneEnabled.value) {
      startVolumeVisualization(localStream)
    }
  } catch (err) {
    console.error('Error changing microphone:', err)
  }
}

async function changeSpeaker(event) {
  selectedSpeaker.value = event.target.value
  
  if (cameraPreview.value) {
    try {
      await cameraPreview.value.setSinkId(selectedSpeaker.value)
    } catch (err) {
      console.error('Error changing speaker:', err)
    }
  }
}

function startVolumeVisualization(stream) {
  if (audioContext) {
    audioContext.close()
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)()
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 64
  analyser.smoothingTimeConstant = 0.8
  
  const source = audioContext.createMediaStreamSource(stream)
  source.connect(analyser)
  
  dataArray = new Uint8Array(analyser.frequencyBinCount)
  
  function updateVolume() {
    if (!analyser) return
    
    analyser.getByteFrequencyData(dataArray)
    
    const barCount = volumeBars.value.length
    const step = Math.floor(dataArray.length / barCount)
    
    for (let i = 0; i < barCount; i++) {
      const index = i * step
      const value = dataArray[index] || 0
      volumeBars.value[i] = Math.min(100, (value / 255) * 100)
    }
    
    animationFrame = requestAnimationFrame(updateVolume)
  }
  
  updateVolume()
}

function stopVolumeVisualization() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  analyser = null
  dataArray = null
}

function stopMedia() {
  stopVolumeVisualization()
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop())
    localStream = null
  }
  
  if (cameraPreview.value) {
    cameraPreview.value.srcObject = null
  }
}

async function testSpeaker() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  
  oscillator.frequency.value = 440
  oscillator.type = 'sine'
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
  
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.5)
}

function copyInviteLink() {
  const url = window.location.href
  navigator.clipboard.writeText(url).then(() => {
    alert('Ссылка скопирована!')
  }).catch(() => {
    alert('Не удалось скопировать ссылку')
  })
}

function openInNewWindow() {
  window.open(window.location.href, '_blank')
}

// Expose methods for parent component
defineExpose({
  getStream: () => localStream,
  isCameraEnabled: () => isCameraEnabled.value,
  isMicrophoneEnabled: () => isMicrophoneEnabled.value,
  stopMedia
})
</script>

<style scoped>
@import '/styles/theme.css';

.device-check-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: var(--bg-primary);
  overflow: hidden;
}

.device-check-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 100;
}

.room-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-active);
}

.device-check-content {
  display: flex;
  flex: 1;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
  min-height: 0;
}

.camera-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.camera-preview-container {
  position: relative;
  width: 100%;
  max-width: 640px;
  aspect-ratio: 16 / 9;
  background: var(--bg-secondary);
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid var(--border-color);
}

.camera-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--bg-primary);
}

.camera-preview.camera-off {
  opacity: 0.3;
}

.camera-off-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2;
}

.camera-off-icon {
  color: var(--text-primary);
  opacity: 0.7;
}

.camera-status {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-text {
  font-size: 12px;
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 4px;
}

.device-name {
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.6);
  padding: 2px 6px;
  border-radius: 4px;
}

.camera-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  z-index: 3;
}

.control-icon-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: 50%;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-icon-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-active);
  transform: scale(1.05);
}

.control-icon-btn.active {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--text-primary);
}

.settings-panel {
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  padding-right: 8px;
}

.device-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.device-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.device-toggle {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(244, 67, 54, 0.2);
  border: 2px solid rgba(244, 67, 54, 0.4);
  border-radius: 50%;
  color: #F44336;
  cursor: pointer;
  transition: all 0.2s ease;
}

.device-toggle.enabled {
  background: rgba(82, 121, 111, 0.2);
  border-color: rgba(82, 121, 111, 0.4);
  color: var(--accent-active);
}

.device-toggle:hover {
  transform: scale(1.05);
}

.device-selector {
  margin-bottom: 16px;
}

.device-select {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.device-select:focus {
  outline: none;
  border-color: var(--accent-active);
  box-shadow: 0 0 0 2px rgba(82, 121, 111, 0.2);
}

.volume-visualization {
  margin-bottom: 16px;
  height: 60px;
  display: flex;
  align-items: flex-end;
  padding: 8px;
  background: var(--bg-primary);
  border-radius: 8px;
}

.volume-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 100%;
}

.volume-bar {
  flex: 1;
  background: var(--border-color);
  border-radius: 2px;
  min-height: 4px;
  transition: height 0.1s ease;
}

.volume-bar.active {
  background: var(--accent-active);
}

.device-controls {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.device-icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.device-icon-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-active);
}

.name-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: all 0.2s ease;
}

.name-input::placeholder {
  color: var(--text-muted);
}

.name-input:focus {
  outline: none;
  border-color: var(--accent-active);
  box-shadow: 0 0 0 2px rgba(82, 121, 111, 0.2);
}

.test-sound-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.test-sound-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-active);
}

/* Responsive */
@media screen and (max-width: 1024px) {
  .device-check-content {
    flex-direction: column;
  }

  .settings-panel {
    width: 100%;
  }

  .camera-preview-container {
    max-width: 100%;
  }
}
</style>

