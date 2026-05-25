<script lang="ts">
  import '../app.css';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
    auth.init();
  });
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
          <a href="/agents" class="text-sm text-gray-600 hover:text-gray-900">
            Agents
          </a>
          {#if $isAuthenticated}
            <a href="/admin" class="text-sm text-gray-600 hover:text-gray-900">
              Admin
            </a>
            <a href="/admin/runtime" class="text-sm text-gray-600 hover:text-gray-900">
              Runtime
            </a>
            <a href="/admin/agent-runtime" class="text-sm text-gray-600 hover:text-gray-900">
              Agent Runtime
            </a>
            <a href="/admin/pm2" class="text-sm text-gray-600 hover:text-gray-900">
              PM2
            </a>
            <a href="/admin/ollama" class="text-sm text-gray-600 hover:text-gray-900">
              Ollama
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
