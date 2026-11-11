import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

vi.mock('../lib/api', () => ({ revisionAPI: { profile: async () => null }, revisionPolicy: { maxTitleChars: 100 }, podcastStart: async () => { throw new Error('Failed to fetch') } }))
vi.mock('../components/Companion/CompanionProvider', () => ({ useCompanion: () => ({ setDocument: vi.fn() }) }))
vi.mock('../components/Chat/MarkdownView', () => ({ default: ({ md }: { md: string }) => <span>{md}</span> }))
import Chat from './Chat'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('une panne du podcast dans le Tuteur est visible et permet de réessayer', async () => {
  Element.prototype.scrollIntoView = vi.fn()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={[{ pathname: '/chat', state: { q: 'Question', answer: 'Une réponse' } }]}><Chat /></MemoryRouter>))
    const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Créer un podcast'))
    expect(button).toBeTruthy()
    await act(async () => { required(button).click() })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Impossible de créer le podcast. Réessaie.')
    expect(required(button).disabled).toBe(false)
  } finally { act(() => root.unmount()); host.remove() }
})
