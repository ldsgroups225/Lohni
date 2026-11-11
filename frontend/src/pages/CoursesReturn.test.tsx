import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import Courses from './Courses'
import { invalidateRevisionCache } from '../lib/cachedDevice'

const api = vi.hoisted(() => ({ chapters: vi.fn(), progress: vi.fn(), updateCard: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionPolicy: { minimumSeenRatio: 0.5 } }))
vi.mock('../components/Chat/MarkdownView', () => ({ default: ({ md }: { md: string }) => <span>{md}</span> }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('au retour les cours et Plus ouvert sont affichés avant la revalidation', async () => {
  localStorage.setItem('lohni-device-id', 'appareil-a')
  sessionStorage.clear()
  api.chapters.mockResolvedValueOnce([{ id: '1', subject: 'Mathématiques', title: 'Les suites', status: 'En cours', origin: 'ai', mastery: null, seenCards: 0, cards: [], summary: '' }]).mockReturnValue(new Promise(() => {}))
  api.progress.mockResolvedValueOnce({ xp: 10, streak: 1 }).mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/courses', element: <Courses /> }, { path: '/quiz', element: <p>Quiz</p> }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Les suites')
    expect(host.querySelector('.motion-list')).not.toBeNull()
    const details = required([...host.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Plus'))
    await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')) })
    await act(async () => { await router.navigate('/quiz') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Les suites')
    expect([...host.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Plus')?.open).toBe(true)
    expect(host.textContent).not.toContain('On prépare tes cours…')
    expect(host.querySelector('.motion-list')).toBeNull()
  } finally {
    act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear()
  }
})

test('un autre appareil ne voit pas les cours en cache', async () => {
  localStorage.setItem('lohni-device-id', 'appareil-b')
  api.chapters.mockReturnValue(new Promise(() => {}))
  api.progress.mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/courses', element: <Courses /> }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).not.toContain('Les suites')
    expect(host.textContent).toContain('Mes cours')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})


test('une modification conserve le cours connu mais protège ses actions pendant la mise à jour', async () => {
  localStorage.setItem('lohni-device-id', 'cours-modifies')
  api.chapters.mockReset().mockResolvedValueOnce([{ id: '1', subject: 'Mathématiques', title: 'Les suites', status: 'En cours', origin: 'ai', mastery: null, seenCards: 0, cards: [], summary: '' }]).mockReturnValue(new Promise(() => {}))
  api.progress.mockReset().mockResolvedValueOnce({ xp: 10, streak: 1 }).mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/courses', element: <Courses /> }, { path: '/autre', element: <p>Autre</p> }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate('/autre') })
    invalidateRevisionCache('/chapters', '/progress')
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Les suites')
    expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Supprimer le chapitre')?.disabled).toBe(true)
    expect(host.textContent).not.toContain('On prépare tes cours…')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('le résumé et les cartes sont accessibles à la demande sans charger leur contenu avant ouverture', async () => {
  localStorage.setItem('lohni-device-id', 'cours-contenu-a-la-demande')
  api.chapters.mockReset().mockResolvedValue([{ id: '1', subject: 'Mathématiques', title: 'Les suites', status: 'En cours', origin: 'ai', mastery: null, seenCards: 0, cards: [{ id: 'c', kind: 'basic', question: 'Question de test', answer: 'Réponse' }], summary: 'Résumé de test' }])
  api.progress.mockReset().mockResolvedValue({ xp: 10, streak: 1 })
  const router = createMemoryRouter([{ path: '/courses', element: <Courses /> }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).not.toContain('Résumé de test')
    expect(host.textContent).not.toContain('Question de test')
    const details = required([...host.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Relire le résumé'))
    await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')) })
    expect(host.textContent).toContain('Résumé de test')
    const cards = required([...host.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Voir les cartes (1)'))
    await act(async () => { cards.open = true; cards.dispatchEvent(new Event('toggle')) })
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Modifier')).click())
    const question = required(host.querySelector('textarea'))
    await act(async () => {
      required(required(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')).set).call(question, 'Question modifiée')
      question.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { cards.open = false; cards.dispatchEvent(new Event('toggle')); cards.open = true; cards.dispatchEvent(new Event('toggle')) })
    expect(host.querySelector('textarea')?.value).toBe('Question modifiée')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})


test('une revalidation terminée ne réactive pas le formulaire pendant son enregistrement', async () => {
  localStorage.setItem('lohni-device-id', 'cours-enregistrement-revalidation')
  const chapter = { id: '1', subject: 'Mathématiques', title: 'Les suites', status: 'En cours', origin: 'ai', mastery: null, seenCards: 0, cards: [{ id: 'c', kind: 'basic', question: 'Question', answer: 'Réponse' }], summary: '' }
  const progress = { xp: 10, streak: 1 }
  let finish!: (value: typeof chapter[]) => void
  api.chapters.mockReset().mockResolvedValueOnce([chapter]).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  api.progress.mockReset().mockResolvedValue(progress)
  api.updateCard.mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/courses', element: <Courses /> }, { path: '/autre', element: <p>Autre</p> }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate('/autre'); await router.navigate(-1) })
    const cards = required([...host.querySelectorAll('details')].find(element => element.querySelector('summary')?.textContent === 'Voir les cartes (1)'))
    await act(async () => { cards.open = true; cards.dispatchEvent(new Event('toggle')) })
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Modifier')).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(api.updateCard).toHaveBeenCalledOnce()
    await act(async () => finish([chapter]))
    expect(host.querySelector('fieldset')?.disabled).toBe(true)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})
