<script lang="ts">
  import { api } from '$lib/api/client';
  import { isAuthenticated, auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import type { ServerDetail, Package } from '$lib/types';

  // Check auth
  $effect(() => {
    if (!$isAuthenticated && !$auth.isLoading) {
      goto('/login');
    }
  });

  let error = $state<string | null>(null);
  let saving = $state(false);

  // Form state
  let name = $state('');
  let description = $state('');
  let version = $state('1.0.0');
  let title = $state('');
  let websiteUrl = $state('');
  let repoUrl = $state('');
  let repoSource = $state('github');

  // Package state
  let packageRegistryType = $state('npm');
  let packageIdentifier = $state('');
  let packageVersion = $state('');
  let packageTransportType = $state<'stdio' | 'streamable-http' | 'sse'>('stdio');
  let packageTransportUrl = $state('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    saving = true;

    try {
      const packages: Package[] = [];
      
      if (packageIdentifier) {
        const transport: Package['transport'] = packageTransportType === 'stdio'
          ? { type: 'stdio' }
          : { type: packageTransportType, url: packageTransportUrl };

        packages.push({
          registryType: packageRegistryType,
          identifier: packageIdentifier,
          version: packageVersion || undefined,
          transport
        });
      }

      const server: ServerDetail = {
        name,
        description,
        version,
        title: title || undefined,
        websiteUrl: websiteUrl || undefined,
        repository: repoUrl ? { url: repoUrl, source: repoSource } : undefined,
        packages: packages.length > 0 ? packages : undefined
      };

      await api.createServer(server);
      goto('/admin');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create server';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Add Server - MCP Registry</title>
</svelte:head>

<div class="max-w-2xl mx-auto px-4 py-8">
  <div class="mb-6">
    <a href="/admin" class="text-blue-600 hover:underline text-sm">&larr; Back to Admin</a>
  </div>

  <h1 class="text-2xl font-bold text-gray-900 mb-6">Add Private Server</h1>

  {#if error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-800">{error}</p>
    </div>
  {/if}

  <form onsubmit={handleSubmit} class="space-y-6">
    <!-- Basic Info -->
    <div class="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 class="font-semibold text-gray-900">Basic Information</h2>
      
      <div>
        <label for="name" class="block text-sm font-medium text-gray-700 mb-1">
          Name <span class="text-red-500">*</span>
        </label>
        <input
          id="name"
          type="text"
          bind:value={name}
          required
          placeholder="com.company/server-name"
          pattern="^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p class="text-xs text-gray-500 mt-1">Format: vendor/server-name (e.g., com.company/my-mcp)</p>
      </div>

      <div>
        <label for="description" class="block text-sm font-medium text-gray-700 mb-1">
          Description <span class="text-red-500">*</span>
        </label>
        <input
          id="description"
          type="text"
          bind:value={description}
          required
          maxlength="100"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="version" class="block text-sm font-medium text-gray-700 mb-1">
            Version <span class="text-red-500">*</span>
          </label>
          <input
            id="version"
            type="text"
            bind:value={version}
            required
            placeholder="1.0.0"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label for="title" class="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            id="title"
            type="text"
            bind:value={title}
            placeholder="Display Title"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label for="websiteUrl" class="block text-sm font-medium text-gray-700 mb-1">
          Website URL
        </label>
        <input
          id="websiteUrl"
          type="url"
          bind:value={websiteUrl}
          placeholder="https://example.com"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>

    <!-- Repository -->
    <div class="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 class="font-semibold text-gray-900">Repository (Optional)</h2>
      
      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2">
          <label for="repoUrl" class="block text-sm font-medium text-gray-700 mb-1">
            Repository URL
          </label>
          <input
            id="repoUrl"
            type="url"
            bind:value={repoUrl}
            placeholder="https://github.com/org/repo"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label for="repoSource" class="block text-sm font-medium text-gray-700 mb-1">
            Source
          </label>
          <select
            id="repoSource"
            bind:value={repoSource}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="bitbucket">Bitbucket</option>
            <option value="azure-devops">Azure DevOps</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Package -->
    <div class="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 class="font-semibold text-gray-900">Package (Optional)</h2>
      
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="packageRegistryType" class="block text-sm font-medium text-gray-700 mb-1">
            Registry Type
          </label>
          <select
            id="packageRegistryType"
            bind:value={packageRegistryType}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="npm">npm</option>
            <option value="pypi">PyPI</option>
            <option value="oci">OCI</option>
            <option value="nuget">NuGet</option>
          </select>
        </div>
        <div>
          <label for="packageIdentifier" class="block text-sm font-medium text-gray-700 mb-1">
            Package Identifier
          </label>
          <input
            id="packageIdentifier"
            type="text"
            bind:value={packageIdentifier}
            placeholder="@company/package"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="packageVersion" class="block text-sm font-medium text-gray-700 mb-1">
            Package Version
          </label>
          <input
            id="packageVersion"
            type="text"
            bind:value={packageVersion}
            placeholder="1.0.0"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label for="packageTransportType" class="block text-sm font-medium text-gray-700 mb-1">
            Transport Type
          </label>
          <select
            id="packageTransportType"
            bind:value={packageTransportType}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="stdio">stdio</option>
            <option value="streamable-http">streamable-http</option>
            <option value="sse">sse</option>
          </select>
        </div>
      </div>

      {#if packageTransportType !== 'stdio'}
        <div>
          <label for="packageTransportUrl" class="block text-sm font-medium text-gray-700 mb-1">
            Transport URL
          </label>
          <input
            id="packageTransportUrl"
            type="url"
            bind:value={packageTransportUrl}
            placeholder="https://api.example.com/mcp"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      {/if}
    </div>

    <!-- Submit -->
    <div class="flex gap-4">
      <button
        type="submit"
        disabled={saving}
        class="flex-1 py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Creating...' : 'Create Server'}
      </button>
      <a
        href="/admin"
        class="py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-center"
      >
        Cancel
      </a>
    </div>
  </form>
</div>
