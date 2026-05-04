<script lang="ts">
  import type { RuntimeInstance, UpdateRuntimeInstanceInput } from '$lib/types';

  interface Props {
    instance: RuntimeInstance;
    onSubmit: (input: UpdateRuntimeInstanceInput) => void;
    onCancel: () => void;
    loading?: boolean;
  }

  let { instance, onSubmit, onCancel, loading = false }: Props = $props();

  const {
    exec_cmd,
    exec_args,
    cwd: initCwd,
    port: initPort,
    endpoint_url,
    health_url,
    env_json
  } = instance;

  let execCmd = $state(exec_cmd);
  let execArgs = $state(exec_args?.join(' ') ?? '');
  let cwd = $state(initCwd ?? '');
  let port = $state(initPort?.toString() ?? '');
  let endpointUrl = $state(endpoint_url ?? '');
  let healthUrl = $state(health_url ?? '');
  let envJson = $state(env_json ? JSON.stringify(env_json, null, 2) : '');

  let error = $state<string | null>(null);

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;

    if (!execCmd.trim()) {
      error = 'Command is required';
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

    const parsedArgs = execArgs.trim()
      ? execArgs.split(/\s+/).filter(Boolean)
      : undefined;

    const input: UpdateRuntimeInstanceInput = {
      exec_cmd: execCmd.trim(),
      exec_args: parsedArgs,
      cwd: cwd.trim() || undefined,
      port: port ? parseInt(port, 10) : undefined,
      endpoint_url: endpointUrl.trim() || undefined,
      health_url: healthUrl.trim() || undefined,
      env_json: parsedEnv,
    };

    onSubmit(input);
  }
</script>

<form onsubmit={handleSubmit} class="space-y-4">
  <div class="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded">
    <span class="font-medium text-gray-700">{instance.server_name}</span>
    <span class="ml-2">v{instance.version}</span>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
      {error}
    </div>
  {/if}

  <div>
    <label for="editExecCmd" class="block text-sm font-medium text-gray-700 mb-1">
      Command <span class="text-red-500">*</span>
    </label>
    <input
      id="editExecCmd"
      type="text"
      bind:value={execCmd}
      placeholder="node, python3, uvx, npx..."
      disabled={loading}
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
    />
  </div>

  <div>
    <label for="editExecArgs" class="block text-sm font-medium text-gray-700 mb-1">
      Arguments
    </label>
    <input
      id="editExecArgs"
      type="text"
      bind:value={execArgs}
      placeholder="server.js --port 7100"
      disabled={loading}
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
    />
    <p class="text-xs text-gray-500 mt-1">Space-separated arguments</p>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label for="editCwd" class="block text-sm font-medium text-gray-700 mb-1">
        Working Directory
      </label>
      <input
        id="editCwd"
        type="text"
        bind:value={cwd}
        placeholder="/path/to/project"
        disabled={loading}
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      />
    </div>

    <div>
      <label for="editPort" class="block text-sm font-medium text-gray-700 mb-1">
        Port
      </label>
      <input
        id="editPort"
        type="number"
        bind:value={port}
        placeholder="7100"
        min="1"
        max="65535"
        disabled={loading}
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      />
    </div>
  </div>

  <div>
    <label for="editEndpointUrl" class="block text-sm font-medium text-gray-700 mb-1">
      Endpoint URL
    </label>
    <input
      id="editEndpointUrl"
      type="text"
      bind:value={endpointUrl}
      placeholder="http://localhost:7100/sse"
      disabled={loading}
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
    />
  </div>

  <div>
    <label for="editHealthUrl" class="block text-sm font-medium text-gray-700 mb-1">
      Health URL
    </label>
    <input
      id="editHealthUrl"
      type="text"
      bind:value={healthUrl}
      placeholder="http://localhost:7100/health"
      disabled={loading}
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
    />
  </div>

  <div>
    <label for="editEnvJson" class="block text-sm font-medium text-gray-700 mb-1">
      Environment Variables (JSON)
    </label>
    <textarea
      id="editEnvJson"
      bind:value={envJson}
      placeholder={'{"API_KEY": "xxx", "DEBUG": "true"}'}
      rows="3"
      disabled={loading}
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
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
      {loading ? 'Saving...' : 'Save Changes'}
    </button>
  </div>
</form>
