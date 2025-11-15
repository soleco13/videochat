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
    
    chatSocket.value.onmessage = (event) => {
      const data = JSON.parse(event.data)
      messages.value.push({
        user_name: data.user_name,
        message: data.message
      })
    }
    
    chatSocket.value.onerror = (error) => {
      console.error('[Chat] WebSocket error:', error)
    }
    
    chatSocket.value.onclose = () => {
      console.log('[Chat] WebSocket disconnected')
    }
  }

  const sendMessage = (message) => {
    if (chatSocket.value && chatSocket.value.readyState === WebSocket.OPEN) {
      chatSocket.value.send(JSON.stringify({
        user_name: userName,
        message: message
      }))
    }
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

