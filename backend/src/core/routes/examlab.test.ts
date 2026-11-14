import { expect, test, vi } from 'vitest'
import { examRoutes } from './examlab'
import { handleExam } from '../../services/examlab/generate'

vi.mock('../../services/examlab/generate', () => ({ handleExam: vi.fn() }))

const item = (id: number, question: string) => ({ id, question, options: ['A) a', 'B) b', 'C) c', 'D) d'], correct: 1, hint: 'Indice', explanation: 'Explication' })

function harness() {
  const routes: Record<string, any> = {}
  const app = { ws: (p: string, h: any) => { routes[`WS ${p}`] = h }, post: (p: string, h: any) => { routes[`POST ${p}`] = h }, get: (p: string, h: any) => { routes[`GET ${p}`] = h }, delete: (p: string, h: any) => { routes[`DELETE ${p}`] = h } }
  examRoutes(app)
  return routes
}

test('l’examen généré avant l’ouverture du flux arrive quand même à l’écran, questions numérotées en continu', async () => {
  vi.mocked(handleExam).mockResolvedValue({ examId: 'bepc', name: 'BEPC blanc', sections: [
    { id: 'maths', title: 'Maths', durationSec: 60, items: [item(1, 'Maths 1'), item(2, 'Maths 2')] },
    { id: 'svt', title: 'SVT', durationSec: 60, items: [item(1, 'SVT 1')] },
  ] })
  const routes = harness()
  let started: any
  await routes['POST /exam']({ body: { examId: 'bepc' } }, { status: () => ({ send: (b: any) => { started = b } }) })
  await new Promise(r => setTimeout(r, 10))

  const sent: any[] = []
  const ws = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)), on: () => {}, close: vi.fn() }
  routes['WS /ws/exams'](ws, { url: `/ws/exams?runId=${started.runId}` })
  await vi.waitFor(() => expect(sent.map(m => m.type)).toContain('done'))

  const exam = sent.find(m => m.type === 'exam')
  expect(exam.payload.map((q: any) => [q.id, q.question])).toEqual([[1, 'Maths 1'], [2, 'Maths 2'], [3, 'SVT 1']])
})

test('un échec de génération est annoncé en français', async () => {
  vi.mocked(handleExam).mockRejectedValue(new Error('boom'))
  const routes = harness()
  let started: any
  await routes['POST /exam']({ body: { examId: 'bepc' } }, { status: () => ({ send: (b: any) => { started = b } }) })
  const sent: any[] = []
  routes['WS /ws/exams']({ readyState: 1, send: (m: string) => sent.push(JSON.parse(m)), on: () => {}, close: vi.fn() }, { url: `/ws/exams?runId=${started.runId}` })
  await vi.waitFor(() => expect(sent.some(m => m.type === 'error')).toBe(true))
  expect(sent.find(m => m.type === 'error').error).toMatch(/examen/)
})

test('annuler un examen interrompt la génération en cours', async () => {
  vi.mocked(handleExam).mockImplementation((_id, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('annulé')))
  }))
  const routes = harness()
  let started: any
  await routes['POST /exam']({ body: { examId: 'bepc' } }, { status: () => ({ send: (body: any) => { started = body } }) })
  routes['DELETE /exam/:id']({ params: { id: started.runId } }, { send: () => {} })
  expect(vi.mocked(handleExam).mock.lastCall?.[1]?.aborted).toBe(true)
})

test('annuler un examen est réservé à l’appareil qui l’a lancé', async () => {
  let signal: AbortSignal | undefined
  vi.mocked(handleExam).mockImplementation((async (_id: string, provided?: AbortSignal) => { signal = provided; return new Promise(() => {}) }) as never)
  const routes = harness()
  let started: any
  await routes['POST /exam']({ headers: { 'x-device-id': 'appareil-a' }, body: { examId: 'bepc' } }, { status: () => ({ send: (b: any) => { started = b } }) })
  const refused = { status: vi.fn().mockReturnThis(), send: vi.fn() }
  routes['DELETE /exam/:id']({ headers: { 'x-device-id': 'appareil-b' }, params: { id: started.runId } }, refused)
  expect(refused.status).toHaveBeenCalledWith(403)
  expect(refused.send).toHaveBeenCalledWith({ ok: false, error: 'Cet examen appartient à un autre appareil.' })
  expect(signal?.aborted).toBe(false)
  const accepted = { status: vi.fn().mockReturnThis(), send: vi.fn() }
  routes['DELETE /exam/:id']({ headers: { 'x-device-id': 'appareil-a' }, params: { id: started.runId } }, accepted)
  expect(accepted.send).toHaveBeenCalledWith({ ok: true })
  expect(signal?.aborted).toBe(true)
})
