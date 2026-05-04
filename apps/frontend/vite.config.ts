import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/v0.1': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/admin/runtime': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
