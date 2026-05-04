<script lang="ts">
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let username = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    loading = true;

    try {
      await auth.login(username, password);
      goto('/admin');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Login failed';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Login - MCP Registry</title>
</svelte:head>

<div class="max-w-md mx-auto px-4 py-16">
  <div class="bg-white rounded-lg shadow-md p-8">
    <h1 class="text-2xl font-bold text-gray-900 mb-6 text-center">Admin Login</h1>

    {#if error}
      <div class="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
        {error}
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label for="username" class="block text-sm font-medium text-gray-700 mb-1">
          Username
        </label>
        <input
          id="username"
          type="text"
          bind:value={username}
          required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        class="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  </div>
</div>
