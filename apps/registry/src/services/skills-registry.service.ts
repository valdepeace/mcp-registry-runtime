import type { SkillListResponse, SkillResponse } from '@mcp-nova/types';
import { SkillListResponseSchema } from '@mcp-nova/types';
import { config } from '../config/index.js';

export class SkillsRegistryService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.officialSkillsRegistryUrl ?? '';
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async fetchAllSkills(): Promise<SkillResponse[]> {
    if (!this.isConfigured) {
      console.log('[SkillsRegistry] No registry URL configured, skipping sync');
      return [];
    }

    const allSkills: SkillResponse[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      page++;
      console.log(`[SkillsRegistry] Fetching page ${page}${cursor ? ` (cursor: ${cursor})` : ''}`);
      const response = await this.listSkills({ cursor, limit: 100 });
      console.log(`[SkillsRegistry] Page ${page}: ${response.skills.length} skills`);
      allSkills.push(...response.skills);
      cursor = response.metadata?.nextCursor;
    } while (cursor);

    console.log(`[SkillsRegistry] Total fetched: ${allSkills.length} skills`);
    return allSkills;
  }

  async listSkills(params: { cursor?: string; limit?: number } = {}): Promise<ReturnType<typeof SkillListResponseSchema.parse>> {
    const url = new URL('/v0.1/skills', this.baseUrl);

    if (params.cursor) url.searchParams.set('cursor', params.cursor);
    if (params.limit) url.searchParams.set('limit', params.limit.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[SkillsRegistry] HTTP ${response.status}: ${response.statusText}`);
      console.error(`[SkillsRegistry] Response body: ${body}`);
      throw new Error(`Failed to fetch skills: ${response.status} ${response.statusText}`);
    }

    const data: unknown = await response.json();
    return SkillListResponseSchema.parse(data);
  }
}

export const skillsRegistryService = new SkillsRegistryService();
