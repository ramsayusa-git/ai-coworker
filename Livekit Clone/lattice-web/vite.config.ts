import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: false,
    allowedHosts: [
      'latticenet.aetosiot.com',
      '.aetosiot.com',
      'localhost'
    ],
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'latticenet.aetosiot.com'
    }
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
    allowedHosts: ['latticenet.aetosiot.com', '.aetosiot.com', 'localhost']
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
