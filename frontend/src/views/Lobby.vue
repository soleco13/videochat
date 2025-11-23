<template>
  <div class="lobby-container" :class="{ 'modal-open': showNameModal }">
    <!-- Name Modal -->
    <NameModal
      :show="showNameModal"
      :initial-name="userName"
      @continue="handleNameContinue"
    />
    <!-- Top Bar -->
    <header class="lobby-header" v-show="!showNameModal">
      <h1 class="lobby-title">Создание конференции</h1>
    </header>

    <!-- Main Content -->
    <div class="lobby-content" v-show="!showNameModal">
      <div class="lobby-content-wrapper">
        <!-- Center Rectangle: Video Preview + Settings + Name -->
        <div class="center-rectangle">
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
              
              <!-- Camera Off Overlay - Placeholder like in room -->
              <div v-if="!isCameraEnabled" class="camera-off-overlay">
                <div class="no-cam-placeholder" v-html="cameraPlaceholderSVG"></div>
              </div>

              <!-- Camera Status -->
              <div class="camera-status">
                <span class="status-text">{{ isCameraEnabled ? 'Камера включена' : 'Камера выключена' }}</span>
                <span class="device-name" v-if="selectedCameraLabel">{{ selectedCameraLabel }}</span>
              </div>

              <!-- Camera Status Icon -->
              <div class="camera-status-icon" v-if="!isCameraEnabled">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 1l22 22"></path>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <line x1="9" y1="13" x2="15" y2="13"></line>
                </svg>
              </div>

              <!-- Camera Controls -->
              <div class="camera-controls">
                <button 
                  class="control-btn" 
                  @click="toggleMicrophone"
                  :class="{ 'active': isMicrophoneEnabled }"
                  title="Включить/выключить микрофон"
                >
                  <img src="/static/images/microphone.svg" alt="Microphone" />
                </button>
                <button 
                  class="control-btn" 
                  @click="toggleCamera"
                  :class="{ 'active': isCameraEnabled }"
                  title="Включить/выключить камеру"
                >
                  <img src="/static/images/video.svg" alt="Camera" />
                </button>
              </div>
            </div>
          </div>

          <!-- Right Panel - Audio Settings -->
          <div class="settings-panel">
            <!-- Microphone Section -->
            <div class="device-section microphone-section">
              <div class="device-header">
                <h3>{{ isMicrophoneEnabled ? 'Микрофон включен' : 'Микрофон выключен' }}</h3>
                <button 
                  class="device-status-icon"
                  :class="{ 'enabled': isMicrophoneEnabled }"
                  @click="toggleMicrophone"
                  title="Включить/выключить микрофон"
                >
                  <svg v-if="isMicrophoneEnabled" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <canvas ref="volumeCanvas" class="volume-canvas"></canvas>
              </div>
            </div>

            <!-- Speakers Section -->
            <div class="device-section speakers-section">
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

        <!-- Mobile Create Button -->
        <div class="mobile-create-section">
          <div class="mobile-room-name-input">
            <label>Название комнаты:</label>
            <input 
              v-model="roomName" 
              type="text"
              placeholder="Введите название комнаты..."
              class="mobile-room-input"
              style="text-transform: uppercase"
              required
            />
          </div>
          <button 
            class="mobile-create-btn" 
            @click="handleCreate"
            :disabled="!roomName.trim()"
          >
            Создать встречу
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Bar - Desktop Only -->
    <footer class="lobby-footer" v-show="!showNameModal">
        <div class="room-name-input">
          <label>Название комнаты:</label>
          <input 
            v-model="roomName" 
            type="text"
            placeholder="Введите название комнаты..."
            class="room-input"
            style="text-transform: uppercase"
            required
          />
        </div>
        <button 
        class="create-btn" 
        @click="handleCreate"
          :disabled="!roomName.trim()"
        >
        Создать встречу
        </button>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import NameModal from '../components/NameModal.vue'

