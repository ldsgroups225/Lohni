import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'

const { ttsPromise, speech, config } = vi.hoisted(() => ({
  ttsPromise: vi.fn(),
  speech: vi.fn(async () => new Uint8Array([1, 2])),
  config: { tts_provider: 'edge', openrouter: 'key', tts_model: 'm', tts_voice: 'Kore', tts_voice_alt: 'Charon', tts_voice_edge: 'fr-FR-A', tts_voice_alt_edge: 'fr-FR-B', ffmpeg: 'ffmpeg' } as Record<string, string>,
}))
vi.mock('node-edge-tts', () => ({ EdgeTTS: vi.fn(function (this: any) { this.ttsPromise = ttsPromise }) }))
vi.mock('./openrouter', () => ({ requestOpenRouterSpeech: speech }))
vi.mock('../../config/env', () => ({ config }))
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const p: any = new EventEmitter()
    p.stderr = new EventEmitter()
    setTimeout(() => p.emit('close', 0), 0)
    return p
  }),
}))

import { tts } from '.'

const segs = [{ text: 'Bonjour' }, { text: 'Salut' }]
let dir: string

beforeEach(() => {
  ttsPromise.mockReset(); speech.mockClear(); config.openrouter = 'key'
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lohni-tts-'))
})

it('bascule tout de suite sur OpenRouter quand Edge refuse la connexion (403)', async () => {
  ttsPromise.mockRejectedValue(new Error('Unexpected server response: 403'))
  const started = Date.now()

  await expect(tts(segs, dir, 'pod')).resolves.toBe(path.join(dir, 'pod.mp3'))

  expect(ttsPromise).toHaveBeenCalledOnce()
  expect(Date.now() - started).toBeLessThan(500)
  expect(speech.mock.calls.map(c => (c as any[])[1].voice)).toEqual(['Kore', 'Charon'])
})

it('réessaie Edge sur une erreur passagère avant de basculer', async () => {
  ttsPromise.mockRejectedValueOnce(new Error('Timed out waiting for Edge TTS')).mockImplementation(async (_t: string, f: string) => fs.writeFileSync(f, 'mp3'))
  await tts(segs, dir, 'pod')
  expect(ttsPromise).toHaveBeenCalledTimes(3)
  expect(speech).not.toHaveBeenCalled()
})

it('remonte l’erreur d’Edge sans clé OpenRouter', async () => {
  config.openrouter = ''
  ttsPromise.mockRejectedValue(new Error('Unexpected server response: 403'))
  await expect(tts(segs, dir, 'pod')).rejects.toThrow('403')
  expect(speech).not.toHaveBeenCalled()
})
