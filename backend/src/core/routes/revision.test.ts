import { EventEmitter } from 'node:events'
import { expect, test, vi } from 'vitest'
import { revisionRoutes } from './revision'
import { RevisionService } from '../../services/revision/service'

// Le serveur maison ne pose pas `req.res` : la route d'import doit lire la réponse reçue en argument.
test('un import JSON aboutit et annule la génération si la réponse est fermée avant la fin', async () => {
  const handlers: Record<string, (...args: any[]) => any> = {}
  const app = new Proxy({}, { get: (_t, method: string) => (path: string, handler: any) => { handlers[`${method} ${path}`] = handler } })
  let signal: AbortSignal | undefined
  vi.spyOn(RevisionService.prototype, 'importChapter').mockImplementation(async (_c, _i, s) => { signal = s; return { ok: true } as any })
  revisionRoutes(app)
  const res: any = Object.assign(new EventEmitter(), { writableEnded: false, destroyed: false, status: () => res, send: vi.fn() })
  const req = { headers: { 'x-device-id': 'd', 'x-local-date': '2026-11-14', 'content-type': 'application/json' }, body: { title: 't', subject: 'SVT', text: 'x' }, setTimeout: () => {} }
  await handlers['post /revision/import'](req, res)
  expect(res.send).toHaveBeenCalledWith({ ok: true, data: { ok: true } })
  expect(signal?.aborted).toBe(false)

  let late: AbortSignal | undefined
  vi.mocked(RevisionService.prototype.importChapter).mockImplementationOnce(async (_c, _i, s) => { late = s; res.emit('close'); return { ok: true } as any })
  await handlers['post /revision/import'](req, res)
  expect(late?.aborted).toBe(true)
})
