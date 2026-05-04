<script lang="ts">
  interface Props {
    value: unknown;
    maxHeight?: string;
  }

  let { value, maxHeight = '40vh' }: Props = $props();

  let copied = $state(false);

  const formatted = $derived(
    (() => {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    })()
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    } catch {
      // clipboard not available
    }
  }
</script>

<div class="relative">
  <button
    type="button"
    onclick={copy}
    class="absolute top-2 right-2 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
  >
    {copied ? 'Copied!' : 'Copy'}
  </button>
  <pre
    style="max-height: {maxHeight}"
    class="bg-gray-900 text-gray-100 text-xs font-mono p-4 rounded overflow-auto whitespace-pre-wrap break-words"
  >{formatted}</pre>
</div>
