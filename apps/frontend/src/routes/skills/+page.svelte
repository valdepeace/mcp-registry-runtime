<script lang="ts">
  import { api } from '$lib/api/client';
  import { SearchInput, Pagination, Chip } from '$lib/components';
  import type { SkillResponse, SkillCategory, SkillFormat } from '$lib/types';
  import { SKILL_CATEGORIES, SKILL_FORMATS } from '$lib/types';

  let skills = $state<SkillResponse[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let search = $state('');
  let category = $state<SkillCategory | ''>('');
  let format = $state<SkillFormat | ''>('');
  let verifiedFilter = $state('');

  let cursorHistory = $state<(string | null)[]>([]);
  let currentCursor = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let total = $state(0);

  async function fetchSkills(cursor: string | null = null) {
    try {
      loading = true;
      error = null;
      const response = await api.listSkills({
        cursor: cursor ?? undefined,
        limit: 30,
        search: search || undefined,
        category: category || undefined,
        format: format || undefined,
        verified: verifiedFilter === '' ? undefined : verifiedFilter === 'true',
      });
      skills = response.skills;
      nextCursor = response.metadata?.nextCursor ?? null;
      total = response.metadata?.total ?? skills.length;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load skills';
    } finally {
      loading = false;
    }
  }

  function onSearch(value: string) {
    search = value;
    currentCursor = null;
    cursorHistory = [];
    fetchSkills();
  }

  function goNext() {
    if (nextCursor) {
      cursorHistory = [...cursorHistory, currentCursor];
      currentCursor = nextCursor;
      fetchSkills(nextCursor);
    }
  }

  function goPrev() {
    if (cursorHistory.length > 0) {
      const prev = cursorHistory[cursorHistory.length - 1];
      cursorHistory = cursorHistory.slice(0, -1);
      currentCursor = prev;
      fetchSkills(prev);
    }
  }

  function applyFilters() {
    currentCursor = null;
    cursorHistory = [];
    fetchSkills();
  }

  $effect(() => {
    fetchSkills();
  });
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
  <h1 class="text-2xl font-bold text-gray-900 mb-2">Skills Registry</h1>
  <p class="text-gray-600 mb-6">Browse and discover reusable skills</p>

  <div class="flex flex-wrap gap-3 mb-6">
    <div class="flex-1 min-w-[200px]">
      <SearchInput bind:value={search} oninput={onSearch} placeholder="Search skills..." />
    </div>
    <select bind:value={category} onchange={applyFilters} class="border rounded px-3 py-2 text-sm">
      <option value="">All categories</option>
      {#each SKILL_CATEGORIES as cat}
        <option value={cat.value}>{cat.label}</option>
      {/each}
    </select>
    <select bind:value={format} onchange={applyFilters} class="border rounded px-3 py-2 text-sm">
      <option value="">All formats</option>
      {#each SKILL_FORMATS as fmt}
        <option value={fmt.value}>{fmt.label}</option>
      {/each}
    </select>
    <select bind:value={verifiedFilter} onchange={applyFilters} class="border rounded px-3 py-2 text-sm">
      <option value="">All</option>
      <option value="true">Verified</option>
      <option value="false">Not verified</option>
    </select>
  </div>

  {#if error}
    <div class="bg-red-50 text-red-700 p-4 rounded">{error}</div>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-gray-500">Loading skills...</div>
  {:else if skills.length === 0}
    <div class="text-center py-12 text-gray-500">No skills found.</div>
  {:else}
    <div class="text-sm text-gray-500 mb-4">{total} skills found</div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each skills as item}
        {@const skill = item.skill}
        <div class="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
          <div class="flex items-start justify-between mb-2">
            <h3 class="font-semibold text-gray-900 text-sm">{skill.name}</h3>
            {#if item.source}
              <Chip variant={item.source === 'registry' ? 'info' : 'purple'}>{item.source}</Chip>
            {/if}
          </div>
          <p class="text-xs text-gray-600 mb-2 line-clamp-3">{skill.description}</p>
          <div class="flex flex-wrap gap-1 mb-2">
            <span class="text-xs bg-gray-100 px-2 py-0.5 rounded">v{skill.version}</span>
            <span class="text-xs bg-gray-100 px-2 py-0.5 rounded">{skill.format}</span>
            {#if skill.category}
              <span class="text-xs bg-gray-100 px-2 py-0.5 rounded">{skill.category}</span>
            {/if}
          </div>
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
