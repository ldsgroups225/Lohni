// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Home from './Home'
import Profile from './Profile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le profil et la progression chargés à l’accueil sont réutilisés dans Moi pendant la revalidation', async () => {
  localStorage.setItem('lohni-device-id', 'partage-ecrans')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_: string, run: () => void) => run() } })
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
  const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/profile')) return new Promise<Response>(() => {})
    const data = url.endsWith('/home') ? { profile, state: 'empty', cardCount: 0, totalCards: 0, daysUntilExam: null } : url.endsWith('/progress') ? { xp: 10, streak: 1, learnedCards: 2, subjects: [] } : []
    return new Response(JSON.stringify({ ok: true, data }), { headers: { 'Content-Type': 'application/json' } })
  }))
  const router = createMemoryRouter([{ path: '/', element: <Home /> }, { path: '/me', element: <Profile /> }, { path: '/autre', element: <p>Autre</p> }])
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await vi.waitFor(() => expect(host.textContent).toContain('Salut'))
    await act(async () => { await router.navigate('/me') })
    expect(host.querySelector('select')?.value).toBe('3e')
    expect(host.querySelector('select')?.disabled).toBe(false)
    expect(host.textContent).not.toContain('On récupère ton parcours')
    await act(async () => { await router.navigate('/autre') })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 86400000)
    await act(async () => { await router.navigate('/me') })
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('Mon parcours')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals() }
})
