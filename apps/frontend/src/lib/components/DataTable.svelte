<script lang="ts" generics="Row">
  /*
   * ponytail: a plain <table> with click-to-sort headers instead of a table
   * library. Every list here is one server-side page (<= 100 rows) that the
   * backend already searches, filters and paginates, so the only thing a
   * headless table lib would have added is this sort function.
   * Ceiling: column resizing/reordering, grouping or virtualised thousands of
   * rows — that is when @tanstack/svelte-table earns its place.
   */
  import type { Snippet } from 'svelte';
  import type { TableColumn } from '$lib/types';
  import Chip from './Chip.svelte';

  interface Props {
    rows: Row[];
    columns: TableColumn<Row>[];
    rowKey: (row: Row) => string;
    /** Rendered in a trailing "Actions" column. */
    actions?: Snippet<[Row]>;
    /** Pass both to get a leading selection checkbox. */
    selected?: (row: Row) => boolean;
    onselect?: (row: Row) => void;
  }

  let { rows, columns, rowKey, actions, selected, onselect }: Props = $props();

  let sortKey = $state<string | null>(null);
  let sortDir = $state<1 | -1>(1);

  function toggleSort(col: TableColumn<Row>): void {
    if (col.sortable === false) return;
    if (sortKey === col.key) {
      sortDir = sortDir === 1 ? -1 : 1;
    } else {
      sortKey = col.key;
      sortDir = 1;
    }
  }

  function compare(a: unknown, b: unknown): number {
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  const sortedRows = $derived.by(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    // copy: the caller keeps its own order (selection, SSE updates, keys)
    return [...rows].sort((a, b) => compare(col.value(a), col.value(b)) * sortDir);
  });

  function cellClass(col: TableColumn<Row>): string {
    return [
      'p-3',
      col.align === 'right' ? 'text-right' : 'text-left',
      col.mono ? 'font-mono text-xs' : '',
    ].join(' ');
  }
</script>

<div class="overflow-x-auto border rounded-lg bg-white">
  <table class="w-full text-sm">
    <thead class="bg-gray-50 text-gray-600">
      <tr>
        {#if selected && onselect}
          <th class="w-8 p-3"></th>
        {/if}
        {#each columns as col (col.key)}
          <th class="{col.align === 'right' ? 'text-right' : 'text-left'} p-3 font-medium whitespace-nowrap">
            {#if col.sortable === false}
              {col.label}
            {:else}
              <button
                type="button"
                onclick={() => toggleSort(col)}
                class="inline-flex items-center gap-1 hover:text-gray-900"
                title="Sort by {col.label}"
              >
                {col.label}
                <span class="text-[10px] {sortKey === col.key ? 'text-gray-700' : 'text-gray-300'}">
                  {sortKey === col.key ? (sortDir === 1 ? '▲' : '▼') : '↕'}
                </span>
              </button>
            {/if}
          </th>
        {/each}
        {#if actions}
          <th class="p-3 text-right font-medium">Actions</th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each sortedRows as row (rowKey(row))}
        <tr class="border-t hover:bg-gray-50">
          {#if selected && onselect}
            <td class="p-3">
              <input
                type="checkbox"
                checked={selected(row)}
                onchange={() => onselect(row)}
                class="w-4 h-4 rounded border-gray-300"
              />
            </td>
          {/if}
          {#each columns as col (col.key)}
            {@const value = col.value(row)}
            <td class={cellClass(col)}>
              {#if value == null || value === ''}
                <span class="text-gray-400">—</span>
              {:else if col.badge}
                <Chip variant={col.badge(row)}>{value}</Chip>
              {:else if col.link}
                <a href={col.link(row)} class="text-blue-600 hover:underline">{value}</a>
              {:else}
                {value}
              {/if}
            </td>
          {/each}
          {#if actions}
            <td class="p-3">
              <div class="flex flex-nowrap gap-1 justify-end">
                {@render actions(row)}
              </div>
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
