// @vitest-environment jsdom
import { act } from 'react'
import { required } from '../test/required'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ chapters: vi.fn(), profile: vi.fn(async () => ({ subjects: ['SVT', 'Mathématiques'] })), chatJSON: vi.fn(), getChats: vi.fn(async () => ({ chats: [] })) }))
vi.mock('../lib/api', () => ({ revisionAPI: { chapters: api.chapters, profile: api.profile }, chatJSON: api.chatJSON, chatMultipart: vi.fn(), getChats: api.getChats }))
import Landing from './Landing'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('les suggestions utilisent le vrai chapitre fragile et transmettent son contexte', async () => {
  api.chapters.mockResolvedValue([{ id: 'c', subject: 'SVT', title: 'Cellules', status: 'Fragile' }])
  api.chatJSON.mockResolvedValue({ chatId: 'chat-1' })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/tutor', element: <Landing /> }, { path: '/chat', element: <p>Discussion ouverte</p> }], { initialEntries: ['/tutor'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Chapitre fragile · SVT')
    expect(host.textContent).not.toContain('cartes fragiles')
    await act(async () => required(host.querySelector('button[aria-label="Mode : Discussion"]')).click())
    await act(async () => required([...host.querySelectorAll('[role=menuitemradio]')].find(item => item.textContent === 'Quiz') as HTMLButtonElement | undefined).click())
    const button = required([...host.querySelectorAll('button')].find(item => item.textContent?.includes('Consolider Cellules')))
    await act(async () => button.click())
    expect(api.chatJSON).toHaveBeenCalledWith({ q: 'Aide-moi à consolider Cellules en SVT\n\nRéponds de façon moyenne.' })
    expect(host.textContent).toContain('Discussion ouverte')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

 test('les matières du profil et les choix courants des menus sont accessibles', async () => {
  api.chapters.mockResolvedValue([])
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/tutor', element: <Landing /> }], { initialEntries: ['/tutor'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    expect(host.textContent).toContain('Mathématiques')
    await act(async () => required(host.querySelector<HTMLButtonElement>('[aria-label="Mode : Discussion"]')).click())
    const quiz = required([...host.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')].find(item => item.textContent === 'Quiz'))
    expect(quiz.getAttribute('aria-checked')).toBe('false')
    await act(async () => quiz.click())
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Mode : Quiz')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})

test('une réponse de profil tardive ne montre pas les matières du précédent appareil', async () => {
  let resolve!: (value: { subjects: string[] }) => void
  api.profile.mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValueOnce({ subjects: ['Physique'] })
  api.chapters.mockResolvedValue([])
  localStorage.setItem('lohni-device-id', 'ancien')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); const router = createMemoryRouter([{ path: '/tutor', element: <Landing /> }], { initialEntries: ['/tutor'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    localStorage.setItem('lohni-device-id', 'nouveau')
    await act(async () => resolve({ subjects: ['Ancienne matière'] }))
    expect(host.textContent).not.toContain('Ancienne matière')
    expect(host.textContent).toContain('Physique')
  } finally { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') }
})

test('le mode Quiz avec un fichier prévient au lieu de l’abandonner en silence', async () => {
  api.chapters.mockResolvedValue([])
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const router = createMemoryRouter([{ path: '/tutor', element: <Landing /> }, { path: '/quiz', element: <p>Quiz ouvert</p> }], { initialEntries: ['/tutor'] })
  try {
    await act(async () => root.render(<RouterProvider router={router} />))
    await act(async () => required(host.querySelector<HTMLButtonElement>('[aria-label="Mode : Discussion"]')).click())
    await act(async () => required([...host.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')].find(item => item.textContent === 'Quiz')).click())
    const input = required(host.querySelector<HTMLInputElement>('input[type=file]'))
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'cours.pdf')], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => required(host.querySelector<HTMLButtonElement>('button[aria-label="Envoyer"]')).click())
    expect(host.textContent).not.toContain('Quiz ouvert')
    expect(required(host.querySelector('[role=alert]')).textContent).toContain('Le quiz ne lit pas les fichiers')
    await act(async () => required([...host.querySelectorAll('button')].find(item => item.textContent === 'Retirer le fichier')).click())
    expect(host.querySelector('[role=alert]')).toBeNull()
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})
