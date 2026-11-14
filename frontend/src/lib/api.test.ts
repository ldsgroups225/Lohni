import { required } from '../test/required'
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
  expect(JSON.parse(required(entries.get(offlineKey)))).toMatchObject({ pending: [], cache: { '/profile': { schoolClass: '3e' } } })
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
  expect(JSON.parse(required(entries.get(offlineKey))).cache['/profile']).toEqual(updated)
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
  expect(JSON.parse(required(entries.get(offlineKey))).pending).toHaveLength(2)
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

test('hors ligne, le compte à rebours utilise les examens en cache et ignore les examens passés', async () => {
  const { invalidateRevisionCache } = await import('./cachedDevice'); invalidateRevisionCache()
  const today = new Date(); const day = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
  const future = new Date(`${day}T00:00:00Z`); future.setUTCDate(future.getUTCDate() + 3)
  const past = new Date(`${day}T00:00:00Z`); past.setUTCDate(past.getUTCDate() - 1)
  const profile = { schoolClass: '3e', subjects: ['Mathématiques'], examDate: '2099-01-01' }
  entries.set(offlineKey, JSON.stringify({ pending: [], cache: { '/profile': profile, '/exams': [
    { id: 'past', title: 'Ancien', date: past.toISOString().slice(0, 10), subjects: ['Mathématiques'], chapterIds: [] },
    { id: 'next', title: 'Brevet', date: future.toISOString().slice(0, 10), subjects: ['Mathématiques'], chapterIds: [] },
  ] }, session: { id: 's', localDate: day, cards: [], position: 0, complete: true } }))
  vi.stubGlobal('navigator', { onLine: false, locks: { request: async (_name: string, save: () => void) => save() } })
  expect(await api.revisionAPI.home()).toMatchObject({ nextExam: { id: 'next', title: 'Brevet' }, daysUntilExam: 3 })
  vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name: string, save: () => void) => save() } })
})

test('le plan distingue une réponse en ligne d’une copie de secours', async () => {
  const plan = { today: '2026-11-09', exams: [], days: [] }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: plan }), { headers: { 'Content-Type': 'application/json' } })))
  expect(await api.revisionAPI.plan()).toEqual({ plan, offline: false })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  expect(await api.revisionAPI.plan()).toEqual({ plan, offline: true })
})

test('le dernier plan reste disponible hors ligne sans modifier la file de réponses', async () => {
  const plan = { today: '2026-11-09', exams: [], days: [] }
  entries.set(offlineKey, JSON.stringify({ pending: [{ localDate: '2026-11-09', answer: { answerId: 'en-attente' } }], cache: { '/plan': plan }, cacheDates: { '/plan': '2026-11-09' } }))
  vi.stubGlobal('navigator', { onLine: false, locks: { request: async (_name: string, save: () => void) => save() } })
  try {
    await expect(api.revisionAPI.plan()).resolves.toEqual({ plan, offline: true })
    expect(JSON.parse(required(entries.get(offlineKey))).pending).toHaveLength(1)
  } finally { vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name: string, save: () => void) => save() } }) }
})

test('les réponses d’examen préservent les positions de la séance quotidienne en cache', async () => {
  vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name: string, save: () => void) => save() } })
  const date = new Date()
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const daily = { id: 'daily', localDate, cards: [{ id: 'card' }, { id: 'other' }], position: 0, complete: false, repeated: [], elapsedMs: 0, earnedXP: 0 }
  entries.set(offlineKey, JSON.stringify({ session: daily, pending: [], cache: {} }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { ...daily, id: 'exam' } }), { headers: { 'Content-Type': 'application/json' } })))
  await api.revisionAPI.examAnswer({ sessionId: 'exam', cardId: 'card', position: 0, knew: true, durationMs: 1 })
  const saved = JSON.parse(required(entries.get(offlineKey)))
  expect(saved.pending).toEqual([])
  expect(saved.session.id).toBe('daily')
  expect(saved.session.cards.map((card: { id: string }) => card.id)).toEqual(['card', 'other'])
})

