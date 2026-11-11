// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Sidebar from './components/Sidebar'
import { BackButton } from './components/ui/BackButton'
import { useOverlayNavigation } from './lib/useOverlayNavigation'
import { navigationTransitions } from './navigationTransitions'

function OverlayScreen() {
  const [open, setOpen] = useOverlayNavigation('menu')
  return <><button onClick={() => setOpen(!open)}>Menu</button>{open && <p>Options</p>}</>
}

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

test('ouvrir et fermer une surcouche ne lance aucune transition d’écran', async () => {
  const start = vi.fn()
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = navigationTransitions(createMemoryRouter([{ path: '/revision', element: <OverlayScreen /> }], { initialEntries: ['/revision'] }))
  const transitions: boolean[] = []
  const unsubscribe = router.subscribe((_state, options) => transitions.push(!!options.viewTransitionOpts))
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector('button')!.click())
    expect(host.textContent).toContain('Options')
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).not.toContain('Options')
    await act(async () => host.querySelector('button')!.click())
    await act(async () => host.querySelector('button')!.click())
    expect(transitions).toEqual([false, false, false, false])
    expect(start).not.toHaveBeenCalled()
  } finally {
    act(() => root.unmount()); unsubscribe(); router.dispose(); host.remove(); vi.unstubAllGlobals(); delete (document as Partial<Document>).startViewTransition
  }
})

test('le routeur declenche la transition native lors du changement de page', async () => {
  const start = vi.fn((callback: () => void) => {
    callback()
    return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} }
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = navigationTransitions(createMemoryRouter([{ path: '*', element: <Link to="/quiz">Quiz</Link> }]))
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector('a')!.click())
    expect(start).toHaveBeenCalledTimes(1)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); vi.unstubAllGlobals(); delete (document as Partial<Document>).startViewTransition }
})
