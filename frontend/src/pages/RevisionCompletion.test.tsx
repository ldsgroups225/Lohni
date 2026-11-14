// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Revision from './Revision'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../lib/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

vi.mock('../lib/api', () => ({
  revisionAPI: {
    profile: async () => ({ subjects: ['Mathématiques'] }),
    session: async () => ({ id: '1', complete: true, position: 1, cards: [], earnedXP: 10 }),
    home: async () => { throw new Error('Impossible de charger les cartes restantes.') },
    progress: async () => ({ xp: 10, streak: 1 }),
    chapters: async () => [],
  },
  revisionSyncStatus: () => ({ online: true, pending: 0 }),
  revisionPolicy: {}, syncRevisionAnswers: () => {}, chatJSON: () => {},
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) })
test('la célébration reste visible si le chargement des cartes restantes échoue', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => { root.render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Revision /> }])} />) })
    expect(container.textContent).toContain('Session terminée')
    expect(container.querySelector('.motion-celebrate')).toBeTruthy()
    expect(container.textContent).not.toContain('Impossible de charger les cartes restantes.')
    expect(container.textContent).not.toContain('Continuer avec les cartes restantes')
  } finally { act(() => root.unmount()); scroll.mockRestore() }
})

test('?chapter= ouvre une séance limitée à ce chapitre, ?missed= celle des cartes ratées', async () => {
  const chapterSession = vi.fn(async (id: string) => ({ id: `chapitre-${id}`, kind: 'chapter', complete: false, position: 0, cards: [{ id: 'c1', chapterId: id, kind: 'basic', question: 'Où ?', answer: 'Ici', reviews: 0 }], earnedXP: 0 }))
  const missedSession = vi.fn(async (id: string) => ({ id: `ratees-${id}`, kind: 'missed', complete: false, position: 0, cards: [{ id: 'c2', chapterId: 'x', kind: 'basic', question: 'Quand ?', answer: 'Hier', reviews: 1 }], earnedXP: 0 }))
  const api = (await import('../lib/api')).revisionAPI as unknown as Record<string, unknown>
  Object.assign(api, { chapterSession, missedSession })
  for (const [url, expected] of [['/?chapter=abc', 'Où ?'], ['/?missed=s1', 'Quand ?']]) {
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => { root.render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Revision /> }], { initialEntries: [url] })} />) })
      expect(container.textContent).toContain(expected)
    } finally { act(() => root.unmount()) }
  }
  expect(chapterSession).toHaveBeenCalledWith('abc')
  expect(missedSession).toHaveBeenCalledWith('s1')
})
