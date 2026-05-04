<script lang="ts">
  import { api } from '$lib/api/client';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import type { AgentInstance, AgentComposeResponse } from '$lib/types';

  let instances = $state<AgentInstance[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);

  let composeModal = $state(false);
  let composeResult = $state<AgentComposeResponse | null>(null);
  let composeError = $state<string | null>(null);

  let createName = $state('');
  let createVersion = $state('1.0.0');

  let invokeModal = $state<string | null>(null);
  let invokeInput = $state('');
  let invokeOutput = $state('');
  let invokeError = $state<string | null>(null);

  let detailModal = $state<string | null>(null);
  let detailPrompt = $state('');

  async function loadInstances() {
    try {
      loading = true;
      error = null;
      const response = await api.listAgentInstances();
      instances = response.instances;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load instances';
    } finally {
      loading = false;
    }
  }

  async function createInstance() {
    if (!createName) { error = 'Agent name is required'; return; }
    try {
      error = null;
      await api.createAgentInstance({ agent_name: createName, agent_version: createVersion });
      message = `Instance created for ${createName}@${createVersion}`;
      createName = '';
      createVersion = '1.0.0';
      loadInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Create failed';
    }
  }

  async function startInstance(id: string) {
    try {
      await api.startAgentInstance(id);
      message = 'Agent started';
      loadInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Start failed';
    }
  }

  async function stopInstance(id: string) {
    try {
      await api.stopAgentInstance(id);
      message = 'Agent stopped';
      loadInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Stop failed';
    }
  }

  async function deleteInstance(id: string) {
    if (!confirm('Delete this agent instance?')) return;
    try {
      await api.deleteAgentInstance(id);
      message = 'Instance deleted';
      loadInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    }
  }

  async function invokeAgent(id: string) {
    invokeModal = id;
    invokeInput = '';
    invokeOutput = '';
    invokeError = null;
  }

  async function doInvoke() {
    if (!invokeModal || !invokeInput) return;
    try {
      const result = await api.invokeAgent(invokeModal, invokeInput);
      invokeOutput = result.output;
      invokeError = null;
    } catch (e) {
      invokeError = e instanceof Error ? e.message : 'Invoke failed';
    }
  }

  async function composeAgent() {
    if (!createName) { error = 'Agent name is required'; return; }
    try {
      composeError = null;
      const result = await api.composeAgent(createName, createVersion);
      composeResult = result;
      composeModal = true;
    } catch (e) {
      composeError = e instanceof Error ? e.message : 'Composition failed';
    }
  }

  function showDetail(prompt: string | null) {
    detailModal = prompt || '';
    detailPrompt = prompt || '';
  }

  $effect(() => {
    if (!$isAuthenticated) { goto('/login'); return; }
    loadInstances();
  });
</script>

