import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  root: resolve(__dirname, 'base/static'),
  base: '/static/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'base/static'),
      'vue': resolve(__dirname, 'node_modules/vue')
    }
  },
  build: {
    outDir: resolve(__dirname, 'staticfiles'),
    emptyOutDir: false,
    manifest: true,
    rollupOptions: {
      input: {
        'js/vue-app': resolve(__dirname, 'base/static/js/vue-app.js'),
      },
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: (chunkInfo) => {
          const name = chunkInfo.name.replace('js/', '')
          return `js/${name}.js`
        },
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'styles/[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      host: 'localhost',
      port: 5173
    },
    fs: {
      allow: ['..', __dirname]
    },
    middlewareMode: false
  }
})

