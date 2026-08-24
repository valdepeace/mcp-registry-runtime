<script lang="ts">
  import type { RuntimeInstance, RuntimeStatus } from '$lib/types';
  import Chip from './Chip.svelte';

  interface Props {
    instance: RuntimeInstance;
    onStart: () => void;
    onStop: () => void;
    onRestart: () => void;
    onLogs: () => void;
    onEdit: () => void;
    onInspect: () => void;
    onDelete: () => void;
    loading?: boolean;
  }

  let { instance, onStart, onStop, onRestart, onLogs, onEdit, onInspect, onDelete, loading = false }: Props = $props();

  // HTTP mode: needs endpoint_url + running. Stdio mode: no endpoint_url → always inspectable.
  const canInspect = $derived(
    instance.endpoint_url
      ? (instance.status === 'online' || instance.status === 'degraded')
      : true
  );

  const statusConfig: Record<RuntimeStatus, { color: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string }> = {
    provisioning: { color: 'info', label: 'Provisioning' },
    online: { color: 'success', label: 'Online' },
    degraded: { color: 'warning', label: 'Degraded' },
    starting: { color: 'info', label: 'Starting' },
    stopping: { color: 'info', label: 'Stopping' },
    stopped: { color: 'default', label: 'Stopped' },
    errored: { color: 'danger', label: 'Errored' },
  };

  const status = $derived(statusConfig[instance.status] || statusConfig.stopped);

  function formatUptime(ms?: number): string {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  const isRunning = $derived(instance.status === 'online' || instance.status === 'degraded');
  // Nothing to start until the repo is cloned, installed and built.
  const canStart = $derived(instance.status === 'stopped' || instance.status === 'errored');
  const canStop = $derived(isRunning || instance.status === 'starting');
</script>

<div class="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
  <!-- Header -->
  <div class="flex items-start justify-between gap-3 mb-3">
    <div class="flex-1 min-w-0">
      <h3 class="font-semibold text-gray-900 truncate">{instance.server_name}</h3>
      <p class="text-sm text-gray-500">v{instance.version}</p>
    </div>
    <Chip variant={status.color}>{status.label}</Chip>
  </div>

  <!-- Info grid -->
  <div class="grid grid-cols-2 gap-2 text-sm mb-3">
    <div>
      <span class="text-gray-500">PM2:</span>
      <span class="font-mono text-xs ml-1">{instance.pm2_name}</span>
    </div>
    {#if instance.pid}
      <div>
        <span class="text-gray-500">PID:</span>
        <span class="ml-1">{instance.pid}</span>
      </div>
    {/if}
    {#if instance.port}
      <div>
        <span class="text-gray-500">Port:</span>
        <span class="ml-1">{instance.port}</span>
      </div>
    {/if}
    {#if instance.uptime_ms}
      <div>
        <span class="text-gray-500">Uptime:</span>
        <span class="ml-1">{formatUptime(instance.uptime_ms)}</span>
      </div>
    {/if}
    {#if instance.restart_count !== undefined && instance.restart_count > 0}
      <div>
        <span class="text-gray-500">Restarts:</span>
        <span class="ml-1">{instance.restart_count}</span>
      </div>
    {/if}
    {#if instance.health_status}
      <div>
        <span class="text-gray-500">Health:</span>
        <Chip 
          variant={instance.health_status === 'healthy' ? 'success' : instance.health_status === 'unhealthy' ? 'danger' : 'default'}
          size="sm"
        >
          {instance.health_status}
        </Chip>
      </div>
    {/if}
  </div>

  <!-- Command -->
  <div class="text-xs text-gray-500 mb-3 font-mono bg-gray-50 p-2 rounded truncate">
    {instance.exec_cmd} {instance.exec_args?.join(' ') || ''}
  </div>

  <!-- Error message -->
  {#if instance.last_error}
    <div class="text-xs text-red-600 bg-red-50 p-2 rounded mb-3 max-h-20 overflow-auto">
      {instance.last_error}
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex items-center gap-2 pt-2 border-t">
    {#if canStart}
      <button
        type="button"
        onclick={onStart}
        disabled={loading}
        class="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
      >
        Start
      </button>
    {/if}
    {#if canStop}
      <button
        type="button"
        onclick={onStop}
        disabled={loading}
        class="px-3 py-1.5 text-sm font-medium text-white bg-yellow-600 rounded hover:bg-yellow-700 disabled:opacity-50"
      >
        Stop
      </button>
    {/if}
    {#if isRunning}
      <button
        type="button"
        onclick={onRestart}
        disabled={loading}
        class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
      >
        Restart
      </button>
    {/if}
    <button
      type="button"
      onclick={onLogs}
      class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
    >
      Logs
    </button>
    <button
      type="button"
      onclick={onEdit}
      disabled={loading}
      class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
    >
      Edit
    </button>
    <button
      type="button"
      onclick={onInspect}
      disabled={loading || !canInspect}
      title={instance.endpoint_url && !canInspect ? 'Start instance to inspect (HTTP mode)' : 'Inspect MCP server'}
      class="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Inspect
    </button>
    <button
      type="button"
      onclick={onDelete}
      disabled={loading || isRunning}
      class="ml-auto px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
    >
      Delete
    </button>
  </div>
</div>
