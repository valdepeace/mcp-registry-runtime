<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  let { open, title, onClose, children }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
        <button
          type="button"
          onclick={onClose}
          class="text-gray-400 hover:text-gray-600 text-2xl leading-none"
        >
          ×
        </button>
      </div>

      <div class="flex-1 overflow-auto p-6">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
