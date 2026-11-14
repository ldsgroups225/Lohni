import http from 'node:http'
import { existsSync } from 'node:fs'
import { afterEach, expect, test } from 'vitest'
import { withUpload } from './withUpload'
import { RevisionError } from '../../services/revision/service'

let server: http.Server
afterEach(() => new Promise(r => server ? server.close(() => r(null)) : r(null)))

async function post(handler: (req: any) => Promise<unknown>, form: FormData) {
  const result: { value?: unknown; error?: unknown } = {}
  server = http.createServer(async (req, res) => {
    try { result.value = await handler(req) } catch (e) { result.error = e }
    res.end('ok')
  })
  await new Promise<void>(r => server.listen(0, r))
  await fetch(`http://127.0.0.1:${(server.address() as any).port}`, { method: 'POST', body: form })
  return result
}
const form = (files: number, q?: string) => {
  const f = new FormData()
  if (q !== undefined) f.append('q', q)
  for (let i = 0; i < files; i++) f.append('file', new Blob(['contenu']), `f${i}.txt`)
  return f
}
const options = { prefix: 'lohni-test-', maxFiles: 3, fileSize: 1024, exactlyOne: true, metadata: true, tooBigMessage: 'Trop gros.', noFileMessage: 'Choisis un fichier à importer.', code: 'IMPORT_FILE' }

test('donne les métadonnées et le fichier, puis supprime le dossier après un succès', async () => {
  let path = ''
  const r = await post(req => withUpload<{ title: string }>(req, options, async ({ files, metadata }) => { path = files[0].path; expect(existsSync(path)).toBe(true); return metadata.title }), form(1, '{"title":"T"}'))
  expect(r.value).toBe('T')
  expect(existsSync(path)).toBe(false)
})

test('supprime le fichier quand le traitement échoue', async () => {
  let path = ''
  const r = await post(req => withUpload(req, options, async ({ files }) => { path = files[0].path; throw new Error('boom') }), form(1, '{}'))
  expect((r.error as Error).message).toBe('boom')
  expect(existsSync(path)).toBe(false)
})

test('métadonnées invalides : erreur claire', async () => {
  const r = await post(req => withUpload(req, options, async () => 1), form(1, 'pas du json'))
  expect(r.error).toBeInstanceOf(RevisionError)
  expect((r.error as Error).message).toBe('Matière et titre du chapitre requis.')
})

test('zéro ou deux fichiers : erreur claire', async () => {
  const none = await post(req => withUpload(req, options, async () => 1), form(0, '{}'))
  expect((none.error as RevisionError).message).toBe('Choisis un fichier à importer.')
  const two = await post(req => withUpload(req, { ...options, maxFiles: 1 }, async () => 1), form(2, '{}'))
  expect((two.error as RevisionError).message).toBe('Trop gros.')
})
