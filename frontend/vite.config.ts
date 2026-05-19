import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
      process: 'process/browser',
    },
  },

  define: {
    global: 'globalThis',
  },

  optimizeDeps: {
    include: ['simple-peer', 'buffer', 'process'],
  },

  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom') || /[/\\]react[/\\]/.test(id) || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('@tanstack/react-query')) {
            return 'vendor-query';
          }
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('simple-peer') || id.includes('readable-stream')) {
            return 'vendor-webrtc';
          }
        },
      },
    },
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
