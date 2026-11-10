import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [state.values.shift(), () => {}] }))
vi.mock('../lib/api', () => ({ revisionAPI: {} }))
import Home from './Home'

test.each([[0, 0, false, 'au repos'], [0, 12, false, 'au repos'], [0, 12, true, 'endormie'], [2, 12, true, 'contente']])('accueil : humeur pour %s jours et %s XP', (streak, xp, streakStarted, humeur) => {
  state.values = [{ profile: { schoolClass: '3e' }, state: 'ready', totalCards: 1, cardCount: 1, daysUntilExam: null }, { streak, xp, streakStarted, subjects: [] }, false, '', '', 0, null, null]
  const html = renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)
  expect(html).toContain(`aria-label="Lohni, ${humeur}"`)
})
