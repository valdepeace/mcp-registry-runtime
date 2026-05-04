<script lang="ts">
  import { api } from '$lib/api/client';
  import type { ServerListItem } from '$lib/types';

  interface Props {
    value: string;
    onSelect: (server: ServerListItem | null) => void;
    placeholder?: string;
    disabled?: boolean;
  }

  let { value = $bindable(), onSelect, placeholder = 'Search servers...', disabled = false }: Props = $props();

  let query = $state('');
  let results = $state<ServerListItem[]>([]);
  let loading = $state(false);
  let open = $state(false);
  let highlightedIndex = $state(-1);
  let inputRef: HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout>;

  // Sync query with external value
  $effect(() => {
    if (value && !query) {
      query = value;
    }
  });

  async function search(searchQuery: string) {
    if (!searchQuery || searchQuery.length < 2) {
      results = [];
      return;
    }

    loading = true;
    try {
      const response = await api.listServers({ search: searchQuery, limit: 50 });
      // Transform ServerResponse to ServerListItem, filter only servers with packages
      results = response.servers
        .filter(s => s.server.packages && s.server.packages.length > 0)
        .slice(0, 20)
        .map(s => ({
          name: s.server.name,
          description: s.server.description,
          version: s.server.version,
          source: s.source,
          version_detail: {
            runtimeHint: s.server.packages?.[0]?.runtimeHint,
            registryType: s.server.packages?.[0]?.registryType,
          }
        }));
    } catch (e) {
      console.error('[ServerCombobox] Search failed:', e);
      results = [];
    } finally {
      loading = false;
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    query = target.value;
    value = '';
    onSelect(null);
    highlightedIndex = -1;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      search(query);
      open = true;
    }, 300);
  }

  function handleSelect(server: ServerListItem) {
    query = server.name;
    value = server.name;
    onSelect(server);
    open = false;
    results = [];
  }

  function handleFocus() {
    if (query.length >= 2) {
      search(query);
      open = true;
    }
  }

  function handleBlur() {
    // Delay to allow click on results
    setTimeout(() => {
      open = false;
    }, 200);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown' && query.length >= 2) {
        search(query);
        open = true;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, results.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        open = false;
        highlightedIndex = -1;
        break;
    }
  }

  function clear() {
    query = '';
    value = '';
    results = [];
    onSelect(null);
    inputRef?.focus();
  }
</script>

<div class="relative">
  <div class="relative">
    <input
      bind:this={inputRef}
      type="text"
      value={query}
      oninput={handleInput}
      onfocus={handleFocus}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      {placeholder}
      {disabled}
      class="w-full border border-gray-300 rounded px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      role="combobox"
      aria-expanded={open}
      aria-controls="server-listbox"
      aria-autocomplete="list"
    />
    
    {#if query}
      <button
        type="button"
        onclick={clear}
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label="Clear"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>

  {#if open && (results.length > 0 || loading)}
    <ul
      id="server-listbox"
      role="listbox"
      class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
    >
      {#if loading}
        <li class="px-3 py-2 text-sm text-gray-500">Searching...</li>
      {:else}
        {#each results as server, index (`${server.name}@${server.version}`)}
          <li
            role="option"
            aria-selected={highlightedIndex === index}
            class="px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 {highlightedIndex === index ? 'bg-blue-100' : ''}"
            onmousedown={() => handleSelect(server)}
            onmouseenter={() => highlightedIndex = index}
          >
            <div class="font-medium text-gray-900">{server.name}</div>
            {#if server.description}
              <div class="text-xs text-gray-500 truncate">{server.description}</div>
            {/if}
            <div class="flex gap-2 mt-1">
              {#if server.version_detail?.runtimeHint}
                <span class="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{server.version_detail.runtimeHint}</span>
              {/if}
              <span class="text-xs text-gray-400">v{server.version}</span>
            </div>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}

  {#if query.length > 0 && query.length < 2 && !value}
    <p class="text-xs text-gray-500 mt-1">Type at least 2 characters to search</p>
  {/if}
</div>
