import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to 5174, 5175... (old copies then keep showing old code)
    strictPort: true,
    // During development, browser calls to /api go to the Express proxy (server/index.js).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
