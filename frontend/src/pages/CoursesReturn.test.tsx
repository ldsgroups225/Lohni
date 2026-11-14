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

const outils = (host: HTMLElement) => required(host.querySelector('nav[aria-label="S’entraîner"]'))

test('S’entraîner est visible sans chapitre, avant les chapitres', async () => {
  localStorage.setItem('lohni-device-id', 'appareil-vide')
  api.chapters.mockReset().mockResolvedValue([])
  api.progress.mockReset().mockResolvedValue({ xp: 0, streak: 0 })
  const router = createMemoryRouter([{ path: '/courses', element: <Courses /> }], { initialEntries: ['/courses'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect([...outils(host).querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')])).toEqual([['Examens', '/exam'], ['Quiz', '/quiz'], ['Débat', '/debate'], ['Podcast', '/tools']])
    expect(host.textContent).toContain('S’entraîner')
    expect(host.querySelector('details')).toBeNull()
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('au retour les cours et S’entraîner sont affichés avant la revalidation', async () => {
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
    expect(outils(host).compareDocumentPosition(required(host.querySelector('article'))) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await act(async () => { await router.navigate('/quiz') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Les suites')
    expect(outils(host).querySelectorAll('a')).toHaveLength(4)
    expect(host.querySelector('a[href="/planner"]')).not.toBeNull()
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
    await act(async () => { required([...host.querySelectorAll('button')].find(button => button.textContent === 'Résumé')).click(); await import('../components/Revision/ChapterSummary') })
    expect(host.textContent).toContain('Résumé de test')
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Réviser avec les cartes')).click())
    expect(host.textContent).toContain('Question de test')
    await act(async () => required(host.querySelector<HTMLButtonElement>('[aria-label="Modifier : Question de test"]')).click())
    const question = required(host.querySelector('textarea'))
    await act(async () => {
      required(required(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')).set).call(question, 'Question modifiée')
      question.dispatchEvent(new Event('input', { bubbles: true }))
    })
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
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === '1 carte')).click())
    await act(async () => required(host.querySelector<HTMLButtonElement>('[aria-label="Modifier : Question"]')).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(api.updateCard).toHaveBeenCalledOnce()
    await act(async () => finish([chapter]))
    expect(host.querySelector('fieldset')?.disabled).toBe(true)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})
