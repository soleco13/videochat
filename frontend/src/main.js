import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Lobby from './views/Lobby.vue'
// Room component removed - use Django template instead
import JoinRoom from './views/JoinRoom.vue'

// Only initialize if we're not in room.html (which uses vue-app.js)
// Check if room-name element exists (it's added by room.html) or if vue-app.js is loaded
function shouldSkipSPA() {
    // Check for room-name element (added by room.html) - this means we're on /room/ page with room.html template
    if (document.getElementById('room-name') && window.location.pathname.includes('/room/')) {
        return true;
    }
    // Check if vue-app.js is already loaded (it would have mounted Vue)
    if (window.__VUE_APP_MOUNTED__) {
        return true;
    }
    // Don't skip for /join/ pages - they should use SPA
    if (window.location.pathname.includes('/join/')) {
        return false;
    }
    return false;
}

if (shouldSkipSPA()) {
    console.log('[SPA] Skipping SPA initialization - room.html detected');
} else {
    const routes = [
        { path: '/', name: 'Lobby', component: Lobby },
        // Room route removed - use Django template /room/:roomName/ instead
        { path: '/join/:roomId', name: 'JoinRoom', component: JoinRoom, props: true },
        { path: '/join/:roomId/', name: 'JoinRoomTrailing', component: JoinRoom, props: true } // Handle trailing slash
    ]

    const router = createRouter({
        history: createWebHistory('/'),
        routes
    })

    // Wait for DOM to be ready
    function initSPA() {
        const appElement = document.getElementById('app');
        if (!appElement) {
            console.error('[SPA] #app element not found');
            return;
        }

        const app = createApp(App)
        app.use(router)
        app.mount('#app')
        console.log('[SPA] App mounted successfully');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSPA);
    } else {
        initSPA();
    }
}

