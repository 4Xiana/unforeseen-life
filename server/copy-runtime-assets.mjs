import { cpSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, 'agent/skills');
for (const entry of readdirSync(source, { recursive: true })) {
  if (!entry.endsWith('.md')) continue;
  cpSync(path.join(source, entry), path.join(root, 'dist/agent/skills', entry), { recursive: true });
}
