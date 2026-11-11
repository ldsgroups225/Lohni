import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { ToolPage } from './ToolPage'

const html = (props: Partial<Parameters<typeof ToolPage>[0]> = {}) =>
  renderToStaticMarkup(<MemoryRouter><ToolPage title="Quiz libre" {...props}><p>contenu</p></ToolPage></MemoryRouter>)

test('en-tête commun : retour vers Cours, titre h1 et badge bêta', () => {
  const out = html()
  expect(out).toContain('aria-label="Retour"')
  expect(out).toContain('<h1'); expect(out).toContain('Quiz libre'); expect(out).toContain('BÊTA'); expect(out).toContain('contenu')
})
test('retour, badge et largeur sont réglables', () => {
  const out = html({ back: '/', beta: false, wide: true })
  expect(out).not.toContain('BÊTA'); expect(out).toContain('max-w-6xl')
})
test('la zone tactile du retour fait 44 px', () => { expect(html()).toContain('size-11') })
