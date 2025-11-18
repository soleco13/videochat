import { ref, onUnmounted } from 'vue'

/**
 * Composable for audio level detection
 * Analyzes audio stream to determine if user is actually speaking
 */
export function useAudioDetection() {
  const isSpeaking = ref(false)
  const audioContext = ref(null)
  const analyser = ref(null)
  const dataArray = ref(null)
  const animationFrameId = ref(null)
  
  // Порог для определения речи (0-255, где 255 - максимальная громкость)
  // Увеличиваем порог, чтобы игнорировать фоновый шум
  const SPEECH_THRESHOLD = 40 // Минимальный уровень для определения речи (увеличен для меньшей чувствительности)
  const SMOOTHING_FACTOR = 0.85 // Сглаживание для избежания мерцания (увеличено для более стабильной работы)
  const MIN_SPEECH_DURATION = 200 // Минимальная длительность речи в мс для активации обводки
  
  let lastLevel = 0
  let speechStartTime = 0
  let isCurrentlySpeaking = false
  
  const startDetection = (audioStream) => {
    if (!audioStream) return
    
    try {
      // Создаем AudioContext
      audioContext.value = new (window.AudioContext || window.webkitAudioContext)()
      analyser.value = audioContext.value.createAnalyser()
      
      // Настройки анализатора
      analyser.value.fftSize = 256 // Размер FFT для анализа
      analyser.value.smoothingTimeConstant = SMOOTHING_FACTOR
      
      const source = audioContext.value.createMediaStreamSource(audioStream)
      source.connect(analyser.value)
      
      dataArray.value = new Uint8Array(analyser.value.frequencyBinCount)
      
      // Запускаем анализ
      analyzeAudio()
    } catch (error) {
      console.error('[AudioDetection] Error starting detection:', error)
    }
  }
  
  // Оптимизация: уменьшаем частоту анализа для экономии ресурсов
  let lastAnalysisTime = 0
  const ANALYSIS_INTERVAL = 16 // ~60fps (каждый кадр)
  
  const analyzeAudio = () => {
    if (!analyser.value || !dataArray.value) return
    
    const now = Date.now()
    // Оптимизация: пропускаем анализ, если прошло мало времени
    if (now - lastAnalysisTime < ANALYSIS_INTERVAL) {
      animationFrameId.value = requestAnimationFrame(analyzeAudio)
      return
    }
    lastAnalysisTime = now
    
    // Получаем данные об уровне звука
    analyser.value.getByteFrequencyData(dataArray.value)
    
    // Оптимизация: используем более эффективный способ вычисления среднего
    // Берем только каждую 4-ю точку для ускорения (можно настроить)
    let sum = 0
    let count = 0
    const step = 4 // Пропускаем каждые 3 точки
    for (let i = 0; i < dataArray.value.length; i += step) {
      sum += dataArray.value[i]
      count++
    }
    const average = count > 0 ? sum / count : 0
    
    // Применяем сглаживание
    const smoothedLevel = lastLevel * SMOOTHING_FACTOR + average * (1 - SMOOTHING_FACTOR)
    lastLevel = smoothedLevel
    
    // Определяем, говорит ли пользователь
    const aboveThreshold = smoothedLevel > SPEECH_THRESHOLD
    
    if (aboveThreshold && !isCurrentlySpeaking) {
      // Начало речи
      speechStartTime = Date.now()
      isCurrentlySpeaking = true
    } else if (!aboveThreshold && isCurrentlySpeaking) {
      // Конец речи - проверяем минимальную длительность
      const speechDuration = Date.now() - speechStartTime
      if (speechDuration < MIN_SPEECH_DURATION) {
        // Слишком короткая речь - игнорируем
        isCurrentlySpeaking = false
        if (isSpeaking.value) {
          isSpeaking.value = false
        }
      } else {
        // Речь была достаточно длинной
        isCurrentlySpeaking = false
        if (isSpeaking.value) {
          // Небольшая задержка перед снятием обводки
          setTimeout(() => {
            isSpeaking.value = false
          }, 300)
        }
      }
    }
    
    // Обновляем состояние только если речь продолжается достаточно долго
    if (isCurrentlySpeaking) {
      const speechDuration = Date.now() - speechStartTime
      if (speechDuration >= MIN_SPEECH_DURATION && !isSpeaking.value) {
        isSpeaking.value = true
      }
    }
    
    // Продолжаем анализ
    animationFrameId.value = requestAnimationFrame(analyzeAudio)
  }
  
  const stopDetection = () => {
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
      animationFrameId.value = null
    }
    
    if (audioContext.value) {
      audioContext.value.close().catch(console.error)
      audioContext.value = null
    }
    
    analyser.value = null
    dataArray.value = null
    isSpeaking.value = false
    lastLevel = 0
    isCurrentlySpeaking = false
    speechStartTime = 0
  }
  
  onUnmounted(() => {
    stopDetection()
  })
  
  return {
    isSpeaking,
    startDetection,
    stopDetection
  }
}

