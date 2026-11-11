// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { expect, test } from 'vitest'
import Sidebar from './Sidebar'
import { useLeaveConfirmation } from '../lib/useLeaveConfirmation'
function Guard() { useLeaveConfirmation(true, 'Quitter ?'); return <p>Quiz</p> }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const tick = () => new Promise(resolve => setTimeout(resolve, 30))
test.each(['/tutor', '/courses'])('un onglet depuis un enfant revient a accueil : %s', async target => {
  window.history.replaceState(null, '', '/')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createBrowserRouter([{ path: '*', element: <><Sidebar /><Outlet /></> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/courses"]')!.click())
    await act(async () => { await router.navigate('/quiz') })
    await act(async () => { host.querySelector<HTMLAnchorElement>(`a[href="${target}"]`)!.click(); await tick() })
    expect(router.state.location.pathname).toBe(target)
    await act(async () => { await router.navigate(-1); await tick() })
    expect(router.state.location.pathname).toBe('/')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('une ouverture directe conserve le remplacement de longlet courant', async () => {
  window.history.replaceState(null, '', '/courses')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createBrowserRouter([{ path: '*', element: <Sidebar /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    const index = window.history.state.idx
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/tutor"]')!.click())
    expect(router.state.location.pathname).toBe('/tutor')
    expect(window.history.state.idx).toBe(index)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('toucher accueil depuis un enfant retourne a son entree', async () => {
  window.history.replaceState(null, '', '/')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createBrowserRouter([{ path: '*', element: <Sidebar /> }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    const index = window.history.state.idx
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/courses"]')!.click())
    await act(async () => { await router.navigate('/quiz') })
    await act(async () => { host.querySelector<HTMLAnchorElement>('a[href="/"]')!.click(); await tick() })
    expect(router.state.location.pathname).toBe('/')
    expect(window.history.state.idx).toBe(index)
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('annuler un changement d’onglet ne modifie pas un retour ulterieur', async () => {
  window.history.replaceState(null, '', '/')
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')) }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createBrowserRouter([{ path: '/', element: <><Sidebar /><Outlet /></>, children: [{ path: 'courses', element: <p>Cours</p> }, { path: 'quiz', element: <Guard /> }, { path: 'tutor', element: <p>Tuteur</p> }] }])
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/courses"]')!.click())
    await act(async () => { await router.navigate('/quiz') })
    await act(async () => { host.querySelector<HTMLAnchorElement>('a[href="/tutor"]')!.click(); await tick() })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Annuler')!.click())
    await act(async () => { await router.navigate(-1); await tick() })
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Quitter')!.click())
    await act(async () => { await tick() })
    expect(router.state.location.pathname).toBe('/courses')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); document.querySelector('dialog')?.remove() }
})
