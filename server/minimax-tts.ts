export async function synthesizeSpeech(text: string, signal?: AbortSignal): Promise<Buffer> {
  if (!process.env.MINIMAX_API_KEY) throw new Error('吱呀的语音还没配置，请稍后再试。');
  const response = await fetch(`${process.env.MINIMAX_API_BASE || 'https://api.minimaxi.com/v1'}/t2a_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: process.env.MINIMAX_TTS_MODEL || 'speech-2.8-turbo',
      text, stream: false, language_boost: 'Chinese', output_format: 'hex',
      voice_setting: { voice_id: process.env.MINIMAX_VOICE_ID || 'qiaopi_mengmei', speed: 1, vol: 1, pitch: 0, emotion: 'happy' },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
  });
  if (!response.ok) throw new Error('吱呀的语音暂时连不上，请重试。');
  const data = await response.json() as { base_resp?: { status_code?: number }; data?: { audio?: string } };
  const hex = data.data?.audio;
  if (data.base_resp?.status_code !== 0 || !hex || hex.length % 2 || !/^[a-f\d]+$/i.test(hex)) {
    throw new Error('这句话的语音没有生成，请重试。');
  }
  return Buffer.from(hex, 'hex');
}
