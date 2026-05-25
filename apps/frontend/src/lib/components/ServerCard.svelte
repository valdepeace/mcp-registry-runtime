<script lang="ts">
  import type { ServerResponse, NovaMeta, PrivateMeta } from '$lib/types';
  import { NOVA_META_NAMESPACE } from '$lib/types';
  import { api } from '$lib/api/client';
  import Chip from './Chip.svelte';
  import LaunchModal from './LaunchModal.svelte';

  interface Props {
    server: ServerResponse;
    highlight?: boolean;
  }

  let { server, highlight = false }: Props = $props();

  let expanded = $state(false);
  let cloneMessage = $state<string | null>(null);
  let launchOpen = $state(false);

  const meta = $derived(server._meta?.['io.modelcontextprotocol.registry/official']);
  const privateMeta = $derived(server._meta?.['io.modelcontextprotocol.registry/private'] as PrivateMeta | undefined);
  const novaMeta = $derived(server._meta?.[NOVA_META_NAMESPACE] as NovaMeta | undefined);
  const isOfficial = $derived(server.source === 'registry');
  const isVendorOfficial = $derived(novaMeta?.vendorOfficial === true);
  const isPrivate = $derived(server.source === 'private');
  const isAzureDevops = $derived(server.source === 'azure-devops');

  const originLabel = $derived(formatOrigin(server.origin));

  function formatOrigin(origin: string | undefined): string | null {
    if (!origin) return null;
    if (origin === 'mcp-official') return 'MCP Registry';
    if (origin === 'smithery-servers') return 'Smithery';
    if (origin === 'private') return 'Private';
    if (origin === 'azure-devops') return 'Azure DevOps';
    return origin;
  }

  function originVariant(origin: string | undefined): 'primary' | 'success' | 'info' | 'purple' | 'default' {
    if (!origin) return 'default';
    if (origin === 'mcp-official') return 'info';
    if (origin === 'smithery-servers') return 'success';
    if (origin === 'private') return 'purple';
    if (origin === 'azure-devops') return 'primary';
    return 'default';
  }

  async function cloneToPrivate(e: Event) {
    e.stopPropagation();
    try {
      await api.cloneServer(server.server.name, server.server.version);
      cloneMessage = 'Cloned to private!';
      setTimeout(() => cloneMessage = null, 3000);
    } catch (err) {
      cloneMessage = 'Clone failed';
    }
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  }

  function toggleExpand() {
    expanded = !expanded;
  }

  function inferLanguage(runtimeHint: string | undefined): { lang: string; variant: 'primary' | 'warning' | 'success' | 'info' } | null {
    if (!runtimeHint) return null;
    const hint = runtimeHint.toLowerCase();
    if (hint.includes('uvx') || hint.includes('pip') || hint.includes('python')) {
      return { lang: 'Python', variant: 'warning' };
    }
    if (hint.includes('npx') || hint.includes('node') || hint.includes('bun')) {
      return { lang: 'JavaScript', variant: 'warning' };
    }
    if (hint.includes('docker')) {
      return { lang: 'Docker', variant: 'info' };
    }
    if (hint.includes('go')) {
      return { lang: 'Go', variant: 'info' };
    }
    if (hint.includes('java') || hint.includes('mvn')) {
      return { lang: 'Java', variant: 'warning' };
    }
    if (hint.includes('cargo') || hint.includes('rust')) {
      return { lang: 'Rust', variant: 'info' };
    }
    return null;
  }

  function transportVariant(type: string | undefined): 'primary' | 'success' | 'info' | 'default' {
    if (!type) return 'default';
    if (type === 'stdio') return 'success';
    if (type === 'streamable-http') return 'info';
    if (type === 'sse') return 'primary';
    return 'default';
  }

  const registryTypes = $derived(
    [...new Set(server.server.packages?.map(p => p.registryType) ?? [])]
  );

  const transportTypes = $derived(
    [...new Set([
      ...(server.server.packages?.map(p => p.transport?.type) ?? []),
      ...(server.server.remotes?.map(r => r.type) ?? []),
    ].filter(Boolean))]
  );

  const hasPackages = $derived((server.server.packages?.length ?? 0) > 0);
  const canLaunch = $derived(hasPackages || !!server.server.repository?.url);

  const inferredLang = $derived(
    server.server.packages?.find(p => p.runtimeHint)?.runtimeHint
      ? inferLanguage(server.server.packages.find(p => p.runtimeHint)!.runtimeHint!)
      : null
  );
</script>

<div
  class="rounded-lg overflow-hidden transition-all flex flex-col border {highlight
    ? 'bg-blue-50 border-blue-200 hover:border-blue-400'
    : 'bg-white border-gray-200 hover:border-blue-300'} hover:shadow-md {expanded ? 'border-gray-400' : ''}"
