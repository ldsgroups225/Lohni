import { required } from '../../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({ saved: false, saveProfile: vi.fn(), generateChapter: vi.fn() }))
vi.mock('../../lib/api', () => ({ revisionAPI: { saveProfile: async (value: unknown) => { api.saveProfile(value); api.saved = true }, generateChapter: api.generateChapter }, revisionPolicy: { maxTitleChars: 100 } }))
import Onboarding from './Onboarding'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function Home() { return api.saved ? <p>Accueil</p> : <Onboarding /> }

test('une étape invalide dans l’adresse affiche le début du parcours', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/?etape=2.5'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('1 sur 6')
    expect(host.textContent).toContain('Choisis ta langue et ton pays')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('retour depuis une étape ouverte directement affiche l’étape précédente', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/outside', element: <p>Hors application</p> }, { path: '/', element: <Onboarding /> }], { initialEntries: ['/outside', '/?etape=2'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Retour')).click())
    expect(host.textContent).toContain('1 sur 6')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('recharger en cours de parcours conserve la classe choisie', async () => {
  sessionStorage.clear()
  const host = document.createElement('div'); document.body.append(host)
  let root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === '5ᵉ')).click())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    act(() => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate(-1) })
    expect(required([...host.querySelectorAll('button')].find(button => button.textContent === '5ᵉ')).getAttribute('aria-pressed')).toBe('true')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear() }
})

test('le retour retrouve l’étape précédente et les réponses', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(host.textContent).toContain('4 sur 6')
    const checkbox = required(host.querySelector<HTMLInputElement>('input[type=checkbox]'))
    const label = required(required(checkbox.parentElement).textContent)
    await act(async () => checkbox.click())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('4 sur 6')
    expect([...host.querySelectorAll('label')].find(el => el.textContent === label)?.querySelector('input')?.checked).toBe(false)
    await act(async () => { await router.navigate(-1) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect([...host.querySelectorAll('label')].find(el => el.textContent === label)?.querySelector('input')?.checked).toBe(false)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('après le parcours, un retour mène à l’accueil puis à la page précédente', async () => {
  api.saved = false
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/outside', element: <p>Hors application</p> }, { path: '/', element: <Home /> }, { path: '/revision', element: <p>Révision</p> }], { initialEntries: ['/outside', '/'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    for (let i = 0; i < 5; i++) await act(async () => required(host.querySelector('form')).requestSubmit())
    const input = required(host.querySelector<HTMLInputElement>('input[placeholder]'))
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).set).call(input, 'Fractions'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(host.textContent).toContain('Révision')
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toBe('Accueil')
    expect(router.state.location.pathname + router.state.location.search).toBe('/')
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toBe('Hors application')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('une ancienne série implicite ne permet pas de contourner le choix par un lien direct', async () => {
  sessionStorage.setItem('lohni-onboarding', JSON.stringify({ schoolClass: 'terminale', series: 'A1', subjects: ['Français'], subject: 'Français', title: 'Chapitre' }))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/?etape=6'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('3 sur 6')
    expect(required([...host.querySelectorAll('button')].find(button => button.textContent === 'Continuer')).disabled).toBe(true)
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'D')).click())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(host.textContent).toContain('4 sur 6')
    expect(host.textContent).toContain('Physique-Chimie')
    expect(host.textContent).not.toContain('Allemand')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear() }
})

 test('la matière du chapitre reste valide après Retour puis Suivant dans l’historique', async () => {
  sessionStorage.clear(); api.saved = false; api.generateChapter.mockClear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }, { path: '/revision', element: <p>Révision</p> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    for (let i = 0; i < 5; i++) await act(async () => required(host.querySelector('form')).requestSubmit())
    const oldSubject = required(host.querySelector('select')).value
    await act(async () => { await router.navigate(-2) })
    const label = required([...host.querySelectorAll('label')].find(item => item.textContent === oldSubject))
    await act(async () => required(label.querySelector('input')).click())
    await act(async () => { await router.navigate(2) })
    const newSubject = required(host.querySelector('select')).value
    expect(newSubject).not.toBe(oldSubject)
    const title = required(host.querySelector<HTMLInputElement>('input[placeholder]'))
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).set).call(title, 'Fractions'); title.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(api.generateChapter).toHaveBeenCalledWith({ subject: newSubject, title: 'Fractions' })
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear() }
})

