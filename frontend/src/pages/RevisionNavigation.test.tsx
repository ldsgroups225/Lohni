// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
vi.mock('../lib/api', () => ({
  revisionAPI: { profile: async () => ({ subjects: ['Mathématiques'] }), session: async () => ({ id: '1', complete: false, position: 0, cards: [{ id: '1', kind: 'basic', question: 'Question ?', answer: 'Oui' }] }) },
  revisionPolicy: {}, revisionSyncStatus: () => ({ online: true, pending: 0 }), syncRevisionAnswers: () => {}, chatJSON: () => {},
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
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})
