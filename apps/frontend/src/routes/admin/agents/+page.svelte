<script lang="ts">
  import { api } from '$lib/api/client';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import type { AgentResponse, AgentDetail, AgentType, AgentCategory } from '$lib/types';
  import { AGENT_TYPES } from '$lib/types';

  let agents = $state<AgentResponse[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);

  let showForm = $state(false);
  let editTarget = $state<AgentResponse | null>(null);
  let formError = $state<string | null>(null);

  let formName = $state('');
  let formVersion = $state('1.0.0');
  let formDescription = $state('');
  let formInstructions = $state('');
  let formSubagentType = $state<AgentType>('custom');
  let formCategory = $state('');
  let formTags = $state('');
  let formSkills = $state('');
  let formMcpServers = $state('');
  let formTools = $state('');

  async function loadAgents() {
    try {
      loading = true;
      error = null;
      const response = await api.listAgents({ limit: 100 });
      agents = response.agents;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load agents';
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    showForm = false;
    editTarget = null;
    formName = '';
    formVersion = '1.0.0';
    formDescription = '';
    formInstructions = '';
    formSubagentType = 'custom';
    formCategory = '';
    formTags = '';
    formSkills = '';
    formMcpServers = '';
    formTools = '';
    formError = null;
  }

  function editAgent(item: AgentResponse) {
    editTarget = item;
    formName = item.agent.name;
    formVersion = item.agent.version;
    formDescription = item.agent.description;
    formInstructions = item.agent.instructions;
    formSubagentType = item.agent.subagent_type;
    formCategory = item.agent.category || '';
    formTags = item.agent.tags?.join(', ') || '';
    formSkills = item.agent.required_skills?.map(s => `${s.name}@${s.version}`).join(', ') || '';
    formMcpServers = item.agent.required_mcp_servers?.map(s => `${s.name}@${s.version}`).join(', ') || '';
    formTools = item.agent.tool_access?.join(', ') || '';
    showForm = true;
    formError = null;
  }

  async function saveAgent() {
    if (!formName || !formVersion || !formDescription || !formInstructions) {
      formError = 'Name, version, description, and instructions are required';
      return;
    }
    try {
      formError = null;
      const agentData: AgentDetail = {
        name: formName,
        version: formVersion,
        description: formDescription,
        instructions: formInstructions,
        subagent_type: formSubagentType,
        required_skills: parseRefList(formSkills),
        required_mcp_servers: parseRefList(formMcpServers),
        tool_access: formTools ? formTools.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        category: (formCategory || undefined) as AgentCategory | undefined,
        tags: formTags ? formTags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      };
      if (editTarget) {
        await api.updateAgent(formName, formVersion, agentData);
        message = 'Agent updated';
      } else {
        await api.createAgent(agentData);
        message = 'Agent created';
      }
      resetForm();
      loadAgents();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Save failed';
    }
  }

  function parseRefList(raw: string): { name: string; version: string }[] {
    return raw ? raw.split(',').map(r => {
      const [name, version] = r.trim().split('@');
      return { name: name || '', version: version || 'latest' };
    }).filter(r => r.name) : [];
  }

  async function deleteAgent(item: AgentResponse) {
    if (!confirm(`Delete ${item.agent.name} v${item.agent.version}?`)) return;
    try {
      await api.deleteAgentVersion(item.agent.name, item.agent.version);
      message = 'Agent deleted';
      loadAgents();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    }
  }

  $effect(() => {
    if (!$isAuthenticated) { goto('/login'); return; }
    loadAgents();
  });
</script>

<div class="max-w-5xl mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Manage Agents</h1>
      <p class="text-gray-600 text-sm">Create and manage private agents</p>
    </div>
    <button onclick={() => { resetForm(); showForm = true; }}
      class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
      + New Agent
    </button>
  </div>

  {#if message}
    <div class="bg-green-50 text-green-700 p-3 rounded mb-4 text-sm">{message}</div>
  {/if}
  {#if error}
    <div class="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
  {/if}

  {#if showForm}
    <div class="bg-white border rounded-lg p-4 mb-6">
      <h2 class="font-semibold mb-3">{editTarget ? 'Edit' : 'Create'} Agent</h2>
      {#if formError}
        <div class="bg-red-50 text-red-700 p-2 rounded mb-3 text-sm">{formError}</div>
      {/if}
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Name</label>
          <input bind:value={formName} disabled={!!editTarget}
            class="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Version</label>
          <input bind:value={formVersion}
            class="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Subagent Type</label>
          <select bind:value={formSubagentType} class="w-full border rounded px-3 py-1.5 text-sm">
            {#each AGENT_TYPES as t}
              <option value={t.value}>{t.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <input bind:value={formCategory}
            class="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
          <input bind:value={formTags}
            class="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <input bind:value={formDescription}
            class="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Instructions (system prompt)</label>
          <textarea bind:value={formInstructions} rows={6}
            class="w-full border rounded px-3 py-1.5 text-sm font-mono"></textarea>
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Required Skills (name@version, comma-separated)</label>
          <input bind:value={formSkills}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="express5-backend@1.0.0, svelte5-templates@1.0.0" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Required MCP Servers (name@version, comma-separated)</label>
          <input bind:value={formMcpServers}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="filesystem@1.0.0" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Tool Access (comma-separated)</label>
          <input bind:value={formTools}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="bash, read, write, glob, grep" />
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick={saveAgent} class="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
          {editTarget ? 'Update' : 'Create'}
        </button>
        <button onclick={resetForm} class="border px-4 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-gray-500">Loading...</div>
  {:else if agents.length === 0}
    <div class="text-center py-12 text-gray-500">No agents yet. Create one above.</div>
  {:else}
    <div class="border rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-3 font-medium">Name</th>
            <th class="text-left p-3 font-medium">Version</th>
            <th class="text-left p-3 font-medium">Type</th>
            <th class="text-left p-3 font-medium">Source</th>
            <th class="text-right p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each agents as item}
            <tr class="border-t hover:bg-gray-50">
              <td class="p-3">{item.agent.name}</td>
              <td class="p-3">v{item.agent.version}</td>
              <td class="p-3">{item.agent.subagent_type}</td>
              <td class="p-3">
                <span class={`text-xs px-2 py-0.5 rounded ${item.source === 'registry' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {item.source}
                </span>
              </td>
              <td class="p-3 text-right">
                {#if item.source !== 'registry'}
                  <button onclick={() => editAgent(item)} class="text-blue-600 hover:underline mr-3 text-xs">Edit</button>
                  <button onclick={() => deleteAgent(item)} class="text-red-600 hover:underline text-xs">Delete</button>
                {:else}
                  <span class="text-gray-400 text-xs">Read-only</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
