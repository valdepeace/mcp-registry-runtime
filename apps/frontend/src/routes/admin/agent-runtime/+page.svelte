<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api } from '$lib/api/client';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { AgentCard, Modal, AgentCombobox } from '$lib/components';
  import type { AgentInstance, AgentComposeResponse, AgentResponse } from '$lib/types';

  let instances = $state<AgentInstance[]>([]);
  let loading = $state(true);
  let backendHealthy = $state<boolean | null>(null);
  let actionLoading = $state<string | null>(null);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);

  // Create / Compose form
  let createAgentQuery = $state('');
  let createSelectedAgent = $state<AgentResponse | null>(null);
  let createAutoStart = $state(false);
  let createEnvJson = $state('');
  let createError = $state<string | null>(null);

  // Compose modal
  let showComposeModal = $state(false);
  let composeResult = $state<AgentComposeResponse | null>(null);
  let composeError = $state<string | null>(null);

  // Polling
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleNextPoll() {
    const needsPoll = instances.some(i => i.status === 'starting' || i.status === 'stopping');
    if (!needsPoll) return;
    pollTimer = setTimeout(async () => {
      await fetchInstances();
      scheduleNextPoll();
    }, 4000);
  }

  onDestroy(() => {
    if (pollTimer !== null) clearTimeout(pollTimer);
  });

  // Invoke modal
  let invokeTarget = $state<string | null>(null);
  let invokeInput = $state('');
  let invokeOutput = $state('');
  let invokeError = $state<string | null>(null);
  let invokeLoading = $state(false);

  // Prompt modal
  let promptTarget = $state<string | null>(null);
  let promptContent = $state('');

  async function fetchInstances() {
    try {
      error = null;
      backendHealthy = null;
      await api.getAgentRuntimeHealth();
      backendHealthy = true;
      const response = await api.listAgentInstances();
      instances = response.instances;
    } catch (e) {
      backendHealthy = false;
      error = e instanceof Error ? e.message : 'Failed to load instances';
    } finally {
      loading = false;
    }
    scheduleNextPoll();
  }

  async function handleCreate() {
    if (!createSelectedAgent) { createError = 'Select an agent from the registry'; return; }
    actionLoading = 'create';
    createError = null;
    try {
      const env_json = parseEnvJson(createEnvJson);
      await api.createAgentInstance({
        agent_name: createSelectedAgent.agent.name,
        agent_version: createSelectedAgent.agent.version,
        auto_start: createAutoStart,
        env_json,
      });
      message = `Instance created for ${createSelectedAgent.agent.name}@${createSelectedAgent.agent.version}`;
      createAgentQuery = '';
      createSelectedAgent = null;
      createAutoStart = false;
      createEnvJson = '';
      await fetchInstances();
    } catch (e) {
      createError = e instanceof Error ? e.message : 'Create failed';
    } finally {
      actionLoading = null;
    }
  }

  function parseEnvJson(raw: string): Record<string, string> | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Environment JSON must be an object');
    }

    const entries = Object.entries(parsed);
    const invalid = entries.find(([, value]) => typeof value !== 'string');
    if (invalid) {
      throw new Error('Environment JSON values must be strings');
    }

    return Object.fromEntries(entries) as Record<string, string>;
  }

  async function handleCompose() {
    if (!createSelectedAgent) { createError = 'Select an agent from the registry'; return; }
    composeError = null;
    try {
      const result = await api.composeAgent(createSelectedAgent.agent.name, createSelectedAgent.agent.version);
      composeResult = result;
      showComposeModal = true;
    } catch (e) {
      composeError = e instanceof Error ? e.message : 'Composition failed';
    }
  }

  async function handleStart(id: string) {
    actionLoading = id;
    try {
      await api.startAgentInstance(id);
      message = 'Agent started';
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to start';
    } finally {
      actionLoading = null;
    }
  }

  async function handleStop(id: string) {
    actionLoading = id;
    try {
      await api.stopAgentInstance(id);
      message = 'Agent stopped';
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to stop';
    } finally {
      actionLoading = null;
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this agent instance?')) return;
    actionLoading = id;
    try {
      await api.deleteAgentInstance(id);
      message = 'Instance deleted';
      await fetchInstances();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete';
    } finally {
      actionLoading = null;
    }
  }

  function handleInvoke(id: string) {
    invokeTarget = id;
    invokeInput = '';
    invokeOutput = '';
    invokeError = null;
  }

  async function doInvoke() {
    if (!invokeTarget || !invokeInput) return;
    invokeLoading = true;
    invokeOutput = '';
    invokeError = null;

    const token = api.getToken();
    let response: Response;
    try {
      response = await fetch(`/admin/agent-runtime/instances/${invokeTarget}/invoke/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ input: invokeInput }),
      });
    } catch (e) {
      invokeError = e instanceof Error ? e.message : 'Network error';
      invokeLoading = false;
      return;
    }

    if (!response.ok) {
      invokeError = await response.text();
      invokeLoading = false;
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; textDelta?: string; error?: string };
            if (event.type === 'text-delta' && event.textDelta) {
              invokeOutput += event.textDelta;
            } else if (event.type === 'error' && event.error) {
              invokeError = event.error;
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (e) {
      invokeError = e instanceof Error ? e.message : 'Stream read error';
    } finally {
      invokeLoading = false;
    }
  }

  function handlePrompt(id: string, prompt: string | null) {
    promptTarget = id;
    promptContent = prompt || '';
  }

  function handleAgentSelect(agent: AgentResponse | null) {
    createSelectedAgent = agent;
    createError = null;
    composeError = null;
    createAgentQuery = agent ? `${agent.agent.name}@${agent.agent.version}` : '';
  }

  $effect(() => {
    if (!$isAuthenticated) { goto('/login'); return; }
    fetchInstances();
  });
</script>

<svelte:head>
  <title>Agent Runtime - Admin</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Agent Runtime</h1>
      <p class="text-gray-600">Manage running agent instances</p>
    </div>
    <div class="flex gap-2">
      {#if backendHealthy !== null}
        <span class={`px-3 py-2 text-xs font-medium rounded ${backendHealthy ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {backendHealthy ? 'Backend online' : 'Backend offline'}
        </span>
      {/if}
      <button
        type="button"
        onclick={fetchInstances}
        disabled={loading}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
      >
        Refresh
      </button>
    </div>
  </div>

  <!-- Message -->
  {#if message}
    <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
      {message}
      <button type="button" onclick={() => message = null} class="float-right text-green-500 hover:text-green-700">x</button>
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
      {error}
      <button type="button" onclick={() => error = null} class="float-right text-red-500 hover:text-red-700">x</button>
    </div>
  {/if}

  <!-- Create / Compose bar -->
  <div class="bg-white border rounded-lg p-4 mb-6">
    <h2 class="font-semibold mb-3">Create Agent Instance</h2>
    <div class="flex gap-3 items-end">
      <div>
        <div class="block text-xs font-medium text-gray-700 mb-1">Agent</div>
        <AgentCombobox
          bind:value={createAgentQuery}
          onSelect={handleAgentSelect}
          placeholder="Search agents..."
          source="all"
        />
      </div>
      <button
        type="button"
        onclick={handleCreate}
        disabled={actionLoading === 'create' || !createSelectedAgent}
        class="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {actionLoading === 'create' ? 'Creating...' : 'Create'}
      </button>
      <label class="flex items-center gap-2 text-sm text-gray-700 pb-1">
        <input type="checkbox" bind:checked={createAutoStart} class="rounded border-gray-300" />
        Auto-start
      </label>
      <button
        type="button"
        onclick={handleCompose}
        disabled={!createSelectedAgent}
        class="px-4 py-1.5 text-sm font-medium text-indigo-700 border border-indigo-300 rounded hover:bg-indigo-50 disabled:opacity-50"
      >
        Compose Preview
      </button>
    </div>
    {#if createSelectedAgent}
      <div class="mt-3 bg-gray-50 border rounded p-3 text-sm">
        <div><span class="text-gray-500">Selected:</span> <span class="font-medium">{createSelectedAgent.agent.name}</span></div>
        <div><span class="text-gray-500">Version:</span> <span class="font-medium">v{createSelectedAgent.agent.version}</span></div>
        <div><span class="text-gray-500">Source:</span> <span class="font-medium">{createSelectedAgent.source ?? 'registry'}</span></div>
      </div>
    {/if}
    <div class="mt-3">
      <label for="agentEnvJson" class="block text-xs font-medium text-gray-700 mb-1">Environment JSON</label>
      <textarea
        id="agentEnvJson"
        bind:value={createEnvJson}
        rows={3}
        class="border rounded px-3 py-2 text-sm w-full font-mono"
        placeholder={`{"API_KEY":"value"}`}
      ></textarea>
    </div>
    {#if createError}
      <div class="bg-red-50 text-red-700 p-2 rounded mt-2 text-sm">{createError}</div>
    {/if}
    {#if composeError}
      <div class="bg-red-50 text-red-700 p-2 rounded mt-2 text-sm">{composeError}</div>
    {/if}
  </div>

  <!-- Loading -->
  {#if loading}
    <div class="text-center py-12 text-gray-600">Loading instances...</div>

  {:else if instances.length === 0}
    <!-- Empty state -->
    <div class="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <p class="text-gray-600 mb-4">No agent instances configured</p>
      <p class="text-sm text-gray-500">Create one above by entering an agent name and version.</p>
    </div>

  {:else}
    <!-- Instance grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each instances as instance (instance.id)}
        <AgentCard
          {instance}
          loading={actionLoading === instance.id}
          onStart={() => handleStart(instance.id)}
          onStop={() => handleStop(instance.id)}
          onInvoke={() => handleInvoke(instance.id)}
          onPrompt={() => handlePrompt(instance.id, instance.composed_prompt)}
          onDelete={() => handleDelete(instance.id)}
        />
      {/each}
    </div>
  {/if}
</div>

<!-- Compose Modal -->
<Modal
  open={showComposeModal}
  title={composeResult ? `Composed Agent: ${composeResult.composed.agent.name}` : 'Compose Preview'}
  onClose={() => showComposeModal = false}
>
  {#if composeResult}
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <span class="text-xs font-medium text-gray-500">Skills resolved</span>
          <div class="flex flex-wrap gap-1 mt-1">
            {#each composeResult.composed.resolvedSkills as skill}
              <span class="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">{skill.name}@{skill.version}</span>
            {:else}
              <span class="text-xs text-gray-400">none</span>
            {/each}
          </div>
        </div>
        <div>
          <span class="text-xs font-medium text-gray-500">MCP servers resolved</span>
          <div class="flex flex-wrap gap-1 mt-1">
            {#each composeResult.composed.resolvedMCPServers as mcp}
              <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{mcp.name}@{mcp.version}</span>
            {:else}
              <span class="text-xs text-gray-400">none</span>
            {/each}
          </div>
        </div>
      </div>
      <div>
        <span class="text-xs font-medium text-gray-500">Full Prompt</span>
        <pre class="bg-gray-50 border rounded p-3 text-xs overflow-x-auto mt-1 max-h-96">{composeResult.composed.composedPrompt}</pre>
      </div>
    </div>
  {/if}
</Modal>

<!-- Invoke Modal -->
<Modal
  open={invokeTarget !== null}
  title="Invoke Agent"
  onClose={() => invokeTarget = null}
>
  <div class="space-y-4">
    <div>
      <label for="invokeInput" class="block text-sm font-medium text-gray-700 mb-1">Input</label>
      <textarea
        id="invokeInput"
        bind:value={invokeInput}
        rows={4}
        class="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Enter input for the agent..."
      ></textarea>
    </div>

    {#if invokeError}
      <div class="bg-red-50 text-red-700 p-3 rounded text-sm">{invokeError}</div>
    {/if}

    {#if invokeOutput}
      <div>
        <h4 class="text-sm font-semibold mb-1">Output</h4>
        <pre class="bg-gray-50 border rounded p-3 text-xs overflow-x-auto max-h-64">{invokeOutput}</pre>
      </div>
    {/if}

    <div class="flex justify-end gap-3 pt-4 border-t">
      <button
        type="button"
        onclick={() => invokeTarget = null}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
      >
        Close
      </button>
      <button
        type="button"
        onclick={doInvoke}
        disabled={invokeLoading || !invokeInput}
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {invokeLoading ? 'Invoking...' : 'Invoke'}
      </button>
    </div>
  </div>
</Modal>

<!-- Prompt Modal -->
<Modal
  open={promptTarget !== null}
  title="Agent Prompt"
  onClose={() => promptTarget = null}
>
  <pre class="bg-gray-50 border rounded p-3 text-xs overflow-x-auto max-h-[70vh]">{promptContent}</pre>
</Modal>
