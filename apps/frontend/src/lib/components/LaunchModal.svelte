<script lang="ts">
  import { api } from '$lib/api/client';
  import { goto } from '$app/navigation';
  import type { ServerResponse, DetectedRuntimeConfig } from '$lib/types';

  interface Props {
    open: boolean;
    server: ServerResponse;
    onClose: () => void;
  }

  let { open, server, onClose }: Props = $props();

  const hasPackages = $derived((server.server.packages?.length ?? 0) > 0);
  const hasRepo = $derived(!!server.server.repository?.url);
  const repoUrl = $derived(server.server.repository?.url ?? '');

  let cloneRepo = $state(hasRepo);
  let launching = $state(false);
  let error = $state<string | null>(null);
  let result = $state<Record<string, any> | null>(null);
  let preview = $state<DetectedRuntimeConfig | null>(null);
  let previewError = $state<string | null>(null);

  // Show what will actually run before anything is created.
  $effect(() => {
    if (!open || result) return;
    preview = null;
    previewError = null;
    api
      .previewRuntimeFromCatalog(server.server.name, server.server.version)
      .then(r => (preview = r.detected))
      .catch(e => (previewError = e instanceof Error ? e.message : 'Could not detect runtime'));
  });

  async function handleLaunch() {
    error = null;
    launching = true;

    try {
      const shouldClone = hasRepo && (!hasPackages || cloneRepo);
      const response = await api.createRuntimeFromCatalog(
        server.server.name,
        server.server.version,
        shouldClone,
        true // auto_start
      );
      result = response;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Launch failed';
    } finally {
      launching = false;
    }
  }

  function handleClose() {
    open = false;
    error = null;
    result = null;
    onClose();
  }

  function handleViewInstance() {
    goto('/admin/runtime');
  }
</script>

{#if open}
  <div
    role="dialog"
    aria-modal="true"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    onclick={handleClose}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
  >
    <div
      role="document"
      class="bg-white rounded-lg w-full max-w-lg shadow-xl overflow-hidden"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="px-6 py-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">Launch MCP</h2>
        <button
          type="button"
          onclick={handleClose}
          class="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div class="p-6 space-y-4">
        {#if !result}
          <div class="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div><span class="font-medium text-gray-700">Name:</span> <span class="text-gray-900">{server.server.name}</span></div>
            <div><span class="font-medium text-gray-700">Version:</span> <span class="text-gray-900">{server.server.version}</span></div>
            {#if hasRepo}
              <div>
                <span class="font-medium text-gray-700">Repository:</span>
                <a href={repoUrl} target="_blank" rel="noopener" class="text-blue-600 hover:underline ml-1 break-all">{repoUrl}</a>
              </div>
            {/if}
            {#if preview}
              <div>
                <span class="font-medium text-gray-700">Command:</span>
                <code class="ml-1 text-xs break-all">{preview.exec_cmd} {preview.exec_args?.join(' ') ?? ''}</code>
              </div>
              {#if preview.port}
                <div>
                  <span class="font-medium text-gray-700">Local port:</span>
                  <span class="ml-1">{preview.port}</span>
                  <span class="text-xs text-gray-500 block mt-0.5">
                    Speaks HTTP — runs on this machine at http://127.0.0.1:{preview.port}, nothing leaves the host.
                  </span>
                </div>
              {/if}
            {:else if previewError}
              <div class="text-xs text-gray-500">Runtime could not be auto-detected: {previewError}</div>
            {/if}
          </div>

          {#if hasRepo && hasPackages}
            <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 {cloneRepo ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}">
              <input
                type="radio"
                name="launch_mode"
                checked={cloneRepo}
                onchange={() => cloneRepo = true}
                class="mt-0.5"
              />
              <div>
                <div class="font-medium text-gray-900 text-sm">Clone repo & launch</div>
                <div class="text-xs text-gray-600 mt-0.5">Clones the repository and runs the MCP from the cloned directory</div>
              </div>
            </label>
          {/if}

          {#if hasPackages}
            <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 {!cloneRepo || !hasRepo ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}">
              <input
                type="radio"
                name="launch_mode"
                checked={!cloneRepo || !hasRepo}
                onchange={() => cloneRepo = false}
                class="mt-0.5"
              />
              <div>
                <div class="font-medium text-gray-900 text-sm">Launch with auto-detect</div>
                <div class="text-xs text-gray-600 mt-0.5">Auto-detects runtime (npx/uvx/docker) from the package definition</div>
              </div>
            </label>
          {/if}

          {#if hasRepo && !hasPackages}
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Cloning repo and auto-detecting runtime from project files (package.json, Dockerfile, pyproject.toml).
            </div>
          {/if}

          {#if error}
            <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>
          {/if}
        {:else}
          <div class="text-center space-y-3">
            <div class="text-green-600 text-lg font-semibold">Instance launched!</div>
            <p class="text-sm text-gray-600">{result.message ?? 'Instance created and started'}</p>
            {#if result.instance}
              <div class="bg-gray-50 rounded p-3 text-xs text-left space-y-1">
                <div><span class="text-gray-500">Status:</span> <span class="font-medium capitalize">{result.instance.status ?? 'unknown'}</span></div>
                {#if result.instance.endpoint_url}
                  <div><span class="text-gray-500">Endpoint:</span> <span class="font-mono break-all">{result.instance.endpoint_url}</span></div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
        {#if !result}
          <button
            type="button"
            onclick={handleClose}
            class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={handleLaunch}
            disabled={launching}
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {launching ? 'Launching...' : hasRepo && !hasPackages ? 'Clone & Launch' : cloneRepo ? 'Clone & Launch' : 'Launch'}
          </button>
        {:else}
          <button
            type="button"
            onclick={handleClose}
            class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            Close
          </button>
          <button
            type="button"
            onclick={handleViewInstance}
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View in Runtime →
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
