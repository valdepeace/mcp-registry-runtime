import type { RuntimeInstance, RuntimeStatus } from '$lib/types';
import type { RuntimeMetrics } from '$lib/types';

export interface RuntimeStatusEvent {
  id: string;
  status: RuntimeStatus;
  last_error?: string;
}

export interface RuntimeHealthEvent {
  id: string;
  health_status: string;
  last_health_check: string;
}

export interface RuntimeInstanceEvent {
  instance: RuntimeInstance;
}

export interface RuntimeDeletedEvent {
  id: string;
}

export interface RuntimeMetricsEvent {
  metrics: RuntimeMetrics[];
}

type EventCallbacks = {
  'instance:status': (data: RuntimeStatusEvent) => void;
  'instance:health': (data: RuntimeHealthEvent) => void;
  'instance:created': (data: RuntimeInstanceEvent) => void;
  'instance:deleted': (data: RuntimeDeletedEvent) => void;
  'instance:updated': (data: RuntimeInstanceEvent) => void;
  'runtime:metrics': (data: RuntimeMetricsEvent) => void;
  'connected': (data: { timestamp: string }) => void;
};

export function createRuntimeEventSource() {
  let eventSource: EventSource | null = null;
  const listeners = new Map<string, Set<Function>>();

  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    eventSource = new EventSource(`/admin/runtime/events?token=${encodeURIComponent(token)}`);

    eventSource.onerror = () => {
      console.warn('[SSE] Connection error, will auto-reconnect');
    };

    const eventNames = [
      'connected',
      'instance:status',
      'instance:health',
      'instance:created',
      'instance:deleted',
      'instance:updated',
      'runtime:metrics',
    ];

    for (const name of eventNames) {
      eventSource.addEventListener(name, (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        const callbacks = listeners.get(name);
        if (callbacks) {
          for (const cb of callbacks) {
            cb(data);
          }
        }
      });
    }
  }

  function on<K extends keyof EventCallbacks>(event: K, callback: EventCallbacks[K]) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(callback);
  }

  function off<K extends keyof EventCallbacks>(event: K, callback: EventCallbacks[K]) {
    listeners.get(event)?.delete(callback);
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    listeners.clear();
  }

  return { connect, on, off, disconnect };
}
