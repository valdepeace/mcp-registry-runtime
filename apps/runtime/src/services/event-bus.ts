import { EventEmitter } from 'events';
import type { RuntimeInstance, RuntimeStatus } from '@mcp-nova/types';

export interface RuntimeMetricEntry {
  id: string;
  server_name: string;
  version: string;
  pm2_name: string;
  status: RuntimeStatus;
  pid?: number;
  uptime_ms?: number;
  restart_count?: number;
  memory?: number;
  cpu?: number;
}

export interface RuntimeEvents {
  'instance:status': { id: string; status: RuntimeStatus; last_error?: string };
  'instance:health': { id: string; health_status: string; last_health_check: string };
  'instance:created': { instance: RuntimeInstance };
  'instance:deleted': { id: string };
  'instance:updated': { instance: RuntimeInstance };
  'runtime:metrics': { metrics: RuntimeMetricEntry[] };
}

export type RuntimeEventName = keyof RuntimeEvents;

class RuntimeEventBus extends EventEmitter {
  emitRuntime<K extends RuntimeEventName>(event: K, data: RuntimeEvents[K]): void {
    this.emit(event, data);
  }

  onRuntime<K extends RuntimeEventName>(event: K, listener: (data: RuntimeEvents[K]) => void): this {
    return this.on(event, listener);
  }
}

export const runtimeEventBus = new RuntimeEventBus();
