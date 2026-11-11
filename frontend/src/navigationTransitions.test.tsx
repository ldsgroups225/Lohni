// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Sidebar from './components/Sidebar'
import { BackButton } from './components/ui/BackButton'
import { navigationTransitions } from './navigationTransitions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le sens suit les écrans, pas les changements de search ou de state', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = navigationTransitions(createMemoryRouter([{ path: '*', element: <><Sidebar /><Link to="/quiz">Quiz</Link><BackButton fallback="/" /><Outlet /></> }], { initialEntries: ['/'] }))
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => (host.querySelector('a[href="/quiz"]') as HTMLElement).click())
    expect(document.documentElement.dataset.nav).toBe('push')
    await act(async () => { await router.navigate('?overlay=1', { state: { open: true } }) })
    expect(document.documentElement.dataset.nav).toBe('push')
    await act(async () => { await router.navigate(-1) })
    expect(document.documentElement.dataset.nav).toBe('push')
    await act(async () => (host.querySelector('[aria-label="Retour"]') as HTMLElement).click())
    expect(document.documentElement.dataset.nav).toBe('pop')
    await act(async () => (host.querySelector('a[href="/courses"]') as HTMLElement).click())
    expect(document.documentElement.dataset.nav).toBe('tab')
    await act(async () => { await router.navigate(-1) })
    expect(document.documentElement.dataset.nav).toBe('pop')
  } finally {
    act(() => root.unmount()); router.dispose(); host.remove(); delete document.documentElement.dataset.nav; vi.restoreAllMocks()
  }
})

test('les transitions natives sont demandées uniquement entre écrans et sans mouvement réduit', async () => {
  const start = vi.fn()
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
  let reduced = false
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
  const router = navigationTransitions(createMemoryRouter([{ path: '*', element: <p>Écran</p> }], { initialEntries: ['/'] }))
  const transitions: boolean[] = []
  const unsubscribe = router.subscribe((_state, options) => transitions.push(!!options.viewTransitionOpts))
  try {
    await router.navigate('/quiz')
    expect(transitions.at(-1)).toBe(true)
    await router.navigate('?menu=1')
    expect(transitions.at(-1)).toBe(false)
    reduced = true
    await router.navigate('/courses')
    expect(transitions.at(-1)).toBe(false)
    delete (document as Partial<Document>).startViewTransition
    reduced = false
    await router.navigate('/tutor')
    expect(transitions.at(-1)).toBe(false)
  } finally {
    unsubscribe(); router.dispose(); vi.unstubAllGlobals(); delete (document as Partial<Document>).startViewTransition; delete document.documentElement.dataset.nav
  }
})
