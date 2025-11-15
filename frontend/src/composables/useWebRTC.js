import { ref } from 'vue'

export function useWebRTC(roomName, uid, userName) {
  const localStream = ref(null)
  const peerConnections = ref({})
  const videoSocket = ref(null)
  const displayedVideos = ref(new Set())
  const connectedUsers = ref(new Set())

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  const initVideoWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/video/${roomName}/`
    
    videoSocket.value = new WebSocket(wsUrl)
    
    videoSocket.value.onopen = () => {
      console.log('[WebRTC] WebSocket connected')
    }
    
    videoSocket.value.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      await handleSignalingMessage(message)
    }
    
    videoSocket.value.onerror = (error) => {
      console.error('[WebRTC] WebSocket error:', error)
    }
    
    videoSocket.value.onclose = () => {
      console.log('[WebRTC] WebSocket disconnected')
    }
  }

  const getUserMedia = async () => {
    try {
      localStream.value = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      })
      return localStream.value
    } catch (error) {
      console.error('[WebRTC] Error accessing media:', error)
      throw error
    }
  }

  const createPeerConnection = (userId) => {
    const peerConnection = new RTCPeerConnection(configuration)
    
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream.value)
      })
    }
    
    let trackReceived = false
    peerConnection.ontrack = (event) => {
      if (trackReceived) return
      trackReceived = true
      
      const remoteStream = event.streams[0]
      if (remoteStream) {
        // mic-active class will be managed by audio detection in Room.vue
        return { userId, stream: remoteStream }
      }
    }
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          to: userId,
          from: uid
        })
      }
    }
    
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState
      if (state === 'failed') {
        try {
          peerConnection.restartIce()
        } catch (error) {
          console.error('[WebRTC] Error restarting ICE:', error)
        }
      }
    }
    
    return peerConnection
  }

  const createOffer = async (userId) => {
    if (peerConnections.value[userId]) {
      return
    }
    
    peerConnections.value[userId] = null
    
    const peerConnection = createPeerConnection(userId)
    peerConnections.value[userId] = peerConnection
    
    try {
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      
      sendSignalingMessage({
        type: 'offer',
        offer: offer,
        to: userId,
        from: uid
      })
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error)
      if (peerConnections.value[userId]) {
        peerConnections.value[userId].close()
        delete peerConnections.value[userId]
      }
    }
  }

  const handleOffer = async (message) => {
    if (!peerConnections.value[message.from]) {
      const peerConnection = createPeerConnection(message.from)
      peerConnections.value[message.from] = peerConnection
    }
    
    const peerConnection = peerConnections.value[message.from]
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer))
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      
      sendSignalingMessage({
        type: 'answer',
        answer: answer,
        to: message.from,
        from: uid
      })
    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error)
    }
  }

  const handleAnswer = async (message) => {
    const peerConnection = peerConnections.value[message.from]
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer))
      } catch (error) {
        console.error('[WebRTC] Error handling answer:', error)
      }
    }
  }

  const handleIceCandidate = async (message) => {
    const peerConnection = peerConnections.value[message.from]
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
      } catch (error) {
        console.error('[WebRTC] Error handling ICE candidate:', error)
      }
    }
  }

  const handleSignalingMessage = async (message) => {
    if (message._target && message._target !== uid) {
      return
    }
    if (message.to && message.to !== uid && message.type !== 'user-joined' && message.type !== 'user-left') {
      return
    }
    
    switch (message.type) {
      case 'offer':
        if (!peerConnections.value[message.from]) {
          await handleOffer(message)
        }
        break
      case 'answer':
        await handleAnswer(message)
        break
      case 'ice-candidate':
        await handleIceCandidate(message)
        break
      case 'user-joined':
        if (message.from && message.from !== uid && !peerConnections.value[message.from]) {
          connectedUsers.value.add(message.from)
          await createOffer(message.from)
        }
        break
      case 'user-left':
        handleUserLeft(message.from)
        break
    }
  }

  const handleUserLeft = (userId) => {
    if (peerConnections.value[userId]) {
      peerConnections.value[userId].close()
      delete peerConnections.value[userId]
    }
    displayedVideos.value.delete(userId)
    connectedUsers.value.delete(userId)
    return userId
  }

  const sendSignalingMessage = (message) => {
    if (videoSocket.value && videoSocket.value.readyState === WebSocket.OPEN) {
      videoSocket.value.send(JSON.stringify(message))
    }
  }

  const joinRoom = async () => {
    await createMember()
    
    try {
      const response = await fetch(`/get_room_members/?room_name=${roomName}`)
      const data = await response.json()
      
      if (data.members && data.members.length > 0) {
        setTimeout(async () => {
          for (const member of data.members) {
            if (member.uid !== uid && !peerConnections.value[member.uid]) {
              connectedUsers.value.add(member.uid)
              await createOffer(member.uid)
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }, 500)
      }
    } catch (error) {
      console.error('[WebRTC] Error getting room members:', error)
    }
    
    sendSignalingMessage({
      type: 'user-joined',
      from: uid
    })
  }

  const createMember = async () => {
    try {
      await fetch('/create_member/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName,
          room_name: roomName,
          UID: uid
        })
      })
    } catch (error) {
      console.error('[WebRTC] Error creating member:', error)
    }
  }

  const deleteMember = async () => {
    try {
      await fetch('/delete_member/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName,
          room_name: roomName,
          UID: uid
        })
      })
    } catch (error) {
      console.error('[WebRTC] Error deleting member:', error)
    }
  }

  const leaveRoom = async () => {
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => track.stop())
    }
    
    Object.keys(peerConnections.value).forEach(userId => {
      peerConnections.value[userId].close()
    })
    peerConnections.value = {}
    
    displayedVideos.value.clear()
    connectedUsers.value.clear()
    
    await deleteMember()
    
    sendSignalingMessage({
      type: 'user-left',
      from: uid
    })
    
    if (videoSocket.value) videoSocket.value.close()
  }

  return {
    localStream,
    peerConnections,
    videoSocket,
    displayedVideos,
    connectedUsers,
    initVideoWebSocket,
    getUserMedia,
    joinRoom,
    leaveRoom,
    handleSignalingMessage,
    createPeerConnection
  }
}

