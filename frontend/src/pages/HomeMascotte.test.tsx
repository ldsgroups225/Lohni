import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useState: () => [state.values.shift(), () => {}] }))
vi.mock('../lib/api', () => ({ revisionAPI: {} }))
import Home from './Home'

test.each([[0, 0, 'au repos'], [0, 12, 'endormie'], [2, 12, 'contente']])('accueil : humeur pour %s jours et %s XP', (streak, xp, humeur) => {
  state.values = [{ profile: { schoolClass: '3e' }, state: 'ready', totalCards: 1, cardCount: 1, daysUntilExam: null }, { streak, xp, subjects: [] }, false, '', '', 0, null, null]
  const html = renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)
  expect(html).toContain(`aria-label="Lohni, ${humeur}"`)
})

test.each([
  [null, null, true, '', ''],
  [null, null, false, '', ''],
  [null, null, false, 'Erreur', ''],
  [{ profile: { schoolClass: '3e' }, state: 'ready', totalCards: 1, cardCount: 1, daysUntilExam: null }, null, false, '', ''],
])('accueil : le logo mobile est présent sans menu inactif', (home, progress, loading, error, progressError) => {
  state.values = [home, progress, loading, error, progressError, 0, null, null, 1, '3e', '', [], '', 'Mathématiques', '', false, '']
  const html = renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>)
  expect(html).toMatch(/<header class="[^"]*lg:hidden[^"]*">.*?mascotte\/corps\.webp.*?Lohni<\/h2>/)
  expect(html).not.toContain('aria-label="Menu"')
})
