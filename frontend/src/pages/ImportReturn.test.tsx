import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import ImportCourse from './ImportCourse'
import { APIError } from '../lib/api'

const api = vi.hoisted(() => ({ profile: vi.fn(), importQuota: vi.fn(), importChapter: vi.fn(), retryImport: vi.fn(), chapters: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionPolicy: { maxUploadMB: 10, maxTextChars: 100000, maxTitleChars: 200, dailyImports: 3 }, APIError: class extends Error { chapterId?: string; constructor(message: string, _status: number, _code?: string, id?: string) { super(message); this.chapterId = id } } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le formulaire d’import reste visible au retour pendant la vérification du quota', async () => {
  localStorage.setItem('lohni-device-id', 'import-retour')
  api.profile.mockResolvedValueOnce({ schoolClass: '3e', subjects: ['Mathématiques'] }).mockReturnValue(new Promise(() => {}))
  api.importQuota.mockResolvedValueOnce({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' }).mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }, { path: '/courses', element: <p>Cours</p> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate('/courses') })
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Coller du texte')
    expect(host.textContent).not.toContain('On prépare ton import')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})


test('la création longue conserve son indicateur de progression', async () => {
  localStorage.setItem('lohni-device-id', 'import-operation-longue')
  api.profile.mockReset().mockResolvedValue({ schoolClass: '3e', subjects: ['Mathématiques'] })
  api.importQuota.mockReset().mockResolvedValue({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' })
  api.importChapter.mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coller du texte'))).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(host.textContent).toContain('Préparation de ton cours…')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('la première visite présente la zone de cours pendant le chargement du profil', async () => {
  localStorage.setItem('lohni-device-id', 'import-premiere-visite')
  api.profile.mockReset().mockReturnValue(new Promise(() => {}))
  api.importQuota.mockReset().mockReturnValue(new Promise(() => {}))
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Cours à réviser')
    expect(host.textContent).not.toContain('On prépare ton import')
    expect(host.textContent).not.toContain('Crée d’abord ton profil')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})


test('après un échec, réessayer prépare le cours déjà enregistré', async () => {
  localStorage.setItem('lohni-device-id', 'import-erreur')
  api.profile.mockReset().mockResolvedValue({ schoolClass: '3e', subjects: ['Mathématiques'] })
  api.importQuota.mockReset().mockResolvedValue({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' })
  api.importChapter.mockReset().mockRejectedValue(new APIError('Erreur de génération', 400, 'IMPORT_GENERATION_FAILED', 'cours-1'))
  api.retryImport.mockResolvedValue({ id: 'cours-1', title: 'Fractions', summary: 'Résumé', origin: 'import' })
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coller du texte'))).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(host.textContent).toContain('Ton cours')
    expect(host.textContent).toContain('bien enregistré')
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Réessayer')).click())
    expect(api.retryImport).toHaveBeenCalledWith('cours-1', expect.any(AbortSignal))
    expect(host.textContent).toContain('Tes cartes sont prêtes')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('propose les trois sources avant la confirmation du texte', async () => {
  localStorage.setItem('lohni-device-id', 'import-sources')
  api.profile.mockReset().mockResolvedValue({ schoolClass: '3e', subjects: ['Mathématiques'] })
  api.importQuota.mockReset().mockResolvedValue({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' })
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Prendre en photo')
    expect(host.textContent).toContain('Choisir un fichier')
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coller du texte'))).click())
    expect(host.textContent).toContain('Créer mes cartes')
    expect(host.querySelector('textarea')).not.toBeNull()
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('affiche le nombre et un exemple des cartes créées', async () => {
  localStorage.setItem('lohni-device-id', 'import-termine')
  api.profile.mockReset().mockResolvedValue({ schoolClass: '3e', subjects: ['Mathématiques'] })
  api.importQuota.mockReset().mockResolvedValue({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' })
  api.importChapter.mockReset().mockResolvedValue({ id: 'cours-2', title: 'Fractions', summary: 'Résumé', origin: 'import' })
  api.chapters.mockReset().mockResolvedValue([{ id: 'cours-2', cards: [{ question: 'Combien font un demi plus un demi ?' }, { question: 'Que signifie fraction ?' }] }])
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coller du texte'))).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(host.textContent).toContain('2 cartes prêtes')
    expect(host.textContent).toContain('Combien font un demi plus un demi ?')
    expect(host.textContent).toContain('Ajouter un autre cours')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('annuler interrompt la demande et indique que le cours peut déjà être enregistré', async () => {
  localStorage.setItem('lohni-device-id', 'import-annulation')
  api.profile.mockReset().mockResolvedValue({ schoolClass: '3e', subjects: ['Mathématiques'] })
  api.importQuota.mockReset().mockResolvedValue({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' })
  api.importChapter.mockReset().mockImplementation((_input, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })))
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coller du texte'))).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Annuler')).click())
    expect(host.textContent).toContain('Annulation demandée')
    expect(host.textContent).toContain('déjà enregistré')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})
