import { required } from '../../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({ saved: false }))
vi.mock('../../lib/api', () => ({ revisionAPI: { saveProfile: async () => { api.saved = true }, generateChapter: async () => {} }, revisionPolicy: { maxTitleChars: 100 } }))
import Onboarding from './Onboarding'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function Home() { return api.saved ? <p>Accueil</p> : <Onboarding /> }

test('une étape invalide dans l’adresse affiche le début du parcours', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/?etape=2.5'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Étape 1 sur 4')
    expect(host.textContent).toContain('Dans quelle classe es-tu')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('retour depuis une étape ouverte directement affiche l’étape précédente', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/outside', element: <p>Hors application</p> }, { path: '/', element: <Onboarding /> }], { initialEntries: ['/outside', '/?etape=2'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required([...host.querySelectorAll('button')].find(button => button.textContent === 'Retour')).click())
    expect(host.textContent).toContain('Étape 1 sur 4')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('recharger en cours de parcours conserve la classe choisie', async () => {
  sessionStorage.clear()
  const host = document.createElement('div'); document.body.append(host)
  let root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    const select = required(host.querySelector('select'))
    const chosen = select.options[1].value
    await act(async () => { select.value = chosen; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    act(() => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => { await router.navigate(-1) })
    expect(required(host.querySelector('select')).value).toBe(chosen)
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); sessionStorage.clear() }
})

test('le retour retrouve l’étape précédente et les réponses', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/', element: <Onboarding /> }], { initialEntries: ['/'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(host.textContent).toContain('Étape 2')
    const checkbox = required(host.querySelector<HTMLInputElement>('input[type=checkbox]'))
    const label = required(required(checkbox.parentElement).textContent)
    await act(async () => checkbox.click())
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => { await router.navigate(-1) })
    expect(host.textContent).toContain('Étape 2')
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
    for (let i = 0; i < 3; i++) await act(async () => required(host.querySelector('form')).requestSubmit())
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
