<script lang="ts">
  /*
   * ponytail: seven inline paths instead of an icon package. They are
   * Material Design icons (Apache-2.0), 24x24, drawn with currentColor so the
   * dark-mode token swap applies without any extra work.
   * Ceiling: if the app ever needs dozens of icons, pull in a set.
   */
  type IconName = 'play' | 'stop' | 'restart' | 'logs' | 'edit' | 'inspect' | 'delete';

  interface Props {
    name: IconName;
    class?: string;
  }

  let { name, class: klass = 'w-4 h-4' }: Props = $props();

  const paths: Record<IconName, string> = {
    play: 'M8 5v14l11-7z',
    stop: 'M6 6h12v12H6z',
    restart:
      'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    logs: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    inspect:
      'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    delete: 'M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  };
</script>

<svg class={klass} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path d={paths[name]} />
</svg>
