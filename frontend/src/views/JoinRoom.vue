<template>
  <main>
    <section id="form-container">
        <img id="logo" src="/images/group.svg" alt="Logo" />
      
      <div id="welcome-message">
        <h1>Join Room</h1>
        <p v-if="error" style="color: red;">{{ error }}</p>
        <p v-else>Enter your name to join the room</p>
      </div>

      <form v-if="!error" @submit.prevent="handleSubmit" id="form">
        <div class="field-wrapper">
          <div class="form-field">
            <label>Room:</label>
            <input :value="roomName" readonly class="readonly-input" />
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
            <input type="submit" value="Join Room" />
          </div>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const roomName = ref('')
const userName = ref('')
const error = ref('')

onMounted(async () => {
  const roomId = route.params.roomId
  try {
    const response = await fetch(`/join/${roomId}/`)
    const text = await response.text()
    // Parse room name from response or use API
    // For now, we'll fetch it from API
    const roomResponse = await fetch(`/api/room/${roomId}/`)
    if (roomResponse.ok) {
      const data = await roomResponse.json()
      roomName.value = data.name
    } else {
      error.value = 'Room not found or inactive'
    }
  } catch (err) {
    error.value = 'Room not found or inactive'
  }
})

const handleSubmit = async () => {
  const name = userName.value.trim().toUpperCase()
  if (!name) {
    alert('Please enter your name')
    return
  }

  try {
    const response = await fetch(`/get_token/?channel=${roomName.value}`)
    const data = await response.json()

    const UID = data.uid || Math.random().toString(36).substring(7)

    sessionStorage.setItem('UID', UID)
    sessionStorage.setItem('room', roomName.value)
    sessionStorage.setItem('name', name)
    localStorage.setItem('username', name)
    
    router.push(`/room/${roomName.value}`)
  } catch (err) {
    alert('Error joining room. Please try again.')
  }
}
</script>

<style>
@import '/styles/theme.css';
@import '/styles/lobby.css';
</style>