const router = useRouter()

const roomName = ref('')
const userName = ref('')
const showNameModal = ref(true) // Показываем модальное окно при загрузке

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
const volumeCanvas = ref(null)
let localStream = null
let audioContext = null
let analyser = null
let dataArray = null
let animationFrame = null
let canvasContext = null

// UI states
// Stable UID for camera placeholder (generated once)
let stablePlaceholderUID = null

// Computed property for camera placeholder SVG (cached, won't regenerate on every render)
const cameraPlaceholderSVG = computed(() => {
  if (!stablePlaceholderUID) {
    stablePlaceholderUID = 'local-' + Date.now() + '-' + Math.random().toString(36).substring(7)
  }
  return generateNoCamSVG(stablePlaceholderUID)
})

onMounted(async () => {
  // Load saved username
  const savedName = localStorage.getItem('username') || sessionStorage.getItem('name')
  if (savedName) {
    userName.value = savedName
  }

  // Don't initialize media until name is entered
  // Media will be initialized in handleNameContinue
})

onUnmounted(() => {
  stopMedia()
  stopVolumeVisualization()
  
  // Remove resize listener
  if (volumeCanvas.value) {
    if (volumeCanvas.value._resizeHandler) {
      window.removeEventListener('resize', volumeCanvas.value._resizeHandler)
    }
    if (volumeCanvas.value._resizeObserver) {
      volumeCanvas.value._resizeObserver.disconnect()
    }
  }
})

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
        clearVolumeCanvas()
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

function setupVolumeCanvas() {
  if (!volumeCanvas.value || !canvasContext) return
  
  const canvas = volumeCanvas.value
  const ctx = canvasContext
  
  // Set canvas size
  const updateCanvasSize = () => {
    const container = canvas.parentElement
    if (container) {
      const containerWidth = container.offsetWidth - 16 // учитываем padding
      const containerHeight = container.offsetHeight - 16
      canvas.width = Math.max(1, containerWidth)
      canvas.height = Math.max(1, containerHeight)
    } else {
      canvas.width = canvas.offsetWidth || 1
      canvas.height = canvas.offsetHeight || 1
    }
  }
  
  updateCanvasSize()
  
  // Update on resize
  window.addEventListener('resize', updateCanvasSize)
  
  // Use ResizeObserver for more accurate size tracking
  if (window.ResizeObserver && canvas.parentElement) {
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize()
    })
    resizeObserver.observe(canvas.parentElement)
    canvas._resizeObserver = resizeObserver
  }
  
  // Store cleanup function
  canvas._resizeHandler = updateCanvasSize
}

