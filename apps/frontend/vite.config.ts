import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/v0.1': {
        target: 'http://localhost:3003',
        changeOrigin: true
      },
      '/admin/agent-runtime': {
        target: 'http://localhost:3027',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
            }

            res.end(JSON.stringify({
              error: 'Agent Runtime backend is not reachable on http://localhost:3027. Start it with npm run dev:agent-runtime.',
            }));
          });
        }
      },
      '/admin/ollama': {
        target: 'http://localhost:3027',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
            }
            res.end(JSON.stringify({
              error: 'Agent Runtime backend is not reachable on http://localhost:3027. Start it with npm run dev:agent-runtime.',
            }));
          });
        }
      },
      '/admin/runtime': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/admin': {
        target: 'http://localhost:3003',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:3003',
        changeOrigin: true
      }
    }
  }
});
