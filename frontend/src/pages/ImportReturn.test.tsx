// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import ImportCourse from './ImportCourse'

const api = vi.hoisted(() => ({ profile: vi.fn(), importQuota: vi.fn(), importChapter: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, revisionPolicy: {} }))
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
    expect(host.textContent).toContain('Titre du chapitre')
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
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(host.textContent).toContain('Préparation du chapitre… Cela peut prendre un moment.')
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
