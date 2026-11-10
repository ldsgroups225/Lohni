import { beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.values.shift(), () => {}],
}))
vi.mock('../lib/api', () => ({ revisionAPI: {}, revisionPolicy: {}, revisionSyncStatus: () => ({ online: true, pending: 0 }) }))
import Home from './Home'
import Courses from './Courses'
import Revision from './Revision'
const render = (element: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>)
beforeEach(() => { state.values = [] })

test('une session terminée fête la progression', () => {
  state.values = [{ profile: { schoolClass: '3e' }, state: 'done', totalCards: 2, daysUntilExam: null }, null, false, '', '', 0]
  expect(render(<Home />)).toContain('aria-label="Lohni, en fête"')
})

test('les cours vides invitent à commencer avec la mascotte', () => {
  state.values = [[], null, null, false, '']
  const html = render(<Courses />)
  expect(html).toContain('Tes cours apparaîtront ici')
  expect(html).toContain('aria-label="Lohni, au repos"')
})

test('une erreur annonce la mascotte désolée', () => {
  state.values = [null, null, false, 'Impossible de charger', '', 0]
  const html = render(<Home />)
  expect(html).toContain('role="alert"')
  expect(html).toContain('aria-label="Lohni, désolée"')
})

const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
const sync = { online: true, pending: 0 }
test('aucune mascotte ne distrait pendant une carte', () => {
  const card = { id: '1', kind: 'basic', question: 'Combien font 1 + 1 ?', answer: '2', origin: 'ai' }
  state.values = [profile, { cards: [card], position: 0, complete: false }, null, false, sync, '', false, undefined, '', '', null]
  const html = render(<Revision />)
  expect(html).toContain('Combien font 1 + 1 ?')
  expect(html).not.toContain('aria-label="Lohni,')
})

test('la fin de session affiche la mascotte en fête', () => {
  state.values = [profile, { cards: [], position: 1, complete: true, earnedXP: 10 }, null, false, sync, '', false, undefined, '', '', null]
  const html = render(<Revision />)
  expect(html).toContain('Session terminée !')
  expect(html).toContain('aria-label="Lohni, en fête"')
})
