import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
vi.mock('../../lib/api', () => ({ revisionAPI: {}, revisionPolicy: {} }))
import Onboarding from './Onboarding'

test('le premier lancement accueille avec Lohni et son slogan', () => {
  const html = renderToStaticMarkup(<MemoryRouter><Onboarding /></MemoryRouter>)
  expect(html).toContain('Choisis ta langue et ton pays')
  expect(html).toContain('aria-label="Lohni, au repos"')
})