function startVolumeVisualization(stream) {
  if (audioContext) {
    audioContext.close()
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)()
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.8
  
  const source = audioContext.createMediaStreamSource(stream)
  source.connect(analyser)
  
  dataArray = new Uint8Array(analyser.frequencyBinCount)
  
  function updateVolume() {
    if (!analyser || !canvasContext || !volumeCanvas.value) return
    
    analyser.getByteFrequencyData(dataArray)
    
    const canvas = volumeCanvas.value
    const ctx = canvasContext
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Draw volume bars
    const barCount = 20
    const barWidth = width / barCount
    const barGap = 2
    
    // Get colors from CSS variables
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-active').trim() || '#52796F'
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || 'rgba(132, 169, 140, 0.3)'
    
    for (let i = 0; i < barCount; i++) {
      const index = Math.floor((i / barCount) * dataArray.length)
      const value = dataArray[index] || 0
      const barHeight = (value / 255) * height
      
      // Draw bar
      ctx.fillStyle = barHeight > height * 0.2 ? accentColor : borderColor
      ctx.fillRect(
        i * barWidth + barGap,
        height - barHeight,
        barWidth - barGap * 2,
        barHeight
      )
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

function clearVolumeCanvas() {
  if (canvasContext && volumeCanvas.value) {
    canvasContext.clearRect(0, 0, volumeCanvas.value.width, volumeCanvas.value.height)
  }
}

function stopMedia() {
  stopVolumeVisualization()
  clearVolumeCanvas()
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop())
    localStream = null
  }
  
  if (cameraPreview.value) {
    cameraPreview.value.srcObject = null
  }
}

// Generate placeholder SVG for disabled camera (like in room)
function generateNoCamSVG(uid) {
  // Use provided stable UID
  const colorPalette = ['#CAD2C5', '#84A98C', '#52796F', '#354F52', '#2F3E46']
  
  // Generate colors based on UID
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash)
  }
  hash = Math.abs(hash)
  
  const shuffled = [...colorPalette]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  
  const colors = {
    primary: shuffled[hash % colorPalette.length],
    accent: shuffled[(hash + 2) % colorPalette.length]
  }
  
  return `
    <div style="width: 100%; height: 100%; position: relative; background: ${colors.primary}; display: flex; align-items: center; justify-content: center;">
      <svg width="200" height="200" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" 
           style="width: 200px; height: 200px; max-width: 30vw; max-height: 30vh;"
           preserveAspectRatio="xMidYMid meet">
        <g fill="${colors.accent}" fill-rule="nonzero">
          <path d="M17.5,12 C19.9852814,12 22,14.0147186 22,16.5 C22,18.9852814 19.9852814,21 17.5,21 C15.3591076,21 13.5674006,19.5049595 13.1119514,17.5019509 L10.8880486,17.5019509 C10.4325994,19.5049595 8.64089238,21 6.5,21 C4.01471863,21 2,18.9852814 2,16.5 C2,14.0147186 4.01471863,12 6.5,12 C8.81637876,12 10.7239814,13.7501788 10.9725684,16.000297 L13.0274316,16.000297 C13.2760186,13.7501788 15.1836212,12 17.5,12 Z M6.5,13.5 C4.84314575,13.5 3.5,14.8431458 3.5,16.5 C3.5,18.1568542 4.84314575,19.5 6.5,19.5 C8.15685425,19.5 9.5,18.1568542 9.5,16.5 C9.5,14.8431458 8.15685425,13.5 6.5,13.5 Z M17.5,13.5 C15.8431458,13.5 14.5,14.8431458 14.5,16.5 C14.5,18.1568542 15.8431458,19.5 17.5,19.5 C19.1568542,19.5 20.5,18.1568542 20.5,16.5 C20.5,14.8431458 19.1568542,13.5 17.5,13.5 Z M12,9.25 C15.3893368,9.25 18.5301001,9.58954198 21.4217795,10.2699371 C21.8249821,10.3648083 22.0749341,10.7685769 21.9800629,11.1717795 C21.8851917,11.5749821 21.4814231,11.8249341 21.0782205,11.7300629 C18.3032332,11.0771247 15.2773298,10.75 12,10.75 C8.72267018,10.75 5.69676679,11.0771247 2.9217795,11.7300629 C2.51857691,11.8249341 2.11480832,11.5749821 2.01993712,11.1717795 C1.92506593,10.7685769 2.17501791,10.3648083 2.5782205,10.2699371 C5.46989988,9.58954198 8.61066315,9.25 12,9.25 Z M15.7002538,3.25 C16.7230952,3.25 17.6556413,3.81693564 18.1297937,4.71158956 L18.2132356,4.88311922 L19.6853587,8.19539615 C19.8535867,8.57390929 19.683117,9.0171306 19.3046038,9.18535866 C18.9576335,9.33956772 18.5562903,9.20917654 18.3622308,8.89482229 L18.3146413,8.80460385 L16.8425183,5.49232692 C16.6601304,5.08195418 16.2735894,4.80422037 15.8336777,4.75711483 L15.7002538,4.75 L8.29974618,4.75 C7.85066809,4.75 7.43988259,4.99042719 7.21817192,5.37329225 L7.15748174,5.49232692 L5.68535866,8.80460385 C5.5171306,9.18311699 5.07390929,9.35358672 4.69539615,9.18535866 C4.34842577,9.03114961 4.17626965,8.64586983 4.27956492,8.29117594 L4.31464134,8.19539615 L5.78676442,4.88311922 C6.20217965,3.94843495 7.09899484,3.32651789 8.10911143,3.25658537 L8.29974618,3.25 L15.7002538,3.25 Z" />
        </g>
      </svg>
    </div>
  `
}

