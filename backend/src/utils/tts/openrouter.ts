// Gemini TTS on OpenRouter only returns raw PCM (24 kHz, mono, 16-bit); a WAV header lets ffmpeg concat it.
const RATE = 24000

function pcmToWav(pcm: Uint8Array) {
  const wav = new Uint8Array(44 + pcm.length)
  const view = new DataView(wav.buffer)
  const ascii = (at: number, s: string) => wav.set(new TextEncoder().encode(s), at)
  ascii(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, 'data'); view.setUint32(40, pcm.length, true)
  wav.set(pcm, 44)
  return wav
}

export async function requestOpenRouterSpeech(
  input: string,
  opts: { apiKey: string; model: string; voice: string },
  fetchImpl: typeof fetch = fetch,
) {
  const r = await fetchImpl('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: opts.model, input, voice: opts.voice, response_format: 'pcm' }),
  })
  if (!r.ok) throw new Error(`openrouter_tts_http_${r.status}`)
  return pcmToWav(new Uint8Array(await r.arrayBuffer()))
}
