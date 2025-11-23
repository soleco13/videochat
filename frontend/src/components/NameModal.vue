<template>
  <div v-if="show" class="name-modal-overlay" @click.self="handleOverlayClick">
    <div class="name-modal">
      <div class="name-modal-content">
        <h2 class="name-modal-title">Представьтесь, чтобы участники могли вас узнать</h2>
        <input
          v-model="localName"
          type="text"
          placeholder="Введите ваше имя..."
          class="name-modal-input"
          @keyup.enter="handleContinue"
          ref="nameInput"
          style="text-transform: uppercase"
        />
        <button
          class="name-modal-button"
          @click="handleContinue"
          :disabled="!localName.trim()"
        >
          Продолжить
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  initialName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['continue', 'close'])

const localName = ref('')
const nameInput = ref(null)

watch(() => props.show, (newVal) => {
  if (newVal) {
    localName.value = props.initialName || ''
    nextTick(() => {
      if (nameInput.value) {
        nameInput.value.focus()
      }
    })
  }
})

watch(() => props.initialName, (newVal) => {
  if (!localName.value && newVal) {
    localName.value = newVal
  }
})

onMounted(() => {
  // Load saved name from localStorage
  const savedName = localStorage.getItem('username') || sessionStorage.getItem('name')
  if (savedName && !localName.value) {
    localName.value = savedName
  }
})

function handleContinue() {
  const name = localName.value.trim()
  if (!name) {
    return
  }
  
  // Save to localStorage
  localStorage.setItem('username', name)
  
  emit('continue', name)
}

function handleOverlayClick() {
  // Don't close on overlay click - user must enter name
}
</script>

<style scoped>
@import '../styles/theme.css';

.name-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.name-modal {
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: 32px;
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
}

.name-modal-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.name-modal-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  text-align: center;
  line-height: 1.4;
}

.name-modal-input {
  width: 100%;
  padding: 14px 18px;
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 16px;
  font-family: inherit;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.name-modal-input::placeholder {
  color: var(--text-muted);
}

.name-modal-input:focus {
  outline: none;
  border-color: var(--accent-active);
  box-shadow: 0 0 0 3px rgba(82, 121, 111, 0.2);
}

.name-modal-button {
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

.name-modal-button:hover:not(:disabled) {
  background: var(--accent-inactive);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.name-modal-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Mobile styles */
@media screen and (max-width: 480px) {
  .name-modal {
    padding: 24px;
    width: 95%;
  }

  .name-modal-title {
    font-size: 18px;
  }

  .name-modal-input {
    padding: 12px 16px;
    font-size: 14px;
  }

  .name-modal-button {
    padding: 12px 24px;
    font-size: 14px;
  }
}
</style>

