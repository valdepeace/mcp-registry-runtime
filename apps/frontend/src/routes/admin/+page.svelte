<script lang="ts">
  import { api } from '$lib/api/client';
  import { auth, isAuthenticated, currentUser } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { ProviderCard } from '$lib/components';
  import type { RegistryStats, ServerResponse } from '$lib/types';

  type SyncProvider = {
    providerName: string;
    entityType: string;
    entityCount: number;
    lastSync: string | null;
    lastStatus: string;
    lastError: string | null;
    configured: boolean;
  };

  let stats = $state<RegistryStats | null>(null);
  let privateServers = $state<ServerResponse[]>([]);
  let providers = $state<SyncProvider[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let syncing = $state(false);
  let syncingProvider = $state<string | null>(null);
  let syncEventSource: EventSource | null = null;
  let providerProgress = $state<Record<string, { message: string; current?: number; total?: number }>>({});
  let progressTimeout: ReturnType<typeof setTimeout> | null = null;

  // Check auth
  $effect(() => {
    if (!$isAuthenticated && !$auth.isLoading) {
      goto('/login');
    }
  });

  function connectSyncEvents() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    syncEventSource = new EventSource(`/admin/sync/events?token=${encodeURIComponent(token)}`);

    syncEventSource.addEventListener('provider:start', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      syncingProvider = data.providerName;
      providerProgress = { ...providerProgress, [data.providerName]: { message: 'Starting...' } };
      clearProgressTimeout();
    });

    syncEventSource.addEventListener('provider:progress', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      providerProgress = { ...providerProgress, [data.providerName]: { message: data.message, current: data.current, total: data.total } };
      clearProgressTimeout();
    });

    syncEventSource.addEventListener('provider:complete', (e: MessageEvent) => {
      loadProviders();
      const data = JSON.parse(e.data);
      clearProviderState(data.providerName);
    });

    syncEventSource.addEventListener('provider:error', (e: MessageEvent) => {
      loadProviders();
      const data = JSON.parse(e.data);
      clearProviderState(data.providerName);
    });

    syncEventSource.addEventListener('connected', () => {});
    syncEventSource.onerror = () => {
      console.warn('[Sync SSE] Connection error, will retry...');
    };
  }

  function clearProviderState(providerName: string) {
    syncingProvider = null;
    const newProgress = { ...providerProgress };
    delete newProgress[providerName];
    providerProgress = newProgress;
  }

  function clearProgressTimeout() {
    if (progressTimeout) { clearTimeout(progressTimeout); progressTimeout = null; }
  }

  function startProgressTimeout() {
    clearProgressTimeout();
    progressTimeout = setTimeout(() => {
      console.warn('[Sync SSE] Progress timeout — clearing state');
      syncingProvider = null;
      loadProviders();
    }, 45000);
  }

  async function loadProviders() {
    try {
      const { providers: p } = await api.getSyncProviders();
      providers = p;
    } catch { /* ignore */ }
  }

  async function loadData() {
    if (!$isAuthenticated) return;

    try {
      error = null;
      const [statsResponse, serversResponse, providersResponse] = await Promise.all([
        api.getStats(),
        api.listServers({ source: 'private', limit: 50 }),
        api.getSyncProviders(),
      ]);
      stats = statsResponse;
      privateServers = serversResponse.servers;
      providers = providersResponse.providers;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  }

  async function triggerSync() {
    syncing = true;
    try {
      await api.triggerSync();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to trigger sync';
      syncing = false;
    }
  }

  async function syncProvider(providerName: string, entityType: string) {
    syncingProvider = providerName;
    providerProgress = { ...providerProgress, [providerName]: { message: 'Starting...' } };
    startProgressTimeout();
    try {
      await api.triggerSyncProvider(entityType, providerName);
    } catch (e) {
      error = e instanceof Error ? e.message : `Failed to sync`;
      clearProviderState(providerName);
    }
  }

  async function deleteServer(serverName: string, version: string) {
    if (!confirm(`Delete ${serverName} v${version}?`)) return;
    
    try {
      await api.deleteServerVersion(serverName, version);
      privateServers = privateServers.filter(
        s => !(s.server.name === serverName && s.server.version === version)
      );
      loadData();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete server';
    }
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  }

  // Load data when authenticated
  $effect(() => {
    if ($isAuthenticated) {
      loadData();
      connectSyncEvents();
    }
    return () => {
      if (syncEventSource) { syncEventSource.close(); syncEventSource = null; }
    };
  });
</script>

<svelte:head>
  <title>Admin - MCP Registry</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-8">
    <h1 class="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
    {#if $currentUser}
      <span class="text-sm text-gray-600">
        Logged in as <span class="font-medium">{$currentUser.username}</span>
      </span>
    {/if}
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-800">{error}</p>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-gray-600">
      Loading...
    </div>
  {:else if stats}
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-500 mb-1">Total MCPs</div>
        <div class="text-3xl font-bold text-gray-900">{stats.servers.total}</div>
        <div class="text-xs text-gray-500 mt-1">{stats.servers.registry} registry, {stats.servers.private} private</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-500 mb-1">Total Skills</div>
        <div class="text-3xl font-bold text-green-600">{stats.skills.total}</div>
        <div class="text-xs text-gray-500 mt-1">{stats.skills.registry} registry, {stats.skills.private} private</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-500 mb-1">Sync Status</div>
        <div class="text-lg font-semibold capitalize {stats.syncStatus.status === 'success' ? 'text-green-600' : stats.syncStatus.status === 'error' ? 'text-red-600' : 'text-yellow-600'}">
          {stats.syncStatus.isSyncing ? 'Syncing...' : stats.syncStatus.status}
        </div>
      </div>
    </div>

    <!-- Transport Stats -->
    <div class="bg-white rounded-lg shadow p-6 mb-8">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">MCPs by Transport</h2>
      <div class="flex gap-8">
        {#each Object.entries(stats.servers.byTransport) as [transport, count]}
          <div>
            <span class="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{transport}</span>
            <span class="ml-2 font-semibold">{count}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Providers -->
    {#if providers.length > 0}
      <div class="mb-8">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Sync Providers</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each providers as provider (provider.providerName + provider.entityType)}
            <ProviderCard
              providerName={provider.providerName}
              entityType={provider.entityType as 'servers' | 'skills'}
              entityCount={provider.entityCount}
              lastSync={provider.lastSync}
              lastStatus={provider.lastStatus}
              lastError={provider.lastError}
              configured={provider.configured}
              onSync={() => syncProvider(provider.providerName, provider.entityType)}
              loading={syncingProvider === provider.providerName}
              progress={providerProgress[provider.providerName]}
            />
          {/each}
        </div>
      </div>
    {/if}

    <!-- Sync Section -->
    <div class="bg-white rounded-lg shadow p-6 mb-8">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Official Registry Sync</h2>
          <p class="text-sm text-gray-600 mt-1">
            Last sync: {formatDate(stats.syncStatus.lastSync)}
            {#if stats.syncStatus.error}
              <span class="text-red-600 ml-2">Error: {stats.syncStatus.error}</span>
            {/if}
          </p>
        </div>
        <button
          type="button"
          onclick={triggerSync}
          disabled={syncing || stats.syncStatus.isSyncing}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing || stats.syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>

    <!-- Quick Links -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      <a href="/admin/skills" class="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
        <h3 class="font-semibold text-gray-900">Manage Skills</h3>
        <p class="text-sm text-gray-600 mt-1">{stats.skills.total} skills registered</p>
      </a>
    </div>

    <!-- Private MCPs -->
    <div class="bg-white rounded-lg shadow">
      <div class="px-6 py-4 border-b flex justify-between items-center">
        <h2 class="text-lg font-semibold text-gray-900">Private MCPs</h2>
        <a
          href="/admin/servers/new"
          class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
        >
          Add MCP
        </a>
      </div>
      
      {#if privateServers.length === 0}
        <div class="p-6 text-center text-gray-600">
          No private MCPs yet
        </div>
      {:else}
        <div class="divide-y">
          {#each privateServers as server}
            <div class="p-4 flex justify-between items-center hover:bg-gray-50">
              <div>
                <div class="font-medium text-gray-900">{server.server.name}</div>
                <div class="text-sm text-gray-600">
                  v{server.server.version} - {server.server.description}
                </div>
              </div>
              <div class="flex gap-2">
                <a
                  href="/servers/{encodeURIComponent(server.server.name)}"
                  class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
                >
                  Edit
                </a>
                <button
                  type="button"
                  onclick={() => deleteServer(server.server.name, server.server.version)}
                  class="px-3 py-1 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
