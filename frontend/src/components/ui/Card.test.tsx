import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Card } from './Card'

test('la carte affiche son contenu', () => {
  expect(renderToStaticMarkup(<Card>Mon cours</Card>)).toContain('Mon cours')
})
