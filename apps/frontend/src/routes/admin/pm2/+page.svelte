<script lang="ts">
  import { api } from '$lib/api/client';
  import { createRuntimeEventSource } from '$lib/api/runtime-events';
  import type { RuntimeMetrics, RuntimeStatus } from '$lib/types';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let metrics = $state<RuntimeMetrics[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let actionLoading = $state<string | null>(null);
  let lastUpdated = $state<Date | null>(null);

  let logsModal = $state<{
    open: boolean;
    name: string;
    id: string;
    content: string;
    loading: boolean;
  }>({ open: false, name: '', id: '', content: '', loading: false });

  const total = $derived(metrics.length);
  const online = $derived(metrics.filter(m => m.status === 'online').length);
  const stopped = $derived(metrics.filter(m => m.status === 'stopped').length);
  const errored = $derived(metrics.filter(m => m.status === 'errored' || m.status === 'degraded').length);

  async function fetchMetrics(silent = false) {
    try {
      const response = await api.getRuntimeMetrics();
      metrics = response.metrics;
      lastUpdated = new Date();
      error = null;
    } catch (e) {
      if (!silent) error = e instanceof Error ? e.message : 'Failed to load metrics';
    } finally {
      loading = false;
    }
  }

  function applyMetrics(incoming: typeof metrics) {
    metrics = incoming;
    lastUpdated = new Date();
    loading = false;
  }

  function statusDot(status: RuntimeStatus): string {
    switch (status) {
      case 'online':   return 'bg-green-500';
      case 'starting':
      case 'stopping': return 'bg-yellow-400';
      case 'errored':  return 'bg-red-500';
      case 'degraded': return 'bg-orange-500';
      default:         return 'bg-gray-400';
    }
  }

  function statusBadge(status: RuntimeStatus): string {
    switch (status) {
      case 'online':   return 'text-green-700 bg-green-100';
      case 'starting':
      case 'stopping': return 'text-yellow-700 bg-yellow-100';
      case 'errored':  return 'text-red-700 bg-red-100';
      case 'degraded': return 'text-orange-700 bg-orange-100';
      default:         return 'text-gray-600 bg-gray-100';
    }
  }

  function cpuColor(cpu: number): string {
    if (cpu >= 80) return 'bg-red-500';
    if (cpu >= 50) return 'bg-yellow-400';
    return 'bg-green-500';
  }

  function memoryColor(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    if (mb >= 512) return 'bg-red-500';
    if (mb >= 128) return 'bg-yellow-400';
    return 'bg-blue-500';
  }

  function formatMemory(bytes?: number): string {
    if (bytes === undefined || bytes === null) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function memoryPercent(bytes?: number): number {
    if (!bytes) return 0;
    // Cap at 1 GB for bar display
    return Math.min((bytes / (1024 * 1024 * 1024)) * 100, 100);
  }

  function formatUptime(ms?: number): string {
    if (!ms || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  }

  function shortName(pm2Name: string): string {
    return pm2Name.replace(/^mcp--/, '').replace(/--/g, '/').replace(/-at-/g, '@');
  }

  async function handleAction(m: RuntimeMetrics, action: 'start' | 'stop' | 'restart') {
    actionLoading = m.id + action;
    try {
      if (action === 'start') await api.startRuntimeInstance(m.id);
      else if (action === 'stop') await api.stopRuntimeInstance(m.id);
      else await api.restartRuntimeInstance(m.id);
      await fetchMetrics(true);
    } catch (e) {
      error = e instanceof Error ? e.message : `Failed to ${action}`;
    } finally {
      actionLoading = null;
    }
  }

  async function openLogs(m: RuntimeMetrics) {
    logsModal = { open: true, name: m.server_name, id: m.id, content: '', loading: true };
    try {
      const res = await api.getRuntimeInstanceLogs(m.id, 300);
      logsModal = { ...logsModal, content: res.logs, loading: false };
    } catch (e) {
      logsModal = { ...logsModal, content: `Error: ${e instanceof Error ? e.message : 'Unknown'}`, loading: false };
    }
  }

  const events = createRuntimeEventSource();

  $effect(() => {
    if (!$isAuthenticated) { goto('/login'); return; }

    // Initial load via HTTP (gets cached data immediately if server already polled)
    fetchMetrics();

    events.connect();
    // All subsequent updates arrive via SSE — no HTTP polling needed
    events.on('runtime:metrics', (data) => applyMetrics(data.metrics));
    events.on('connected', () => fetchMetrics(true));
    events.on('instance:created', () => fetchMetrics(true));
    events.on('instance:deleted', () => fetchMetrics(true));

    return () => {
      events.disconnect();
    };
  });
</script>

<svelte:head>
  <title>PM2 Dashboard - Admin</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 py-8">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">PM2 Dashboard</h1>
      <p class="text-sm text-gray-500 mt-0.5">
        {#if lastUpdated}
          Updated: {lastUpdated.toLocaleTimeString()} · auto-refresh 3s
        {:else}
          Loading...
        {/if}
      </p>
    </div>
    <a
      href="/admin/runtime"
      class="text-sm text-blue-600 hover:text-blue-700"
    >
      ← Instance Management
    </a>
  </div>

  <!-- Summary bar -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="bg-white rounded-lg border p-4 text-center">
      <div class="text-3xl font-bold text-gray-900">{total}</div>
      <div class="text-xs text-gray-500 mt-1 uppercase tracking-wide">Total</div>
    </div>
    <div class="bg-white rounded-lg border p-4 text-center">
      <div class="text-3xl font-bold text-green-600">{online}</div>
      <div class="text-xs text-gray-500 mt-1 uppercase tracking-wide">Online</div>
    </div>
    <div class="bg-white rounded-lg border p-4 text-center">
      <div class="text-3xl font-bold text-gray-500">{stopped}</div>
      <div class="text-xs text-gray-500 mt-1 uppercase tracking-wide">Stopped</div>
    </div>
    <div class="bg-white rounded-lg border p-4 text-center">
      <div class="text-3xl font-bold {errored > 0 ? 'text-red-600' : 'text-gray-300'}">{errored}</div>
      <div class="text-xs text-gray-500 mt-1 uppercase tracking-wide">Errored</div>
    </div>
  </div>

  <!-- Error -->
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex justify-between">
      <span>{error}</span>
      <button type="button" onclick={() => error = null} class="text-red-500 hover:text-red-700">×</button>
    </div>
  {/if}

  <!-- Loading -->
  {#if loading}
    <div class="text-center py-16 text-gray-500">Loading PM2 processes...</div>

  {:else if metrics.length === 0}
    <div class="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <p class="text-gray-500 mb-2">No runtime instances configured</p>
      <a href="/admin/runtime" class="text-sm text-blue-600 hover:underline">Go to Runtime →</a>
    </div>

  {:else}
    <!-- Process grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each metrics as m (m.id)}
        <div class="bg-white rounded-lg border overflow-hidden">
          <!-- Status strip -->
          <div class="h-1 {statusDot(m.status)}"></div>

          <div class="p-4">
            <!-- Title row -->
            <div class="flex items-start justify-between mb-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full flex-shrink-0 {statusDot(m.status)}"></span>
                  <span class="font-semibold text-gray-900 text-sm truncate" title={m.server_name}>
                    {shortName(m.pm2_name)}
                  </span>
                </div>
                <div class="text-xs text-gray-400 mt-0.5 pl-4">v{m.version}</div>
              </div>
              <span class="text-xs font-medium px-2 py-0.5 rounded-full {statusBadge(m.status)} ml-2 flex-shrink-0">
                {m.status}
              </span>
            </div>

            <!-- Metrics -->
            <div class="space-y-2 mb-4">
              <!-- CPU -->
              <div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>CPU</span>
                  <span class="font-mono font-medium {(m.cpu ?? 0) >= 80 ? 'text-red-600' : 'text-gray-700'}">
                    {m.cpu !== undefined ? `${m.cpu.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500 {m.cpu !== undefined ? cpuColor(m.cpu) : 'bg-gray-200'}"
                    style="width: {Math.min(m.cpu ?? 0, 100)}%"
                  ></div>
                </div>
              </div>

              <!-- Memory -->
              <div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Memory</span>
                  <span class="font-mono font-medium text-gray-700">{formatMemory(m.memory)}</span>
                </div>
                <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500 {m.memory !== undefined ? memoryColor(m.memory) : 'bg-gray-200'}"
                    style="width: {memoryPercent(m.memory)}%"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Info row -->
            <div class="flex gap-4 text-xs text-gray-500 mb-4">
              <div>
                <span class="block text-gray-400">Uptime</span>
                <span class="font-mono font-medium text-gray-700">{formatUptime(m.uptime_ms)}</span>
              </div>
              <div>
                <span class="block text-gray-400">Restarts</span>
                <span class="font-mono font-medium {(m.restart_count ?? 0) > 5 ? 'text-orange-600' : 'text-gray-700'}">
                  {m.restart_count ?? 0}
                </span>
              </div>
              <div>
                <span class="block text-gray-400">PID</span>
                <span class="font-mono font-medium text-gray-700">{m.pid ?? '—'}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-1.5">
              {#if m.status === 'stopped' || m.status === 'errored'}
                <button
                  type="button"
                  onclick={() => handleAction(m, 'start')}
                  disabled={actionLoading !== null}
                  class="flex-1 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading === m.id + 'start' ? '...' : 'Start'}
                </button>
              {:else}
                <button
                  type="button"
                  onclick={() => handleAction(m, 'stop')}
                  disabled={actionLoading !== null}
                  class="flex-1 py-1.5 text-xs font-medium text-white bg-yellow-600 rounded hover:bg-yellow-700 disabled:opacity-50"
                >
                  {actionLoading === m.id + 'stop' ? '...' : 'Stop'}
                </button>
              {/if}
              <button
                type="button"
                onclick={() => handleAction(m, 'restart')}
                disabled={actionLoading !== null || m.status === 'stopped'}
                class="flex-1 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {actionLoading === m.id + 'restart' ? '...' : 'Restart'}
              </button>
              <button
                type="button"
                onclick={() => openLogs(m)}
                class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                Logs
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Logs panel -->
{#if logsModal.open}
  <div
    role="dialog"
    aria-modal="true"
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/50 cursor-pointer"
    onclick={() => logsModal = { ...logsModal, open: false }}
    onkeydown={(e) => e.key === 'Escape' && (logsModal = { ...logsModal, open: false })}
  >
    <div
      role="document"
      class="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span class="text-sm font-medium text-gray-200">Logs: {logsModal.name}</span>
        <button
          type="button"
          onclick={() => logsModal = { ...logsModal, open: false }}
          class="text-gray-400 hover:text-gray-200 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div class="flex-1 overflow-auto p-4">
        {#if logsModal.loading}
          <div class="text-center py-8 text-gray-400">Loading logs...</div>
        {:else}
          <pre class="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">{logsModal.content || 'No logs available'}</pre>
        {/if}
      </div>
    </div>
  </div>
{/if}
