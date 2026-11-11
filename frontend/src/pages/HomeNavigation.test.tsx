// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({ home: vi.fn(), chapters: vi.fn(async () => []), progress: vi.fn(async () => null) }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionDeviceId: () => 'device' }))
vi.mock('../components/Revision/Onboarding', () => ({ default: () => <p>Onboarding</p> }))
import Home from './Home'
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
