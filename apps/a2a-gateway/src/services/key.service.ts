import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto';
import { databaseService } from './database.service.js';

export interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;
  requests_per_min: number;
  created_at: string;
  revoked_at: string | null;
}

interface ApiKeyRow extends ApiKey {
  key_hash: string;
}

const KEY_PREFIX = 'a2a_';

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export class KeyService {
  private db = databaseService.db;

  /** Returns the plaintext key exactly once — only the hash is stored. */
  issue(label: string, requestsPerMin = 30): { key: ApiKey; plaintext: string } {
    const id = randomUUID();
    const plaintext = KEY_PREFIX + randomBytes(24).toString('base64url');
    const keyHash = hash(plaintext);
    const keyPrefix = plaintext.slice(0, KEY_PREFIX.length + 6);

    this.db.prepare(`
      INSERT INTO a2a_api_keys (id, label, key_hash, key_prefix, requests_per_min)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, label, keyHash, keyPrefix, requestsPerMin);

    return { key: this.get(id)!, plaintext };
  }

  list(): ApiKey[] {
    return this.db.prepare(`
      SELECT id, label, key_prefix, requests_per_min, created_at, revoked_at
      FROM a2a_api_keys ORDER BY created_at DESC
    `).all() as ApiKey[];
  }

  get(id: string): ApiKey | null {
    return (this.db.prepare(`
      SELECT id, label, key_prefix, requests_per_min, created_at, revoked_at
      FROM a2a_api_keys WHERE id = ?
    `).get(id) as ApiKey | undefined) ?? null;
  }

  revoke(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE a2a_api_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  /** Constant-time-compares the hash, not the plaintext key, against every stored hash. */
  verify(plaintext: string): (ApiKey & { key_hash: string }) | null {
    if (!plaintext.startsWith(KEY_PREFIX)) return null;
    const candidateHash = Buffer.from(hash(plaintext));

    const rows = this.db.prepare(`
      SELECT id, label, key_prefix, requests_per_min, created_at, revoked_at, key_hash
      FROM a2a_api_keys WHERE revoked_at IS NULL
    `).all() as ApiKeyRow[];

    for (const row of rows) {
      const storedHash = Buffer.from(row.key_hash);
      if (storedHash.length === candidateHash.length && timingSafeEqual(storedHash, candidateHash)) {
        return row;
      }
    }
    return null;
  }
}

export const keyService = new KeyService();
