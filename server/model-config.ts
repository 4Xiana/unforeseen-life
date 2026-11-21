import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const LOCAL_MODEL_KEYS = new Set(['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_USE_CHAT_COMPLETIONS', 'OPENAI_AGENTS_DISABLE_TRACING', 'MINIMAX_API_KEY', 'MINIMAX_API_BASE', 'MINIMAX_TTS_MODEL', 'MINIMAX_VOICE_ID']);

/** Product model credentials take precedence over unrelated sandbox defaults; PORT stays platform-owned. */
export function loadServerEnvironment(filename = '.env', env: NodeJS.ProcessEnv = process.env) {
  let content: string;
  try { content = readFileSync(filename, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  for (const [key, value] of Object.entries(parse(content))) {
    if (env[key] === undefined || LOCAL_MODEL_KEYS.has(key)) env[key] = value;
  }
}

/** Fast interactive responses, compatible with forced tools and SDK tool-result round trips. */
export function chatRequestOptions(baseURL = process.env.OPENAI_BASE_URL) {
  try {
    if (new URL(baseURL || '').hostname === 'api.deepseek.com') return { reasoning_effort: 'none' as const, thinking: { type: 'disabled' as const } };
  } catch { /* Other providers keep their existing defaults. */ }
  return {};
}
