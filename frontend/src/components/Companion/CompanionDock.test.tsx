import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CompanionDock from './CompanionDock'
import { useCompanion } from './CompanionProvider'

vi.mock('./CompanionProvider', () => ({ useCompanion: vi.fn() }))
vi.mock('../../lib/api', () => ({ companionAsk: vi.fn() }))

test('sans document, le bouton et le panneau restent absents', () => {
  vi.mocked(useCompanion).mockReturnValue({ document: null, setDocument: vi.fn() })
  expect(renderToStaticMarkup(<MemoryRouter><CompanionDock /></MemoryRouter>)).toBe('')
})

test('avec document, le cours et ses commandes restent disponibles', () => {
  vi.mocked(useCompanion).mockReturnValue({
    document: { id: 'fractions', title: 'Les fractions', text: 'Une fraction représente une partie du tout.' },
    setDocument: vi.fn(),
  })
  const html = renderToStaticMarkup(<MemoryRouter><CompanionDock /></MemoryRouter>)
  expect(html).toContain('Les fractions')
  expect(html).toContain('Document associé')
  expect(html).toContain('Envoyer')
  expect(html).not.toContain('Aucun document')
  expect(html).toContain('Assistant de cours')
})
