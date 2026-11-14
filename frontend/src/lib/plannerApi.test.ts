// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { plannerDelete, plannerIngest, plannerList, plannerMaterials } from './api'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

test('les appels du planning envoient l’identifiant appareil de la révision', async () => {
  vi.stubGlobal('navigator', { ...navigator, locks: {} })
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await plannerIngest('Maths'); await plannerList(); await plannerDelete('1')
  const ids = fetchMock.mock.calls.map(([, init]: any) => new Headers(init.headers).get('X-Device-Id'))
  expect(ids).toHaveLength(3)
  expect(ids[0]).toMatch(/^[\da-f-]{36}$/)
  expect(new Set(ids).size).toBe(1)
})

test('les fiches demandent le type attendu par le serveur', async () => {
  vi.stubGlobal('navigator', { ...navigator, locks: {} })
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, materials: 'x' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await plannerMaterials('1', 'flashcards')
  expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ type: 'flashcards' })
})
