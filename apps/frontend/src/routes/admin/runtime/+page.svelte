<script lang="ts">
  import { api } from '$lib/api/client';
  import { createRuntimeEventSource } from '$lib/api/runtime-events';
  import { RuntimeCard, Modal, CreateRuntimeForm, EditRuntimeForm, InspectModal, ServerCombobox } from '$lib/components';
  import type { RuntimeInstance, CreateRuntimeInstanceInput, UpdateRuntimeInstanceInput, ServerListItem } from '$lib/types';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let instances = $state<RuntimeInstance[]>([]);
  let loading = $state(true);
  let actionLoading = $state<string | null>(null);
  let error = $state<string | null>(null);

  // Selection for bulk actions
  let selectedIds = $state<Set<string>>(new Set());

  // Modals
  let showCreateModal = $state(false);
  let showFromCatalogModal = $state(false);
  let showLogsModal = $state(false);
  let showEditModal = $state(false);
  let editInstance = $state<RuntimeInstance | null>(null);
  let inspectInstance = $state<RuntimeInstance | null>(null);
  let logsInstance = $state<RuntimeInstance | null>(null);
  let logsContent = $state('');
  let logsLoading = $state(false);

  // From catalog form
  let catalogServerName = $state('');
  let catalogVersion = $state('');
  let selectedServer = $state<ServerListItem | null>(null);

  function handleServerSelect(server: ServerListItem | null) {
    selectedServer = server;
    if (server) {
      catalogVersion = server.version;
    }
  }

  const selectedCount = $derived(selectedIds.size);
  const canBulkStart = $derived(
    selectedCount > 0 && 
    [...selectedIds].some(id => {
      const inst = instances.find(i => i.id === id);
      return inst && (inst.status === 'stopped' || inst.status === 'errored');
    })
  );
  const canBulkStop = $derived(
    selectedCount > 0 && 
    [...selectedIds].some(id => {
      const inst = instances.find(i => i.id === id);
      return inst && (inst.status === 'online' || inst.status === 'degraded');
    })
  );

  async function fetchInstances() {
    try {
      error = null;
      const response = await api.listRuntimeInstances();
      instances = response.instances;
      // Clean up selections for deleted instances
      const validIds = new Set(instances.map(i => i.id));
      selectedIds = new Set([...selectedIds].filter(id => validIds.has(id)));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load instances';
    } finally {
      loading = false;
    }
  }

  function toggleSelection(id: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedIds = newSet;
  }

  function selectAll() {
    selectedIds = new Set(instances.map(i => i.id));
  }

  function clearSelection() {
    selectedIds = new Set();
  }

  async function handleStart(id: string) {
    actionLoading = id;
    try {
      await api.startRuntimeInstance(id);
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to start';
    } finally {
      actionLoading = null;
    }
  }

  async function handleStop(id: string) {
    actionLoading = id;
    try {
      await api.stopRuntimeInstance(id);
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to stop';
    } finally {
      actionLoading = null;
    }
  }

  async function handleRestart(id: string) {
    actionLoading = id;
    try {
      await api.restartRuntimeInstance(id);
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to restart';
    } finally {
      actionLoading = null;
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this instance?')) return;
    
    actionLoading = id;
    try {
      await api.deleteRuntimeInstance(id);
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete';
    } finally {
      actionLoading = null;
    }
  }

  async function handleShowLogs(instance: RuntimeInstance) {
    logsInstance = instance;
    logsContent = '';
    showLogsModal = true;
    logsLoading = true;
    
    try {
      const response = await api.getRuntimeInstanceLogs(instance.id, 500);
      logsContent = response.logs;
    } catch (e) {
      logsContent = `Error loading logs: ${e instanceof Error ? e.message : 'Unknown error'}`;
    } finally {
      logsLoading = false;
    }
  }

  function handleOpenEdit(instance: RuntimeInstance) {
    editInstance = instance;
    showEditModal = true;
  }

  async function handleEdit(input: UpdateRuntimeInstanceInput) {
    if (!editInstance) return;
    actionLoading = editInstance.id;
    try {
      await api.updateRuntimeInstance(editInstance.id, input);
      showEditModal = false;
      editInstance = null;
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update';
    } finally {
      actionLoading = null;
    }
  }

  async function handleCreate(input: CreateRuntimeInstanceInput) {
    actionLoading = 'create';
    try {
      await api.createRuntimeInstance(input);
      showCreateModal = false;
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create';
    } finally {
      actionLoading = null;
    }
  }

  async function handleCreateFromCatalog() {
    if (!catalogServerName) {
      error = 'Server name is required';
      return;
    }
    
    actionLoading = 'from-catalog';
    try {
      await api.createRuntimeFromCatalog(catalogServerName, catalogVersion || undefined);
      showFromCatalogModal = false;
      catalogServerName = '';
      catalogVersion = '';
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create from catalog';
    } finally {
      actionLoading = null;
    }
  }

  async function handleSync() {
    loading = true;
    try {
      await api.syncRuntimeInstances();
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to sync';
    } finally {
      loading = false;
    }
  }

  async function handleBulkStart() {
    const ids = [...selectedIds].filter(id => {
      const inst = instances.find(i => i.id === id);
      return inst && (inst.status === 'stopped' || inst.status === 'errored');
    });
    
    if (ids.length === 0) return;
    
    actionLoading = 'bulk';
    try {
      await api.bulkStartRuntimeInstances(ids);
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to bulk start';
    } finally {
      actionLoading = null;
    }
  }

  async function handleBulkStop() {
    const ids = [...selectedIds].filter(id => {
      const inst = instances.find(i => i.id === id);
      return inst && (inst.status === 'online' || inst.status === 'degraded');
    });
    
    if (ids.length === 0) return;
    
    actionLoading = 'bulk';
    try {
      await api.bulkStopRuntimeInstances(ids);
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to bulk stop';
    } finally {
      actionLoading = null;
    }
  }

  const events = createRuntimeEventSource();

  $effect(() => {
    if (!$isAuthenticated) {
      goto('/login');
      return;
    }

    fetchInstances();
    events.connect();

    events.on('connected', () => {
      // Re-sync full state on (re)connect to catch missed events
      fetchInstances();
    });

    events.on('instance:status', (data) => {
      instances = instances.map(inst =>
        inst.id === data.id
          ? { ...inst, status: data.status, last_error: data.last_error ?? inst.last_error }
          : inst
      );
    });

    events.on('instance:health', (data) => {
      instances = instances.map(inst =>
        inst.id === data.id
          ? { ...inst, health_status: data.health_status as any, last_health_check: data.last_health_check }
          : inst
      );
    });

    events.on('instance:created', (data) => {
      // Only add if not already in the list (avoid duplicates from REST + SSE)
      if (!instances.find(i => i.id === data.instance.id)) {
        instances = [data.instance, ...instances];
      }
    });

    events.on('instance:deleted', (data) => {
      instances = instances.filter(inst => inst.id !== data.id);
      selectedIds = new Set([...selectedIds].filter(id => id !== data.id));
    });

    events.on('instance:updated', (data) => {
      instances = instances.map(inst =>
        inst.id === data.instance.id ? data.instance : inst
      );
    });

    return () => {
      events.disconnect();
    };
  });
</script>

<svelte:head>
  <title>Runtime Instances - Admin</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Runtime Instances</h1>
      <p class="text-gray-600">Manage locally running MCP servers</p>
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        onclick={handleSync}
        disabled={loading}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
      >
        Sync Status
      </button>
      <button
        type="button"
        onclick={() => showFromCatalogModal = true}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
      >
        From Catalog
      </button>
      <button
        type="button"
        onclick={() => showCreateModal = true}
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
      >
        + New Instance
      </button>
    </div>
  </div>

  <!-- Bulk actions bar -->
  {#if instances.length > 0}
    <div class="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={selectAll}
          class="text-sm text-blue-600 hover:text-blue-700"
        >
          Select All
        </button>
        <span class="text-gray-300">|</span>
        <button
          type="button"
          onclick={clearSelection}
          class="text-sm text-gray-600 hover:text-gray-700"
        >
          Clear
        </button>
      </div>
      
      {#if selectedCount > 0}
        <span class="text-sm text-gray-600">{selectedCount} selected</span>
        <div class="flex gap-2 ml-auto">
          <button
            type="button"
            onclick={handleBulkStart}
            disabled={!canBulkStart || actionLoading === 'bulk'}
            class="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
          >
            Start Selected
          </button>
          <button
            type="button"
            onclick={handleBulkStop}
            disabled={!canBulkStop || actionLoading === 'bulk'}
            class="px-3 py-1.5 text-sm font-medium text-white bg-yellow-600 rounded hover:bg-yellow-700 disabled:opacity-50"
          >
            Stop Selected
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
      {error}
      <button
        type="button"
        onclick={() => error = null}
        class="float-right text-red-500 hover:text-red-700"
      >
        ×
      </button>
    </div>
  {/if}

  <!-- Loading -->
  {#if loading}
    <div class="text-center py-12 text-gray-600">
      Loading instances...
    </div>
  {:else if instances.length === 0}
    <!-- Empty state -->
    <div class="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <p class="text-gray-600 mb-4">No runtime instances configured</p>
      <div class="flex justify-center gap-2">
        <button
          type="button"
          onclick={() => showFromCatalogModal = true}
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          Create from Catalog
        </button>
        <button
          type="button"
          onclick={() => showCreateModal = true}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          Create Manually
        </button>
      </div>
    </div>
  {:else}
    <!-- Instance grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each instances as instance (instance.id)}
        <div class="relative">
          <!-- Selection checkbox -->
          <input
            type="checkbox"
            checked={selectedIds.has(instance.id)}
            onchange={() => toggleSelection(instance.id)}
            class="absolute top-3 left-3 z-10 w-4 h-4 rounded border-gray-300"
          />
          <div class="pl-8">
            <RuntimeCard
              {instance}
              loading={actionLoading === instance.id}
              onStart={() => handleStart(instance.id)}
              onStop={() => handleStop(instance.id)}
              onRestart={() => handleRestart(instance.id)}
              onLogs={() => handleShowLogs(instance)}
              onEdit={() => handleOpenEdit(instance)}
              onInspect={() => inspectInstance = instance}
              onDelete={() => handleDelete(instance.id)}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Modal -->
<Modal
  open={showCreateModal}
  title="Create Runtime Instance"
  onClose={() => showCreateModal = false}
>
  <CreateRuntimeForm
    loading={actionLoading === 'create'}
    onSubmit={handleCreate}
    onCancel={() => showCreateModal = false}
  />
</Modal>

<!-- From Catalog Modal -->
<Modal
  open={showFromCatalogModal}
  title="Create from Catalog"
  onClose={() => showFromCatalogModal = false}
>
  <form onsubmit={(e) => { e.preventDefault(); handleCreateFromCatalog(); }} class="space-y-4">
    <p class="text-sm text-gray-600">
      Auto-detect runtime configuration from a server in the catalog.
    </p>
    
    <div>
      <label for="catalogServerName" class="block text-sm font-medium text-gray-700 mb-1">
        Server <span class="text-red-500">*</span>
      </label>
      <ServerCombobox
        bind:value={catalogServerName}
        onSelect={handleServerSelect}
        placeholder="Search servers..."
        disabled={actionLoading === 'from-catalog'}
      />
      {#if selectedServer}
        <div class="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
          <div class="font-medium text-gray-800">{selectedServer.name}</div>
          {#if selectedServer.description}
            <div class="truncate">{selectedServer.description}</div>
          {/if}
        </div>
      {/if}
    </div>

    <div>
      <label for="catalogVersion" class="block text-sm font-medium text-gray-700 mb-1">
        Version
      </label>
      <input
        id="catalogVersion"
        type="text"
        bind:value={catalogVersion}
        placeholder="Leave empty for latest"
        disabled={actionLoading === 'from-catalog'}
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      />
    </div>

    <div class="flex justify-end gap-3 pt-4 border-t">
      <button
        type="button"
        onclick={() => showFromCatalogModal = false}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={actionLoading === 'from-catalog' || !catalogServerName}
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {actionLoading === 'from-catalog' ? 'Creating...' : 'Create'}
      </button>
    </div>
  </form>
</Modal>

<!-- Inspect Modal -->
{#if inspectInstance}
  <InspectModal instance={inspectInstance} onClose={() => inspectInstance = null} />
{/if}

<!-- Edit Modal -->
{#if editInstance}
  <Modal
    open={showEditModal}
    title="Edit Runtime Instance"
    onClose={() => { showEditModal = false; editInstance = null; }}
  >
    <EditRuntimeForm
      instance={editInstance}
      loading={actionLoading === editInstance.id}
      onSubmit={handleEdit}
      onCancel={() => { showEditModal = false; editInstance = null; }}
    />
  </Modal>
{/if}

<!-- Logs Modal -->
<Modal
  open={showLogsModal}
  title={logsInstance ? `Logs: ${logsInstance.pm2_name}` : 'Logs'}
  onClose={() => showLogsModal = false}
>
  {#if logsLoading}
    <div class="text-center py-8 text-gray-600">Loading logs...</div>
  {:else}
    <pre class="bg-gray-900 text-gray-100 p-4 rounded text-xs font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap">{logsContent || 'No logs available'}</pre>
  {/if}
</Modal>
