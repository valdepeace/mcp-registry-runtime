<script lang="ts">
  import { api } from '$lib/api/client';
  import { ServerCard, SearchInput, Pagination, Filters } from '$lib/components';
  import type { ServerResponse, TransportType, ServerCategory, ServerSource } from '$lib/types';

  // State
  let servers = $state<ServerResponse[]>([]);
  let recentServers = $state<ServerResponse[]>([]);
  let loading = $state(true);
  let searchLoading = $state(false);
  let error = $state<string | null>(null);

  // Filters
  let search = $state('');
  let latestOnly = $state(true);
  let transportType = $state<TransportType | ''>('');
  let source = $state<ServerSource | 'all'>('all');
  let origin = $state('');
  let category = $state<ServerCategory | ''>('');
  let verified = $state<boolean | null>(null);
  let featured = $state<boolean | null>(null);
  let vendorOfficial = $state<boolean | null>(null);

  // Pagination
  let cursorHistory = $state<(string | null)[]>([]);
  let currentCursor = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let total = $state(0);

  // Debounce timeout
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  async function fetchServers(cursor: string | null = null) {
    try {
      error = null;
      const response = await api.listServers({
        cursor: cursor ?? undefined,
        limit: 30,
        search: search || undefined,
        transport_type: transportType || undefined,
        source,
        origin: origin || undefined,
        version: latestOnly ? 'latest' : undefined,
        category: category || undefined,
        verified: verified ?? undefined,
        featured: featured ?? undefined,
        vendor_official: vendorOfficial ?? undefined,
      });

      servers = response.servers;
      nextCursor = response.metadata?.nextCursor ?? null;
      total = response.metadata?.total ?? servers.length;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load servers';
      servers = [];
    } finally {
      loading = false;
      searchLoading = false;
    }
  }

  async function fetchRecentlyUpdated() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const response = await api.listServers({
        limit: 6
      });
      
      // Filter for recently updated (within last hour)
      recentServers = response.servers.filter(s => {
        const meta = s._meta?.['io.modelcontextprotocol.registry/official'];
        const updatedAt = meta?.updatedAt || meta?.publishedAt;
        return updatedAt && new Date(updatedAt).toISOString() > oneHourAgo;
      });
    } catch {
      // Silently fail
    }
  }

  function handleSearch(value: string) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchLoading = true;
    
    searchTimeout = setTimeout(() => {
      search = value;
      cursorHistory = [];
      currentCursor = null;
      fetchServers(null);
    }, 300);
  }

  function handleFilterChange() {
    cursorHistory = [];
    currentCursor = null;
    fetchServers(null);
  }

  function handleNext() {
    if (nextCursor) {
      cursorHistory = [...cursorHistory, currentCursor];
      currentCursor = nextCursor;
      fetchServers(nextCursor);
    }
  }

  function handlePrevious() {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      cursorHistory = cursorHistory.slice(0, -1);
      currentCursor = prevCursor;
      fetchServers(prevCursor);
    }
  }

  // Initial load
  $effect(() => {
    fetchServers();
    fetchRecentlyUpdated();
  });
</script>

<svelte:head>
  <title>MCP Registry - Browse MCPs</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 py-8 md:py-12">
  <!-- Header -->
  <header class="mb-8 pb-8 border-b">
    <h1 class="text-4xl font-bold text-gray-900 mb-2">MCP Registry</h1>
    <p class="text-gray-600 text-lg mb-6">Discover Model Context Protocol MCPs</p>
    <div class="flex gap-6 text-sm">
      <a
        href="https://github.com/modelcontextprotocol"
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 hover:text-blue-700 font-medium"
      >
        GitHub
      </a>
      <a
        href="https://modelcontextprotocol.io/docs"
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 hover:text-blue-700 font-medium"
      >
        Docs
      </a>
    </div>
  </header>

  <!-- Recently Updated -->
  {#if recentServers.length > 0}
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">Recently Updated</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each recentServers as server (server.server.name + server.server.version)}
          <ServerCard {server} highlight={true} />
        {/each}
      </div>
    </div>
  {/if}

  <!-- Search and Filters -->
  <div class="mb-8 space-y-3">
    <SearchInput
      bind:value={search}
      placeholder="Search MCPs by name..."
      loading={searchLoading}
      oninput={handleSearch}
    />
    <Filters
      bind:latestOnly
      bind:transportType
      bind:source
      bind:origin
      bind:category
      bind:verified
      bind:featured
      bind:vendorOfficial
      onchange={handleFilterChange}
    />
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="text-center py-12 text-gray-600">
      Loading MCPs...
    </div>
  {:else if error}
    <!-- Error State -->
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p class="text-red-800">{error}</p>
      <button
        type="button"
        onclick={() => fetchServers(currentCursor)}
        class="mt-2 text-sm text-red-600 hover:underline"
      >
        Retry
      </button>
    </div>
  {:else}
    <!-- Server List -->
    {#if servers.length === 0}
      <div class="text-center py-12 text-gray-600">
        No MCPs found
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each servers as server (server.server.name + server.server.version)}
          <ServerCard {server} />
        {/each}
      </div>

      <!-- Pagination -->
      <Pagination
        hasPrevious={cursorHistory.length > 0}
        hasNext={!!nextCursor}
        info={nextCursor ? `Showing ${servers.length} of ${total}` : `Showing ${servers.length} MCPs`}
        onprevious={handlePrevious}
        onnext={handleNext}
      />
    {/if}
  {/if}
</div>
