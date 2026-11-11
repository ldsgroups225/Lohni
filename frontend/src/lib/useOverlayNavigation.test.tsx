// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test } from 'vitest'
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
