import fs from 'node:fs'
import { Readable } from 'node:stream'
import { beforeEach, expect, test, vi } from 'vitest'
import { transcriberRoutes } from './transcriber'
import { transcribeAudio } from '../../services/transcriber'

vi.mock('../../services/transcriber', () => ({ transcribeAudio: vi.fn() }))

async function post(file: File) {
  const form = new FormData()
  form.append('file', file)
  const request = new Request('http://local/transcriber', { method: 'POST', body: form })
  const req: any = Readable.from([Buffer.from(await request.arrayBuffer())])
  req.headers = { 'content-type': request.headers.get('content-type') }
  let handler: any
  transcriberRoutes({ post: (_path: string, h: any) => { handler = h } })
  const res: any = { statusCode: 200, body: undefined, status(code: number) { this.statusCode = code; return this }, json(b: any) { this.body = b; return this } }
  await handler(req, res)
  return res
}

const sentPath = () => vi.mocked(transcribeAudio).mock.calls[0][0]

beforeEach(() => { vi.mocked(transcribeAudio).mockReset() })

test('renvoie la transcription et les fiches, puis supprime l’audio temporaire', async () => {
  const studyMaterials = { summary: 'Résumé' }
  vi.mocked(transcribeAudio).mockImplementation(async (p) => {
    expect(fs.readFileSync(p, 'utf8')).toBe('son')
    return { text: 'Bonjour la classe', studyMaterials } as any
  })

  const res = await post(new File(['son'], 'recording.webm', { type: 'audio/webm' }))

  expect(res.body).toEqual({ ok: true, transcription: 'Bonjour la classe', studyMaterials })
  expect(sentPath()).not.toContain('storage')
  await vi.waitFor(() => expect(fs.existsSync(sentPath())).toBe(false))
})

test('refuse un fichier qui n’est pas audio', async () => {
  const res = await post(new File(['x'], 'cours.pdf', { type: 'application/pdf' }))
  expect(res.statusCode).toBe(400)
  expect(res.body.error).toBe('Le fichier doit être un enregistrement audio ou vidéo.')
  expect(transcribeAudio).not.toHaveBeenCalled()
})

test('refuse un enregistrement de plus de 25 Mo sans le transcrire', async () => {
  const res = await post(new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'long.webm', { type: 'audio/webm' }))
  expect(res.statusCode).toBe(413)
  expect(transcribeAudio).not.toHaveBeenCalled()
})

test('supprime l’audio et répond en français quand la transcription échoue', async () => {
  vi.mocked(transcribeAudio).mockRejectedValue(new Error('La transcription a échoué. Réessaie dans un instant.'))
  const res = await post(new File(['son'], 'recording.webm', { type: 'audio/webm' }))
  expect(res.statusCode).toBe(500)
  expect(res.body).toEqual({ ok: false, error: 'La transcription a échoué. Réessaie dans un instant.' })
  await vi.waitFor(() => expect(fs.existsSync(sentPath())).toBe(false))
})
