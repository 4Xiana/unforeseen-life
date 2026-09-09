import 'dotenv/config';
import { OpenAI } from 'openai';
import zlib from 'zlib';

// ── 手工生成一张 80x80 纯红 PNG（无需 canvas 依赖）──
function crc32(buf) {
  let c, table = crc32.t || (crcc32Table());
  function crcc32Table() {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    crc32.t = t;
    return t;
  }
  c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makeRedPng(size = 80) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit, RGB
  const rowBuf = Buffer.alloc(1 + size * 3);
  for (let i = 0; i < size; i++) { rowBuf[1 + i * 3] = 255; }
  const raw = Buffer.concat(Array.from({ length: size }, () => rowBuf));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const dataUrl = 'data:image/png;base64,' + makeRedPng().toString('base64');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const tools = [{
  type: 'function',
  function: {
    name: 'report_color',
    description: '报告图片主色',
    parameters: {
      type: 'object',
      properties: { color: { type: 'string', description: '颜色名，如 红色/蓝色' } },
      required: ['color'],
    },
  },
}];

async function test(model) {
  console.log(`\n=== 测试模型: ${model} ===`);
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '这张图片的主色是什么？请调用 report_color 工具回答，color 填颜色名。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      tools,
      tool_choice: 'auto',
      max_tokens: 512,
    });
    const msg = res.choices[0]?.message;
    console.log('content:', JSON.stringify(msg?.content || ''));
    console.log('tool_calls:', JSON.stringify(msg?.tool_calls || [], null, 2));
    console.log('finish_reason:', res.choices[0]?.finish_reason);
  } catch (e) {
    console.log('ERROR:', e.status, e.message?.slice(0, 400));
  }
}

await test('MiniMax-M3');
await test('MiniMax-VL-01');
