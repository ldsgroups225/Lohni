import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'

const entries = new Map<string, string>()
const deviceId = '11111111-1111-4111-8111-111111111111'
const offlineKey = `lohni-revision-offline:${deviceId}`
let api: typeof import('./api')

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  })
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setInterval: vi.fn() }))
  vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name: string, save: () => void) => save() } })
  api = await import('./api')
})
beforeEach(() => {
  entries.clear()
  entries.set('lohni-device-id', deviceId)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { schoolClass: '3e', subjects: ['Mathématiques'] } }), {
    headers: { 'Content-Type': 'application/json' },
  })))
})
afterAll(() => vi.unstubAllGlobals())

test('un cache local corrompu est jeté et ne bloque pas les appels de révision', async () => {
  entries.set(offlineKey, '{cassé')
  expect(api.revisionSyncStatus().pending).toBe(0)
  expect(entries.has(offlineKey)).toBe(false)
  await expect(api.revisionAPI.profile()).resolves.toEqual({ schoolClass: '3e', subjects: ['Mathématiques'] })
  expect(JSON.parse(entries.get(offlineKey)!)).toMatchObject({ pending: [], cache: { '/profile': { schoolClass: '3e' } } })
})

function queueTwoAnswers() {
  entries.set(offlineKey, JSON.stringify({ cache: {}, pending: [
    { localDate: '2026-11-07', answer: { answerId: 'expired', sessionId: 'old', cardId: 'old-card', position: 0, knew: true, durationMs: 1000 } },
    { localDate: '2026-11-09', answer: { answerId: 'next', sessionId: 'current', cardId: 'current-card', position: 0, knew: true, durationMs: 1000 } },
  ] }))
}

test('une réponse refusée pour date est retirée sans bloquer la suivante ni les mutations', async () => {
  queueTwoAnswers()
  const replayed: string[] = []
  const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const answer = JSON.parse(init.body as string)
    if (url.endsWith('/session/answer')) {
      replayed.push(answer.answerId)
      if (answer.answerId === 'expired') return new Response(JSON.stringify({
        ok: false, error: 'Date locale trop éloignée.', code: 'REVISION_LOCAL_DATE_OUT_OF_RANGE',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true, data: {
        id: 'current', localDate: '2026-11-09', cards: [], position: 1, complete: true,
        repeated: [], elapsedMs: 1000, earnedXP: 60,
      } }), { headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ ok: true, data: profile }), { headers: { 'Content-Type': 'application/json' } })
  }))

  await api.syncRevisionAnswers()
  expect(replayed).toEqual(['expired', 'next'])
  expect(api.revisionSyncStatus()).toMatchObject({ pending: 0, error: '' })
  await expect(api.revisionAPI.saveProfile(profile)).resolves.toEqual(profile)
})

test.each([
  { status: 400, code: undefined },
  { status: 400, code: 'OTHER_ERROR' },
  { status: 500, code: 'REVISION_LOCAL_DATE_OUT_OF_RANGE' },
])('une autre erreur HTTP conserve la file et arrête le rejeu : %j', async ({ status, code }) => {
  queueTwoAnswers()
  const replayed: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    replayed.push(JSON.parse(init.body as string).answerId)
    return new Response(JSON.stringify({ ok: false, error: 'Réessaie plus tard.', code }), {
      status, headers: { 'Content-Type': 'application/json' },
    })
  }))

  await api.syncRevisionAnswers()
  expect(replayed).toEqual(['expired'])
  expect(api.revisionSyncStatus()).toMatchObject({ pending: 2, error: 'Réessaie plus tard.' })
})

test('une erreur réseau conserve les réponses pour un nouvel essai', async () => {
  queueTwoAnswers()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  await api.syncRevisionAnswers()
  expect(api.revisionSyncStatus()).toMatchObject({ pending: 2, error: expect.stringContaining('Connexion impossible') })
})
