// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
const delayedProfile = vi.hoisted(() => ({ wait: false }))
vi.mock('../lib/api', () => ({
  revisionAPI: { profile: () => delayedProfile.wait ? new Promise(() => {}) : Promise.resolve({ schoolClass: '3e', subjects: ['Mathématiques'] }), session: async () => ({ id: '1', complete: false, position: 0, cards: [{ id: '1', chapterId: 'c', kind: 'basic', question: 'Question ?', answer: 'Oui' }, { id: '2', chapterId: 'c', kind: 'basic', question: 'Autre ?', answer: 'Oui' }] }), answer: async () => ({ id: '1', complete: false, position: 1, cards: [{ id: '1', chapterId: 'c', kind: 'basic', question: 'Question ?', answer: 'Oui' }, { id: '2', chapterId: 'c', kind: 'basic', question: 'Autre ?', answer: 'Oui' }] }), chapters: async () => [{ id: 'c', subject: 'Mathématiques', title: 'Fractions' }] },
  revisionPolicy: {}, revisionSyncStatus: () => ({ online: true, pending: 0 }), syncRevisionAnswers: () => {}, chatJSON: async () => ({ chatId: "1" }),
}))
import Revision from './Revision'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = () => {}
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')) }
test('le menu se ferme au retour et la sortie de session demande confirmation', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <p>Accueil</p> }, { path: '/revision', element: <Revision /> }], { initialEntries: ['/', '/revision'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Plus d’options"]')!.click())
    expect(host.textContent).toContain('Supprimer cette carte')
    await act(async () => { await router.navigate(-1) })
    expect(host.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { await router.navigate(-1) })
    expect(document.querySelector('dialog')?.textContent).toContain('Ta progression est enregistrée')
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Annuler')!.click())
    expect(host.textContent).toContain('Question ?')
    await act(async () => { await router.navigate(-1) })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    expect(host.textContent).toContain('Accueil')
  } finally { delayedProfile.wait = false; act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})

test('expliquer une carte ratée ouvre le tuteur sans confirmation de sortie', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/revision', element: <Revision /> }, { path: '/chat', element: <p>Tuteur ouvert</p> }], { initialEntries: ['/revision'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector<HTMLElement>('[aria-label="Question"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Je ne savais pas')!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Explique-moi')!.click())
    expect(host.textContent).toContain('Tuteur ouvert')
    expect(document.querySelector('dialog')).toBeNull()
  } finally { delayedProfile.wait = false; act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})

test('la session reste visible au retour pendant son actualisation', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <p>Accueil</p> }, { path: '/revision', element: <Revision /> }], { initialEntries: ['/revision'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate('/') })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    delayedProfile.wait = true
    await act(async () => { void router.navigate('/revision') })
    expect(host.textContent).toContain('Question ?')
    expect(host.textContent).not.toContain('On prépare ta session')
  } finally { delayedProfile.wait = false; act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})
