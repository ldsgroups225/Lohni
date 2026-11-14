import { expect, test, vi } from 'vitest'
import { debateRoutes } from './debate'
import llm from '../../utils/llm/llm'

vi.mock('../../utils/llm/llm', () => ({ default: { invoke: vi.fn() } }))
vi.mock('../../utils/database/keyv', () => {
  const data = new Map()
  return { default: { get: async (key: string) => structuredClone(data.get(key)), set: async (key: string, value: unknown) => { data.set(key, structuredClone(value)) }, delete: async (key: string) => data.delete(key) } }
})

function harness() {
  const routes: Record<string, any> = {}
  const app = { ws: (p: string, h: any) => { routes[`WS ${p}`] = h }, post: (p: string, h: any) => { routes[`POST ${p}`] = h }, get: (p: string, h: any) => { routes[`GET ${p}`] = h }, delete: (p: string, h: any) => { routes[`DELETE ${p}`] = h } }
  debateRoutes(app)
  const call = async (key: string, req: any) => {
    const res: any = { code: 200, body: undefined, status(c: number) { this.code = c; return this }, json(b: any) { this.body = b; return this } }
    await routes[key](req, res)
    return res
  }
  const follow = (taskId: string) => {
    const sent: any[] = []
    routes['WS /ws/debate']({ readyState: 1, send: (m: string) => sent.push(JSON.parse(m)), on: () => {}, close: vi.fn() }, { url: `/ws/debate?taskId=${taskId}` })
    return sent
  }
  return { call, follow }
}

async function started(h: ReturnType<typeof harness>) {
  const { body } = await h.call('POST /debate/start', { body: { topic: 'Les téléphones', position: 'for' } })
  return body.debateId as string
}

test('un tour de débat diffuse l’argument, la réponse mot à mot puis la fin', async () => {
  const h = harness()
  const debateId = await started(h)
  vi.mocked(llm.invoke).mockResolvedValueOnce('Je ne suis pas d’accord.' as any)
  const res = await h.call('POST /debate/:debateId/argue', { params: { debateId }, headers: {}, body: { argument: ' Mon argument ' } })
  expect(res.code).toBe(202)
  const sent = h.follow(res.body.taskId)
  await vi.waitFor(() => expect(sent.map(m => m.type)).toContain('done'))
  expect(sent[0]).toEqual({ type: 'user_argument', content: 'Mon argument' })
  expect(sent[1]).toEqual({ type: 'ai_thinking' })
  expect(sent.filter(m => m.type === 'ai_token').map(m => m.token).join('')).toBe('Je ne suis pas d’accord.')
  expect(sent.find(m => m.type === 'ai_complete').content).toBe('Je ne suis pas d’accord.')
  const stored = await h.call('GET /debate/:debateId', { params: { debateId } })
  expect(stored.body.session.messages.map((m: any) => m.role)).toEqual(['user', 'assistant'])
})

test('une panne du modèle est annoncée en français', async () => {
  const h = harness()
  const debateId = await started(h)
  vi.mocked(llm.invoke).mockRejectedValueOnce(new Error('boom'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const res = await h.call('POST /debate/:debateId/argue', { params: { debateId }, headers: {}, body: { argument: 'Mon argument' } })
    const sent = h.follow(res.body.taskId)
    await vi.waitFor(() => expect(sent.some(m => m.type === 'error')).toBe(true))
    expect(sent.find(m => m.type === 'error').error).toBe('Impossible de générer la réponse. Réessaie.')
  } finally { log.mockRestore() }
})

test('l’analyse diffuse ses phases puis le bilan avec le débat mis à jour', async () => {
  const h = harness()
  const debateId = await started(h)
  vi.mocked(llm.invoke).mockResolvedValueOnce(JSON.stringify({ winner: 'user', reason: 'Bravo' }) as any)
  const res = await h.call('POST /debate/:debateId/analyze', { params: { debateId }, headers: {} })
  const sent = h.follow(res.body.taskId)
  await vi.waitFor(() => expect(sent.map(m => m.type)).toContain('done'))
  expect(sent.some(m => m.type === 'phase')).toBe(true)
  const complete = sent.find(m => m.type === 'complete')
  expect(complete.analysis.winner).toBe('user')
  expect(complete.session).toMatchObject({ id: debateId, winner: 'user' })
})

test('annuler une réponse est réservé à l’appareil qui l’a lancée', async () => {
  const h = harness()
  const debateId = await started(h)
  vi.mocked(llm.invoke).mockResolvedValueOnce('Réponse assez longue pour durer un peu.' as any)
  const res = await h.call('POST /debate/:debateId/argue', { params: { debateId }, headers: { 'x-device-id': 'a' }, body: { argument: 'Mon argument' } })
  const { taskId } = res.body
  const refused = await h.call('DELETE /debate/tasks/:taskId', { params: { taskId }, headers: { 'x-device-id': 'b' } })
  expect(refused.code).toBe(403)
  expect(refused.body.error).toBe('Cette réponse appartient à un autre appareil.')
  const accepted = await h.call('DELETE /debate/tasks/:taskId', { params: { taskId }, headers: { 'x-device-id': 'a' } })
  expect(accepted.body).toEqual({ ok: true })
  // La tâche annulée n’existe plus : un flux tardif reçoit l’erreur française.
  expect(h.follow(taskId)[0]?.error).toBe('Cette réponse n’est plus disponible. Réessaie.')
})

// Un modèle qui ne répond jamais : seule l’annulation de la tâche peut interrompre la requête.
function hangingModel() {
  const seen: { signal?: AbortSignal } = {}
  vi.mocked(llm.invoke).mockReset() // des réponses programmées plus haut peuvent n’avoir jamais été consommées
  vi.mocked(llm.invoke).mockImplementationOnce((_m: any, options: any) => new Promise((_, reject) => {
    seen.signal = options.signal
    seen.signal?.addEventListener('abort', () => reject(seen.signal?.reason))
  }))
  return seen
}

test.each([
  ['une réponse', 'POST /debate/:debateId/argue', { argument: 'Mon argument' }],
  ['une analyse', 'POST /debate/:debateId/analyze', undefined],
])('annuler %s interrompt aussi la requête au modèle', async (_name, route, body) => {
  const h = harness()
  const debateId = await started(h)
  const seen = hangingModel()
  const res = await h.call(route, { params: { debateId }, headers: { 'x-device-id': 'a' }, body })
  h.follow(res.body.taskId)
  await vi.waitFor(() => expect(seen.signal).toBeDefined())
  expect(seen.signal!.aborted).toBe(false)
  await h.call('DELETE /debate/tasks/:taskId', { params: { taskId: res.body.taskId }, headers: { 'x-device-id': 'a' } })
  expect(seen.signal!.aborted).toBe(true)
})
