<script lang="ts">
  import { page } from '$app/stores';
  import { api } from '$lib/api/client';
  import type { ServerResponse, Package, RemoteTransport, PrivateMeta } from '$lib/types';

  // State
  let server = $state<ServerResponse | null>(null);
  let versions = $state<ServerResponse[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedVersion = $state<string>('latest');

  // Derived
  const serverName = $derived(decodeURIComponent($page.params.name ?? ''));
  const meta = $derived(server?._meta?.['io.modelcontextprotocol.registry/official']);
  const privateMeta = $derived(server?._meta?.['io.modelcontextprotocol.registry/private'] as PrivateMeta | undefined);
  const isPrivate = $derived(server?.source === 'private');

  async function loadServer(version: string) {
    try {
      error = null;
      loading = true;
      server = await api.getServerVersion(serverName, version);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load server';
      server = null;
    } finally {
      loading = false;
    }
  }

  async function loadVersions() {
    try {
      const response = await api.getServerVersions(serverName);
      versions = response.servers;
    } catch {
      versions = [];
    }
  }

  function handleVersionChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedVersion = target.value;
    loadServer(selectedVersion);
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  function getTransportBadgeColor(type: string): string {
    switch (type) {
      case 'stdio': return 'bg-green-100 text-green-700';
      case 'streamable-http': return 'bg-blue-100 text-blue-700';
      case 'sse': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  // Initial load
  $effect(() => {
    if (serverName) {
      loadServer('latest');
      loadVersions();
    }
  });
</script>

<svelte:head>
  <title>{serverName} - MCP Registry</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 py-8">
  <!-- Breadcrumb -->
  <nav class="mb-6">
    <a href="/" class="text-blue-600 hover:underline">← Back to servers</a>
  </nav>

  {#if loading}
    <div class="text-center py-12 text-gray-600">Loading server...</div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-6">
      <h2 class="text-lg font-semibold text-red-800 mb-2">Error</h2>
      <p class="text-red-700">{error}</p>
      <a href="/" class="mt-4 inline-block text-blue-600 hover:underline">← Back to servers</a>
    </div>
  {:else if server}
    <!-- Header -->
    <header class="mb-8">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 mb-2">
            <h1 class="text-3xl font-bold text-gray-900 break-all">{server.server.name}</h1>
            {#if isPrivate}
              <span class="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
                Private
              </span>
            {:else}
              <span class="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                Official
              </span>
            {/if}
          </div>
          {#if server.server.title && server.server.title !== server.server.name}
            <p class="text-xl text-gray-600 mb-2">{server.server.title}</p>
          {/if}
          <p class="text-gray-600 text-lg">{server.server.description}</p>
        </div>

        <!-- Version Selector -->
        {#if versions.length > 1}
          <div class="flex-shrink-0">
            <label for="version-select" class="block text-sm font-medium text-gray-700 mb-1">
              Version
            </label>
            <select
              id="version-select"
              value={selectedVersion}
              onchange={handleVersionChange}
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="latest">Latest ({server.server.version})</option>
              {#each versions as v}
                <option value={v.server.version}>{v.server.version}</option>
              {/each}
            </select>
          </div>
        {:else}
          <div class="text-sm bg-gray-100 px-4 py-2 rounded-lg">
            v{server.server.version}
          </div>
        {/if}
      </div>

      <!-- Links -->
      <div class="flex flex-wrap gap-4 text-sm">
        {#if server.server.repository?.url}
          <a
            href={server.server.repository.url}
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600 hover:underline flex items-center gap-1"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Repository
          </a>
        {/if}
        {#if server.server.websiteUrl}
          <a
            href={server.server.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600 hover:underline flex items-center gap-1"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
            </svg>
            Website
          </a>
        {/if}
      </div>
    </header>

    <!-- Metadata -->
    <section class="bg-gray-50 rounded-lg p-6 mb-8">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Metadata</h2>
      <dl class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <dt class="text-gray-500">Status</dt>
          <dd class="font-medium capitalize">{meta?.status || 'active'}</dd>
        </div>
        <div>
          <dt class="text-gray-500">Published</dt>
          <dd class="font-medium">{formatDate(meta?.publishedAt || privateMeta?.createdAt)}</dd>
        </div>
        <div>
          <dt class="text-gray-500">Updated</dt>
          <dd class="font-medium">{formatDate(meta?.updatedAt || privateMeta?.updatedAt)}</dd>
        </div>
        <div>
          <dt class="text-gray-500">Latest</dt>
          <dd class="font-medium">{meta?.isLatest ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
    </section>

    <!-- Packages -->
    {#if server.server.packages && server.server.packages.length > 0}
      <section class="mb-8">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Packages</h2>
        <div class="space-y-4">
          {#each server.server.packages as pkg, i}
            <div class="bg-white border border-gray-200 rounded-lg p-5">
              <div class="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div class="flex items-center gap-3 mb-1">
                    <span class="font-mono text-sm bg-gray-100 px-3 py-1 rounded">{pkg.registryType}</span>
                    {#if pkg.transport?.type}
                      <span class="text-xs px-2 py-1 rounded {getTransportBadgeColor(pkg.transport.type)}">
                        {pkg.transport.type}
                      </span>
                    {/if}
                  </div>
                  <p class="font-medium text-gray-900 break-all">{pkg.identifier}</p>
                  {#if pkg.version}
                    <p class="text-sm text-gray-500">v{pkg.version}</p>
                  {/if}
                </div>
              </div>

              <!-- Package Details -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {#if pkg.runtimeHint}
                  <div>
                    <span class="text-gray-500">Runtime:</span>
                    <code class="ml-2 bg-gray-100 px-2 py-0.5 rounded">{pkg.runtimeHint}</code>
                  </div>
                {/if}
                {#if pkg.registryBaseUrl}
                  <div>
                    <span class="text-gray-500">Registry:</span>
                    <span class="ml-2 break-all">{pkg.registryBaseUrl}</span>
                  </div>
                {/if}
              </div>

              <!-- Environment Variables -->
              {#if pkg.environmentVariables && pkg.environmentVariables.length > 0}
                <div class="mt-4">
                  <h4 class="text-sm font-medium text-gray-700 mb-2">Environment Variables</h4>
                  <div class="bg-gray-50 rounded p-3 space-y-2">
                    {#each pkg.environmentVariables as env}
                      <div class="flex items-start gap-2 text-sm">
                        <code class="bg-gray-200 px-2 py-0.5 rounded font-mono text-xs">{env.name}</code>
                        {#if env.isRequired}
                          <span class="text-red-500 text-xs">required</span>
                        {/if}
                        {#if env.isSecret}
                          <span class="text-yellow-600 text-xs">secret</span>
                        {/if}
                        {#if env.description}
                          <span class="text-gray-600">{env.description}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Arguments -->
              {#if pkg.packageArguments && pkg.packageArguments.length > 0}
                <div class="mt-4">
                  <h4 class="text-sm font-medium text-gray-700 mb-2">Arguments</h4>
                  <div class="bg-gray-50 rounded p-3 space-y-2">
                    {#each pkg.packageArguments as arg}
                      <div class="flex items-start gap-2 text-sm">
                        <code class="bg-gray-200 px-2 py-0.5 rounded font-mono text-xs">
                          {arg.type === 'named' ? `--${arg.name}` : (arg as { name?: string }).name || `arg${arg.type}`}
                        </code>
                        {#if arg.isRequired}
                          <span class="text-red-500 text-xs">required</span>
                        {/if}
                        {#if arg.description}
                          <span class="text-gray-600">{arg.description}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Remotes -->
    {#if server.server.remotes && server.server.remotes.length > 0}
      <section class="mb-8">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Remote Endpoints</h2>
        <div class="space-y-4">
          {#each server.server.remotes as remote, i}
            <div class="bg-white border border-gray-200 rounded-lg p-5">
              <div class="flex items-center gap-3 mb-3">
                <span class="text-sm px-3 py-1 rounded {getTransportBadgeColor(remote.type)}">
                  {remote.type}
                </span>
              </div>
              <p class="font-mono text-sm bg-gray-100 px-3 py-2 rounded break-all">{remote.url}</p>

              <!-- Variables -->
              {#if remote.variables && Object.keys(remote.variables).length > 0}
                <div class="mt-4">
                  <h4 class="text-sm font-medium text-gray-700 mb-2">Variables</h4>
                  <div class="bg-gray-50 rounded p-3 space-y-2">
                    {#each Object.entries(remote.variables) as [name, input]}
                      <div class="flex items-start gap-2 text-sm">
                        <code class="bg-gray-200 px-2 py-0.5 rounded font-mono text-xs">{name}</code>
                        {#if input.isRequired}
                          <span class="text-red-500 text-xs">required</span>
                        {/if}
                        {#if input.isSecret}
                          <span class="text-yellow-600 text-xs">secret</span>
                        {/if}
                        {#if input.description}
                          <span class="text-gray-600">{input.description}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Headers -->
              {#if remote.headers && remote.headers.length > 0}
                <div class="mt-4">
                  <h4 class="text-sm font-medium text-gray-700 mb-2">Headers</h4>
                  <div class="bg-gray-50 rounded p-3 space-y-1">
                    {#each remote.headers as header}
                      <div class="text-sm font-mono">
                        <span class="text-gray-600">{header.name}:</span>
                        <span class="ml-2">{header.value || '(variable)'}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- All Versions -->
    {#if versions.length > 1}
      <section class="mb-8">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">All Versions</h2>
        <div class="bg-white border border-gray-200 rounded-lg divide-y">
          {#each versions as v}
            <button
              type="button"
              onclick={() => { selectedVersion = v.server.version; loadServer(v.server.version); }}
              class="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-left {v.server.version === server.server.version ? 'bg-blue-50' : ''}"
            >
              <div>
                <span class="font-medium">v{v.server.version}</span>
                {#if v._meta?.['io.modelcontextprotocol.registry/official']?.isLatest}
                  <span class="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">latest</span>
                {/if}
              </div>
              <span class="text-sm text-gray-500">
                {formatDate(v._meta?.['io.modelcontextprotocol.registry/official']?.publishedAt)}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Raw JSON -->
    <section>
      <details class="bg-white border border-gray-200 rounded-lg">
        <summary class="px-5 py-3 cursor-pointer font-medium text-gray-700 hover:bg-gray-50">
          View Raw JSON
        </summary>
        <pre class="p-5 bg-gray-50 text-xs overflow-x-auto border-t">{JSON.stringify(server, null, 2)}</pre>
      </details>
    </section>
  {/if}
</div>
