<script lang="ts">
  import { onMount } from 'svelte';

  /** Cards ↔ table switch. Remembers the choice per view in localStorage. */
  interface Props {
    value: 'cards' | 'table';
    /** localStorage key, e.g. "view:servers". Omit to not remember. */
    storageKey?: string;
  }

  let { value = $bindable('cards'), storageKey }: Props = $props();

  onMount(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'cards' || saved === 'table') value = saved;
    } catch {
      // private mode / storage blocked — the default view is fine
    }
  });

  function pick(next: 'cards' | 'table'): void {
    value = next;
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // not remembering is not worth failing over
    }
  }

  const active = 'bg-white text-gray-900 shadow-sm';
  const idle = 'text-gray-500 hover:text-gray-700';
</script>

<div class="inline-flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg" role="group" aria-label="View mode">
  <button
    type="button"
    onclick={() => pick('cards')}
    aria-pressed={value === 'cards'}
    title="Card view"
    class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors {value === 'cards' ? active : idle}"
  >
    ▦ Cards
  </button>
  <button
    type="button"
    onclick={() => pick('table')}
    aria-pressed={value === 'table'}
    title="Table view"
    class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors {value === 'table' ? active : idle}"
  >
    ☰ Table
  </button>
</div>
