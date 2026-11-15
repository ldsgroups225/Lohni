// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { required } from '../test/required'

// États de l'écran de révision, rendus avec les vrais hooks : l'ordre des useState de Revision n'a aucune importance ici.
type Scenario = { session: unknown; afterAnswer?: unknown; progress?: unknown; moreCards?: boolean }
const scenario = vi.hoisted(() => ({ current: {} as Scenario }))
vi.mock('../lib/useLeaveConfirmation', () => ({ useLeaveConfirmation: () => {} }))
vi.mock('../lib/api', async () => {
  const { rememberRevisionSnapshot } = await import('../test/revisionApiDouble')
  const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
  return {
    revisionAPI: {
      profile: async () => { rememberRevisionSnapshot('/profile', profile); return profile },
      session: async () => scenario.current.session,
      answer: async () => scenario.current.afterAnswer,
      chapters: async () => [{ id: 'c', subject: 'Mathématiques', title: 'Fractions' }],
      progress: async () => scenario.current.progress ?? { xp: 0, streak: 0, learnedCards: 0, subjects: [] },
      home: async () => ({ moreCards: scenario.current.moreCards }),
    },
    revisionPolicy: {}, revisionSyncStatus: () => ({ online: true, pending: 0 }), syncRevisionAnswers: () => {}, chatJSON: async () => ({ chatId: '1' }),
  }
})
import Revision from './Revision'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)

const card = { id: '1', chapterId: 'c', kind: 'basic', question: 'Quelle réponse ?', answer: 'Oui', origin: 'ai' }
const ongoing = (position: number) => ({ id: 's', complete: false, position, localDate: '2026-11-14', cards: [card, { ...card, id: '2' }] })
const finished = (earnedXP: number) => ({ id: 's', complete: true, position: 1, earnedXP, localDate: '2026-11-14', cards: [card] })

let host: HTMLElement, root: Root
async function open(value: Scenario) {
  scenario.current = value
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const router = createMemoryRouter([{ path: '/revision', element: <Revision /> }], { initialEntries: ['/revision'] })
  await act(async () => root.render(<RouterProvider router={router} />))
}
afterEach(() => { act(() => root.unmount()); host.remove() })
const button = (name: string) => required([...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name))
const reveal = () => act(async () => { required(host.querySelector('[aria-roledescription="carte"]')).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })

test('une carte propose de quitter, sans lien d’import ni mascotte', async () => {
  await open({ session: ongoing(0) })
  expect(host.textContent).toContain('Quelle réponse ?')
  expect(host.querySelector('[aria-label="Quitter la session"]')).not.toBeNull()
  expect(host.textContent).not.toContain('Importer mon cours')
  expect(host.innerHTML).not.toContain('aria-label="Lohni,')
})

test('la carte révélée propose les deux réponses et garde une sortie', async () => {
  await open({ session: ongoing(0) })
  await reveal()
  expect(button('Je savais')).toBeTruthy(); expect(button('Je ne savais pas')).toBeTruthy()
  expect(host.querySelector('[aria-label="Quitter la session"]')).not.toBeNull()
})

test('la fin de session propose un retour à l’accueil avec la mascotte en fête', async () => {
  await open({ session: finished(70), progress: { xp: 100, streak: 3, learnedCards: 1, subjects: [] } })
  expect(host.textContent).toContain('Retour à l’accueil')
  expect(host.textContent).toContain('Session terminée')
  expect(host.textContent).toContain('+70')
  expect(host.innerHTML).toContain('aria-label="Lohni, en fête"')
})

test('une carte ratée reste à retravailler pendant la session mais disparaît à la fin', async () => {
  await open({ session: ongoing(0), afterAnswer: ongoing(1) })
  await reveal()
  await act(async () => button('Je ne savais pas').click())
  expect(host.textContent).toContain('À retravailler')
  expect(host.textContent).toContain('Explique-moi')
  act(() => root.unmount()); host.remove()
  await open({ session: ongoing(0), afterAnswer: finished(0) })
  await reveal()
  await act(async () => button('Je ne savais pas').click())
  expect(host.textContent).toContain('Session terminée')
  expect(host.textContent).not.toContain('À retravailler')
})

test.each([true, false])('fin de session : continuation selon les cartes disponibles (%s)', async moreCards => {
  await open({ session: finished(70), moreCards })
  expect(host.textContent?.includes('Continuer avec les cartes restantes')).toBe(moreCards)
})
