<script lang="ts">
  import Chip from './Chip.svelte';

  interface Props {
    providerName: string;
    entityType: 'servers' | 'skills';
    entityCount: number;
    lastSync: string | null;
    lastStatus: string;
    lastError: string | null;
    configured: boolean;
    onSync?: () => void;
    loading?: boolean;
    progress?: { message: string; current?: number; total?: number } | null;
  }

  let {
    providerName,
    entityType,
    entityCount,
    lastSync,
    lastStatus,
    lastError,
    configured,
    onSync,
    loading = false,
    progress = null,
  }: Props = $props();

  const statusConfig: Record<string, { color: 'success' | 'warning' | 'danger' | 'default' | 'info'; label: string }> = {
    success: { color: 'success', label: 'OK' },
    error: { color: 'danger', label: 'Error' },
    syncing: { color: 'warning', label: 'Syncing' },
  };

  const statusObj = $derived(statusConfig[lastStatus] || { color: 'default' as const, label: lastStatus || 'Unknown' });

  const entityIcon: Record<string, string> = {
    servers: '\u{1F4E1}',
    skills: '\u{1F9E9}',
  };

  const entityLabel = $derived(
    entityType === 'servers' ? 'MCPs' : 'Skills'
  );

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  }
</script>

<div class="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
  <!-- Header -->
  <div class="flex items-start justify-between gap-3 mb-3">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-lg">{entityIcon[entityType] || '\u{1F4E6}'}</span>
        <h3 class="font-semibold text-gray-900 truncate">{providerName}</h3>
      </div>
      <p class="text-sm text-gray-500 ml-7">{entityLabel}</p>
    </div>
    <div class="flex items-center gap-2 flex-shrink-0">
      {#if !configured}
        <Chip variant="warning" size="sm">Not Configured</Chip>
      {:else}
        <Chip variant={statusObj.color}>{statusObj.label}</Chip>
      {/if}
    </div>
  </div>

  <!-- Info grid -->
  <div class="grid grid-cols-2 gap-2 text-sm mb-3">
    <div>
      <span class="text-gray-500">Entities:</span>
      <span class="ml-1 font-semibold">{entityCount.toLocaleString()}</span>
    </div>
    <div>
      <span class="text-gray-500">Last Sync:</span>
      <span class="ml-1">{formatDate(lastSync)}</span>
    </div>
    {#if configured}
      <div class="col-span-2">
        <span class="text-gray-500">Status:</span>
        <span class="ml-1 capitalize text-xs">{lastStatus}</span>
      </div>
    {/if}
  </div>

  <!-- Progress / Loading -->
  {#if loading}
    {@const msg = progress?.message ?? 'Starting...'}
    {@const cur = progress?.current}
    {@const tot = progress?.total}
    {@const pct = tot && tot > 0 ? Math.round((cur ?? 0) / tot * 100) : 0}
    <div class="mb-3">
      <div class="flex justify-between text-xs text-gray-500 mb-1">
        <span>{msg}</span>
        {#if cur != null && tot != null}
          <span>{cur}/{tot}</span>
        {/if}
      </div>
      <div class="w-full bg-gray-200 rounded-full h-1.5">
        <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style="width: {pct || 5}%"></div>
      </div>
    </div>
  {/if}

  <!-- Error message -->
  {#if lastError}
    <div class="text-xs text-red-600 bg-red-50 p-2 rounded mb-3 max-h-20 overflow-auto">
      {lastError}
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex items-center gap-2 pt-2 border-t">
    <button
      type="button"
      onclick={() => onSync?.()}
      disabled={loading || !configured}
      class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Syncing...' : 'Sync Now'}
    </button>
    {#if !configured}
      <span class="ml-auto text-xs text-gray-400">Provider not configured</span>
    {/if}
  </div>
</div>
