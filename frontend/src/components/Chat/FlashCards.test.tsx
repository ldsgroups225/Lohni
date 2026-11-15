import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import FlashCards from './FlashCards'

vi.mock('./MarkdownView', () => ({ default: ({ md }: { md: string }) => md }))

test('les boutons de la liste de cartes font 44 px', () => {
  const html = renderToStaticMarkup(<FlashCards items={[{ q: 'Q ?', a: 'R' }]} onAdd={() => {}} onToggleCollapse={() => {}} />)
  for (const label of ['Masquer les cartes', 'Enregistrer dans mes révisions']) {
    const button = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? ''
    expect(button, label).toMatch(/\bsize-11\b/)
  }
})
