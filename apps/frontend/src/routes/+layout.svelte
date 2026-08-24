<script lang="ts">
  import '../app.css';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let { children } = $props();
  let dark = $state(false);

  onMount(() => {
    auth.init();
    // app.html already applied the class before paint; just read it back.
    dark = document.documentElement.classList.contains('dark');
  });

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // private mode / storage disabled — the toggle still works for this session
    }
  }
</script>

<div class="min-h-screen flex flex-col">
  <!-- Nav -->
  <nav class="bg-white border-b">
    <div class="max-w-7xl mx-auto px-4">
      <div class="flex justify-between h-14 items-center">
        <a href="/" class="font-semibold text-lg text-gray-900">
          MCP Registry
        </a>
        <div class="flex items-center gap-4">
          <a href="/" class="text-sm text-gray-600 hover:text-gray-900">
            Servers
          </a>
          <a href="/skills" class="text-sm text-gray-600 hover:text-gray-900">
            Skills
          </a>
          <button
            type="button"
            onclick={toggleTheme}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={dark ? 'Light theme' : 'Dark theme'}
            class="p-1.5 rounded text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            {#if dark}
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            {:else}
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            {/if}
          </button>
          {#if $isAuthenticated}
            <a href="/admin" class="text-sm text-gray-600 hover:text-gray-900">
              Admin
            </a>
            <a href="/admin/runtime" class="text-sm text-gray-600 hover:text-gray-900">
              Runtime
            </a>
            <a href="/admin/pm2" class="text-sm text-gray-600 hover:text-gray-900">
              PM2
            </a>
            <button
              type="button"
              onclick={() => auth.logout()}
              class="text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          {:else}
            <a href="/login" class="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Login
            </a>
          {/if}
        </div>
      </div>
    </div>
  </nav>

  <!-- Main content -->
  <main class="flex-1">
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="bg-gray-50 border-t py-4">
    <div class="max-w-7xl mx-auto px-4">
      <div class="flex justify-between items-center text-sm text-gray-600">
        <span>MCP Private Registry</span>
        <a
          href="https://github.com/modelcontextprotocol"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-600 hover:underline"
        >
          Model Context Protocol
        </a>
      </div>
    </div>
  </footer>
</div>
