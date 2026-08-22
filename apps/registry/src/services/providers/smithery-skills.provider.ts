/**
 * Skills provider for Smithery.ai — MCP + Skills marketplace.
 *
 * API: https://api.smithery.ai/skills (no auth required)
 * Docs: https://smithery.ai
 *
 * Strategy:
 *   1. Fetch paginated listing from Smithery API (metadata + gitUrl)
 *   2. Compute the raw.githubusercontent.com URL for each skill's SKILL.md
 *   3. Store metadata + rawUrl in _meta.smithery — frontend fetches content on demand
 */
import type { SkillResponse } from '@mcp/types';
import type { SkillsProvider } from './types.js';
import { config } from '../../config/index.js';

interface SmitherySkill {
  id: string;
  namespace: string;
  slug: string;
  displayName: string;
  description: string;
  prompt: string | null;
  gitUrl: string;
  categories: string[];
  totalActivations: number;
  qualityScore: number;
  featured: boolean;
  verified: boolean;
  listed: boolean;
}

interface SmitheryPaginated<T> {
  skills: T[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

function parseGitHubRawUrl(gitUrl: string): string | null {
  const match = gitUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}/SKILL.md`;
}

function mapSkill(sk: SmitherySkill): SkillResponse {
  const normalizedName = sk.slug.includes('/') ? sk.slug : `${sk.namespace}/${sk.slug}`;
  const rawUrl = parseGitHubRawUrl(sk.gitUrl);

  return {
    skill: {
      name: normalizedName,
      description: sk.description || sk.displayName,
      title: sk.displayName,
      version: '1.0.0',
      content: `[Smithery skill: ${sk.displayName}]\nSource: ${sk.gitUrl}\nCategories: ${sk.categories.join(', ')}\nActivations: ${sk.totalActivations}\nQuality score: ${Math.round(sk.qualityScore * 100)}%`,
      format: 'markdown',
      tags: sk.categories ?? [],
      repository: { url: sk.gitUrl, source: 'github' },
    },
    source: 'registry',
    _meta: {
      'com.mcp-registry-runtime.meta': {
        verified: sk.verified,
        featured: sk.featured,
        vendorOfficial: false,
      },
      'smithery': {
        qualityScore: sk.qualityScore,
        totalActivations: sk.totalActivations,
        rawUrl,
      },
    },
  };
}

export class SmitherySkillsProvider implements SkillsProvider {
  readonly name = 'smithery-skills';
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.smitheryApiUrl ?? 'https://api.smithery.ai';
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async fetchAllSkills(onProgress?: (msg: string, current?: number, total?: number) => void): Promise<SkillResponse[]> {
    const maxSkills = config.smitherySkillsMax ?? 500;
    console.log(`[SmitherySkills] Fetching listing (max ${maxSkills} skills)...`);
    const allSkills: SmitherySkill[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = new URL('/skills', this.baseUrl);
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', '100');

      onProgress?.(`Page ${page}/${totalPages}...`, page, totalPages);

      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.error(`[SmitherySkills] HTTP ${response.status} on page ${page}`);
        break;
      }

      const data = await response.json() as SmitheryPaginated<SmitherySkill>;
      allSkills.push(...(data?.skills ?? []));
      totalPages = data?.pagination?.totalPages ?? 1;
      page++;

      if (allSkills.length >= maxSkills) break;
    } while (page <= totalPages);

    const toMap = allSkills.slice(0, maxSkills);
    const result = toMap.map(mapSkill);

    console.log(`[SmitherySkills] Mapped ${result.length} skills (rawUrl in _meta.smithery)`);
    return result;
  }
}
