<script lang="ts">
  import { api } from '$lib/api/client';
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import type { SkillResponse, SkillDetail, SkillCategory } from '$lib/types';

  let skills = $state<SkillResponse[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);
  let formError = $state<string | null>(null);

  let showForm = $state(false);
  let editTarget = $state<SkillResponse | null>(null);

  let formName = $state('');
  let formVersion = $state('1.0.0');
  let formDescription = $state('');
  let formContent = $state('');
  let formFormat = $state<'markdown' | 'json' | 'yaml'>('markdown');
  let formCategory = $state('');
  let formTags = $state('');

  async function loadSkills() {
    try {
      loading = true;
      error = null;
      const response = await api.listSkills({ limit: 100 });
      skills = response.skills;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load skills';
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
    formContent = '';
    formFormat = 'markdown';
    formCategory = '';
    formTags = '';
    formError = null;
  }

  function editSkill(item: SkillResponse) {
    editTarget = item;
    formName = item.skill.name;
    formVersion = item.skill.version;
    formDescription = item.skill.description;
    formContent = item.skill.content;
    formFormat = item.skill.format;
    formCategory = item.skill.category || '';
    formTags = item.skill.tags?.join(', ') || '';
    showForm = true;
    formError = null;
  }

  async function saveSkill() {
    if (!formName || !formVersion || !formDescription || !formContent) {
      formError = 'All required fields must be filled';
      return;
    }
    try {
      formError = null;
      const skillData: SkillDetail = {
        name: formName,
        version: formVersion,
        description: formDescription,
        content: formContent,
        format: formFormat,
        category: (formCategory || undefined) as SkillCategory | undefined,
        tags: formTags ? formTags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      };
      if (editTarget) {
        await api.updateSkill(formName, formVersion, skillData);
        message = 'Skill updated';
      } else {
        await api.createSkill(skillData);
        message = 'Skill created';
      }
      resetForm();
      loadSkills();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Save failed';
    }
  }

  async function deleteSkill(item: SkillResponse) {
    if (!confirm(`Delete ${item.skill.name} v${item.skill.version}?`)) return;
    try {
      await api.deleteSkillVersion(item.skill.name, item.skill.version);
      message = 'Skill deleted';
      loadSkills();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    }
  }

  $effect(() => {
    if (!$isAuthenticated) { goto('/login'); return; }
    loadSkills();
  });
</script>

<div class="max-w-5xl mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Manage Skills</h1>
      <p class="text-gray-600 text-sm">Create and manage private skills</p>
    </div>
    <button onclick={() => { resetForm(); showForm = true; }}
      class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
      + New Skill
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
      <h2 class="font-semibold mb-3">{editTarget ? 'Edit' : 'Create'} Skill</h2>
      {#if formError}
        <div class="bg-red-50 text-red-700 p-2 rounded mb-3 text-sm">{formError}</div>
      {/if}
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Name</label>
          <input bind:value={formName} disabled={!!editTarget}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="my-skill" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Version</label>
          <input bind:value={formVersion}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="1.0.0" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Format</label>
          <select bind:value={formFormat} class="w-full border rounded px-3 py-1.5 text-sm">
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <input bind:value={formCategory}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="backend" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
          <input bind:value={formTags}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="express, typescript" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <input bind:value={formDescription}
            class="w-full border rounded px-3 py-1.5 text-sm" placeholder="Short description" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-gray-700 mb-1">Content</label>
          <textarea bind:value={formContent} rows={8}
            class="w-full border rounded px-3 py-1.5 text-sm font-mono" placeholder="Skill content..."></textarea>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick={saveSkill} class="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
          {editTarget ? 'Update' : 'Create'}
        </button>
        <button onclick={resetForm} class="border px-4 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-gray-500">Loading...</div>
  {:else if skills.length === 0}
    <div class="text-center py-12 text-gray-500">No skills yet. Create one above.</div>
  {:else}
    <div class="border rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left p-3 font-medium">Name</th>
            <th class="text-left p-3 font-medium">Version</th>
            <th class="text-left p-3 font-medium">Source</th>
            <th class="text-left p-3 font-medium">Format</th>
            <th class="text-right p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each skills as item}
            <tr class="border-t hover:bg-gray-50">
              <td class="p-3">{item.skill.name}</td>
              <td class="p-3">v{item.skill.version}</td>
              <td class="p-3">
                <span class={`text-xs px-2 py-0.5 rounded ${item.source === 'registry' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {item.source}
                </span>
              </td>
              <td class="p-3 text-gray-500">{item.skill.format}</td>
              <td class="p-3 text-right">
                {#if item.source !== 'registry'}
                  <button onclick={() => editSkill(item)} class="text-blue-600 hover:underline mr-3 text-xs">Edit</button>
                  <button onclick={() => deleteSkill(item)} class="text-red-600 hover:underline text-xs">Delete</button>
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