test('les classes sont regroupées et la série doit être choisie explicitement', async () => {
  sessionStorage.clear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    const groups = [...host.querySelectorAll('fieldset')]
    expect(groups.find(group => group.querySelector('legend')?.textContent === 'Collège')?.querySelectorAll('button')).toHaveLength(4)
    expect(groups.find(group => group.querySelector('legend')?.textContent === 'Lycée')?.querySelectorAll('button')).toHaveLength(3)
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Terminale')).click())
    expect(required([...host.querySelectorAll('button')].find(button => button.textContent === 'Continuer')).disabled).toBe(true)
    expect(host.textContent).not.toContain('coefficients')
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'D')).click())
    expect(required([...host.querySelectorAll('button')].find(button => button.textContent === 'Continuer')).disabled).toBe(false)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear() }
})

 test('la mascotte réagit au choix de classe', async () => {
  sessionStorage.clear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === '5ᵉ')).click())
    expect(host.querySelector('[aria-label="Lohni, contente"]')).not.toBeNull()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)) })
    expect(host.querySelector('[aria-label="Lohni, au repos"]')).not.toBeNull()
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear() }
})

test('un ancien brouillon ouvert à étape 4 conserve ses réponses sans créer de chapitre', async () => {
  sessionStorage.setItem('lohni-onboarding', JSON.stringify({ schoolClass: '3e', series: '', subjects: ['Français'], subject: 'Français', title: 'Ancien chapitre', examDate: '2027-12-13' }))
  api.generateChapter.mockClear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/?etape=4'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(api.generateChapter).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Quelles matières révises-tu')
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(required(host.querySelector<HTMLInputElement>('input[type=date]')).value).toBe('2027-12-13')
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(required(host.querySelector<HTMLInputElement>('input[placeholder]')).value).toBe('Ancien chapitre')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear() }
})

test('le prénom facultatif est repris uniquement pour le même appareil', async () => {
  sessionStorage.clear(); localStorage.setItem('lohni-device-id', 'prenom-a')
  const host = document.createElement('div'); document.body.append(host)
  let root = createRoot(host); const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector('form')).requestSubmit())
    const input = required(host.querySelector<HTMLInputElement>('input[autocomplete="given-name"]'))
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).set).call(input, 'Awa'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => root.unmount()); root = createRoot(host)
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(required(host.querySelector<HTMLInputElement>('input[autocomplete="given-name"]')).value).toBe('Awa')
    act(() => root.unmount()); localStorage.setItem('lohni-device-id', 'prenom-b'); root = createRoot(host)
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(required(host.querySelector<HTMLInputElement>('input[autocomplete="given-name"]')).value).toBe('')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear(); localStorage.clear() }
})

 test('terminer conserve le prénom local sans le transmettre à l’API', async () => {
  sessionStorage.clear(); localStorage.setItem('lohni-device-id', 'prenom-final')
  sessionStorage.setItem('lohni-first-name:prenom-final', 'Awa')
  sessionStorage.setItem('lohni-onboarding', JSON.stringify({ schoolClass: '3e', subjects: ['Français'], subject: 'Français', title: 'Fractions' }))
  api.saveProfile.mockClear(); api.generateChapter.mockClear()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/?etape=6'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(localStorage.getItem('lohni-first-name:prenom-final')).toBe('Awa')
    expect(api.saveProfile).toHaveBeenCalledWith({ schoolClass: '3e', series: undefined, subjects: ['Français'], examDate: undefined })
    expect(api.generateChapter).toHaveBeenCalledWith({ subject: 'Français', title: 'Fractions' })
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear(); localStorage.clear() }
})

test('passer le prénom continue vers la classe sans le conserver', async () => {
  sessionStorage.clear(); localStorage.setItem('lohni-device-id', 'prenom-skip')
  sessionStorage.setItem('lohni-first-name:prenom-skip', 'Awa')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/?etape=2'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Passer cette étape')).click())
    expect(host.textContent).toContain('Dans quelle classe es-tu')
    expect(sessionStorage.getItem('lohni-first-name:prenom-skip')).toBeNull()
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear(); localStorage.clear() }
})

test('une double soumission ne crée qu’un chapitre', async () => {
  sessionStorage.clear(); localStorage.setItem('lohni-device-id', 'double-envoi')
  sessionStorage.setItem('lohni-onboarding', JSON.stringify({ schoolClass: '3e', subjects: ['Français'], title: 'Fractions' }))
  api.saveProfile.mockClear(); api.generateChapter.mockClear().mockReturnValueOnce(new Promise(() => {}))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/?etape=6'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { const form = required(host.querySelector('form')); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    expect(api.generateChapter).toHaveBeenCalledTimes(1)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear(); localStorage.clear() }
})
