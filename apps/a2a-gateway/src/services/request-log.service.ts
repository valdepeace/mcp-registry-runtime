import { randomUUID } from 'crypto';
import { databaseService } from './database.service.js';

export interface A2ARequestLog {
  id: string;
  key_id: string;
  key_label: string;
  skill: string;
  status: 'completed' | 'failed' | 'input-required' | 'working';
  input_json: string | null;
  result_json: string | null;
  error: string | null;
  instance_id: string | null;
  created_at: string;
  updated_at: string;
}

export class RequestLogService {
  private db = databaseService.db;

  start(keyId: string, keyLabel: string, skill: string, input: unknown): string {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO a2a_requests (id, key_id, key_label, skill, status, input_json)
      VALUES (?, ?, ?, ?, 'working', ?)
    `).run(id, keyId, keyLabel, skill, JSON.stringify(input ?? null));
    return id;
  }

  finish(id: string, status: A2ARequestLog['status'], result?: unknown, error?: string, instanceId?: string): void {
    this.db.prepare(`
      UPDATE a2a_requests
      SET status = ?, result_json = ?, error = ?, instance_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, result !== undefined ? JSON.stringify(result) : null, error ?? null, instanceId ?? null, id);
  }

  list(limit = 100): A2ARequestLog[] {
    return this.db.prepare(`
      SELECT * FROM a2a_requests ORDER BY created_at DESC LIMIT ?
    `).all(limit) as A2ARequestLog[];
  }
}

export const requestLogService = new RequestLogService();