<div class="max-w-5xl mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Agent Runtime</h1>
      <p class="text-gray-600 text-sm">Manage running agent instances</p>
    </div>
  </div>

  {#if message}
    <div class="bg-green-50 text-green-700 p-3 rounded mb-4 text-sm">{message}</div>
  {/if}
  {#if error}
    <div class="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
  {/if}

  <!-- Create Form -->
  <div class="bg-white border rounded-lg p-4 mb-6">
    <h2 class="font-semibold mb-3">Create Agent Instance</h2>
    <div class="flex gap-3 items-end">
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">Agent Name</label>
        <input bind:value={createName} class="border rounded px-3 py-1.5 text-sm w-48"
          placeholder="agent-name" />
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">Version</label>
        <input bind:value={createVersion} class="border rounded px-3 py-1.5 text-sm w-32"
          placeholder="1.0.0" />
      </div>
      <button onclick={createInstance} class="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
        Create
      </button>
      <button onclick={composeAgent} class="border border-indigo-300 text-indigo-700 px-4 py-1.5 rounded text-sm hover:bg-indigo-50">
        Compose Preview
      </button>
    </div>
    {#if composeError}
      <div class="bg-red-50 text-red-700 p-2 rounded mt-2 text-sm">{composeError}</div>
    {/if}
  </div>

  <!-- Compose Modal -->
  {#if composeModal && composeResult}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => composeModal = false}>
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onclick={(e: Event) => e.stopPropagation()}>
        <h3 class="text-lg font-semibold mb-2">Composed Agent: {composeResult.composed.agent.name}</h3>
        <div class="mb-3">
          <span class="text-xs font-medium">Skills resolved:</span>
          <span class="text-xs text-gray-600 ml-2">{composeResult.composed.resolvedSkills.map(s => `${s.name}@${s.version}`).join(', ') || 'none'}</span>
        </div>
        <div class="mb-3">
          <span class="text-xs font-medium">MCP servers resolved:</span>
          <span class="text-xs text-gray-600 ml-2">{composeResult.composed.resolvedMCPServers.map(m => `${m.name}@${m.version}`).join(', ') || 'none'}</span>
        </div>
        <h4 class="text-sm font-semibold mb-1">Full Prompt:</h4>
        <pre class="bg-gray-50 border rounded p-3 text-xs overflow-x-auto">{composeResult.composed.composedPrompt}</pre>
        <button onclick={() => composeModal = false}
          class="mt-4 border px-4 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50">Close</button>
      </div>
    </div>
  {/if}

  <!-- Invoke Modal -->
  {#if invokeModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => invokeModal = null}>
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4" onclick={(e: Event) => e.stopPropagation()}>
        <h3 class="text-lg font-semibold mb-3">Invoke Agent</h3>
        <textarea bind:value={invokeInput} rows={4}
          class="w-full border rounded p-2 text-sm mb-3" placeholder="Enter input for the agent..."></textarea>
        {#if invokeError}
          <div class="bg-red-50 text-red-700 p-2 rounded mb-3 text-sm">{invokeError}</div>
        {/if}
        {#if invokeOutput}
          <h4 class="text-sm font-semibold mb-1">Output:</h4>
          <pre class="bg-gray-50 border rounded p-3 text-xs overflow-x-auto mb-3 max-h-64">{invokeOutput}</pre>
        {/if}
        <div class="flex gap-2">
          <button onclick={doInvoke} class="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Invoke</button>
          <button onclick={() => invokeModal = null} class="border px-4 py-1.5 rounded text-sm text-gray-600">Close</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Detail Modal -->
  {#if detailModal !== null}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => detailModal = null}>
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onclick={(e: Event) => e.stopPropagation()}>
        <h3 class="text-lg font-semibold mb-2">Agent Prompt</h3>
        <pre class="bg-gray-50 border rounded p-3 text-xs overflow-x-auto max-h-96">{detailPrompt}</pre>
        <button onclick={() => detailModal = null}
          class="mt-4 border px-4 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50">Close</button>
      </div>
    </div>
  {/if}

  <!-- Instances -->
  {#if loading}
    <div class="text-center py-12 text-gray-500">Loading instances...</div>
  {:else if instances.length === 0}
    <div class="text-center py-12 text-gray-500">No agent instances running.</div>
  {:else}
    <div class="border rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-3 font-medium">Agent</th>
            <th class="text-left p-3 font-medium">Version</th>
            <th class="text-left p-3 font-medium">Status</th>
            <th class="text-left p-3 font-medium">PM2</th>
            <th class="text-right p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each instances as inst}
            <tr class="border-t hover:bg-gray-50">
              <td class="p-3">{inst.agent_name}</td>
              <td class="p-3">v{inst.agent_version}</td>
              <td class="p-3">
                <span class={`text-xs px-2 py-0.5 rounded ${
                  inst.status === 'online' ? 'bg-green-100 text-green-700' :
                  inst.status === 'errored' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'}`}>
                  {inst.status}
                </span>
              </td>
              <td class="p-3 text-gray-500 text-xs">{inst.pm2_name}</td>
              <td class="p-3 text-right">
                {#if inst.composed_prompt}
                  <button onclick={() => showDetail(inst.composed_prompt)} class="text-gray-600 hover:underline mr-2 text-xs">Prompt</button>
                {/if}
                <button onclick={() => invokeAgent(inst.id)} class="text-indigo-600 hover:underline mr-2 text-xs">Invoke</button>
                {#if inst.status === 'stopped' || inst.status === 'errored'}
                  <button onclick={() => startInstance(inst.id)} class="text-green-600 hover:underline mr-2 text-xs">Start</button>
                {:else}
                  <button onclick={() => stopInstance(inst.id)} class="text-orange-600 hover:underline mr-2 text-xs">Stop</button>
                {/if}
                <button onclick={() => deleteInstance(inst.id)} class="text-red-600 hover:underline text-xs">Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
