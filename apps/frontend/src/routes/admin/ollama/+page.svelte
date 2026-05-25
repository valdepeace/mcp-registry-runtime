<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api } from '$lib/api/client';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import type { OllamaModel, OllamaRunningModel, OllamaStatus, OllamaPullEvent } from '$lib/types';

  let status = $state<OllamaStatus | null>(null);
  let models = $state<OllamaModel[]>([]);
  let running = $state<OllamaRunningModel[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);

  // Pull state
  let pullModel = $state('');
  let pulling = $state(false);
  let pullProgress = $state<OllamaPullEvent[]>([]);
  let pullError = $state<string | null>(null);
  let pullComplete = $state(false);

  // Delete state
  let deletingModel = $state<string | null>(null);

  // Poll timer for running models
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (pollTimer !== null) clearTimeout(pollTimer);
  });

  function scheduleRunningPoll() {
    pollTimer = setTimeout(async () => {
      try {
        const r = await api.listOllamaRunning();
        running = r.models;
      } catch { /* ignore */ }
      scheduleRunningPoll();
    }, 5000);
  }

  async function fetchAll() {
    loading = true;
    error = null;
    try {
      const [s, m, r] = await Promise.all([
        api.getOllamaStatus(),
        api.listOllamaModels(),
        api.listOllamaRunning(),
      ]);
      status = s;
      models = m.models;
      running = r.models;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load Ollama data';
    } finally {
      loading = false;
    }
    scheduleRunningPoll();
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete model "${name}"?`)) return;
    deletingModel = name;
    error = null;
    try {
      await api.deleteOllamaModel(name);
      message = `Model "${name}" deleted`;
      models = models.filter(m => m.name !== name);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    } finally {
      deletingModel = null;
    }
  }

  async function handlePull() {
    if (!pullModel.trim()) return;
    pulling = true;
    pullProgress = [];
    pullError = null;
    pullComplete = false;

    try {
      for await (const event of api.pullOllamaModel(pullModel.trim())) {
        pullProgress = [...pullProgress.slice(-1), event]; // keep last + current for display
        if (event.type === 'complete') {
          pullComplete = true;
          message = `Model "${pullModel}" pulled successfully`;
          pullModel = '';
          await fetchAll();
          break;
        }
        if (event.type === 'error') {
          pullError = event.error;
          break;
        }
      }
    } catch (e) {
      pullError = e instanceof Error ? e.message : 'Pull failed';
    } finally {
      pulling = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function pullProgressPercent(event: OllamaPullEvent): number {
    if (event.type !== 'progress' || !event.total) return 0;
    return Math.round((event.completed / event.total) * 100);
  }

  function latestProgressEvent(): Extract<OllamaPullEvent, { type: 'progress' }> | null {
    const last = pullProgress[pullProgress.length - 1];
    if (!last || last.type !== 'progress') return null;
    return last;
  }

  function latestStatus(): string {
    const last = pullProgress[pullProgress.length - 1];
    if (!last) return '';
    if (last.type === 'status') return last.status ?? '';
    if (last.type === 'progress') return last.status ?? '';
    if (last.type === 'complete') return 'Done';
    return '';
  }

  $effect(() => {
    if (!$isAuthenticated) { goto('/login'); return; }
    fetchAll();
  });
</script>

<svelte:head>
  <title>Ollama - Admin</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 py-8">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Ollama</h1>
      <p class="text-gray-600">Manage local LLM models</p>
    </div>
    <div class="flex items-center gap-3">
      {#if status !== null}
        <span class={`px-3 py-1.5 text-xs font-medium rounded-full ${status.running ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {status.running ? `Ollama ${status.version ?? ''}` : 'Ollama offline'}
        </span>
      {/if}
      <button
        type="button"
        onclick={fetchAll}
        disabled={loading}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
      >
        Refresh
      </button>
    </div>
  </div>

  <!-- Message / Error -->
  {#if message}
    <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4 flex justify-between">
      <span>{message}</span>
      <button type="button" onclick={() => message = null} class="text-green-500 hover:text-green-700">×</button>
    </div>
  {/if}
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex justify-between">
      <span>{error}</span>
      <button type="button" onclick={() => error = null} class="text-red-500 hover:text-red-700">×</button>
    </div>
  {/if}

  <!-- Ollama offline notice -->
  {#if status !== null && !status.running}
    <div class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-4 rounded mb-6">
      <p class="font-medium">Ollama is not running</p>
      <p class="text-sm mt-1">Start it with: <code class="bg-yellow-100 px-1 rounded">ollama serve</code></p>
    </div>
  {/if}

  <!-- Pull a model -->
  <div class="bg-white border rounded-lg p-5 mb-6">
    <h2 class="font-semibold text-gray-900 mb-3">Pull Model</h2>
    <div class="flex gap-3 items-end">
      <div class="flex-1">
        <label for="pullModelInput" class="block text-xs font-medium text-gray-600 mb-1">Model name</label>
        <input
          id="pullModelInput"
          type="text"
          bind:value={pullModel}
          placeholder="e.g. gemma3, llama3.2, mistral"
          disabled={pulling}
          onkeydown={(e) => e.key === 'Enter' && handlePull()}
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>
      <button
        type="button"
        onclick={handlePull}
        disabled={pulling || !pullModel.trim()}
        class="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {pulling ? 'Pulling...' : 'Pull'}
      </button>
    </div>

    <!-- Pull progress -->
    {#if pulling || pullComplete}
      <div class="mt-4 space-y-2">
        <div class="text-sm text-gray-600">{latestStatus()}</div>
        {#if latestProgressEvent()}
          {@const prog = latestProgressEvent()!}
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-blue-500 h-2 rounded-full transition-all duration-200"
              style="width: {pullProgressPercent(prog)}%"
            ></div>
          </div>
          <div class="text-xs text-gray-500 text-right">
            {formatBytes(prog.completed)} / {formatBytes(prog.total)}
            ({pullProgressPercent(prog)}%)
          </div>
        {/if}
      </div>
    {/if}
    {#if pullError}
      <div class="mt-3 bg-red-50 text-red-700 text-sm p-2 rounded">{pullError}</div>
    {/if}
  </div>

  <!-- Loaded in memory -->
  {#if running.length > 0}
    <div class="bg-white border rounded-lg p-5 mb-6">
      <h2 class="font-semibold text-gray-900 mb-3">
        Loaded in Memory
        <span class="ml-2 text-xs font-normal text-gray-500">(auto-refreshes every 5s)</span>
      </h2>
      <div class="space-y-2">
        {#each running as rm}
          <div class="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded">
            <div>
              <span class="font-medium text-sm text-gray-900">{rm.name}</span>
              <span class="ml-3 text-xs text-gray-500">{formatBytes(rm.size_vram)} VRAM</span>
            </div>
            <div class="text-xs text-gray-500">
              expires {new Date(rm.expires_at).toLocaleTimeString()}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Installed models -->
  <div class="bg-white border rounded-lg">
    <div class="px-5 py-4 border-b">
      <h2 class="font-semibold text-gray-900">Installed Models <span class="text-sm font-normal text-gray-500">({models.length})</span></h2>
    </div>

    {#if loading}
      <div class="text-center py-12 text-gray-500">Loading...</div>
    {:else if models.length === 0}
      <div class="text-center py-12 text-gray-500">
        No models installed. Pull one above.
      </div>
    {:else}
      <div class="divide-y">
        {#each models as model}
          {@const isRunning = running.some(r => r.name === model.name)}
          <div class="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900 text-sm">{model.name}</span>
                {#if isRunning}
                  <span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">loaded</span>
                {/if}
              </div>
              <div class="text-xs text-gray-500 mt-0.5 flex gap-3">
                <span>{formatBytes(model.size)}</span>
                <span>{model.details.parameter_size}</span>
                <span>{model.details.quantization_level}</span>
                <span>{model.details.family}</span>
              </div>
            </div>
            <button
              type="button"
              onclick={() => handleDelete(model.name)}
              disabled={deletingModel === model.name}
              class="ml-4 px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
            >
              {deletingModel === model.name ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
