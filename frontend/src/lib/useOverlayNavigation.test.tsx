// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { useOverlayNavigation } from './useOverlayNavigation'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function Page() {
  const [open, setOpen] = useOverlayNavigation('menu')
  return <><p>Révision</p><button onClick={() => setOpen(!open)}>Menu</button>{open && <p>Options</p>}</>
}
test('retour et fermeture du menu conservent la page sans entrée orpheline', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <p>Accueil</p> }, { path: '/revision', element: <Page /> }], { initialEntries: ['/', '/revision'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector('button')!.click())
    expect(host.textContent).toContain('Options')
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Révision'); expect(host.textContent).not.toContain('Options')
    await act(async () => host.querySelector('button')!.click())
    await act(async () => host.querySelector('button')!.click())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Accueil')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('une surcouche issue du chargement ne se rouvre pas et retourne a la page precedente', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/revision', element: <Page /> }], { initialEntries: ['/revision', { pathname: '/revision', state: { overlay: 'menu' } }] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).not.toContain('Options')
    expect(router.state.location.state?.overlay).toBeUndefined()
    await act(async () => host.querySelector('button')!.click())
    expect(host.textContent).toContain('Options')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('la fermeture par retour ou par bouton appelle le meme rappel une fois', async () => {
  const closed = vi.fn()
  function Screen() {
    const [open, setOpen] = useOverlayNavigation('menu', closed)
    return <button onClick={() => setOpen(!open)}>{open ? 'Fermer' : 'Ouvrir'}</button>
  }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Screen /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector('button')!.click())
    await act(async () => { await router.navigate(-1) })
    expect(closed).toHaveBeenCalledTimes(1)
    await act(async () => host.querySelector('button')!.click())
    await act(async () => host.querySelector('button')!.click())
    expect(closed).toHaveBeenCalledTimes(2)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('retour vers chat avec une ancienne surcouche reste sur chat', async () => {
  function Chat() {
    const [open, setOpen] = useOverlayNavigation('companion')
    return <><p>Chat</p><button onClick={() => setOpen(true)}>Assistant</button>{open && <p>Assistant ouvert</p>}</>
  }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <p>Accueil</p> }, { path: '/chat', element: <Chat /> }, { path: '/revision', element: <p>Révision</p> }], { initialEntries: ['/', '/chat'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector('button')!.click())
    await act(async () => { await router.navigate('/revision') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Chat')
    expect(host.textContent).not.toContain('Assistant ouvert')
    expect(router.state.location.state?.overlay).toBeUndefined()
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Accueil')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('une surcouche du shell ne se rouvre pas au retour depuis une autre page', async () => {
  function Shell() {
    const [open, setOpen] = useOverlayNavigation('companion')
    return <><button onClick={() => setOpen(true)}>Assistant</button>{open && <p>Assistant ouvert</p>}<Outlet /></>
  }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Shell />, children: [{ path: 'tutor', element: <p>Tuteur</p> }, { path: 'chat', element: <p>Chat</p> }, { path: 'revision', element: <p>Révision</p> }] }], { initialEntries: ['/tutor', '/chat'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector('button')!.click())
    await act(async () => { await router.navigate('/revision') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Chat')
    expect(host.textContent).not.toContain('Assistant ouvert')
    expect(router.state.location.state?.overlay).toBeUndefined()
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Tuteur')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})