>
  <!-- Header (clickable) -->
  <div
    role="button"
    tabindex="0"
    onclick={toggleExpand}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleExpand();
      }
    }}
    class="cursor-pointer p-5 flex-1 text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:rounded-t-lg"
  >
    <div class="flex items-start justify-between gap-3 mb-2">
      <h3 class="font-semibold text-gray-900 text-base flex-1 min-w-0 break-all">
        {server.server.name}
      </h3>
      <div class="flex items-center gap-2">
        {#if novaMeta?.verified}
          <Chip variant="success" icon="✓">Verified</Chip>
        {/if}
        {#if novaMeta?.featured}
          <Chip variant="warning" icon="★">Featured</Chip>
        {/if}
        <span class="text-xs text-gray-500 font-medium whitespace-nowrap">
          v{server.server.version}
        </span>
        {#if canLaunch}
          <button
            type="button"
            onclick={(e) => { e.stopPropagation(); launchOpen = true; }}
            class="text-xs px-2 py-1 rounded font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            title="Launch this MCP"
          >
            Launch
          </button>
        {/if}
      </div>
    </div>

    <p class="text-sm text-gray-600 leading-relaxed line-clamp-2 mb-3 break-words">
      {server.server.description || ''}
    </p>

    <!-- Chips row -->
    <div class="flex flex-wrap items-center gap-1.5 mb-2">
      {#if originLabel}
        <Chip variant={originVariant(server.origin)} icon="🌐">{originLabel}</Chip>
      {:else if isOfficial}
        <Chip variant="success">Registry</Chip>
      {/if}
      {#if isVendorOfficial}
        <Chip variant="warning">Vendor official</Chip>
      {/if}
      {#if isPrivate && !originLabel}
        <Chip variant="purple">Private</Chip>
      {/if}
      {#if isAzureDevops && !originLabel}
        <Chip variant="primary">Azure DevOps</Chip>
      {/if}
      {#if inferredLang}
        <Chip variant={inferredLang.variant}>{inferredLang.lang}</Chip>
      {/if}
      {#each transportTypes as transport}
        <Chip variant={transportVariant(transport)}>{transport}</Chip>
      {/each}
      {#each registryTypes as registry}
        <Chip variant="info">{registry}</Chip>
      {/each}
      {#if novaMeta?.category}
        <Chip variant="primary">{novaMeta.category}</Chip>
      {/if}
      {#each novaMeta?.tags ?? [] as tag}
        <Chip variant="default">{tag}</Chip>
      {/each}
      {#if novaMeta?.license}
        <Chip variant="default">{novaMeta.license}</Chip>
      {/if}
    </div>

    <div class="text-xs text-gray-500">
      {formatDate(meta?.updatedAt || meta?.publishedAt || privateMeta?.updatedAt || privateMeta?.createdAt)}
    </div>

    {#if cloneMessage}
      <div class="text-xs text-green-600 mt-1">{cloneMessage}</div>
    {/if}
  </div>

  <!-- Expanded Details -->
  {#if expanded}
    <div class="border-t bg-gray-50 p-5 space-y-3 text-sm break-words">
      {#if server.server.title}
        <div>
          <span class="font-medium">Title:</span>
          <span class="break-all">{server.server.title}</span>
        </div>
      {/if}

      <div>
        <span class="font-medium">Origin:</span>
        <span>{originLabel ?? '—'}</span>
      </div>

      {#if server.provider_name}
        <div>
          <span class="font-medium">Provider:</span>
          <span>{server.provider_name}</span>
        </div>
      {/if}

      <div>
        <span class="font-medium">Status:</span>
        <span class="capitalize">{meta?.status || 'active'}</span>
      </div>

      {#if server.server.repository?.url}
        <div>
          <span class="font-medium">Repository:</span>
          <a
            href={server.server.repository.url}
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600 hover:underline break-all"
          >
            {server.server.repository.url}
          </a>
        </div>
      {/if}

      {#if server.server.websiteUrl}
        <div>
          <span class="font-medium">Website:</span>
          <a
            href={server.server.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600 hover:underline break-all"
          >
            {server.server.websiteUrl}
          </a>
        </div>
      {/if}

      <!-- Packages -->
      {#if server.server.packages && server.server.packages.length > 0}
        <div class="mt-3">
          <h4 class="font-medium text-gray-900 mb-2">Packages</h4>
          <ul class="space-y-2">
            {#each server.server.packages as pkg}
              <li class="text-sm">
                <span class="font-mono bg-gray-100 px-2 py-1 rounded">{pkg.registryType}</span>
                <span class="text-gray-600 ml-1">{pkg.identifier}</span>
                {#if pkg.transport?.type}
                  <span class="text-xs text-gray-400 ml-2">({pkg.transport.type})</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Remotes -->
      {#if server.server.remotes && server.server.remotes.length > 0}
        <div class="mt-3">
          <h4 class="font-medium text-gray-900 mb-2">Remotes</h4>
          <ul class="space-y-2">
            {#each server.server.remotes as remote}
              <li class="text-sm">
                <span class="font-mono bg-gray-100 px-2 py-1 rounded">{remote.type}</span>
                {#if remote.url}
                  <span class="text-gray-600 ml-1 break-all">{remote.url}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Actions -->
      <div class="mt-4 flex items-center gap-4">
        <a
          href="/servers/{encodeURIComponent(server.server.name)}"
          class="text-blue-600 hover:underline font-medium"
        >
          View details →
        </a>
        {#if isOfficial}
          <button onclick={cloneToPrivate} class="text-green-600 hover:underline text-sm">Clone to Private</button>
        {/if}
        <details>
          <summary class="cursor-pointer text-gray-500 hover:text-gray-700">View JSON</summary>
          <pre class="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto break-all">{JSON.stringify(server, null, 2)}</pre>
        </details>
      </div>
    </div>
  {/if}
</div>

<LaunchModal open={launchOpen} {server} onClose={() => launchOpen = false} />