test('plusieurs réponses en attente sont synchronisées dans l’ordre', async () => {
  queueTwoAnswers()
  const replayed: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    replayed.push(JSON.parse(init.body as string).answerId)
    return new Response(JSON.stringify({ ok: true, data: { id: 'current', position: 1 } }), { headers: { 'Content-Type': 'application/json' } })
  }))
  await api.syncRevisionAnswers()
  expect(replayed).toEqual(['expired', 'next'])
  expect(api.revisionSyncStatus().pending).toBe(0)
})

test('hors ligne, l’accueil recalcule les nouvelles cartes et les répétitions de la séance', async () => {
  const date = [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0'), String(new Date().getDate()).padStart(2, '0')].join('-')
  const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
  const cards = [{ id: 'a', reviews: 0 }, { id: 'b', reviews: 0 }, { id: 'a', reviews: 0 }]
  entries.set(offlineKey, JSON.stringify({ session: { id: 's', localDate: date, cards, position: 1, repeated: ['a'], complete: false }, pending: [], cache: { '/profile': profile, '/home': { profile, cardCount: 3, newCards: 3, reviewCards: 0 } }, cacheDates: { '/home': date } }))
  vi.stubGlobal('navigator', { onLine: false, locks: { request: async (_name: string, save: () => void) => save() } })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  expect(await api.revisionAPI.home()).toMatchObject({ cardCount: 2, newCards: 1, reviewCards: 1 })
  vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_name: string, save: () => void) => save() } })
})

test('podcastStart en erreur serveur lève une APIError avec le message du serveur', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Sujet trop court.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })))
  await expect(api.podcastStart({ topic: 'x' })).rejects.toMatchObject({ name: 'Error', status: 400, message: 'Sujet trop court.' })
  await expect(api.podcastStart({ topic: 'x' })).rejects.toBeInstanceOf(api.APIError)
})

test('un appel qui dépasse le délai échoue avec un message français', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })))
  const pending = expect(api.podcastStart({ topic: 'x' })).rejects.toMatchObject({ code: 'TIMEOUT', message: expect.stringContaining('trop de temps') })
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  await pending
  vi.useRealTimers()
})

test('examen et podcast portent l’en-tête d’appareil', async () => {
  const seen: Array<string | null> = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    seen.push(new Headers(init.headers).get('X-Device-Id'))
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }))
  await api.startExam('e1'); await api.cancelExam('r1'); await api.podcastStart({ topic: 'x' }); await api.podcastCancel('p1')
  expect(seen).toEqual([deviceId, deviceId, deviceId, deviceId])

const json = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { headers: { 'Content-Type': 'application/json' } })

test('un chemin invalidé garde sa dernière valeur mais devient périmé jusqu’à la prochaine lecture', async () => {
  const { invalidateRevisionCache, revisionSnapshot, revisionSnapshotStale } = await import('./cachedDevice')
  invalidateRevisionCache()
  const chapters = [{ id: 'c', title: 'Les suites' }]
  vi.stubGlobal('fetch', vi.fn(async () => json(chapters)))
  await api.revisionAPI.chapters()
  expect(revisionSnapshot('/chapters')).toEqual(chapters)
  expect(revisionSnapshotStale('/chapters')).toBe(false)
  invalidateRevisionCache('/chapters')
  expect(revisionSnapshot('/chapters')).toEqual(chapters)
  expect(revisionSnapshotStale('/chapters')).toBe(true)
  await api.revisionAPI.chapters()
  expect(revisionSnapshotStale('/chapters')).toBe(false)
  invalidateRevisionCache()
  expect(revisionSnapshot('/chapters')).toBeUndefined()
})

