// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Revision from './Revision'

vi.mock('../lib/api', () => ({
  revisionAPI: {
    profile: async () => ({ subjects: ['Mathématiques'] }),
    session: async () => ({ id: '1', complete: true, position: 1, cards: [], earnedXP: 10 }),
    home: async () => { throw new Error('Impossible de charger les cartes restantes.') },
    progress: async () => ({ xp: 10, streak: 1 }),
  },
  revisionSyncStatus: () => ({ online: true, pending: 0 }),
  revisionPolicy: {}, syncRevisionAnswers: () => {}, chatJSON: () => {},
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) })
test('la célébration reste visible si le chargement des cartes restantes échoue', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter><Revision /></MemoryRouter>) })
  expect(container.textContent).toContain('Session terminée !')
  expect(container.querySelector('.motion-celebrate')).toBeTruthy()
  expect(container.textContent).not.toContain('Impossible de charger les cartes restantes.')
  expect(container.textContent).not.toContain('Continuer avec les cartes restantes')
  act(() => root.unmount())
})
