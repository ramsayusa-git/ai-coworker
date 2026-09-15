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
    },
    // The console talks to the core same-origin (see api/client.ts). In
    // production the reverse proxy does this; in dev, this does.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8100', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8100', changeOrigin: true },
      '/version': { target: 'http://127.0.0.1:8100', changeOrigin: true },
      '/contracts': { target: 'http://127.0.0.1:8100', changeOrigin: true },
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
