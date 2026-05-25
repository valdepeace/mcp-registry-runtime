<script lang="ts">
  import { api } from '$lib/api/client';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import type { AgentInstance } from '$lib/types';

  let instances = $state<AgentInstance[]>([]);
  let selectedId = $state('');
  let loading = $state(true);
  let error = $state<string | null>(null);

  let input = $state('');
  let streaming = $state(false);
  let messages = $state<{ role: 'user' | 'assistant'; text: string }[]>([]);

  async function fetchInstances() {
    try {
      error = null;
      const response = await api.listAgentInstances();
      instances = response.instances;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load instances';
    } finally {
      loading = false;
    }
  }

  async function handleSend(e: SubmitEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedId || streaming) return;
    const selected = instances.find((instance) => instance.id === selectedId);
    if (!selected || selected.status !== 'online') {
      error = 'Start the agent instance before chatting.';
      return;
    }

    streaming = true;
    const userMsg = input.trim();
    messages = [...messages, { role: 'user', text: userMsg }];
    messages = [...messages, { role: 'assistant', text: '' }];
    input = '';

    const token = api.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`/admin/agent-runtime/instances/${selectedId}/invoke/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: userMsg }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'text-delta') {
                const lastIdx = messages.length - 1;
                if (lastIdx >= 0) {
                  messages[lastIdx] = {
                    ...messages[lastIdx],
                    text: messages[lastIdx].text + parsed.textDelta,
                  };
                  messages = [...messages];
                }
              } else if (parsed.type === 'error') {
                const lastIdx = messages.length - 1;
                if (lastIdx >= 0) {
                  messages[lastIdx] = {
                    ...messages[lastIdx],
                    text: messages[lastIdx].text + `\n\n[Error: ${parsed.error}]`,
                  };
                  messages = [...messages];
                }
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Stream error';
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0) {
        messages[lastIdx] = {
          ...messages[lastIdx],
          text: messages[lastIdx].text + `\n\n[${err}]`,
        };
        messages = [...messages];
      }
    } finally {
      streaming = false;
    }
  }

  $effect(() => {
    if ($isAuthenticated) {
      fetchInstances();
    }
  });
</script>

{#if !$isAuthenticated}
  <div class="text-center py-12">
    <p class="text-gray-600">Please <a href="/login" class="text-blue-600 hover:underline">login</a> to use the chat.</p>
  </div>
{:else}
  <div class="max-w-3xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
    <div class="flex items-center gap-3 mb-4">
      <h1 class="text-lg font-semibold text-gray-900">Agent Chat</h1>
      {#if loading}
        <span class="text-sm text-gray-500">Loading instances...</span>
      {/if}
    </div>

    {#if error}
      <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-4">{error}</div>
    {/if}

    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-700 mb-1">Agent Instance</label>
      <select
        bind:value={selectedId}
        class="w-full border rounded-lg px-3 py-2 text-sm bg-white"
      >
        <option value="">Select an instance...</option>
        {#each instances as inst}
          <option value={inst.id} disabled={inst.status !== 'online'}>
            {inst.agent_name}@{inst.agent_version}
            {#if inst.status !== 'online'}[{inst.status}]{/if}
          </option>
        {/each}
      </select>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto border rounded-lg bg-gray-50 p-4 mb-3">
      {#if messages.length === 0}
        <div class="text-center py-8 text-gray-400 text-sm">
          {selectedId ? 'Send a message to start the conversation.' : 'Select an agent instance above to begin.'}
        </div>
      {:else}
        <div class="space-y-4">
          {#each messages as msg, i (i)}
            <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[80%] rounded-lg px-4 py-2 text-sm {msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-900'}">
                <div class="whitespace-pre-wrap">{msg.text}</div>
              </div>
            </div>
          {/each}
          {#if streaming}
            <div class="text-gray-400 text-xs animate-pulse">Agent is responding...</div>
          {/if}
        </div>
      {/if}
    </div>

    <form onsubmit={handleSend} class="flex gap-2">
      <input
        type="text"
        bind:value={input}
        placeholder={selectedId ? 'Type your message...' : 'Select an instance first...'}
        disabled={!selectedId || streaming}
        class="flex-1 border rounded-lg px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        type="submit"
        disabled={!selectedId || !input.trim() || streaming}
        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {streaming ? '...' : 'Send'}
      </button>
    </form>
  </div>
{/if}
