// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Revision from './Revision'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

vi.mock('../lib/api', () => ({
  revisionAPI: { profile: async () => ({ subjects: ['Mathématiques'] }), examSession: async () => ({ id: 'e', kind: 'express', complete: true, position: 0, cards: [], earnedXP: 0 }), progress: async () => ({ xp: 0, streak: 0 }) },
  revisionSyncStatus: () => ({ online: true, pending: 0 }), revisionPolicy: {}, syncRevisionAnswers: () => {}, chatJSON: () => {},
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) })
test('une révision express sans carte fragile affiche son message', async () => {
  const host = document.createElement('div'); const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Revision /> }], { initialEntries: ['/?exam=e'] })} />))
    expect(host.textContent).toContain('Rien de fragile à revoir pour cet examen. Bravo !')
  } finally { act(() => root.unmount()) }
})
