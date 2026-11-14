import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, test, vi } from 'vitest'

// rehype-highlight enregistre toutes ses grammaires à chaque rendu : une carte de révision sans code ne doit pas payer ce coût.
const highlight = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock('rehype-highlight', () => ({ default: highlight }))
vi.mock('katex/dist/katex.min.css', () => ({}))
const markdown = vi.hoisted(() => ({ calls: 0 }))
vi.mock('react-markdown', async original => {
  const actual = await original<typeof import('react-markdown')>()
  return { ...actual, default: (props: Parameters<typeof actual.default>[0]) => { markdown.calls++; return actual.default(props) } }
})
import MarkdownContent from './MarkdownContent'

beforeEach(() => highlight.mockClear())

test('un texte sans bloc de code ne charge pas la coloration syntaxique', () => {
  expect(renderToStaticMarkup(<MarkdownContent md={'Le **triangle** rectangle : $a^2 = b^2 + c^2$'} />)).toContain('triangle')
  expect(highlight).not.toHaveBeenCalled()
})

test('un bloc de code garde sa coloration', () => {
  renderToStaticMarkup(<MarkdownContent md={'```python\nprint(1)\n```'} />)
  expect(highlight).toHaveBeenCalled()
})

test('une carte préparée à l’avance s’affiche sans refaire l’analyse Markdown ni KaTeX', async () => {
  const { prerenderMarkdown } = await import('./MarkdownContent')
  const md = 'Calcule $c^2 = a^2 + b^2$ pour la carte suivante.'
  prerenderMarkdown([{ md, inline: true }])
  const calls = markdown.calls
  expect(calls).toBeGreaterThan(0)
  expect(renderToStaticMarkup(<MarkdownContent md={md} inline />)).toContain('katex')
  expect(markdown.calls).toBe(calls)
})
