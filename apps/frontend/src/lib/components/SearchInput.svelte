<script lang="ts">
  interface Props {
    value: string;
    placeholder?: string;
    loading?: boolean;
    oninput?: (value: string) => void;
  }

  let { value = $bindable(), placeholder = 'Search MCPs...', loading = false, oninput }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = target.value;
    oninput?.(value);
  }
</script>

<div class="relative">
  <input
    type="search"
    {value}
    {placeholder}
    oninput={handleInput}
    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
  />
  {#if loading}
    <span class="absolute right-3 top-2.5 text-gray-400 text-sm">Searching...</span>
  {/if}
</div>
