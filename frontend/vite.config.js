import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  root: resolve(__dirname, 'src'),
  base: '/',
  publicDir: resolve(__dirname, 'src/static'),
  build: {
    outDir: resolve(__dirname, '../staticfiles'),
    emptyOutDir: false,
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        room: resolve(__dirname, 'src/room-entry.js')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'room') {
            return 'js/vue-app.js'
          }
          return 'js/[name].js'
        },
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            // Keep original CSS file names for Django static files
            return 'styles/[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
        // Ensure imports use correct paths
        format: 'es',
        // Use absolute paths for chunk imports
        paths: (id) => {
          // If it's a relative import, make it absolute from /static/
          if (id.startsWith('./') || id.startsWith('../')) {
            return `/static/${id.replace(/^\.\//, '').replace(/^\.\.\//, '')}`
          }
          return id
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
      '/get_token': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/create_room': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/create_member': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/get_member': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/delete_member': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/get_room_members': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})