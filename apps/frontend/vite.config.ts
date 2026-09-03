import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type ProxyOptions } from 'vite';
import type { IncomingMessage } from 'http';

/**
 * Several backend API prefixes (/admin, /admin/runtime, /admin/a2a...) share
 * a path segment with SvelteKit page routes of the same name (/admin,
 * /admin/runtime, /admin/agents...). A browser navigation — reload, typed
 * URL, back/forward — is a plain GET that matches the proxy rule just as
 * well as an API call does, and without this it lands on the backend's raw
 * JSON instead of the SPA shell. The app's own fetch() calls never send
 * Accept: text/html, so bypassing on that header only skips real page loads.
 *
 * Returning the request's own URL (a string) is what actually hands the
 * request to the next middleware (SvelteKit) in Vite 6 — `false` looks like
 * the obvious "don't proxy this" value but Vite's own proxy middleware
 * responds 404 itself in that case instead of falling through.
 */
function bypassNavigations(req: IncomingMessage): string | undefined {
  return req.headers.accept?.includes('text/html') ? req.url : undefined;
}

function backend(target: string): ProxyOptions {
  return { target, changeOrigin: true, bypass: bypassNavigations };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/v0.1': backend('http://localhost:4269'),
      '/admin/runtime': backend('http://localhost:4270'),
      '/admin/a2a': backend('http://localhost:4271'),
      '/admin': backend('http://localhost:4269'),
      '/health': backend('http://localhost:4269'),
    }
  }
});
