// @vitest-environment jsdom
import { act } from 'react'
import { required } from '../test/required'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ chapters: vi.fn(), chatJSON: vi.fn(), getChats: vi.fn(async () => ({ chats: [] })) }))
vi.mock('../lib/api', () => ({ revisionAPI: { chapters: api.chapters }, chatJSON: api.chatJSON, chatMultipart: vi.fn(), getChats: api.getChats }))
import Landing from './Landing'
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
    const button = required([...host.querySelectorAll('button')].find(item => item.textContent?.includes('Consolider Cellules')))
    await act(async () => button.click())
    expect(api.chatJSON).toHaveBeenCalledWith({ q: 'Aide-moi à consolider Cellules en SVT' })
    expect(host.textContent).toContain('Discussion ouverte')
  } finally { act(() => root.unmount()); router.dispose(); host.remove() }
})
