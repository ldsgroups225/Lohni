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

test('deux écrans partageant une lecture de profil attendent une seule requête', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const first = api.revisionAPI.profile()
  const second = api.revisionAPI.profile()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  finish(new Response(JSON.stringify({ ok: true, data: { schoolClass: '3e', subjects: ['Mathématiques'] } }), { headers: { 'Content-Type': 'application/json' } }))
  expect(await Promise.all([first, second])).toEqual([
    { schoolClass: '3e', subjects: ['Mathématiques'] }, { schoolClass: '3e', subjects: ['Mathématiques'] },
  ])
})

test('une lecture tardive du profil ne copie pas les données sur un autre appareil', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const result = api.revisionAPI.profile()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  entries.set('lohni-device-id', '22222222-2222-4222-8222-222222222222')
  finish(new Response(JSON.stringify({ ok: true, data: { schoolClass: '3e', subjects: ['Mathématiques'] } }), { headers: { 'Content-Type': 'application/json' } }))
  await expect(result).rejects.toThrow('Les données ont changé')
  expect(entries.get('lohni-revision-offline:22222222-2222-4222-8222-222222222222')).not.toContain('Mathématiques')
})

test('une lecture antérieure à un enregistrement ne remplace pas le profil enregistré', async () => {
  let finish!: (response: Response) => void
  const updated = { schoolClass: '5e', subjects: ['Français'] }
  let reads = 0
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => init.method === 'PUT' || ++reads > 1
    ? Promise.resolve(new Response(JSON.stringify({ ok: true, data: updated }), { headers: { 'Content-Type': 'application/json' } }))
    : new Promise<Response>(resolve => { finish = resolve })))
  const oldRead = api.revisionAPI.profile()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  await api.revisionAPI.saveProfile(updated)
  finish(new Response(JSON.stringify({ ok: true, data: { schoolClass: '3e', subjects: ['Mathématiques'] } }), { headers: { 'Content-Type': 'application/json' } }))
  await expect(oldRead).resolves.toEqual(updated)
  expect(JSON.parse(entries.get(offlineKey)!).cache['/profile']).toEqual(updated)
})

test('une synchronisation tardive ne déplace pas la file vers un autre appareil', async () => {
  queueTwoAnswers()
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const syncing = api.syncRevisionAnswers()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const otherKey = 'lohni-revision-offline:22222222-2222-4222-8222-222222222222'
  entries.set('lohni-device-id', '22222222-2222-4222-8222-222222222222')
  finish(new Response(JSON.stringify({ ok: true, data: { id: 'old', cards: [], position: 1 } }), { headers: { 'Content-Type': 'application/json' } }))
  await syncing
  expect(JSON.parse(entries.get(offlineKey)!).pending).toHaveLength(2)
  expect(entries.get(otherKey)).toBeUndefined()
})

test('au démarrage les données locales du jour sont immédiatement disponibles et la lecture est partagée', async () => {
  const day = new Date(); const date = [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-')
  const home = { profile: { schoolClass: '3e', subjects: [] }, state: 'ready', cardCount: 2 }
  entries.set(offlineKey, JSON.stringify({ pending: [], cache: { '/home': home }, cacheDates: { '/home': date } }))
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  api.prepareRevisionStartup()
  const { revisionSnapshot } = await import('./cachedDevice')
  expect(revisionSnapshot('/home')).toEqual(home)
  void api.revisionAPI.home()
  void api.revisionAPI.home()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
})

test('le démarrage ignore les données quotidiennes anciennes et celles d’un autre appareil', async () => {
  const { invalidateRevisionCache, revisionSnapshot } = await import('./cachedDevice')
  invalidateRevisionCache()
  entries.set(offlineKey, JSON.stringify({ pending: [], cache: { '/home': { state: 'done' } }, cacheDates: { '/home': '2000-01-01' } }))
  api.prepareRevisionStartup()
  expect(revisionSnapshot('/home')).toBeUndefined()
  entries.set('lohni-device-id', '22222222-2222-4222-8222-222222222222')
  api.prepareRevisionStartup()
  expect(revisionSnapshot('/home')).toBeUndefined()
})

test('le démarrage et les lectures partagent la synchronisation des réponses', async () => {
  queueTwoAnswers()
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  api.prepareRevisionStartup()
  void api.revisionAPI.home().catch(() => {})
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/session/answer')
  finish(new Response(JSON.stringify({ error: 'Réessaie' }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
  await vi.waitFor(() => expect(api.revisionSyncStatus().pending).toBe(2))
})

test('un contexte non sécurisé affiche le message HTTPS avant toute requête', async () => {
  entries.clear()
  vi.stubGlobal('crypto', {})
  expect(api.revisionSyncStatus()).toMatchObject({ error: expect.stringContaining('HTTPS') })
  await expect(api.revisionAPI.profile()).rejects.toThrow('Ouvre Lohni en HTTPS dans un navigateur à jour pour sauvegarder tes réponses hors ligne.')
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
