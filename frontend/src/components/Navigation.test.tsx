// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import Sidebar from './Sidebar'
import { ToolPage } from './ui/ToolPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })
function Screen() { const location = useLocation(); return <><span data-path>{location.pathname}</span><Sidebar /><ToolPage title="Outil">Contenu</ToolPage></> }
async function setup(entries: string[]) {
  const router = createMemoryRouter([{ path: '*', element: <Screen /> }], { initialEntries: entries.map((pathname, index) => index === 0 ? { pathname, key: 'default' } : pathname) })
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<RouterProvider router={router} />))
  const click = async (selector: string) => act(async () => (container.querySelector(selector) as HTMLElement).click())
  return { router, click }
}
test('le retour reprend l’écran précédent', async () => {
  const { router, click } = await setup(['/tutor', '/quiz'])
  await click('[aria-label="Retour"]')
  expect(router.state.location.pathname).toBe('/tutor')
})
test('le retour direct utilise le repli sans empiler', async () => {
  const { router, click } = await setup(['/quiz'])
  await click('[aria-label="Retour"]')
  expect(router.state.location.pathname).toBe('/courses')
  await act(async () => { await router.navigate(-1) })
  expect(router.state.location.pathname).toBe('/courses')
})
test('les changements d’onglet préservent Accueil et remplacent les autres', async () => {
  const { router, click } = await setup(['/'])
  await click('a[href="/courses"]'); await click('a[href="/tutor"]'); await click('a[href="/me"]')
  await act(async () => { await router.navigate(-1) })
  expect(router.state.location.pathname).toBe('/')
})
test('toucher l’onglet actif remonte en respectant le mouvement réduit', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  const { router, click } = await setup(['/courses'])
  await click('a[href="/courses"]')
  expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  expect(router.state.location.pathname).toBe('/courses')
})
