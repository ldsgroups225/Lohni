import { expect, test, vi } from 'vitest'
import { createDebateSession, getDebateSession, streamDebateAnalysis, streamDebateResponse, surrenderDebate } from './index'
import llm from '../../utils/llm/llm'

vi.mock('../../utils/llm/llm', () => ({ default: { call: vi.fn() } }))
vi.mock('../../utils/database/keyv', () => {
  const data = new Map()
  return { default: { get: async (key: string) => structuredClone(data.get(key)), set: async (key: string, value: unknown) => { data.set(key, structuredClone(value)) }, delete: async (key: string) => data.delete(key) } }
})

test.each(['« [ CONCEDE ] » Mes arguments sont épuisés.', '"[CONCEDE]" Mes arguments sont épuisés.'])('une concession encadrée de guillemets ou espaces met fin au débat', async response => {
  const session = await createDebateSession('Les téléphones', 'for')
  vi.mocked(llm.call).mockResolvedValueOnce(response as any)
  const events: Array<string | { type: "concede"; reason: string }> = []
  for await (const event of streamDebateResponse(session.id, 'Mon argument')) events.push(event)
  expect(events).toEqual([{ type: 'concede', reason: 'Mes arguments sont épuisés.' }])
  expect((await getDebateSession(session.id))?.status).toBe('ai_conceded')
})

test('le bilan demande une description française de l’abandon', async () => {
  const session = await createDebateSession('Les téléphones', 'for')
  await surrenderDebate(session.id)
  vi.mocked(llm.call).mockResolvedValueOnce(JSON.stringify({ winner: 'ai' }) as any)
  for await (const _ of streamDebateAnalysis(session.id)) { /* consume */ }
  const prompt = JSON.stringify(vi.mocked(llm.call).mock.lastCall)
  expect(prompt).toContain('L’élève a abandonné le débat')
  expect(prompt).toContain('sans traductions anglaises')
})
