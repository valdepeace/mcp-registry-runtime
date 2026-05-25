<script lang="ts">
  import type { AgentInstance } from '$lib/types';
  import Chip from './Chip.svelte';

  interface Props {
    instance: AgentInstance;
    onStart: () => void;
    onStop: () => void;
    onInvoke: () => void;
    onPrompt: () => void;
    onDelete: () => void;
    loading?: boolean;
  }

  let {
    instance,
    onStart,
    onStop,
    onInvoke,
    onPrompt,
    onDelete,
    loading = false,
  }: Props = $props();

  type AgentStatus = 'online' | 'starting' | 'stopping' | 'stopped' | 'errored';

  const statusConfig: Record<AgentStatus, { color: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string }> = {
    online: { color: 'success', label: 'Online' },
    starting: { color: 'info', label: 'Starting' },
    stopping: { color: 'info', label: 'Stopping' },
    stopped: { color: 'default', label: 'Stopped' },
    errored: { color: 'danger', label: 'Errored' },
  };

  const status = $derived(statusConfig[instance.status as AgentStatus] || statusConfig.stopped);

  function parseJsonArray(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function truncatePrompt(prompt: string | null, maxLen = 120): string {
    if (!prompt) return '';
    return prompt.length > maxLen ? prompt.slice(0, maxLen) + '...' : prompt;
  }

  const skills = $derived(parseJsonArray(instance.resolved_skills));
  const mcpServers = $derived(parseJsonArray(instance.resolved_mcp_instances));
  const promptPreview = $derived(truncatePrompt(instance.composed_prompt));

  const isRunning = $derived(instance.status === 'online');
  const canStart = $derived(instance.status === 'stopped' || instance.status === 'errored');
  const canStop = $derived(isRunning || instance.status === 'starting');

  function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }
</script>

<div class="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
  <!-- Header -->
  <div class="flex items-start justify-between gap-3 mb-3">
    <div class="flex-1 min-w-0">
      <h3 class="font-semibold text-gray-900 truncate">{instance.agent_name}</h3>
      <p class="text-sm text-gray-500">v{instance.agent_version}</p>
    </div>
    <Chip variant={status.color}>{status.label}</Chip>
  </div>

  <!-- Lifecycle -->
  <div class="grid grid-cols-2 gap-2 text-sm mb-3">
    {#if instance.last_started_at}
      <div>
        <span class="text-gray-500">Started:</span>
        <span class="ml-1">{formatDate(instance.last_started_at)}</span>
      </div>
    {/if}
    {#if instance.last_stopped_at}
      <div>
        <span class="text-gray-500">Stopped:</span>
        <span class="ml-1">{formatDate(instance.last_stopped_at)}</span>
      </div>
    {/if}
    {#if instance.last_invoked_at}
      <div>
        <span class="text-gray-500">Invoked:</span>
        <span class="ml-1">{formatDate(instance.last_invoked_at)}</span>
      </div>
    {/if}
  </div>

  <!-- Skills & MCP servers -->
  {#if skills.length > 0 || mcpServers.length > 0}
    <div class="flex flex-wrap gap-2 mb-3">
      {#each skills as skill}
        <Chip variant="info" size="sm">{skill}</Chip>
      {/each}
      {#each mcpServers as mcp}
        <Chip variant="purple" size="sm">{mcp}</Chip>
      {/each}
    </div>
  {/if}

  <!-- Prompt preview -->
  {#if promptPreview}
    <div class="text-xs text-gray-500 mb-3 font-mono bg-gray-50 p-2 rounded max-h-16 overflow-hidden">
      {promptPreview}
    </div>
  {/if}

  <!-- Error message -->
  {#if instance.last_error}
    <div class="text-xs text-red-600 bg-red-50 p-2 rounded mb-3 max-h-20 overflow-auto">
      {instance.last_error}
    </div>
  {/if}

  <!-- Created -->
  <div class="text-xs text-gray-400 mb-3">
    Created {formatDate(instance.created_at)}
  </div>

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
    <button
      type="button"
      onclick={onInvoke}
      disabled={loading || !isRunning}
      class="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Invoke
    </button>
    {#if instance.composed_prompt}
      <button
        type="button"
        onclick={onPrompt}
        class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
      >
        Prompt
      </button>
    {/if}
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
