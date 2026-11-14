import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import ImportCourse from './ImportCourse'
import { APIError } from '../lib/api'
import { rememberRevisionSnapshot } from '../test/revisionApiDouble'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

const api = vi.hoisted(() => ({ profile: vi.fn(), importQuota: vi.fn(), importChapter: vi.fn(), retryImport: vi.fn(), discardImport: vi.fn(), chapters: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionPolicy: { maxUploadMB: 10, maxTextChars: 100000, maxTitleChars: 200, dailyImports: 3 }, APIError: class extends Error { chapterId?: string; code?: string; constructor(message: string, _status: number, code?: string, id?: string) { super(message); this.code = code; this.chapterId = id } } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('le formulaire d’import reste visible au retour pendant la vérification du quota', async () => {
  localStorage.setItem('lohni-device-id', 'import-retour')
  api.profile.mockImplementationOnce(async () => { const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }; rememberRevisionSnapshot('/profile', profile); return profile }).mockReturnValue(new Promise(() => {}))
  api.importQuota.mockImplementationOnce(async () => { const quota = { remaining: 2, resetsAt: '2026-11-12T00:00:00Z' }; rememberRevisionSnapshot('/import/quota', quota); return quota }).mockReturnValue(new Promise(() => {}))
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

test('après un échec, essayer avec un autre fichier retire le cours vide, garder le cours le conserve', async () => {
  localStorage.setItem('lohni-device-id', 'import-autre-fichier')
  api.profile.mockReset().mockResolvedValue({ schoolClass: '3e', subjects: ['Mathématiques'] })
  api.importQuota.mockReset().mockResolvedValue({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' })
  api.importChapter.mockReset().mockRejectedValue(new APIError('Erreur de génération', 400, 'IMPORT_GENERATION_FAILED', 'cours-1'))
  api.discardImport.mockReset().mockResolvedValue(null)
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }, { path: '/courses', element: <p>Cours</p> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const button = (label: string) => required([...host.querySelectorAll('button')].find(item => item.textContent === label))
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(item => item.textContent?.includes('Coller du texte'))).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await act(async () => button('Garder le cours sans cartes').click())
    expect(api.discardImport).not.toHaveBeenCalled()
    await act(async () => { await router.navigate('/import') })
    await act(async () => required([...host.querySelectorAll('button')].find(item => item.textContent?.includes('Coller du texte'))).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await act(async () => button('Essayer avec un autre fichier').click())
    expect(api.discardImport).toHaveBeenCalledWith('cours-1')
    expect(host.textContent).toContain('Choisir un fichier')
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
  api.chapters.mockReset().mockResolvedValue([{ id: 'cours-2', cards: [{ question: 'Combien font un demi plus un demi ?', answer: 'Un **entier** : $H_2O$.' }, { question: 'Que signifie fraction ?' }] }])
  const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }, { path: '/revision', element: <p>Séance</p> }], { initialEntries: ['/import'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coller du texte'))).click())
    await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(host.textContent).toContain('2 cartes prêtes')
    expect(host.textContent).toContain('Combien font un demi plus un demi ?')
    expect(host.querySelector('strong')?.textContent).toBe('entier')
    expect(host.querySelector('.katex')).not.toBeNull()
    expect(host.textContent).not.toContain('**')
    expect(host.textContent).toContain('Ajouter un autre cours')
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Commencer la révision')).click())
    expect(router.state.location.pathname + router.state.location.search).toBe('/revision?chapter=cours-2')
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

test('une erreur de fichier ou de quota a un titre précis dans l’écran d’erreur', async () => {
  for (const [code, message, title] of [['IMPORT_FILE', 'Fichier illisible. Essaie un autre fichier ou colle le texte du cours.', 'Ce cours ne peut pas être lu'], ['IMPORT_QUOTA', 'Tu as atteint tes 3 imports du jour.', 'Limite d’imports atteinte']]) {
    localStorage.setItem('lohni-device-id', `import-erreur-${code}`)
    api.profile.mockReset().mockResolvedValue({ schoolClass: '3e', subjects: ['Mathématiques'] })
    api.importQuota.mockReset().mockResolvedValue({ remaining: 2, resetsAt: '2026-11-12T00:00:00Z' })
    api.importChapter.mockReset().mockRejectedValue(new APIError(message, 400, code))
    const router = createMemoryRouter([{ path: '/import', element: <ImportCourse /> }], { initialEntries: ['/import'] })
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => root.render(<RouterProvider router={router} />))
      await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coller du texte'))).click())
      await act(async () => required(host.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      expect(host.querySelector('[role="alert"] h2')?.textContent).toBe(title)
      expect(host.textContent).toContain(message)
    } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem(`lohni-device-id`) }
  }
})
