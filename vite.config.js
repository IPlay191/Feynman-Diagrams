import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During development, browser calls to /api go to the Express proxy (server/index.js).
    proxy: { '/api': 'http://localhost:8787', '/tiles': 'http://localhost:8787' },
  },
});
