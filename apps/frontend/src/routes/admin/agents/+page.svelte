<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { Chip } from '$lib/components';
  import type { A2AApiKey, A2ARequestLog } from '$lib/types';

  let keys = $state<A2AApiKey[]>([]);
  let requests = $state<A2ARequestLog[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let newKeyLabel = $state('');
  let issuing = $state(false);
  /** Shown exactly once, right after issuing — the gateway never stores the plaintext. */
  let justIssued = $state<{ label: string; plaintext: string } | null>(null);

  async function fetchAll() {
    try {
      const [k, r] = await Promise.all([api.listA2AKeys(), api.listA2ARequests(50)]);
      keys = k.keys;
      requests = r.requests;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load — is apps/a2a-gateway running?';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(), 10_000);
    return () => clearInterval(interval);
  });

  async function handleIssue(e: Event) {
    e.preventDefault();
    if (!newKeyLabel.trim()) return;
    issuing = true;
    try {
      const { key, plaintext } = await api.issueA2AKey(newKeyLabel.trim());
      justIssued = { label: key.label, plaintext };
      newKeyLabel = '';
      await fetchAll();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to issue key';
    } finally {
      issuing = false;
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this key? Any agent using it loses access immediately.')) return;
    try {
      await api.revokeA2AKey(id);
      await fetchAll();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to revoke key';
    }
  }

  function statusVariant(status: A2ARequestLog['status']): 'success' | 'warning' | 'danger' | 'info' {
    switch (status) {
      case 'completed': return 'success';
      case 'input-required': return 'warning';
      case 'failed': return 'danger';
      default: return 'info';
    }
  }

  function formatDate(s: string): string {
    return new Date(s.replace(' ', 'T') + 'Z').toLocaleString();
  }
</script>

<div class="max-w-5xl mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-gray-900">Agent Requests</h1>
    <p class="text-sm text-gray-500 mt-1">
      External agents that discover and request MCPs from this host over A2A — <code class="text-xs bg-gray-100 px-1.5 py-0.5 rounded">apps/a2a-gateway</code>.
    </p>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-6">{error}</div>
  {/if}

  {#if justIssued}
    <div class="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
      <p class="text-sm font-medium text-amber-900">Key for "{justIssued.label}" — copy it now, it won't be shown again:</p>
      <code class="block mt-2 text-xs bg-white border border-amber-200 rounded px-3 py-2 break-all select-all">{justIssued.plaintext}</code>
      <button type="button" onclick={() => justIssued = null} class="text-xs text-amber-700 hover:text-amber-900 mt-2">Dismiss</button>
    </div>
  {/if}

  <section class="mb-10">
    <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">API keys</h2>

    <form onsubmit={handleIssue} class="flex gap-2 mb-4">
      <input
        type="text"
        bind:value={newKeyLabel}
        placeholder="Label, e.g. research-assistant-agent"
        disabled={issuing}
        class="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={issuing || !newKeyLabel.trim()}
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {issuing ? 'Issuing…' : 'Issue key'}
      </button>
    </form>

    {#if loading}
      <p class="text-sm text-gray-500">Loading…</p>
    {:else if keys.length === 0}
      <p class="text-sm text-gray-500">No keys issued yet — an agent needs one before it can call anything past the Agent Card.</p>
    {:else}
      <div class="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {#each keys as key (key.id)}
          <div class="flex items-center justify-between px-4 py-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-900">{key.label}</span>
                {#if key.revoked_at}
                  <Chip variant="danger" size="sm">Revoked</Chip>
                {/if}
              </div>
              <div class="text-xs text-gray-500 font-mono mt-0.5">{key.key_prefix}… · {key.requests_per_min}/min · issued {formatDate(key.created_at)}</div>
            </div>
            {#if !key.revoked_at}
              <button
                type="button"
                onclick={() => handleRevoke(key.id)}
                class="text-xs text-red-600 hover:text-red-700 font-medium shrink-0 ml-3"
              >
                Revoke
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Recent requests</h2>

    {#if loading}
      <p class="text-sm text-gray-500">Loading…</p>
    {:else if requests.length === 0}
      <p class="text-sm text-gray-500">Nothing yet — this fills in as agents call <code class="text-xs bg-gray-100 px-1 rounded">/a2a</code>.</p>
    {:else}
      <div class="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {#each requests as req (req.id)}
          <div class="px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <code class="text-xs font-mono text-gray-700 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">{req.skill}</code>
                <span class="text-sm text-gray-600 truncate">{req.key_label}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Chip variant={statusVariant(req.status)} size="sm">{req.status}</Chip>
                <span class="text-xs text-gray-400">{formatDate(req.created_at)}</span>
              </div>
            </div>
            {#if req.error}
              <p class="text-xs text-red-600 mt-1.5">{req.error}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
