import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './Button'

test('le bouton peut être activé ou désactivé', () => {
  expect(renderToStaticMarkup(<Button>Continuer</Button>)).toMatch(/<button[^>]*>Continuer<\/button>/)
  expect(renderToStaticMarkup(<Button disabled>Continuer</Button>)).toMatch(/<button[^>]*disabled=""[^>]*>Continuer<\/button>/)
})
