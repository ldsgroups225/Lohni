import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Progress } from './Progress'

test('la progression conserve son nom accessible et sa valeur', () => {
  const html = renderToStaticMarkup(<Progress aria-label="Progression de la session" value={3} max={10} />)
  expect(html).toMatch(/<progress\b/)
  expect(html).toContain('aria-label="Progression de la session"')
  expect(html).toContain('value="3"')
  expect(html).toContain('max="10"')
})
