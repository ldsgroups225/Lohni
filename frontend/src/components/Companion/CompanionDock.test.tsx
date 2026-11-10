import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CompanionDock from './CompanionDock'
import { useCompanion } from './CompanionProvider'

vi.mock('./CompanionProvider', () => ({ useCompanion: vi.fn() }))
vi.mock('../../lib/api', () => ({ companionAsk: vi.fn() }))

test.each([false, true])('sans document, le bouton et le panneau restent absents même si open vaut %s', open => {
  vi.mocked(useCompanion).mockReturnValue({ document: null, open, setOpen: vi.fn(), setDocument: vi.fn() })
  expect(renderToStaticMarkup(<CompanionDock />)).toBe('')
})

test.each([false, true])('avec document, le cours et ses commandes restent disponibles si open vaut %s', open => {
  vi.mocked(useCompanion).mockReturnValue({
    document: { id: 'fractions', title: 'Les fractions', text: 'Une fraction représente une partie du tout.' },
    open, setOpen: vi.fn(), setDocument: vi.fn(),
  })
  const html = renderToStaticMarkup(<CompanionDock />)
  expect(html).toContain('Les fractions')
  expect(html).toContain('Document associé')
  expect(html).toContain('Envoyer')
  expect(html).not.toContain('Aucun document')
  if (!open) expect(html).toContain('Assistant de cours')
})
