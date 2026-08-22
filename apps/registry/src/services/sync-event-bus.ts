import { EventEmitter } from 'events';

export interface SyncEvent {
  type: 'provider:start' | 'provider:complete' | 'provider:error' | 'provider:progress';
  providerName: string;
  entityType: 'servers' | 'skills';
  timestamp: string;
  count?: number;
  error?: string;
  /** Progress fields */
  message?: string;
  current?: number;
  total?: number;
}

class SyncEventBus extends EventEmitter {
  emitSync(event: SyncEvent): void {
    this.emit('sync', event);
  }

  onSync(listener: (event: SyncEvent) => void): this {
    return this.on('sync', listener);
  }
}

export const syncEventBus = new SyncEventBus();
