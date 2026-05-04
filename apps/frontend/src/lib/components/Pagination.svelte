<script lang="ts">
  interface Props {
    hasPrevious: boolean;
    hasNext: boolean;
    info?: string;
    onprevious: () => void;
    onnext: () => void;
  }

  let { hasPrevious, hasNext, info = '', onprevious, onnext }: Props = $props();
</script>

<div class="mt-8 flex justify-between items-center">
  <button
    type="button"
    onclick={onprevious}
    disabled={!hasPrevious}
    class="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
  >
    Previous
  </button>
  
  <span class="text-sm text-gray-600 font-medium">
    {info}
  </span>
  
  <button
    type="button"
    onclick={onnext}
    disabled={!hasNext}
    class="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
  >
    Next
  </button>
</div>