async function testSpeaker() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  
  // Set output device if supported
  if (selectedSpeaker.value && audioContext.setSinkId) {
    try {
      await audioContext.setSinkId(selectedSpeaker.value)
    } catch (err) {
      console.warn('Could not set sink ID:', err)
    }
  }
  
  gainNode.connect(audioContext.destination)
  
  oscillator.frequency.value = 440
  oscillator.type = 'sine'
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
  
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.5)
}

async function handleNameContinue(name) {
  userName.value = name.trim().toUpperCase()
  showNameModal.value = false
  
  // Initialize media after name is entered
  try {
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
    
    // Initialize canvas for volume visualization
    await nextTick()
    if (volumeCanvas.value) {
      canvasContext = volumeCanvas.value.getContext('2d')
      setupVolumeCanvas()
    }
  } catch (err) {
    console.error('Error initializing media:', err)
  }
}

async function handleCreate() {
  if (!roomName.value.trim() || !userName.value.trim()) {
    alert('Пожалуйста, заполните все поля')
    return
  }

  const room = roomName.value.trim().toUpperCase()
  const name = userName.value.trim().toUpperCase()

  try {
    // Create room and get invite link
    const createResponse = await fetch('/create_room/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        room_name: room,
        name: name
      })
    })
    
    const roomData = await createResponse.json()
    
    if (roomData.error) {
      alert(roomData.error)
      return
    }

    // Get UID
    const response = await fetch(`/get_token/?channel=${room}`)
    const data = await response.json()

    const UID = data.uid || Math.random().toString(36).substring(7)

    // Store in sessionStorage
    sessionStorage.setItem('UID', UID)
    sessionStorage.setItem('room', room)
    sessionStorage.setItem('name', name)
    sessionStorage.setItem('cameraEnabled', isCameraEnabled.value.toString())
    sessionStorage.setItem('microphoneEnabled', isMicrophoneEnabled.value.toString())
    localStorage.setItem('username', name)
    
    // Stop preview stream
    stopMedia()
    
    // Redirect to room using Django URL (not Vue Router)
    window.location.href = `/room/${room}/`
  } catch (error) {
    console.error('Error creating room:', error)
    alert('Ошибка при создании комнаты. Попробуйте снова.')
  }
}
</script>

<style scoped>
@import '../styles/theme.css';

.lobby-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: var(--bg-primary);
  overflow: hidden;
}

.lobby-header {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 100;
}

.lobby-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.lobby-content {
  display: flex;
  flex: 1;
  gap: 20px;
  padding: 20px;
  padding-bottom: 0;
  overflow: hidden;
  min-height: 0;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}

.lobby-content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 1012px; /* 496px (video) + 20px (gap) + 496px (settings) */
}

.center-rectangle {
  display: grid;
  grid-template-columns: 496px 496px;
  gap: 20px;
  align-items: start;
  justify-content: center;
  width: 100%;
  max-width: 1012px;
}

.center-rectangle .camera-panel {
  grid-column: 1;
  grid-row: 1;
}

.center-rectangle .settings-panel {
  grid-column: 2;
  grid-row: 1;
}


.camera-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 496px;
  height: 496px;
  max-width: 496px;
  max-height: 496px;
  min-width: 496px;
  min-height: 496px;
}

.camera-preview-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg-secondary);
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid var(--border-color);
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
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
  z-index: 2;
}

