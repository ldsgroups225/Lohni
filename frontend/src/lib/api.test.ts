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