test('une lecture en vol pendant une modification est relue au lieu de livrer l’ancienne valeur', async () => {
  const { invalidateRevisionCache, revisionSnapshot } = await import('./cachedDevice')
  invalidateRevisionCache()
  let finish!: (response: Response) => void
  let reads = 0
  vi.stubGlobal('fetch', vi.fn(() => ++reads === 1 ? new Promise<Response>(resolve => { finish = resolve }) : Promise.resolve(json([{ id: 'nouveau' }]))))
  const read = api.revisionAPI.chapters()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  invalidateRevisionCache('/chapters')
  finish(json([{ id: 'ancien' }]))
  await expect(read).resolves.toEqual([{ id: 'nouveau' }])
  expect(revisionSnapshot('/chapters')).toEqual([{ id: 'nouveau' }])
})

test('la séance lue est disponible tout de suite au retour sur l’écran', async () => {
  const { invalidateRevisionCache, revisionSnapshot } = await import('./cachedDevice')
  invalidateRevisionCache()
  const session = { id: 's', localDate: '2026-11-09', cards: [], position: 0, complete: false }
  vi.stubGlobal('fetch', vi.fn(async () => json(session)))
  await api.revisionAPI.session()
  expect(revisionSnapshot('/session')).toMatchObject({ id: 's' })
})

test('le quota d’import est partagé puis périmé par un import', async () => {
  const { invalidateRevisionCache, revisionSnapshot, revisionSnapshotStale } = await import('./cachedDevice')
  invalidateRevisionCache()
  const quota = { remaining: 2, resetsAt: '2026-11-10T00:00:00Z' }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.endsWith('/import') ? { id: 'c', title: 'T', summary: '', origin: 'import' } : quota)))
  await api.revisionAPI.importQuota()
  expect(revisionSnapshot('/import/quota')).toEqual(quota)
  await api.revisionAPI.importChapter({ title: 'T', subject: 'Mathématiques', text: 'x' })
  expect(revisionSnapshotStale('/import/quota')).toBe(true)
})

test('enregistrer le profil garde l’accueil et la progression affichables avec le nouveau profil', async () => {
  const { invalidateRevisionCache, rememberRevisionSnapshot, revisionSnapshot } = await import('./cachedDevice')
  invalidateRevisionCache()
  const updated = { schoolClass: '5e', subjects: ['Mathématiques'] }
  rememberRevisionSnapshot('/home', { profile: { schoolClass: '3e', subjects: [] }, state: 'ready' })
  rememberRevisionSnapshot('/progress', { streak: 3 })
  rememberRevisionSnapshot('/chapters', [{ id: 'c' }])
  vi.stubGlobal('fetch', vi.fn(async () => json(updated)))
  await api.revisionAPI.saveProfile(updated as never)
  expect(revisionSnapshot('/home')).toMatchObject({ state: 'ready', profile: updated })
  expect(revisionSnapshot('/progress')).toEqual({ streak: 3 })
  expect(revisionSnapshot('/chapters')).toBeUndefined()
})

test('un instantané n’est visible que pour son appareil et son jour', async () => {
  const { invalidateRevisionCache, rememberRevisionSnapshot, revisionSnapshot } = await import('./cachedDevice')
  invalidateRevisionCache()
  rememberRevisionSnapshot('/chapters', [{ id: 'c' }])
  expect(revisionSnapshot('/chapters')).toEqual([{ id: 'c' }])
  entries.set('lohni-device-id', '22222222-2222-4222-8222-222222222222')
  expect(revisionSnapshot('/chapters')).toBeUndefined()
  entries.set('lohni-device-id', deviceId)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 86400000)
  try { expect(revisionSnapshot('/chapters')).toBeUndefined() } finally { vi.useRealTimers() }
})

test('un contexte non sécurisé affiche le message HTTPS avant toute requête', async () => {
  entries.clear()
  vi.stubGlobal('crypto', {})
  expect(api.revisionSyncStatus()).toMatchObject({ error: expect.stringContaining('HTTPS') })
  await expect(api.revisionAPI.profile()).rejects.toThrow('Ouvre Lohni en HTTPS dans un navigateur à jour pour sauvegarder tes réponses hors ligne.')
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})






