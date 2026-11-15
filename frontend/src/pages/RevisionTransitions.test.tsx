import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// Transitions entre deux cartes : rien ne doit apparaître au-dessus de la carte suivante ni changer la hauteur des choix.
const api = vi.hoisted(() => ({ sync: { online: true, pending: 0, error: '' } as { online: boolean; pending: number; error: string } }))
vi.mock('../lib/api', async () => {
  const { rememberRevisionSnapshot } = await import('../test/revisionApiDouble')
  const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
  const cards = [
    { id: '1', chapterId: 'c', kind: 'basic', question: 'Question un ?', answer: 'Oui' },
    { id: '2', chapterId: 'c', kind: 'mcq', question: 'Question deux ?', answer: 'Parce que.', options: ['A', 'B', 'C'], correct: 2 },
    { id: '3', chapterId: 'c', kind: 'basic', question: 'Question trois ?', answer: 'Oui' },
  ]
  const at = (position: number) => ({ id: 's', complete: false, position, localDate: '2026-11-14', cards })
  return {
    revisionAPI: {
      profile: async () => { rememberRevisionSnapshot('/profile', profile); return profile },
      session: async () => at(0),
      answer: async (input: { position: number }) => at(input.position + 1),
      chapters: async () => [{ id: 'c', subject: 'Mathématiques', title: 'Fractions' }],
    },
    revisionPolicy: {}, revisionSyncStatus: () => api.sync, syncRevisionAnswers: () => {}, chatJSON: async () => ({ chatId: '1' }),
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

let host: HTMLElement, root: Root
beforeEach(async () => {
  api.sync = { online: true, pending: 0, error: '' }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const router = createMemoryRouter([{ path: '/revision', element: <Revision /> }], { initialEntries: ['/revision'] })
  await act(async () => root.render(<RouterProvider router={router} />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const button = (name: string) => required([...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name))
const section = () => required(host.querySelector('section[aria-label="Session de révision"]'))
const reveal = () => act(async () => { required(host.querySelector('[aria-roledescription="carte"]')).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
const above = (node: Node, other: Node) => !!(node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)

test('la carte ratée à retravailler s’affiche sous la carte suivante, jamais au-dessus', async () => {
  await reveal()
  await act(async () => button('Je ne savais pas').click())
  expect(host.textContent).toContain('Question deux ?')
  const aside = required([...host.querySelectorAll('aside')].find(a => a.textContent?.includes('À retravailler')))
  expect(above(section(), aside)).toBe(true)
})

test('les marques d’un QCM corrigé ne changent pas la place des choix', async () => {
  await reveal()
  await act(async () => button('Je savais').click())
  const options = () => [...section().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
  const slots = () => options().map(option => option.lastElementChild?.getAttribute('data-mark-slot'))
  expect(slots()).toEqual(['', '', ''])
  await act(async () => required(options()[0]).click())
  expect(slots()).toEqual(['', '', ''])
  expect(required(options()[1]).textContent).toContain('Bonne réponse')
  expect(required(options()[1].querySelector('.sr-only')).textContent).toBe('Bonne réponse')
  expect(required(options()[0].querySelector('.sr-only')).textContent).toBe('Ta réponse')
})

test('une réponse en cours d’envoi en ligne n’affiche pas d’encart au-dessus de la carte', async () => {
  api.sync = { online: true, pending: 1, error: '' }
  await act(async () => { window.dispatchEvent(new Event('revision-sync')) })
  expect(host.textContent).not.toContain('en attente d’envoi')
})

test('une réponse qui n’a pas pu partir reste signalée', async () => {
  api.sync = { online: true, pending: 1, error: 'Synchronisation impossible. Réessaie.' }
  await act(async () => { window.dispatchEvent(new Event('revision-sync')) })
  expect(host.textContent).toContain('1 réponse en attente d’envoi')
})

test('la carte qui sort de l’écran ne rend pas la page défilable', () => {
  expect(required(host.querySelector('main')).className).toContain('overflow-clip')
})