.no-cam-placeholder {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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

.camera-status-icon {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(244, 67, 54, 0.2);
  border: 2px solid rgba(244, 67, 54, 0.4);
  border-radius: 4px;
  color: #F44336;
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

.control-btn {
  position: relative;
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  border-radius: 50%;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.control-btn:hover {
  border-color: var(--accent-inactive);
  background: var(--bg-secondary);
}

.control-btn:not(.active) {
  opacity: 0.6;
  background: var(--bg-primary);
  border-color: var(--border-color);
}

.control-btn:not(.active):hover {
  opacity: 0.8;
  border-color: var(--accent-inactive);
}

.control-btn.active {
  background: var(--accent-active);
  border-color: var(--accent-active);
  box-shadow: 0 0 20px rgba(82, 121, 111, 0.5), var(--shadow-md);
  opacity: 1;
}

.control-btn.active:hover {
  background: var(--accent-inactive);
  border-color: var(--accent-inactive);
  box-shadow: 0 0 25px rgba(132, 169, 140, 0.6), var(--shadow-md);
}

.control-btn img {
  width: 24px;
  height: 24px;
  filter: brightness(0) invert(1);
  opacity: 0.9;
}

.control-btn.active img {
  opacity: 1;
}

.control-btn:not(.active) img {
  opacity: 0.7;
}

.control-btn:not(.active)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 30px;
  height: 2px;
  background: var(--text-primary);
  transform: translate(-50%, -50%) rotate(45deg);
  opacity: 0.9;
  z-index: 10;
  pointer-events: none;
}

.control-btn.active::after {
  display: none;
}


.settings-panel {
  width: 496px;
  height: 496px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
  padding-right: 0;
  flex-shrink: 0;
  box-sizing: border-box;
}

.device-section.microphone-section {
  flex: 2;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.device-section.speakers-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}


.volume-visualization {
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: stretch;
}

.device-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 496px;
  max-width: 496px;
  box-sizing: border-box;
  overflow: hidden;
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

.device-status-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(244, 67, 54, 0.2);
  border: 2px solid rgba(244, 67, 54, 0.4);
  border-radius: 4px;
  color: #F44336;
  cursor: pointer;
  transition: all 0.2s ease;
}

.device-status-icon.enabled {
  background: rgba(82, 121, 111, 0.2);
  border-color: rgba(82, 121, 111, 0.4);
  color: var(--accent-active);
}

.device-status-icon:hover {
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
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 8px;
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
}

.volume-canvas {
  width: 100%;
  height: 100%;
  display: block;
  flex: 1;
  max-width: 100%;
  max-height: 100%;
  box-sizing: border-box;
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
  width: 100%;
  justify-content: center;
}

.test-sound-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-active);
}

.lobby-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 24px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  gap: 16px;
}

/* Mobile Create Section */
.mobile-create-section {
  display: none;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px;
  width: 100%;
  max-width: 1012px;
  margin: 0 auto;
}

.mobile-room-name-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.mobile-room-name-input label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.mobile-room-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.mobile-room-input::placeholder {
  color: var(--text-muted);
}

.mobile-room-input:focus {
  outline: none;
  border-color: var(--accent-active);
  box-shadow: 0 0 0 2px rgba(82, 121, 111, 0.2);
}

