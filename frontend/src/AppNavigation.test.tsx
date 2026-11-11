import { required } from './test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import App from './App'

vi.mock('./components/Companion/CompanionProvider', () => ({ CompanionProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('./components/Companion/CompanionDock', () => ({ default: () => null }))
vi.mock('@cognicatch/react', () => ({ AdaptiveToastProvider: () => null }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
