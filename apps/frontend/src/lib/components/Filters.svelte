<script lang="ts">
  import type { TransportType, ServerCategory, ServerSource } from '$lib/types';
  import { SERVER_CATEGORIES } from '$lib/types';

  interface Props {
    latestOnly: boolean;
    transportType: TransportType | '';
    source: ServerSource | 'all';
    category: ServerCategory | '';
    verified: boolean | null;
    vendorOfficial: boolean | null;
    onchange: () => void;
  }

  let {
    latestOnly = $bindable(),
    transportType = $bindable(),
    source = $bindable(),
    category = $bindable(),
    verified = $bindable(),
    vendorOfficial = $bindable(),
    onchange,
  }: Props = $props();

  function handleLatestChange(e: Event) {
    latestOnly = (e.target as HTMLInputElement).checked;
    onchange();
  }

  function handleTransportChange(e: Event) {
    transportType = (e.target as HTMLSelectElement).value as TransportType | '';
    onchange();
  }

  function handleSourceChange(e: Event) {
    source = (e.target as HTMLSelectElement).value as ServerSource | 'all';
    onchange();
  }

  function handleCategoryChange(e: Event) {
    category = (e.target as HTMLSelectElement).value as ServerCategory | '';
    onchange();
  }

  function handleVerifiedChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (value === '') {
      verified = null;
    } else {
      verified = value === 'true';
    }
    onchange();
  }

  function handleVendorOfficialChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (value === '') {
      vendorOfficial = null;
    } else {
      vendorOfficial = value === 'true';
    }
    onchange();
  }
</script>

<div class="flex flex-wrap items-center gap-4 text-sm text-gray-600">
  <label class="flex items-center">
    <input
      type="checkbox"
      checked={latestOnly}
      onchange={handleLatestChange}
      class="mr-2"
    />
    <span>Latest only</span>
  </label>

  <div class="flex items-center gap-2">
    <label for="transport-filter">Transport:</label>
    <select
      id="transport-filter"
      value={transportType}
      onchange={handleTransportChange}
      class="border border-gray-300 rounded px-2 py-1 text-sm"
    >
      <option value="">All</option>
      <option value="stdio">stdio</option>
      <option value="streamable-http">streamable-http</option>
      <option value="sse">sse</option>
    </select>
  </div>

  <div class="flex items-center gap-2">
    <label for="source-filter">Source:</label>
    <select
      id="source-filter"
      value={source}
      onchange={handleSourceChange}
      class="border border-gray-300 rounded px-2 py-1 text-sm"
    >
      <option value="all">All</option>
      <option value="registry">Registry (mcp.io)</option>
      <option value="private">Private</option>
      <option value="azure-devops">Azure DevOps</option>
    </select>
  </div>

  <div class="flex items-center gap-2">
    <label for="vendor-official-filter">Vendor official:</label>
    <select
      id="vendor-official-filter"
      value={vendorOfficial === null ? '' : String(vendorOfficial)}
      onchange={handleVendorOfficialChange}
      class="border border-gray-300 rounded px-2 py-1 text-sm"
    >
      <option value="">All</option>
      <option value="true">Official only</option>
      <option value="false">Unofficial</option>
    </select>
  </div>

  <div class="flex items-center gap-2">
    <label for="category-filter">Category:</label>
    <select
      id="category-filter"
      value={category}
      onchange={handleCategoryChange}
      class="border border-gray-300 rounded px-2 py-1 text-sm"
    >
      <option value="">All</option>
      {#each SERVER_CATEGORIES as cat}
        <option value={cat.value}>{cat.label}</option>
      {/each}
    </select>
  </div>

  <div class="flex items-center gap-2">
    <label for="verified-filter">Verified:</label>
    <select
      id="verified-filter"
      value={verified === null ? '' : String(verified)}
      onchange={handleVerifiedChange}
      class="border border-gray-300 rounded px-2 py-1 text-sm"
    >
      <option value="">All</option>
      <option value="true">Verified only</option>
      <option value="false">Unverified only</option>
    </select>
  </div>
</div>