.mobile-create-btn {
  width: 100%;
  padding: 14px 32px;
  background: var(--accent-active);
  border: none;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-create-btn:hover:not(:disabled) {
  background: var(--accent-inactive);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.mobile-create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.room-name-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.room-name-input label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.room-input {
  flex: 1;
  padding: 10px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: all 0.2s ease;
}

.room-input::placeholder {
  color: var(--text-muted);
}

.room-input:focus {
  outline: none;
  border-color: var(--accent-active);
  box-shadow: 0 0 0 2px rgba(82, 121, 111, 0.2);
}

.create-btn {
  padding: 12px 32px;
  background: var(--accent-active);
  border: none;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.create-btn:hover:not(:disabled) {
  background: var(--accent-inactive);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Responsive */
@media screen and (max-width: 1200px) {
  .camera-panel {
    width: 400px;
    height: 400px;
    max-width: 400px;
    max-height: 400px;
    min-width: 400px;
    min-height: 400px;
  }

  .settings-panel {
    width: 400px;
    height: 400px;
  }

  .device-section {
    width: 400px;
    max-width: 400px;
  }

  .lobby-content-wrapper {
    max-width: 820px; /* 400px + 20px + 400px */
  }

  .center-rectangle {
    grid-template-columns: 400px 400px;
    max-width: 820px;
  }


  .mobile-create-section {
    max-width: 820px;
  }
}

@media screen and (max-width: 1024px) {
  .camera-panel {
    width: 350px;
    height: 350px;
    max-width: 350px;
    max-height: 350px;
    min-width: 350px;
    min-height: 350px;
  }

  .settings-panel {
    width: 350px;
    height: 350px;
  }

  .device-section {
    width: 350px;
    max-width: 350px;
  }

  .lobby-content-wrapper {
    max-width: 720px; /* 350px + 20px + 350px */
  }

  .center-rectangle {
    grid-template-columns: 350px 350px;
    max-width: 720px;
  }

  .name-section-wrapper {
    width: 720px;
  }

  .name-section-wrapper .device-section {
    width: 720px;
    max-width: 720px;
  }

  .mobile-create-section {
    max-width: 720px;
  }
}

@media screen and (max-width: 768px) {
  .lobby-footer {
    display: none;
  }

  .mobile-create-section {
    display: flex;
  }

  .lobby-content {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    padding: 16px;
    padding-bottom: 0;
  }

  .center-rectangle {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 100%;
  }

  .camera-panel {
    width: 100%;
    max-width: 496px;
    min-width: 0;
    aspect-ratio: 1;
    height: auto;
  }

  .camera-preview-container {
    width: 100%;
    height: 100%;
  }

  .settings-panel {
    width: 100%;
    max-width: 496px;
    height: auto;
    min-height: 400px;
  }

  .device-section {
    width: 100%;
    max-width: 496px;
  }

  .lobby-content-wrapper {
    max-width: 100%;
  }


  .volume-visualization {
    min-height: 150px;
  }
}

@media screen and (max-width: 480px) {
  .lobby-footer {
    display: none;
  }

  .mobile-create-section {
    display: flex;
    padding: 12px 16px;
  }

  .lobby-content {
    padding: 12px;
    padding-bottom: 0;
  }

  .camera-panel {
    max-width: 100%;
  }

  .settings-panel {
    max-width: 100%;
    min-height: 350px;
  }

  .device-section {
    padding: 16px;
    max-width: 100%;
  }

  .name-section-wrapper {
    max-width: 100%;
  }

  .volume-visualization {
    min-height: 120px;
    padding: 6px;
  }

  .lobby-header {
    padding: 12px 16px;
  }

  .lobby-title {
    font-size: 16px;
  }
}

@media screen and (max-width: 768px) {
  .lobby-content {
    padding: 16px;
  }

  .camera-preview-container {
    max-width: 100%;
  }

  .settings-panel {
    max-width: 100%;
  }

  .lobby-header {
    padding: 12px 16px;
  }

  .lobby-title {
    font-size: 16px;
  }

  .lobby-footer {
    flex-direction: column;
    padding: 12px 16px;
    gap: 12px;
  }

  .room-name-input {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .room-name-input label {
    margin-bottom: 8px;
  }

  .create-btn {
    width: 100%;
  }
}

@media screen and (max-width: 480px) {
  .lobby-content {
    padding: 12px;
  }

  .device-section {
    padding: 16px;
  }

  .lobby-header {
    padding: 10px 12px;
  }

  .lobby-title {
    font-size: 14px;
  }
}
</style>
