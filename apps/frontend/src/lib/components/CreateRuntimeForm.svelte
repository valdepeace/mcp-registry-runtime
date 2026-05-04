<script lang="ts">
  import type { CreateRuntimeInstanceInput } from '$lib/types';

  interface Props {
    onSubmit: (input: CreateRuntimeInstanceInput) => void;
    onCancel: () => void;
    loading?: boolean;
  }

  let { onSubmit, onCancel, loading = false }: Props = $props();

  let serverName = $state('');
  let version = $state('');
  let execCmd = $state('');
  let execArgs = $state('');
  let cwd = $state('');
  let port = $state('');
  let envJson = $state('');

  let error = $state<string | null>(null);

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;

    if (!serverName || !version || !execCmd) {
      error = 'Server name, version, and command are required';
      return;
    }

    // Validate server name format
    if (!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(serverName)) {
      error = 'Server name must be in format org/name';
      return;
    }

    // Parse env JSON if provided
    let parsedEnv: Record<string, string> | undefined;
    if (envJson.trim()) {
      try {
        parsedEnv = JSON.parse(envJson);
      } catch {
        error = 'Environment variables must be valid JSON';
        return;
      }
    }

    // Parse args
    const parsedArgs = execArgs.trim() 
      ? execArgs.split(/\s+/).filter(Boolean) 
      : undefined;

    const input: CreateRuntimeInstanceInput = {
      server_name: serverName,
      version,
      exec_cmd: execCmd,
      exec_args: parsedArgs,
      cwd: cwd || undefined,
      port: port ? parseInt(port, 10) : undefined,
      env_json: parsedEnv,
    };

    onSubmit(input);
  }
</script>

<form onsubmit={handleSubmit} class="space-y-4">
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
      {error}
    </div>
  {/if}

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label for="serverName" class="block text-sm font-medium text-gray-700 mb-1">
        Server Name <span class="text-red-500">*</span>
      </label>
      <input
        id="serverName"
        type="text"
        bind:value={serverName}
        placeholder="org/server-name"
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p class="text-xs text-gray-500 mt-1">Format: org/name (e.g., docker/mcp-docker)</p>
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

  <div>
    <label for="execCmd" class="block text-sm font-medium text-gray-700 mb-1">
      Command <span class="text-red-500">*</span>
    </label>
    <input
      id="execCmd"
      type="text"
      bind:value={execCmd}
      placeholder="node, python3, uvx, npx..."
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      <p class="text-xs text-gray-500 mt-1">Auto-generates health URL if set</p>
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
      disabled={loading}
      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? 'Creating...' : 'Create Instance'}
    </button>
  </div>
</form>
