import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadServerEnvironment, chatRequestOptions } from '../server/model-config.js';

test('产品模型配置覆盖继承默认值，平台端口与其他继承配置保留', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'zhiya-config-'));
  try {
    const filename = path.join(dir, '.env');
    writeFileSync(filename, 'OPENAI_API_KEY=local-test-key\nOPENAI_BASE_URL=https://api.deepseek.com\nOPENAI_MODEL=deepseek-flash\nOPENAI_AGENTS_DISABLE_TRACING=1\nPORT=5182\nMINIMAX_API_KEY=local-voice-key\nMINIMAX_API_BASE=https://api.minimaxi.com/v1\nMINIMAX_TTS_MODEL=speech-2.8-turbo\nMINIMAX_VOICE_ID=file-voice\nXIAN_TEST_VALUE=local\nUNRELATED_CONFIG=local\n');
    const env = { OPENAI_API_KEY: 'sandbox-test-key', OPENAI_BASE_URL: 'https://example.test', OPENAI_MODEL: 'other', PORT: '8801', MINIMAX_API_KEY: 'sandbox-voice-key', MINIMAX_API_BASE: 'https://other.test', MINIMAX_TTS_MODEL: 'other-voice-model', MINIMAX_VOICE_ID: 'inherited-voice', UNRELATED_CONFIG: 'inherited' } as NodeJS.ProcessEnv;
    loadServerEnvironment(filename, env);
    assert.equal(env.OPENAI_API_KEY, 'local-test-key');
    assert.equal(env.OPENAI_BASE_URL, 'https://api.deepseek.com');
    assert.equal(env.OPENAI_MODEL, 'deepseek-flash');
    assert.equal(env.OPENAI_AGENTS_DISABLE_TRACING, '1');
    assert.equal(env.PORT, '8801');
    assert.equal(env.MINIMAX_API_KEY, 'local-voice-key');
    assert.equal(env.MINIMAX_API_BASE, 'https://api.minimaxi.com/v1');
    assert.equal(env.MINIMAX_TTS_MODEL, 'speech-2.8-turbo');
    assert.equal(env.MINIMAX_VOICE_ID, 'file-voice');
    assert.equal(env.UNRELATED_CONFIG, 'inherited');
    assert.equal(env.XIAN_TEST_VALUE, 'local');
    const fresh = {} as NodeJS.ProcessEnv;
    loadServerEnvironment(filename, fresh);
    assert.equal(fresh.PORT, '5182');
    loadServerEnvironment(path.join(dir, 'missing'), fresh);
    assert.equal(fresh.OPENAI_MODEL, 'deepseek-flash');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('仅向 DeepSeek 官方服务发送非思考参数，其他兼容服务保持默认', () => {
  assert.deepEqual(chatRequestOptions('https://api.deepseek.com'), { reasoning_effort: 'none', thinking: { type: 'disabled' } });
  assert.deepEqual(chatRequestOptions('https://api.deepseek.com/v1'), { reasoning_effort: 'none', thinking: { type: 'disabled' } });
  for (const base of ['', 'invalid', 'https://api.openai.com/v1', 'https://api.deepseek.com.example.test']) assert.deepEqual(chatRequestOptions(base), {});
});
