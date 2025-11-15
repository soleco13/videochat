<template>
  <div class="chat-section" v-show="show" :class="{ 'open': show }">
    <div class="chat-messages" ref="chatMessages">
      <div 
        v-for="(message, index) in messages" 
        :key="index"
        class="message"
        :class="{ 'own': message.user_name === userName }"
      >
        <div class="message-avatar"></div>
        <div class="message-content">
          <div class="message-author">
            {{ message.user_name === userName ? 'You' : message.user_name }}
          </div>
          <div class="message-text">{{ message.message }}</div>
        </div>
      </div>
    </div>
    <div class="chat-input-wrapper">
      <input 
        v-model="newMessage" 
        @keyup.enter="sendMessage"
        type="text" 
        placeholder="Type your message..." 
        class="chat-input"
      />
      <button @click="sendMessage" class="send-btn">Send</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  messages: {
    type: Array,
    default: () => []
  },
  userName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['send'])

const newMessage = ref('')
const chatMessages = ref(null)

const sendMessage = () => {
  if (!newMessage.value.trim()) return
  emit('send', newMessage.value.trim())
  newMessage.value = ''
  nextTick(() => {
    scrollToBottom()
  })
}

const scrollToBottom = () => {
  if (chatMessages.value) {
    chatMessages.value.scrollTop = chatMessages.value.scrollHeight
  }
}

watch(() => props.messages, () => {
  nextTick(() => {
    scrollToBottom()
  })
}, { deep: true })

watch(() => props.show, (newVal) => {
  if (newVal) {
    nextTick(() => {
      scrollToBottom()
    })
  }
})
</script>

<style>
/* Chat styles are in global chat.css */
</style>
