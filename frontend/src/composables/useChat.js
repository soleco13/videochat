import { ref } from 'vue'

export function useChat(roomName, userName) {
  const messages = ref([])
  const chatSocket = ref(null)
  const unreadCount = ref(0)

  const initChatWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/chat/${roomName}/`
    
    chatSocket.value = new WebSocket(wsUrl)
    
    chatSocket.value.onopen = () => {
      console.log('[Chat] WebSocket connected')
    }
    
    // Оптимизация: батчинг сообщений
    let messageBatch = []
    let batchTimer = null
    const BATCH_DELAY = 50
    
    chatSocket.value.onmessage = (event) => {
      try {
        // Оптимизация: проверяем размер данных перед парсингом
        if (event.data.length > 100000) {
          console.warn('[Chat] Message too large, ignoring')
          return
        }
        
        const data = JSON.parse(event.data)
        
        messageBatch.push({
          user_name: data.user_name,
          message: data.message
        })
        
        // Отменяем предыдущий таймер
        if (batchTimer) {
          clearTimeout(batchTimer)
        }
        
        // Обрабатываем батч
        batchTimer = setTimeout(() => {
          if (messageBatch.length > 0) {
            messages.value.push(...messageBatch)
            messageBatch = []
          }
          batchTimer = null
        }, BATCH_DELAY)
      } catch (error) {
        console.error('[Chat] Error parsing message:', error)
      }
    }
    
    chatSocket.value.onerror = (error) => {
      console.error('[Chat] WebSocket error:', error)
    }
    
    chatSocket.value.onclose = () => {
      console.log('[Chat] WebSocket disconnected')
    }
  }

  // Оптимизация: дебаунсинг и проверка размера
  let sendTimer = null
  
  const sendMessage = (message) => {
    if (!message || !message.trim()) return
    
    // Оптимизация: проверяем размер сообщения
    if (message.length > 10000) {
      console.warn('[Chat] Message too long, truncating')
      return
    }
    
    // Отменяем предыдущий таймер
    if (sendTimer) {
      clearTimeout(sendTimer)
    }
    
    // Дебаунсинг: отправляем через небольшую задержку
    sendTimer = setTimeout(() => {
      if (chatSocket.value && chatSocket.value.readyState === WebSocket.OPEN) {
        chatSocket.value.send(JSON.stringify({
          user_name: userName,
          message: message.trim()
        }))
      }
      sendTimer = null
    }, 50)
  }

  const incrementUnread = () => {
    unreadCount.value++
  }

  const resetUnread = () => {
    unreadCount.value = 0
  }

  const close = () => {
    if (chatSocket.value) {
      chatSocket.value.close()
    }
  }

  return {
    messages,
    chatSocket,
    unreadCount,
    initChatWebSocket,
    sendMessage,
    incrementUnread,
    resetUnread,
    close
  }
}

