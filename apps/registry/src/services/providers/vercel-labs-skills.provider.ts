/**
 * Skills provider for vercel-labs/skills on GitHub.
 * Fetches official Vercel-curated skills — no API key required.
 * Rate limit: 60 req/hr unauthenticated, 5000/hr with GITHUB_TOKEN.
 */
import type { SkillResponse, SkillCategory } from '@mcp/types';
import type { SkillsProvider } from './types.js';

const REPO_OWNER = 'vercel-labs';
const REPO_NAME = 'skills';
const BRANCH = 'main';
const BASE_API = 'https://api.github.com';
const BASE_RAW = 'https://raw.githubusercontent.com';

const VALID_CATEGORIES = new Set<string>([
  'ai', 'data', 'development', 'infrastructure', 'integration',
  'security', 'productivity', 'frontend', 'backend', 'devops', 'other',
]);

interface GithubEntry {
  name: string;
  type: 'file' | 'dir';
  path: string;
  download_url: string | null;
}

function parseFrontmatter(markdown: string): { meta: Record<string, string>; content: string } {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: markdown };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w\s]*?):\s*(.+)/);
    if (kv) meta[kv[1].trim()] = kv[2].trim();
  }
  return { meta, content: match[2].trim() };
}

export class VercelLabsSkillsProvider implements SkillsProvider {
  readonly name = 'vercel-labs';
  private githubToken: string | undefined;

  constructor(githubToken?: string) {
    this.githubToken = githubToken;
  }

  isConfigured(): boolean {
    return true;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.githubToken) h['Authorization'] = `Bearer ${this.githubToken}`;
    return h;
  }

  async fetchAllSkills(onProgress?: (msg: string, current?: number, total?: number) => void): Promise<SkillResponse[]> {
    console.log('[VercelLabsSkills] Listing skills directory...');

    const listUrl = `${BASE_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/skills`;
    const listRes = await fetch(listUrl, {
      headers: this.headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!listRes.ok) {
      console.error(`[VercelLabsSkills] Failed to list skills: HTTP ${listRes.status}`);
      return [];
    }

    const entries = await listRes.json() as GithubEntry[];
    const dirs = entries.filter(e => e.type === 'dir');
    console.log(`[VercelLabsSkills] Found ${dirs.length} skill directories`);

    const results: SkillResponse[] = [];
    const concurrency = 5;

    for (let i = 0; i < dirs.length; i += concurrency) {
      const batch = dirs.slice(i, i + concurrency);
      const settled = await Promise.allSettled(batch.map(d => this.fetchSkill(d.name)));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }
      onProgress?.(
        `Fetched ${Math.min(i + concurrency, dirs.length)}/${dirs.length}`,
        Math.min(i + concurrency, dirs.length),
        dirs.length,
      );
    }

    console.log(`[VercelLabsSkills] Mapped ${results.length} skills`);
    return results;
  }

  private async fetchSkill(dirName: string): Promise<SkillResponse | null> {
    try {
      const rawUrl = `${BASE_RAW}/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/skills/${encodeURIComponent(dirName)}/SKILL.md`;
      const res = await fetch(rawUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;

      const markdown = await res.text();
      const { meta, content } = parseFrontmatter(markdown);

      const name = meta.name || dirName;
      const normalizedName = name.includes('/') ? name : `vercel-labs/${name}`;

      return {
        skill: {
          name: normalizedName,
          description: meta.description || name,
          title: meta.title || meta.name || dirName,
          version: meta.version || '1.0.0',
          content,
          format: 'markdown',
          category: (meta.category && VALID_CATEGORIES.has(meta.category)
            ? meta.category as SkillCategory
            : undefined),
          tags: meta.tags ? meta.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          repository: {
            url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/tree/${BRANCH}/skills/${dirName}`,
            source: 'github',
          },
        },
        source: 'registry',
        _meta: {
          'com.mcp-registry-runtime.meta': {
            vendorOfficial: true,
          },
        },
      };
    } catch {
      return null;
    }
  }
}
