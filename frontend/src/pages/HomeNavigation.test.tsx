import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({ home: vi.fn(), plan: vi.fn(async () => ({ plan: { today: '2026-11-09', exams: [], days: [] }, offline: false })), exams: vi.fn(async () => []), chapters: vi.fn(async () => []), progress: vi.fn(async (): Promise<unknown> => null), profile: vi.fn(), saveProfile: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionDeviceId: () => 'device' }))
vi.mock('../components/Revision/Onboarding', () => ({ default: () => <p>Onboarding</p> }))
import Home from './Home'
import Profile from './Profile'
import { invalidateRevisionCache, rememberRevisionSnapshot } from '../lib/cachedDevice'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le retour apres onboarding attend le profil au lieu de montrer onboarding', async () => {
  api.home.mockResolvedValueOnce(null)
  let resolve!: (value: unknown) => void
  api.home.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Home /> }, { path: '/revision', element: <p>Revision</p> }], { initialEntries: ['/'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Onboarding')
    await act(async () => { await router.navigate('/revision') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).not.toContain('Onboarding')
    await act(async () => resolve({ profile: { schoolClass: '3e' }, state: 'empty', cardCount: 0, daysUntilExam: null }))
    expect(host.textContent).toContain('Salut')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('un autre appareil ne voit pas l’accueil en cache', async () => {
  localStorage.setItem('lohni-device-id', 'appareil-a')
  api.home.mockResolvedValueOnce({ profile: { schoolClass: '3e' }, state: 'empty', cardCount: 0, totalCards: 0, daysUntilExam: null })
  api.progress.mockResolvedValue(null)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Home /> }, { path: '/other', element: <p>Autre</p> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Salut')
    await act(async () => { await router.navigate('/other') })
    localStorage.setItem('lohni-device-id', 'appareil-b')
    api.home.mockReturnValueOnce(new Promise(() => {}))
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).not.toContain('Salut')
    expect(host.textContent).toContain('Session du jour')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('après modification du profil une erreur réseau ne réaffiche pas l’ancien profil en cache', async () => {
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
  localStorage.setItem('lohni-device-id', 'appareil-profil')
  const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
  api.home.mockResolvedValueOnce({ profile, state: 'empty', cardCount: 0, totalCards: 0, daysUntilExam: null }).mockRejectedValueOnce(new Error('Réseau indisponible'))
  api.profile.mockResolvedValue(profile)
  api.saveProfile.mockImplementation(async value => { invalidateRevisionCache(); rememberRevisionSnapshot('/profile', value); return value })
  api.progress.mockResolvedValue({ xp: 10, streak: 1, learnedCards: 0, subjects: [] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Home /> }, { path: '/me', element: <Profile /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate('/me') })
    const select = required(host.querySelector('select'))
    await act(async () => { select.value = '5e'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).not.toContain('3ᵉ')
    expect(host.textContent).toContain('5ᵉ')
    expect(host.textContent).toContain('La mise à jour de ton accueil est temporairement indisponible.')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('une réponse tardive ne montre pas l’accueil du précédent appareil', async () => {
  localStorage.setItem('lohni-device-id', 'appareil-ancien')
  let resolve!: (value: unknown) => void
  api.home.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Home /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    localStorage.setItem('lohni-device-id', 'appareil-nouveau')
    await act(async () => resolve({ profile: { schoolClass: '3e' }, state: 'empty', cardCount: 0, totalCards: 0, daysUntilExam: null }))
    expect(host.textContent).not.toContain('Salut')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('au premier chargement, l’accueil montre sa structure sans écran de chargement ni faux parcours', async () => {
  localStorage.setItem('lohni-device-id', 'premier-accueil')
  api.home.mockReturnValueOnce(new Promise(() => {}))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Home /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Session du jour')
    expect(host.textContent).not.toContain('On prépare ta journée')
    expect(host.textContent).not.toContain('Onboarding')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('un chargement lent est signalé sans écran plein', async () => {
  localStorage.setItem('lohni-device-id', 'accueil-lent')
  api.home.mockReturnValueOnce(new Promise(() => {}))
  vi.useFakeTimers()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Home /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.querySelector('[role="status"]')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(700) })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('On prépare ta journée…')
    expect(host.textContent).toContain('Session du jour')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id'); vi.useRealTimers() }
})

test('un accueil local du jour reste visible pendant la mise à jour', async () => {
  localStorage.setItem('lohni-device-id', 'accueil-local')
  invalidateRevisionCache()
  rememberRevisionSnapshot('/home', { profile: { schoolClass: '3e', subjects: [] }, state: 'ready', cardCount: 2, totalCards: 2, estimatedMinutes: 1, daysUntilExam: null })
  api.home.mockReturnValueOnce(new Promise(() => {}))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Home /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('2 cartes')
    expect(host.textContent).not.toContain('Onboarding')
  } finally { act(() => root.unmount()); host.remove(); router.dispose(); localStorage.removeItem('lohni-device-id'); invalidateRevisionCache() }
})
