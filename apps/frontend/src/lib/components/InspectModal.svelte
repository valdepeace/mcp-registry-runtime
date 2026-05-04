<script lang="ts">
  import { api } from '$lib/api/client';
  import type {
    RuntimeInstance,
    McpCapabilities,
    McpTool,
    McpResource,
    McpPrompt,
    McpPropertySchema,
    InspectHistoryEntry
  } from '$lib/types';
  import Modal from './Modal.svelte';
  import JsonOutput from './JsonOutput.svelte';

  interface Props {
    instance: RuntimeInstance;
    onClose: () => void;
  }

  let { instance, onClose }: Props = $props();

  // ── Capabilities loading ─────────────────────────────────────────────────
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let capabilities = $state<McpCapabilities | null>(null);
  let activeTab = $state<'tools' | 'resources' | 'prompts' | 'history'>('tools');

  async function loadCapabilities() {
    loading = true;
    loadError = null;
    try {
      capabilities = await api.getInspectCapabilities(instance.id);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to inspect instance';
    } finally {
      loading = false;
    }
  }

  $effect(() => { loadCapabilities(); });

  // ── Tools ────────────────────────────────────────────────────────────────
  let activeTool = $state<string | null>(null);
  let toolArgs = $state<Record<string, string>>({});
  let toolRunning = $state(false);
  let toolResult = $state<unknown>(null);
  let toolError = $state<string | null>(null);

  function selectTool(name: string) {
    if (activeTool === name) { activeTool = null; return; }
    activeTool = name;
    toolArgs = {};
    toolResult = null;
    toolError = null;
  }

  function setToolArg(key: string, value: string) {
    toolArgs = { ...toolArgs, [key]: value };
  }

  async function runTool(tool: McpTool) {
    toolRunning = true;
    toolResult = null;
    toolError = null;

    const parsed: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
      const raw = toolArgs[key] ?? '';
      if (raw === '' && !tool.inputSchema.required?.includes(key)) continue;
      if (schema.type === 'integer') {
        parsed[key] = parseInt(raw, 10);
      } else if (schema.type === 'number') {
        parsed[key] = parseFloat(raw);
      } else if (schema.type === 'boolean') {
        parsed[key] = raw === 'true';
      } else if (schema.type === 'object' || schema.type === 'array') {
        try { parsed[key] = JSON.parse(raw); }
        catch { toolError = `Invalid JSON for "${key}"`; toolRunning = false; return; }
      } else {
        parsed[key] = raw;
      }
    }

    try {
      toolResult = await api.callInspectTool(instance.id, tool.name, parsed);
    } catch (e) {
      toolError = e instanceof Error ? e.message : 'Tool call failed';
    } finally {
      toolRunning = false;
    }
  }

  // ── Resources ────────────────────────────────────────────────────────────
  let activeResource = $state<string | null>(null);
  let resourceLoading = $state(false);
  let resourceResult = $state<unknown>(null);
  let resourceError = $state<string | null>(null);

  async function readResource(uri: string) {
    if (activeResource === uri) { activeResource = null; return; }
    activeResource = uri;
    resourceResult = null;
    resourceError = null;
    resourceLoading = true;
    try {
      resourceResult = await api.readInspectResource(instance.id, uri);
    } catch (e) {
      resourceError = e instanceof Error ? e.message : 'Failed to read resource';
    } finally {
      resourceLoading = false;
    }
  }

  // ── Prompts ──────────────────────────────────────────────────────────────
  let activePrompt = $state<string | null>(null);
  let promptArgs = $state<Record<string, string>>({});
  let promptRunning = $state(false);
  let promptResult = $state<unknown>(null);
  let promptError = $state<string | null>(null);

  function selectPrompt(name: string) {
    if (activePrompt === name) { activePrompt = null; return; }
    activePrompt = name;
    promptArgs = {};
    promptResult = null;
    promptError = null;
  }

  function setPromptArg(key: string, value: string) {
    promptArgs = { ...promptArgs, [key]: value };
  }

  async function runPrompt(prompt: McpPrompt) {
    promptRunning = true;
    promptResult = null;
    promptError = null;
    const args: Record<string, string> = {};
    for (const arg of prompt.arguments ?? []) {
      if (promptArgs[arg.name]) args[arg.name] = promptArgs[arg.name];
    }
    try {
      promptResult = await api.getInspectPrompt(instance.id, prompt.name, args);
    } catch (e) {
      promptError = e instanceof Error ? e.message : 'Prompt failed';
    } finally {
      promptRunning = false;
    }
  }

  // ── History ──────────────────────────────────────────────────────────────
  let historyEntries = $state<InspectHistoryEntry[]>([]);
  let historyLoading = $state(false);
  let historyError = $state<string | null>(null);
  let expandedHistoryId = $state<number | null>(null);

  async function loadHistory() {
    historyLoading = true;
    historyError = null;
    try {
      historyEntries = await api.getInspectHistory(instance.id);
    } catch (e) {
      historyError = e instanceof Error ? e.message : 'Failed to load history';
    } finally {
      historyLoading = false;
    }
  }

  $effect(() => {
    if (activeTab === 'history') loadHistory();
  });

  function reuseHistoryEntry(entry: InspectHistoryEntry) {
    const args = JSON.parse(entry.args_json) as Record<string, unknown>;
    activeTool = entry.tool_name;
    toolArgs = Object.fromEntries(
      Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    );
    toolResult = null;
    toolError = null;
    activeTab = 'tools';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function inputType(schema: McpPropertySchema): string {
    if (schema.type === 'integer' || schema.type === 'number') return 'number';
    return 'text';
  }

  function isTextarea(schema: McpPropertySchema): boolean {
    return schema.type === 'object' || schema.type === 'array';
  }

  function isCheckbox(schema: McpPropertySchema): boolean {
    return schema.type === 'boolean';
  }

  function isEnum(schema: McpPropertySchema): boolean {
    return Array.isArray(schema.enum) && schema.enum.length > 0;
  }
</script>

<Modal open={true} title="Inspect: {instance.server_name} v{instance.version}" {onClose}>

  {#if loading}
    <div class="flex items-center justify-center py-16 text-gray-500">
      <span class="animate-pulse">Connecting to MCP server…</span>
    </div>

  {:else if loadError}
    <div class="space-y-4">
      <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
        {loadError}
      </div>
      <button
        type="button"
        onclick={loadCapabilities}
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
      >
        Retry
      </button>
    </div>

  {:else if capabilities}
    <!-- Tab bar -->
    <div class="flex gap-1 mb-4 border-b">
      {#each (['tools', 'resources', 'prompts'] as const) as tab}
        {@const count = capabilities[tab].length}
        <button
          type="button"
          onclick={() => activeTab = tab}
          class="px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors {activeTab === tab
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'}"
        >
          {tab}
          <span class="ml-1 px-1.5 py-0.5 text-xs rounded-full {activeTab === tab ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}">
            {count}
          </span>
        </button>
      {/each}
      <button
        type="button"
        onclick={() => activeTab = 'history'}
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors {activeTab === 'history'
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'}"
      >
        History
      </button>
    </div>

    <!-- ── Tools tab ── -->
    {#if activeTab === 'tools'}
      {#if capabilities.tools.length === 0}
        <p class="text-gray-500 text-sm text-center py-8">No tools available</p>
      {:else}
        <div class="space-y-2">
          {#each capabilities.tools as tool (tool.name)}
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <!-- Tool header -->
              <button
                type="button"
                onclick={() => selectTool(tool.name)}
                class="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-mono text-sm font-semibold text-gray-900">{tool.name}</span>
                  {#if tool.description}
                    <p class="text-xs text-gray-500 mt-0.5 truncate">{tool.description}</p>
                  {/if}
                </div>
                <span class="text-gray-400 ml-2 mt-0.5 text-xs">{activeTool === tool.name ? '▲' : '▼'}</span>
              </button>

              {#if activeTool === tool.name}
                <div class="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                  {#if tool.description}
                    <p class="text-sm text-gray-600">{tool.description}</p>
                  {/if}

                  <!-- Input schema form -->
                  {#if Object.keys(tool.inputSchema.properties ?? {}).length > 0}
                    <div class="space-y-3">
                      {#each Object.entries(tool.inputSchema.properties ?? {}) as [key, schema]}
                        {@const required = tool.inputSchema.required?.includes(key) ?? false}
                        <div>
                          <label class="block text-xs font-medium text-gray-700 mb-1">
                            {key}
                            {#if required}<span class="text-red-500 ml-0.5">*</span>{/if}
                            {#if schema.type}
                              <span class="ml-1 text-gray-400 font-normal">({schema.type})</span>
                            {/if}
                          </label>
                          {#if schema.description}
                            <p class="text-xs text-gray-400 mb-1">{schema.description}</p>
                          {/if}

                          {#if isEnum(schema)}
                            <select
                              value={toolArgs[key] ?? ''}
                              onchange={(e) => setToolArg(key, e.currentTarget.value)}
                              class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— select —</option>
                              {#each schema.enum! as opt}
                                <option value={String(opt)}>{String(opt)}</option>
                              {/each}
                            </select>

                          {:else if isCheckbox(schema)}
                            <div class="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={toolArgs[key] === 'true'}
                                onchange={(e) => setToolArg(key, String(e.currentTarget.checked))}
                                class="w-4 h-4 rounded border-gray-300"
                              />
                              <span class="text-xs text-gray-500">{toolArgs[key] === 'true' ? 'true' : 'false'}</span>
                            </div>

                          {:else if isTextarea(schema)}
                            <textarea
                              value={toolArgs[key] ?? ''}
                              oninput={(e) => setToolArg(key, e.currentTarget.value)}
                              placeholder={`{"key": "value"}`}
                              rows="3"
                              class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            ></textarea>

                          {:else}
                            <input
                              type={inputType(schema)}
                              value={toolArgs[key] ?? ''}
                              oninput={(e) => setToolArg(key, e.currentTarget.value)}
                              placeholder={schema.default !== undefined ? String(schema.default) : ''}
                              class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-xs text-gray-400 italic">No input parameters</p>
                  {/if}

                  <!-- Run button -->
                  {#if toolError}
                    <p class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{toolError}</p>
                  {/if}
                  <button
                    type="button"
                    onclick={() => runTool(tool)}
                    disabled={toolRunning}
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {toolRunning ? 'Running…' : 'Run'}
                  </button>

                  <!-- Result -->
                  {#if toolResult !== null}
                    <JsonOutput value={toolResult} />
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- ── Resources tab ── -->
    {#if activeTab === 'resources'}
      {#if capabilities.resources.length === 0}
        <p class="text-gray-500 text-sm text-center py-8">No resources available</p>
      {:else}
        <div class="space-y-2">
          {#each capabilities.resources as resource (resource.uri)}
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onclick={() => readResource(resource.uri)}
                class="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-medium text-sm text-gray-900">{resource.name}</span>
                  <span class="font-mono text-xs text-gray-400 ml-2">{resource.uri}</span>
                  {#if resource.description}
                    <p class="text-xs text-gray-500 mt-0.5">{resource.description}</p>
                  {/if}
                  {#if resource.mimeType}
                    <span class="text-xs text-gray-400">{resource.mimeType}</span>
                  {/if}
                </div>
                <span class="text-gray-400 ml-2 mt-0.5 text-xs shrink-0">
                  {activeResource === resource.uri ? '▲' : 'Read'}
                </span>
              </button>

              {#if activeResource === resource.uri}
                <div class="border-t border-gray-100 px-4 py-4 bg-gray-50">
                  {#if resourceLoading}
                    <p class="text-sm text-gray-500 animate-pulse">Loading…</p>
                  {:else if resourceError}
                    <p class="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{resourceError}</p>
                  {:else if resourceResult !== null}
                    <JsonOutput value={resourceResult} />
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- ── Prompts tab ── -->
    {#if activeTab === 'prompts'}
      {#if capabilities.prompts.length === 0}
        <p class="text-gray-500 text-sm text-center py-8">No prompts available</p>
      {:else}
        <div class="space-y-2">
          {#each capabilities.prompts as prompt (prompt.name)}
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onclick={() => selectPrompt(prompt.name)}
                class="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-mono text-sm font-semibold text-gray-900">{prompt.name}</span>
                  {#if prompt.description}
                    <p class="text-xs text-gray-500 mt-0.5 truncate">{prompt.description}</p>
                  {/if}
                </div>
                <span class="text-gray-400 ml-2 mt-0.5 text-xs">{activePrompt === prompt.name ? '▲' : '▼'}</span>
              </button>

              {#if activePrompt === prompt.name}
                <div class="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                  {#if prompt.description}
                    <p class="text-sm text-gray-600">{prompt.description}</p>
                  {/if}

                  {#if (prompt.arguments ?? []).length > 0}
                    <div class="space-y-3">
                      {#each prompt.arguments ?? [] as arg}
                        <div>
                          <label class="block text-xs font-medium text-gray-700 mb-1">
                            {arg.name}
                            {#if arg.required}<span class="text-red-500 ml-0.5">*</span>{/if}
                          </label>
                          {#if arg.description}
                            <p class="text-xs text-gray-400 mb-1">{arg.description}</p>
                          {/if}
                          <input
                            type="text"
                            value={promptArgs[arg.name] ?? ''}
                            oninput={(e) => setPromptArg(arg.name, e.currentTarget.value)}
                            class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-xs text-gray-400 italic">No arguments</p>
                  {/if}

                  {#if promptError}
                    <p class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{promptError}</p>
                  {/if}
                  <button
                    type="button"
                    onclick={() => runPrompt(prompt)}
                    disabled={promptRunning}
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {promptRunning ? 'Getting…' : 'Get Prompt'}
                  </button>

                  {#if promptResult !== null}
                    <JsonOutput value={promptResult} />
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
    <!-- ── History tab ── -->
    {#if activeTab === 'history'}
      <div class="space-y-2">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-gray-400">Últimas 100 llamadas a tools. Click en "Reusar" para cargar los argumentos.</p>
          <button
            type="button"
            onclick={loadHistory}
            class="text-xs text-blue-600 hover:underline"
          >Actualizar</button>
        </div>

        {#if historyLoading}
          <div class="text-center py-8 text-gray-400 animate-pulse text-sm">Cargando historial…</div>
        {:else if historyError}
          <p class="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{historyError}</p>
        {:else if historyEntries.length === 0}
          <p class="text-gray-500 text-sm text-center py-8">Sin ejecuciones registradas todavía.</p>
        {:else}
          {#each historyEntries as entry (entry.id)}
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <!-- Entry header -->
              <button
                type="button"
                onclick={() => expandedHistoryId = expandedHistoryId === entry.id ? null : entry.id}
                class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="shrink-0 px-1.5 py-0.5 text-xs rounded font-medium {entry.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    {entry.status === 'success' ? 'OK' : 'ERR'}
                  </span>
                  <span class="font-mono text-sm text-gray-900 truncate">{entry.tool_name}</span>
                  {#if entry.duration_ms !== null}
                    <span class="text-xs text-gray-400 shrink-0">{entry.duration_ms}ms</span>
                  {/if}
                </div>
                <span class="text-xs text-gray-400 shrink-0 ml-2">{new Date(entry.created_at).toLocaleString()}</span>
              </button>

              {#if expandedHistoryId === entry.id}
                <div class="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                  <div>
                    <p class="text-xs font-medium text-gray-600 mb-1">Argumentos</p>
                    <pre class="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">{JSON.stringify(JSON.parse(entry.args_json), null, 2)}</pre>
                  </div>

                  {#if entry.status === 'error' && entry.error}
                    <div>
                      <p class="text-xs font-medium text-red-600 mb-1">Error</p>
                      <p class="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{entry.error}</p>
                    </div>
                  {:else if entry.result_json}
                    <div>
                      <p class="text-xs font-medium text-gray-600 mb-1">Resultado</p>
                      <pre class="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(JSON.parse(entry.result_json), null, 2)}</pre>
                    </div>
                  {/if}

                  <button
                    type="button"
                    onclick={() => reuseHistoryEntry(entry)}
                    class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Reusar argumentos
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}
</Modal>
