// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
vi.mock('../../lib/api', () => ({ companionAsk: vi.fn() }))
import { CompanionProvider, useCompanion } from './CompanionProvider'
import CompanionDock from './CompanionDock'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function Screen() {
  const { setDocument } = useCompanion()
  useEffect(() => { setDocument({ id: 'cours', title: 'Fractions' }) }, [setDocument])
  return <><p>Le cours</p><CompanionDock /></>
}
test('retour ferme l’assistant en gardant le cours ouvert', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/courses', element: <CompanionProvider><Screen /></CompanionProvider> }], { initialEntries: ['/courses'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Assistant de cours'))!.click())
    expect(host.querySelector('[role=dialog]')?.hasAttribute('inert')).toBe(false)
    await act(async () => { await router.navigate(-1) })
    expect(host.querySelector('[role=dialog]')?.hasAttribute('inert')).toBe(true)
    expect(host.textContent).toContain('Le cours')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})
