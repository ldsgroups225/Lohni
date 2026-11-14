import { required } from './test/required'
// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import App from './App'
import { useSecondaryScreen } from './components/Sidebar'

vi.mock('./components/Companion/CompanionProvider', () => ({ CompanionProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('./components/Companion/CompanionDock', () => ({ default: () => null }))
vi.mock('@cognicatch/react', () => ({ AdaptiveToastProvider: () => null }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Detail() { const [open, setOpen] = useState(false); useSecondaryScreen(open); return <button type="button" onClick={() => setOpen(!open)}>Chapitre</button> }

test('les changements d’onglet et le retour conservent le conteneur sans fondu global', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const router = createMemoryRouter([{ element: <App />, children: [
    { path: '/', element: <h1>Accueil</h1> },
    { path: '/tutor', element: <h1>Tuteur</h1> },
    { path: '/me', element: <h1>Moi</h1> },
  ] }])
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    const shell = required(host.querySelector('h1')).parentElement
    for (const path of ['/tutor', '/me', '/']) {
      await act(async () => (host.querySelector(`a[href="${path}"]`) as HTMLElement).click())
      expect(required(host.querySelector('h1')).parentElement).toBe(shell)
      expect(required(shell).classList.contains('motion-route')).toBe(false)
    }
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); vi.restoreAllMocks() }
})

test('la barre du bas se cache sur téléphone hors des quatre onglets', async () => {
  const router = createMemoryRouter([{ element: <App />, children: [
    { path: '/', element: <h1>Accueil</h1> },
    { path: '/me/examens', element: <h1>Examens</h1> },
    { path: '/import', element: <h1>Ajouter un cours</h1> },
  ] }])
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const nav = () => required(host.querySelector('nav[aria-label="Navigation principale"]'))
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(nav().classList.contains('max-md:hidden')).toBe(false)
    for (const path of ['/me/examens', '/import']) {
      await act(async () => { await router.navigate(path) })
      expect(nav().classList.contains('max-md:hidden')).toBe(true)
    }
    await act(async () => { await router.navigate('/') })
    expect(nav().classList.contains('max-md:hidden')).toBe(false)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('un écran secondaire sans adresse propre cache aussi la barre, qui revient à sa fermeture', async () => {
  const router = createMemoryRouter([{ element: <App />, children: [{ path: '/courses', element: <Detail /> }] }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const hidden = () => required(host.querySelector('nav[aria-label="Navigation principale"]')).classList.contains('max-md:hidden')
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(hidden()).toBe(false)
    await act(async () => required(host.querySelector<HTMLButtonElement>('main button, button')).click())
    expect(hidden()).toBe(true)
    await act(async () => required(host.querySelector<HTMLButtonElement>('main button, button')).click())
    expect(hidden()).toBe(false)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})
