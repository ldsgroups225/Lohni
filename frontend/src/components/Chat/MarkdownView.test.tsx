import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MarkdownView from './MarkdownView'

test('le contenu Markdown reste lisible et conserve ses liens et sa structure', () => {
  const html = renderToStaticMarkup(<MarkdownView md={'# Mon cours\n\nUn **résumé** et [une source](https://example.org).\n\n> Une citation'} />)
  expect(html).toContain('<h1')
  expect(html).toContain('Mon cours')
  expect(html).toContain('<strong')
  expect(html).toContain('résumé')
  expect(html).toContain('href="https://example.org"')
  expect(html).toContain('<blockquote')
  expect(html).toContain('Une citation')
})
