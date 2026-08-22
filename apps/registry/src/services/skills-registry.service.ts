import type { SkillListResponse, SkillResponse } from '@mcp/types';
import { SkillListResponseSchema } from '@mcp/types';
import { config } from '../config/index.js';
import {
  SkillsShProvider,
  SmitherySkillsProvider,
  VercelLabsSkillsProvider,
  type SkillsProvider,
} from './providers/index.js';

export class SkillsRegistryService {
  private providers: SkillsProvider[];

  constructor() {
    this.providers = [];
    this.initProviders();
  }

  private initProviders(): void {
    // Always active — no key required
    this.providers.push(new VercelLabsSkillsProvider(config.githubToken));

    // Opt-in — only if explicitly configured
    if (config.skillsShApiKey || config.skillsShApiUrl) {
      this.providers.push(new SkillsShProvider());
    }
    if (config.smitheryApiUrl) {
      this.providers.push(new SmitherySkillsProvider());
    }

    const active = this.providers.filter(p => p.isConfigured()).map(p => p.name);
    console.log(`[SkillsRegistry] Providers — active: [${active.join(', ') || 'none'}]`);
  }

  get isConfigured(): boolean {
    return this.providers.some(p => p.isConfigured()) || (config.officialSkillsRegistryUrl?.length ?? 0) > 0;
  }

  getProvider(name: string): SkillsProvider | undefined {
    return this.providers.find(p => p.name === name);
  }

  get providerNames(): string[] {
    const names = this.providers.filter(p => p.isConfigured()).map(p => p.name);
    if ((config.officialSkillsRegistryUrl?.length ?? 0) > 0) {
      names.push('official-skills');
    }
    return names;
  }

  async fetchAllSkills(onProgress?: (msg: string, current?: number, total?: number) => void): Promise<Array<{ provider: string; skills: SkillResponse[]; error?: string }>> {
    if (!this.isConfigured) {
      console.log('[SkillsRegistry] No providers configured, skipping sync');
      return [];
    }

    const results: Array<{ provider: string; skills: SkillResponse[]; error?: string }> = [];
    const configuredProviders = this.providers.filter(p => p.isConfigured());

    for (const provider of configuredProviders) {
      try {
        console.log(`[SkillsRegistry] Fetching from provider: ${provider.name}`);
        const skills = await provider.fetchAllSkills(onProgress);
        results.push({ provider: provider.name, skills });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[SkillsRegistry] Provider ${provider.name} failed:`, msg);
        results.push({ provider: provider.name, skills: [], error: msg });
      }
    }

    const legacyUrl = config.officialSkillsRegistryUrl;
    if (legacyUrl) {
      try {
        console.log('[SkillsRegistry] Fetching from legacy skills URL...');
        const legacySkills = await this.fetchFromLegacy(legacyUrl);
        results.push({ provider: 'official-skills', skills: legacySkills });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[SkillsRegistry] Legacy skills fetch failed:', msg);
        results.push({ provider: 'official-skills', skills: [], error: msg });
      }
    }

    const total = results.reduce((sum, r) => sum + r.skills.length, 0);
    console.log(`[SkillsRegistry] Total fetched: ${total} skills across ${results.length} providers`);
    return results;
  }

  private async fetchFromLegacy(baseUrl: string): Promise<SkillResponse[]> {
    const allSkills: SkillResponse[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      page++;
      const url = new URL('/v0.1/skills', baseUrl);
      if (cursor) url.searchParams.set('cursor', cursor);
      url.searchParams.set('limit', '100');

      console.log(`[SkillsRegistry] Legacy page ${page}...`);
      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data: unknown = await response.json();
      const parsed = SkillListResponseSchema.parse(data);
      allSkills.push(...parsed.skills);
      cursor = parsed.metadata?.nextCursor;
    } while (cursor);

    return allSkills;
  }
}

export const skillsRegistryService = new SkillsRegistryService();
