import { describe, expect, it, vi } from 'vitest'
import { requestOpenRouterSpeech } from './openrouter'

describe('OpenRouter TTS', () => {
  it('demande du PCM et le renvoie en WAV 24 kHz mono 16 bits', async () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6])
    const fetchMock = vi.fn(async () => new Response(pcm, { status: 200 }))

    const wav = await requestOpenRouterSpeech('Bonjour', { apiKey: 'k', model: 'google/tts', voice: 'Kore' }, fetchMock as typeof fetch)

    const [url, init] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect(JSON.parse(String(init.body))).toEqual({ model: 'google/tts', input: 'Bonjour', voice: 'Kore', response_format: 'pcm' })

    const view = new DataView(wav.buffer)
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe('WAVE')
    expect(view.getUint32(4, true)).toBe(wav.length - 8)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(24000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(pcm.length)
    expect([...wav.slice(44)]).toEqual([...pcm])
  })

  it('remonte le statut HTTP en cas d’échec', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"x"}', { status: 402 }))
    await expect(requestOpenRouterSpeech('a', { apiKey: 'k', model: 'm', voice: 'v' }, fetchMock as typeof fetch)).rejects.toThrow('openrouter_tts_http_402')
  })
})

it('annuler la synthèse interrompt la requête HTTP', async () => {
  const controller = new AbortController()
  const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Annulé', 'AbortError')))
  }))
  const result = requestOpenRouterSpeech('Bonjour', { apiKey: 'k', model: 'm', voice: 'v', signal: controller.signal }, fetchMock as typeof fetch)
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
})
