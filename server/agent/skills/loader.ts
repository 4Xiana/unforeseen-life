import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { renderSeedCatalog } from './quest-library/seeds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

const bodyCache = new Map<string, string>();
const metaCache = new Map<string, { name: string; description: string }>();
let availableCache: { id: string; name: string; description: string }[] | null = null;

function parseFrontmatter(raw: string): { meta: { name?: string; description?: string }; body: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  const fmBlock = match[1];
  const body = match[2].trim();
  const name = fmBlock.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fmBlock.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { meta: { name, description }, body };
}

export function loadSkillBody(dirName: string): string {
  const cached = bodyCache.get(dirName);
  if (cached !== undefined) return cached;
  const filePath = join(SKILLS_DIR, dirName, 'SKILL.md');
  if (!existsSync(filePath)) {
    bodyCache.set(dirName, '');
    return '';
  }
  try {
    const { body } = parseFrontmatter(readFileSync(filePath, 'utf-8'));
    bodyCache.set(dirName, body);
    return body;
  } catch {
    bodyCache.set(dirName, '');
    return '';
  }
}

/**
 * 手册完整正文：SKILL.md 正文 + 该手册附带的结构化附录。
 * S1 预载与 get_skill 工具统一走这里，保证两个通道模型看到的内容完全同源。
 * 目前 quest-library 的种子目录（seeds.ts 结构化数据）渲染后追加在正文末尾。
 */
export function loadFullSkillBody(dirName: string): string {
  const body = loadSkillBody(dirName);
  if (!body) return '';
  if (dirName === 'quest-library') {
    return `${body}\n\n---\n\n${renderSeedCatalog()}`;
  }
  return body;
}

export function listAvailableSkills(): { id: string; name: string; description: string }[] {
  if (availableCache) return availableCache;
  const result: { id: string; name: string; description: string }[] = [];
  try {
    const entries = readdirSync(SKILLS_DIR);
    for (const entry of entries) {
      const skillPath = join(SKILLS_DIR, entry);
      if (!statSync(skillPath).isDirectory()) continue;
      const mdPath = join(skillPath, 'SKILL.md');
      if (!existsSync(mdPath)) continue;
      const cached = metaCache.get(entry);
      if (cached) {
        result.push({ id: entry, name: cached.name, description: cached.description });
        continue;
      }
      try {
        const { meta } = parseFrontmatter(readFileSync(mdPath, 'utf-8'));
        const item = { id: entry, name: meta.name || entry, description: meta.description || '' };
        metaCache.set(entry, { name: item.name, description: item.description });
        result.push(item);
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  availableCache = result;
  return result;
}
