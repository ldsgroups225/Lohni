import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [state.values.shift(), () => {}] }))
vi.mock('../lib/api', () => ({ revisionAPI: {} }))
import Profile from './Profile'

test.each([[0, 0, 'au repos'], [0, 12, 'endormie'], [2, 12, 'contente']])('Moi annonce une seule mascotte selon la série %s et les XP %s', (streak, xp, humeur) => {
  state.values = [null, { streak, xp, learnedCards: 0 }, false, '', false]
  const html = renderToStaticMarkup(<MemoryRouter><Profile /></MemoryRouter>)
  expect(html.match(/aria-label="Lohni,/g)).toHaveLength(1)
  expect(html).toContain(`aria-label="Lohni, ${humeur}"`)
})
