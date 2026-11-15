// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { plannerDelete, plannerIngest, plannerList, plannerMaterials, plannerWeekly } from './api'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

test('les appels du planning envoient l’identifiant appareil de la révision', async () => {
  vi.stubGlobal('navigator', { ...navigator, locks: {} })
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, tasks: [], task: { id: '1' } }), { status: 200, headers: { 'content-type': 'application/json' } }))
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

const stubJson = (body: unknown, type = 'application/json') => {
  vi.stubGlobal('navigator', { ...navigator, locks: {} })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': type } })))
}

test('le serveur envoie des dates ISO : le client les lit en millisecondes', async () => {
  stubJson({ ok: true, tasks: [{ id: '1', title: 'Maths', dueAt: '2026-11-18T12:00:00.000Z' }] })
  expect((await plannerList()).tasks[0].dueAt).toBe(Date.parse('2026-11-18T12:00:00.000Z'))
  stubJson({ ok: true, plan: { days: [{ date: '2026-11-18', slots: [{ id: 's', taskId: '1', start: '2026-11-18T08:00:00.000Z', end: '2026-11-18T08:25:00.000Z', kind: 'focus' }] }, { date: '2026-11-19' }] } })
  const { plan } = await plannerWeekly()
  expect(plan.days[0].slots[0].start).toBe(Date.parse('2026-11-18T08:00:00.000Z'))
  expect(plan.days[1].slots).toEqual([])
})

test.each([['sans liste', { ok: true }], ['page HTML', '<!doctype html>'], ['charge utile d’erreur', { ok: false, error: 'Le planning est indisponible.' }]])('une liste de tâches %s est un échec de chargement lisible', async (_n, body) => {
  stubJson(body, typeof body === 'string' ? 'text/html' : 'application/json')
  await expect(plannerList()).rejects.toThrow(/indisponible/)
})

test('un planning absent ou sans jours devient un planning vide', async () => {
  stubJson({ ok: true })
  expect((await plannerWeekly()).plan).toEqual({ days: [] })
})
