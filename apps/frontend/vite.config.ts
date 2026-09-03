import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/v0.1': {
        target: 'http://localhost:4269',
        changeOrigin: true
      },
      '/admin/runtime': {
        target: 'http://localhost:4270',
        changeOrigin: true
      },
      '/admin/a2a': {
        target: 'http://localhost:4271',
        changeOrigin: true
      },
      '/admin': {
        target: 'http://localhost:4269',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:4269',
        changeOrigin: true
      }
    }
  }
});
