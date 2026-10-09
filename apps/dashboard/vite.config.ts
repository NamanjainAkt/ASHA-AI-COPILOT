import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/patients': 'http://127.0.0.1:8000',
      '/screenings': 'http://127.0.0.1:8000',
      '/followups': 'http://127.0.0.1:8000',
      '/workers': 'http://127.0.0.1:8000',
      '/dashboard': 'http://127.0.0.1:8000',
      '/models': 'http://127.0.0.1:8000',
      '/sync': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
