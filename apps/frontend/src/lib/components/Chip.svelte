<script lang="ts">
  import type { Snippet } from 'svelte';

  type ChipVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

  interface Props {
    variant?: ChipVariant;
    size?: 'sm' | 'md';
    icon?: string;
    clickable?: boolean;
    onclick?: () => void;
    children: Snippet;
  }

  let {
    variant = 'default',
    size = 'sm',
    icon,
    clickable = false,
    onclick,
    children,
  }: Props = $props();

  const variantClasses: Record<ChipVariant, string> = {
    default: 'bg-gray-100 text-gray-700',
    primary: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-cyan-100 text-cyan-700',
    purple: 'bg-purple-100 text-purple-700',
  };

  const sizeClasses: Record<'sm' | 'md', string> = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };
</script>

{#if clickable}
  <button
    type="button"
    class="inline-flex items-center gap-1 rounded font-medium transition-colors hover:opacity-80 {variantClasses[variant]} {sizeClasses[size]}"
    {onclick}
  >
    {#if icon}
      <span>{icon}</span>
    {/if}
    {@render children()}
  </button>
{:else}
  <span
    class="inline-flex items-center gap-1 rounded font-medium {variantClasses[variant]} {sizeClasses[size]}"
  >
    {#if icon}
      <span>{icon}</span>
    {/if}
    {@render children()}
  </span>
{/if}
