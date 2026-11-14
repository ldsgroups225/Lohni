import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [state.values.shift(), () => {}] }))
vi.mock('../lib/api', () => ({ revisionAPI: {} }))
import Profile from './Profile'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../lib/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

test.each([[0, 0, false, 'au repos'], [0, 12, false, 'au repos'], [0, 12, true, 'endormie'], [2, 12, true, 'contente']])('Moi annonce une seule mascotte selon la série %s et les XP %s', (streak, xp, streakStarted, humeur) => {
  state.values = [null, { streak, xp, streakStarted, learnedCards: 0 }, false, '', false]
  const html = renderToStaticMarkup(<MemoryRouter><Profile /></MemoryRouter>)
  expect(html.match(/aria-label="Lohni,/g)).toHaveLength(1)
  expect(html).toContain(`aria-label="Lohni, ${humeur}"`)
})
