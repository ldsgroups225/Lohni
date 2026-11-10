import { beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.values.shift(), () => {}],
}))
vi.mock('../lib/api', () => ({ revisionAPI: {}, revisionPolicy: { minimumSeenRatio: 0.5 } }))
import Home from './Home'
import Courses from './Courses'

const profile = { schoolClass: 'terminale', series: 'C', subjects: ['Mathématiques'] }
const progress = { xp: 0, streak: 0, learnedCards: 0, subjects: [{ subjectId: 'math', name: 'Mathématiques', mastery: null, status: 'À découvrir' }] }
const home = { profile, daysUntilExam: null, totalCards: 2, cardCount: 0, estimatedMinutes: 0, state: 'empty' }
const render = (element: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>)
beforeEach(() => { state.values = [] })

test('accueil : libellé de classe, maîtrise vide et accès aux cours sans promesse pour demain', () => {
  state.values = [home, progress, false, '', '', 0]
  const html = render(<Home />)
  expect(html).toContain('Terminale · BAC · Série C')
  expect(html).toContain("Aucune carte n&#x27;est à réviser aujourd&#x27;hui.")
  expect(html).toContain('href="/courses"')
  expect(html).toContain('Voir mes cours')
  expect(html).toMatch(/<progress[^>]*value="0"[^>]*class="[^"]*mastery-progress|<progress[^>]*class="[^"]*mastery-progress[^>]*value="0"/)
})

test.each([true, false])('accueil : lien de continuation selon les cartes disponibles (%s)', moreCards => {
  state.values = [{ ...home, state: 'done', moreCards }, null, false, '', '', 0]
  expect(render(<Home />).includes('Continuer les cartes restantes')).toBe(moreCards)
})

test.each([null, 0])('cours : la maîtrise %s est visuellement vide', mastery => {
  const chapter = { id: '1', subject: 'Mathématiques', title: 'Fractions', status: 'À découvrir', origin: 'import', mastery, seenCards: 0, cards: [], summary: '' }
  state.values = [[chapter], null, null, false, '']
  const html = render(<Courses />)
  expect(html).toMatch(/<progress[^>]*class="[^"]*mastery-progress[^>]*value="0"/)
})
