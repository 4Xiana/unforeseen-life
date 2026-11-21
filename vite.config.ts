import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5182',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['connection'] = 'keep-alive';
              delete proxyRes.headers['content-length'];
              delete proxyRes.headers['content-encoding'];
            }
          });
        },
      },
      '/evidence': {
        target: 'http://localhost:5182',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5183,
    strictPort: true,
    proxy: {
      '/unforeseen-life/api': {
        target: 'http://127.0.0.1:5184',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/unforeseen-life/, ''),
      },
      '/unforeseen-life/evidence': {
        target: 'http://127.0.0.1:5184',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/unforeseen-life/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        debug: resolve(__dirname, 'debug.html'),
      },
    },
  },
})
