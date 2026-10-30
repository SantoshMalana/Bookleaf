import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the API runs on :4000; proxying keeps the browser on a single origin, so the
// httpOnly session cookie and the SSE stream work exactly as they do in production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:4000', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
