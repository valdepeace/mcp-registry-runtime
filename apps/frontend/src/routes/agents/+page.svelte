<script lang="ts">
  import { api } from '$lib/api/client';
  import { SearchInput, Pagination, Chip } from '$lib/components';
  import type { AgentResponse, AgentCategory, AgentType } from '$lib/types';
  import { AGENT_CATEGORIES, AGENT_TYPES } from '$lib/types';

  let agents = $state<AgentResponse[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let search = $state('');
  let category = $state<AgentCategory | ''>('');
  let subagentType = $state<AgentType | ''>('');

  let cursorHistory = $state<(string | null)[]>([]);
  let currentCursor = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let total = $state(0);

  async function fetchAgents(cursor: string | null = null) {
    try {
      loading = true;
      error = null;
      const response = await api.listAgents({
        cursor: cursor ?? undefined,
        limit: 30,
        search: search || undefined,
        category: category || undefined,
        subagent_type: subagentType || undefined,
      });
      agents = response.agents;
      nextCursor = response.metadata?.nextCursor ?? null;
      total = response.metadata?.total ?? agents.length;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load agents';
    } finally {
      loading = false;
    }
  }

  function onSearch(value: string) {
    search = value;
    currentCursor = null;
    cursorHistory = [];
    fetchAgents();
  }

  function applyFilters() {
    currentCursor = null;
    cursorHistory = [];
    fetchAgents();
  }

  function goNext() {
    if (nextCursor) {
      cursorHistory = [...cursorHistory, currentCursor];
      currentCursor = nextCursor;
      fetchAgents(nextCursor);
    }
  }

  function goPrev() {
    if (cursorHistory.length > 0) {
      const prev = cursorHistory[cursorHistory.length - 1];
      cursorHistory = cursorHistory.slice(0, -1);
      currentCursor = prev;
      fetchAgents(prev);
    }
  }

  $effect(() => {
    fetchAgents();
  });
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
  <h1 class="text-2xl font-bold text-gray-900 mb-2">Agents Registry</h1>
  <p class="text-gray-600 mb-6">Browse and discover composable agents</p>

  <div class="flex flex-wrap gap-3 mb-6">
    <div class="flex-1 min-w-[200px]">
      <SearchInput bind:value={search} oninput={onSearch} placeholder="Search agents..." />
    </div>
    <select bind:value={category} onchange={applyFilters} class="border rounded px-3 py-2 text-sm">
      <option value="">All categories</option>
      {#each AGENT_CATEGORIES as cat}
        <option value={cat.value}>{cat.label}</option>
      {/each}
    </select>
    <select bind:value={subagentType} onchange={applyFilters} class="border rounded px-3 py-2 text-sm">
      <option value="">All types</option>
      {#each AGENT_TYPES as t}
        <option value={t.value}>{t.label}</option>
      {/each}
    </select>
  </div>

  {#if error}
    <div class="bg-red-50 text-red-700 p-4 rounded">{error}</div>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-gray-500">Loading agents...</div>
  {:else if agents.length === 0}
    <div class="text-center py-12 text-gray-500">No agents found.</div>
  {:else}
    <div class="text-sm text-gray-500 mb-4">{total} agents found</div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each agents as item}
        {@const agent = item.agent}
        <div class="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
          <div class="flex items-start justify-between mb-2">
            <h3 class="font-semibold text-gray-900 text-sm">{agent.name}</h3>
            {#if item.source}
              <Chip variant={item.source === 'registry' ? 'info' : 'purple'}>{item.source}</Chip>
            {/if}
          </div>
          <p class="text-xs text-gray-600 mb-2 line-clamp-3">{agent.description}</p>
          <div class="flex flex-wrap gap-1 mb-2">
            <span class="text-xs bg-gray-100 px-2 py-0.5 rounded">v{agent.version}</span>
            <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{agent.subagent_type}</span>
            {#if agent.category}
              <span class="text-xs bg-gray-100 px-2 py-0.5 rounded">{agent.category}</span>
            {/if}
          </div>
          {#if agent.required_skills && agent.required_skills.length > 0}
            <p class="text-xs text-gray-500">Skills: {agent.required_skills.map(s => s.name).join(', ')}</p>
          {/if}
        </div>
      {/each}
    </div>
    <Pagination
      onnext={goNext}
      onprevious={goPrev}
      hasNext={!!nextCursor}
      hasPrevious={cursorHistory.length > 0}
    />
  {/if}
</div>
