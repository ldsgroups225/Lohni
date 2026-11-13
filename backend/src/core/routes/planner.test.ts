import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createKeyv } from '../../utils/database/keyv-store'
import { PlannerService } from '../../services/planner/service'
import { PlannerStore } from '../../services/planner/store'
import { plannerRoutes } from './planner'

vi.mock('../../services/planner/ai', async importOriginal => ({
  ...await importOriginal<object>(),
  parseTask: async (text: string) => ({ title: text, dueAt: '2026-11-20T10:00:00.000Z', estMins: 30, priority: 3 }),
  generateSteps: async () => ['étape'],
}))

type Handler = (req: any, res: any) => Promise<void>
let directory: string
let handlers: Record<string, Handler>
let sockets: Record<string, { sent: string[]; ws: any }[]>
const a = randomUUID(), b = randomUUID()

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lohni-planner-'))
  const db = createKeyv(`sqlite://${join(directory, 'test.sqlite')}`)
  handlers = {}
  const app: any = { ws: (path: string, h: Handler) => { handlers[`ws ${path}`] = h } }
  for (const m of ['get', 'post', 'patch', 'delete']) app[m] = (path: string, h: Handler) => { handlers[`${m} ${path}`] = h }
  plannerRoutes(app, new PlannerService(new PlannerStore(db)))
  sockets = {}
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

async function call(method: string, path: string, device: string | undefined, body?: any, params: any = {}) {
  let status = 200, payload: any
  const res = { status(code: number) { status = code; return this }, send(data: any) { payload = data } }
  const pattern = Object.keys(handlers).find(k => k.startsWith(`${method} `) && k.slice(method.length + 1) === path)!
  await handlers[pattern]({ headers: device ? { 'x-device-id': device } : {}, body, params, query: {} }, res)
  return { status, body: payload }
}
function connect(device: string) {
  const sent: string[] = []
  const ws = { send: (m: string) => sent.push(m), close: vi.fn(), on: vi.fn(), readyState: 1 }
  handlers['ws /ws/planner']!(ws, { url: `/ws/planner?device=${device}` } as any)
  return { sent, ws }
}

test('chaque appareil ne voit que ses tâches', async () => {
  const created = await call('post', '/tasks/ingest', a, { text: 'Maths' })
  expect(created.status).toBe(200)
  const id = created.body.task.id
  expect((await call('get', '/tasks', a)).body.tasks.map((t: any) => t.id)).toEqual([id])
  expect((await call('get', '/tasks', b)).body.tasks).toEqual([])
  for (const [m, p, body] of [['get', '/tasks/:id'], ['patch', '/tasks/:id', { notes: 'x' }], ['post', '/tasks/:id/plan'], ['post', '/tasks/:id/replan'], ['delete', '/tasks/:id']] as const) {
    expect((await call(m, p, b, body, { id })).status, `${m} ${p}`).toBe(404)
  }
  expect((await call('post', '/sessions/start', b, { taskId: id })).status).toBe(404)
  const weekly = await call('post', '/planner/weekly', b, {})
  expect(weekly.body.tasks).toEqual([])
  expect((await call('get', '/tasks/:id', a, undefined, { id })).status).toBe(200)
})

test('les routes refusent une requête sans identifiant appareil valide', async () => {
  for (const device of [undefined, 'pas-un-uuid']) {
    const r = await call('get', '/tasks', device)
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('Identifiant appareil invalide.')
  }
  expect((await call('post', '/tasks/ingest', undefined, { text: 'x' })).status).toBe(400)
})

test('les anciennes tâches globales ne sont servies à personne', async () => {
  const db = createKeyv(`sqlite://${join(directory, 'legacy.sqlite')}`)
  await db.set('planner:tasks', [{ id: 'old' }])
  await db.set('planner:task:old', { id: 'old', title: 'Ancienne', dueAt: '2026-11-20T10:00:00.000Z' })
  const service = new PlannerService(new PlannerStore(db))
  expect(await service.listTasks(a)).toEqual([])
  expect(await service.getTask(a, 'old')).toBeNull()
})

test('le WebSocket ne diffuse qu’à l’appareil concerné', async () => {
  const mine = connect(a), theirs = connect(b)
  await call('post', '/tasks/ingest', a, { text: 'Maths' })
  expect(mine.sent.some(m => m.includes('task.created'))).toBe(true)
  expect(theirs.sent.some(m => m.includes('task.created'))).toBe(false)
  const bad = connect('nope')
  expect(bad.ws.close).toHaveBeenCalled()
})

test('un échec d’ajout renvoie un message français', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const r = await call('post', '/tasks/ingest', a, { text: '' })
  expect(r.status).toBe(400)
  expect(r.body.error).toMatch(/Écris/)
  log.mockRestore()
})
