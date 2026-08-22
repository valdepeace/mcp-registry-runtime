/**
 * Skills provider for skills.sh — the open agent skills directory.
 *
 * API docs: https://skills.sh/docs/api
 * Base URL: https://skills.sh/api/v1
 *
 * Strategy:
 *   1. Fetch paginated list of all skills (GET /skills)
 *   2. For each skill, fetch detail (GET /skills/:source/:skill) to get SKILL.md content
 *   3. Parse SKILL.md frontmatter (YAML delimited by ---) + markdown body
 *   4. Map to SkillResponse format
 */
import type { SkillResponse, SkillCategory } from '@mcp/types';
import type { SkillsProvider } from './types.js';
import { config } from '../../config/index.js';

const VALID_CATEGORIES: Set<string> = new Set([
  'ai', 'data', 'development', 'infrastructure', 'integration',
  'security', 'productivity', 'frontend', 'backend', 'devops', 'other',
]);

const VALID_FORMATS: Set<string> = new Set(['markdown', 'json', 'yaml']);

interface V1Skill {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType: 'github' | 'well-known';
  installUrl: string | null;
  url: string;
  isDuplicate?: boolean;
}

interface V1SkillDetail {
  id: string;
  source: string;
  slug: string;
  installs: number;
  hash: string | null;
  files: Array<{ path: string; contents: string }> | null;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
  };
}

function parseFrontmatter(markdown: string): { meta: Record<string, string>; content: string } {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: markdown };

  const meta: Record<string, string> = {};
  const yamlLines = match[1].split('\n');
  for (const line of yamlLines) {
    const keyVal = line.match(/^(\w[\w\s]*?):\s*(.+)/);
    if (keyVal) {
      meta[keyVal[1].trim()] = keyVal[2].trim();
    }
  }

  return { meta, content: match[2].trim() };
}

export class SkillsShProvider implements SkillsProvider {
  readonly name = 'skills.sh';
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor() {
    this.baseUrl = config.skillsShApiUrl ?? 'https://skills.sh/api/v1';
    if (!this.baseUrl.endsWith('/')) {
      this.baseUrl += '/';
    }
    this.apiKey = config.skillsShApiKey;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Accept': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async fetchAllSkills(onProgress?: (msg: string, current?: number, total?: number) => void): Promise<SkillResponse[]> {
    console.log('[SkillsSh] Fetching skill listing...');
    const allSkills: V1Skill[] = [];
    let page = 0;
    let hasMore = true;

    do {
      const url = new URL('skills', this.baseUrl);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', '100');
      url.searchParams.set('view', 'all-time');

      onProgress?.(`Listing page ${page + 1}...`, page + 1);

      const response = await fetch(url.toString(), {
        headers: this.headers,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error(`[SkillsSh] HTTP 401 — API key required. Get one at https://skills.sh`);
        } else {
          console.error(`[SkillsSh] HTTP ${response.status} on page ${page}`);
        }
        break;
      }

      const data = await response.json() as PaginatedResponse<V1Skill>;
      const filtered = data?.data?.filter(s => !s.isDuplicate) ?? [];
      allSkills.push(...filtered);
      hasMore = data?.pagination?.hasMore ?? false;
      page++;
    } while (hasMore);

    console.log(`[SkillsSh] Listed ${allSkills.length} skills from listing. Fetching details...`);

    const result: SkillResponse[] = [];
    const concurrency = 5;

    for (let i = 0; i < allSkills.length; i += concurrency) {
      const batch = allSkills.slice(i, i + concurrency);
      const responses = await Promise.allSettled(
        batch.map(skill => this.fetchSkillDetail(skill))
      );
      for (const r of responses) {
        if (r.status === 'fulfilled' && r.value) result.push(r.value);
      }
      onProgress?.(`Details ${Math.min(i + concurrency, allSkills.length)}/${allSkills.length}`, Math.min(i + concurrency, allSkills.length), allSkills.length);
    }

    console.log(`[SkillsSh] Total mapped: ${result.length} skills`);
    return result;
  }

  private async fetchSkillDetail(skill: V1Skill): Promise<SkillResponse | null> {
    try {
      const id = skill.id;
      const url = new URL(`skills/${id}`, this.baseUrl);
      const response = await fetch(url.toString(), {
        headers: this.headers,
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        console.warn(`[SkillsSh] Detail fetch failed for ${id}: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json() as V1SkillDetail;
      const skillFile = data.files?.find(f => f.path === 'SKILL.md' || f.path.endsWith('.md'));
      if (!skillFile) {
        return {
          skill: {
            name: `skills.sh/${skill.slug}`,
            description: skill.name,
            version: '1.0.0',
            content: '',
            format: 'markdown',
            tags: [],
          },
          source: 'registry',
          _meta: {
            'com.mcp-registry-runtime.meta': {
              vendorOfficial: false,
            },
          },
        };
      }

      const { meta, content } = parseFrontmatter(skillFile.contents);
      const name = meta.name || meta.title || `skills.sh/${skill.slug}`;
      const normalizedName = name.includes('/') ? name : `skills.sh/${name}`;

      return {
        skill: {
          name: normalizedName,
          description: meta.description || skill.name,
          title: meta.title || meta.name,
          version: meta.version || '1.0.0',
          content,
          format: (meta.format && VALID_FORMATS.has(meta.format) ? meta.format as 'markdown' | 'json' | 'yaml' : 'markdown'),
          category: (meta.category && VALID_CATEGORIES.has(meta.category) ? meta.category as SkillCategory : undefined),
          tags: meta.tags ? meta.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          repository: { url: skill.installUrl || '', source: 'github' },
        },
        source: 'registry',
        _meta: {
          'com.mcp-registry-runtime.meta': {
            vendorOfficial: false,
          },
        },
      };
    } catch (err) {
      return null;
    }
  }
}
