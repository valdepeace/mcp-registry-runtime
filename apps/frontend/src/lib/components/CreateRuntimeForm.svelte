<script lang="ts">
  import { api } from '$lib/api/client';
  import ServerCombobox from './ServerCombobox.svelte';
  import type { CreateRuntimeInstanceInput, ServerListItem } from '$lib/types';

  interface Props {
    onSubmit: (input: CreateRuntimeInstanceInput, opts?: { buildFromSource?: boolean }) => void;
    onCancel: () => void;
    loading?: boolean;
    /** Preselected MCP, e.g. when opened from a catalog card. */
    initialServerName?: string;
    initialVersion?: string;
  }

  let {
    onSubmit,
    onCancel,
    loading = false,
    initialServerName = '',
    initialVersion = '',
  }: Props = $props();

  let serverName = $state(initialServerName);
  let version = $state(initialVersion);
  let execCmd = $state('');
  let execArgs = $state('');
  let cwd = $state('');
  let port = $state('');
  let envJson = $state('');

  let selectedServer = $state<ServerListItem | null>(null);
  /** Set when the MCP ships no package and has to be cloned and built here. */
  let sourceRepo = $state<string | null>(null);
  let detecting = $state(false);
  let detectNote = $state<string | null>(null);
  let error = $state<string | null>(null);

  /**
   * Ask the runtime to work out exec_cmd/args/env/port for this MCP without
   * creating anything, then drop the answer into the fields so it stays editable.
   */
  async function detect(name: string, ver?: string) {
    if (!name) return;
    detecting = true;
    detectNote = null;
    error = null;
    try {
      const { detected } = await api.previewRuntimeFromCatalog(name, ver || undefined);
      sourceRepo = detected.provision?.repository ?? null;
      execCmd = detected.exec_cmd ?? '';
      execArgs = (detected.exec_args ?? []).join(' ');
      cwd = detected.cwd ?? '';
      port = detected.port ? String(detected.port) : '';
      envJson = Object.keys(detected.env_json ?? {}).length
        ? JSON.stringify(detected.env_json, null, 2)
        : '';
      if (sourceRepo) {
        detectNote = null;
      } else {
        detectNote = port
          ? `Detected from catalog. This MCP speaks HTTP — it will run locally on port ${port}.`
          : 'Detected from catalog. Review before creating.';
      }
    } catch (e) {
      sourceRepo = null;
      detectNote = e instanceof Error
        ? `Could not auto-detect: ${e.message}. Fill the command in by hand.`
        : 'Could not auto-detect. Fill the command in by hand.';
    } finally {
      detecting = false;
    }
  }

  function handleServerSelect(server: ServerListItem | null) {
    selectedServer = server;
    sourceRepo = null;
    if (!server) return;
    version = server.version;
    detect(server.name, server.version);
  }

  // Preselected from a catalog card — detect straight away.
  $effect(() => {
    if (initialServerName) detect(initialServerName, initialVersion);
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;

    if (!serverName || !version) {
      error = 'MCP and version are required';
      return;
    }
    if (!sourceRepo && !execCmd) {
      error = 'Command is required';
      return;
    }

    if (!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(serverName)) {
      error = 'MCP name must be in format org/name';
      return;
    }

    let parsedEnv: Record<string, string> | undefined;
    if (envJson.trim()) {
      try {
        parsedEnv = JSON.parse(envJson);
      } catch {
        error = 'Environment variables must be valid JSON';
        return;
      }
    }

    onSubmit(
      {
        server_name: serverName,
        version,
        exec_cmd: execCmd,
        exec_args: execArgs.trim() ? execArgs.split(/\s+/).filter(Boolean) : undefined,
        cwd: cwd || undefined,
        port: port ? parseInt(port, 10) : undefined,
        env_json: parsedEnv,
      },
      { buildFromSource: !!sourceRepo },
    );
  }
</script>

<form onsubmit={handleSubmit} class="space-y-4">
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
      {error}
    </div>
  {/if}

  <div class="grid grid-cols-3 gap-4">
    <div class="col-span-2">
      <label for="serverName" class="block text-sm font-medium text-gray-700 mb-1">
        MCP <span class="text-red-500">*</span>
      </label>
      <ServerCombobox
        bind:value={serverName}
        onSelect={handleServerSelect}
        placeholder="Search the catalog..."
        disabled={loading}
      />
      <p class="text-xs text-gray-500 mt-1">
        Pick one and the command is filled in from the catalog. Format: org/name
      </p>
    </div>

    <div>
      <label for="version" class="block text-sm font-medium text-gray-700 mb-1">
        Version <span class="text-red-500">*</span>
      </label>
      <input
        id="version"
        type="text"
        bind:value={version}
        placeholder="1.0.0"
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  </div>

  {#if selectedServer?.description}
    <div class="p-2 bg-gray-50 rounded text-xs text-gray-600">
      <div class="font-medium text-gray-800">{selectedServer.name}</div>
      <div class="line-clamp-2">{selectedServer.description}</div>
    </div>
  {/if}

  {#if detecting}
    <div class="text-xs text-gray-500">Detecting runtime configuration…</div>
  {:else if sourceRepo}
    <div class="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded text-xs space-y-1">
      <div>
        This MCP ships no package. It will be cloned from
        <a href={sourceRepo} target="_blank" rel="noopener" class="underline break-all">{sourceRepo}</a>,
        its dependencies installed and the project built here, then PM2 runs it locally.
      </div>
      <div>The command is filled in once the build finishes — it can take a few minutes.</div>
    </div>
  {:else if detectNote}
    <div class="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded text-xs">
      {detectNote}
    </div>
  {/if}

  <div>
    <label for="execCmd" class="block text-sm font-medium text-gray-700 mb-1">
      Command {#if !sourceRepo}<span class="text-red-500">*</span>{/if}
    </label>
    <input
      id="execCmd"
      type="text"
      bind:value={execCmd}
      placeholder={sourceRepo ? 'detected after the build' : 'node, python3, uvx, npx, docker...'}
      disabled={!!sourceRepo}
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>

  <div>
    <label for="execArgs" class="block text-sm font-medium text-gray-700 mb-1">
      Arguments
    </label>
    <input
      id="execArgs"
      type="text"
      bind:value={execArgs}
      placeholder="server.js --port 7100"
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <p class="text-xs text-gray-500 mt-1">Space-separated arguments</p>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label for="cwd" class="block text-sm font-medium text-gray-700 mb-1">
        Working Directory
      </label>
      <input
        id="cwd"
        type="text"
        bind:value={cwd}
        placeholder="/path/to/project"
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div>
      <label for="port" class="block text-sm font-medium text-gray-700 mb-1">
        Port
      </label>
      <input
        id="port"
        type="number"
        bind:value={port}
        placeholder="7100"
        min="1"
        max="65535"
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p class="text-xs text-gray-500 mt-1">Auto-generates endpoint and health URL</p>
    </div>
  </div>

  <div>
    <label for="envJson" class="block text-sm font-medium text-gray-700 mb-1">
      Environment Variables (JSON)
    </label>
    <textarea
      id="envJson"
      bind:value={envJson}
      placeholder={'{"API_KEY": "xxx", "DEBUG": "true"}'}
      rows="3"
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
    ></textarea>
  </div>

  <div class="flex justify-end gap-3 pt-4 border-t">
    <button
      type="button"
      onclick={onCancel}
      disabled={loading}
      class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
    >
      Cancel
    </button>
    <button
      type="submit"
      disabled={loading || detecting}
      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? 'Creating...' : sourceRepo ? 'Clone, build & create' : 'Create Instance'}
    </button>
  </div>
</form>
