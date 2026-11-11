import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MarkdownView from './MarkdownContent'
import DeferredMarkdown from './MarkdownView'

test('le résumé affiche Markdown, tableaux GFM et formules LaTeX', () => {
  const html = renderToStaticMarkup(<MarkdownView md={String.raw`## Les fractions

**Un demi** vaut $\frac{1}{2}$.

$$
\frac{2}{4}=\frac{1}{2}
$$

| Fraction | Valeur |
| --- | --- |
| Un demi | 0,5 |`} />)
  expect(html).toContain('<h2')
  expect(html).toContain('<strong')
  expect(html).toContain('<table')
  expect(html).toContain('class="katex"')
  expect(html).toContain('class="katex-display"')
})

test('une option QCM reste inline dans son label radio, même avec du Markdown de bloc', () => {
  const html = renderToStaticMarkup(<label><input type="radio" name="answer" value="1" />
    <MarkdownView inline md={String.raw`**Un demi** : $\frac{1}{2}$

# Une formule

$$\frac{2}{4}$$

- Un choix

` + "\n\n```\ncode\n```"} />
  </label>)
  expect(html).toContain('<label><input type="radio" name="answer"')
  expect(html).toContain('<strong>Un demi</strong>')
  expect(html).toContain('class="katex"')
  expect(html).not.toMatch(/<(?:div|p|h[1-6]|ul|ol|li|pre|table)\b/)
})
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

test('un nombre seul entouré de $ s’affiche en texte, pas en formule', () => {
  const html = renderToStaticMarkup(<MarkdownView md="$1$ g de glucides fournit $4$ kcal, soit $\frac{1}{2}$." inline />)
  expect(html).toContain('1 g de glucides fournit 4 kcal')
  expect(html.match(/class="katex"/g)?.length).toBe(1)
})


test('le texte reste visible pendant le chargement du rendu Markdown', () => {
  const html = renderToStaticMarkup(<DeferredMarkdown md="Une réponse utile" />)
  expect(html).toContain('Une réponse utile')
})
