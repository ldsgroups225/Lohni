// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({ start: vi.fn(async () => ({ quizId: '1' })) }))
vi.mock('../lib/api', () => ({ quizStart: api.start, connectQuizStream: (_id: string, onEvent: (e: unknown) => void) => { onEvent({ type: 'quiz', quiz: [{ id: 1, question: 'Combien ?', options: ['Un', 'Deux'], correct: 1, hint: '', explanation: '' }] }); return { close: () => {} } } }))
import Quiz from './Quiz'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('choisir un nouveau sujet retire l’ancien sujet de l’adresse', async () => {
  sessionStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/quiz', element: <Quiz /> }], { initialEntries: ['/quiz?topic=maths'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Un'))!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Voir'))!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Nouveau sujet'))!.click())
    expect(router.state.location.search).toBe('')
    expect(host.querySelector('input')).not.toBeNull()
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('reprendre un quiz relancé sur le même sujet garde la nouvelle progression', async () => {
  sessionStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')) }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/quiz', element: <Quiz /> }, { path: '/courses', element: <p>Cours</p> }], { initialEntries: ['/quiz?topic=maths'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Un'))!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Voir'))!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Nouveau sujet'))!.click())
    const input = host.querySelector('input')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'maths'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Commencer le quiz'))!.click())
    await act(async () => { await router.navigate('/courses') })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Combien ?')
    expect(host.textContent).not.toContain('Quiz terminé')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})

test('retrouver le quiz conserve les questions sans nouvelle génération', async () => {
  api.start.mockClear(); sessionStorage.clear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/quiz', element: <Quiz /> }, { path: '/courses', element: <p>Cours</p> }], { initialEntries: ['/quiz?topic=maths'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Combien ?')
    HTMLDialogElement.prototype.showModal = function () { this.open = true }
    HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')) }
    await act(async () => { await router.navigate('/courses') })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Combien ?')
    expect(api.start).toHaveBeenCalledTimes(1)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('quitter un quiz en cours demande confirmation', async () => {
  sessionStorage.clear()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')) }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/quiz', element: <Quiz /> }, { path: '/courses', element: <p>Cours</p> }], { initialEntries: ['/courses', '/quiz?topic=maths'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate(-1) })
    expect(document.querySelector('dialog')?.textContent).toContain('Quitter')
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Annuler')!.click())
    expect(host.textContent).toContain('Combien ?')
    await act(async () => { await router.navigate(-1) })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    expect(host.textContent).toContain('Cours')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})

test('une nouvelle demande du même sujet crée un nouveau quiz', async () => {
  api.start.mockClear(); sessionStorage.clear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/quiz', element: <Quiz /> }, { path: '/tutor', element: <p>Tuteur</p> }], { initialEntries: ['/tutor'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate('/quiz?topic=maths') })
    expect(host.textContent).toContain('Combien ?')
    await act(async () => { await router.navigate(-1) })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    await act(async () => { await router.navigate('/quiz?topic=maths') })
    expect(host.textContent).toContain('Combien ?')
    expect(api.start).toHaveBeenCalledTimes(2)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})

test('un quiz choisi sur place reste disponible après la mise à jour de son adresse et un retour', async () => {
  api.start.mockClear(); sessionStorage.clear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/quiz', element: <Quiz /> }, { path: '/tutor', element: <p>Tuteur</p> }], { initialEntries: ['/quiz'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Les fractions'))!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Commencer le quiz'))!.click())
    expect(host.textContent).toContain('Combien ?')
    await act(async () => { await router.navigate('/tutor') })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Combien ?')
    expect(api.start).toHaveBeenCalledTimes(1)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})

test('retrouver un quiz termine conserve ses resultats sans confirmation', async () => {
  sessionStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/quiz', element: <Quiz /> }, { path: '/courses', element: <p>Cours</p> }], { initialEntries: ['/quiz?topic=maths'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Un'))!.click())
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Voir'))!.click())
    await act(async () => { await router.navigate('/courses') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Quiz terminé')
    await act(async () => { await router.navigate('/courses') })
    expect(document.querySelector('dialog')).toBeNull()
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})
