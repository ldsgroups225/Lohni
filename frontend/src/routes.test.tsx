// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { routes } from './routes'

vi.mock('./pages/Home', () => ({ default: () => <p>Accueil test</p> }))
vi.mock('./pages/Courses', () => ({ default: () => <p>Cours test</p> }))
vi.mock('./components/Sidebar', () => ({ default: () => null }))
vi.mock('./components/Companion/CompanionProvider', () => ({ CompanionProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('./components/Companion/CompanionDock', () => ({ default: () => null }))
vi.mock('@cognicatch/react', () => ({ AdaptiveToastProvider: () => null }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('la navigation remet en haut et le retour restaure la position, même après la redirection des cartes', async () => {
  let scrollY = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((_x, y) => { scrollY = y as number })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Accueil test')
    scrollY = 420
    await act(async () => { await router.navigate('/cards') })
    expect(host.textContent).toContain('Cours test')
    expect(router.state.location.pathname).toBe('/courses')
    expect(scrollY).toBe(0)
    scrollY = 180
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Accueil test')
    expect(scrollY).toBe(420)
  } finally {
    act(() => root.unmount())
    router.dispose()
    host.remove()
    scrollTo.mockRestore()
  }
})
