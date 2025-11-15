<template>
  <main>
    <section id="form-container">
        <img id="logo" src="/images/group.svg" alt="Logo" />
      
      <div id="welcome-message">
        <h1>Batch Meet</h1>
        <p>A group video calling platform made for UIT Students!</p>
      </div>

      <form @submit.prevent="handleSubmit" id="form">
        <div class="field-wrapper">
          <div class="form-field">
            <label>Room:</label>
            <input 
              v-model="roomName" 
              name="room" 
              placeholder="Enter a room name..." 
              style="text-transform:uppercase"
              required
            />
          </div>

          <div class="form-field">
            <label>Name:</label>
            <input 
              v-model="userName" 
              name="name" 
              placeholder="Enter your name..." 
              style="text-transform:uppercase"
              required
            />
          </div>

          <div class="form-field">
            <input type="submit" value="Create/Join Room" />
          </div>
        </div>
      </form>
      
      <div v-if="inviteUrl" id="invite-section">
        <h3>Invite Link:</h3>
        <div class="invite-link-wrapper">
          <input type="text" :value="inviteUrl" readonly id="invite-link" />
          <button @click="copyInviteLink" class="copy-btn">Copy</button>
        </div>
        <p>Share this link with others to invite them to the room</p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const roomName = ref('')
const userName = ref('')
const inviteUrl = ref('')

const handleSubmit = async () => {
  if (!roomName.value.trim() || !userName.value.trim()) {
    alert('Please fill in all fields')
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

    // Show invite link
    inviteUrl.value = roomData.invite_url

    // Get UID
    const response = await fetch(`/get_token/?channel=${room}`)
    const data = await response.json()

    const UID = data.uid || Math.random().toString(36).substring(7)

    // Store in sessionStorage
    sessionStorage.setItem('UID', UID)
    sessionStorage.setItem('room', room)
    sessionStorage.setItem('name', name)
    localStorage.setItem('username', name)
    
    // Redirect after a short delay to show invite link
    setTimeout(() => {
      router.push(`/room/${room}`)
    }, 1000)
  } catch (error) {
    console.error('Error creating room:', error)
    alert('Error creating room. Please try again.')
  }
}

const copyInviteLink = () => {
  const inviteLink = document.getElementById('invite-link')
  inviteLink.select()
  inviteLink.setSelectionRange(0, 99999)
  document.execCommand('copy')
  
  const btn = event.target
  const originalText = btn.textContent
  btn.textContent = 'Copied!'
  btn.style.backgroundColor = '#4CAF50'
  
  setTimeout(() => {
    btn.textContent = originalText
    btn.style.backgroundColor = 'rgb(75, 93, 172)'
  }, 2000)
}
</script>

<style>
/* Lobby styles are in global lobby.css */
</style>

