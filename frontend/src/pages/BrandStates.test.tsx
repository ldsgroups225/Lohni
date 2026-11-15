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
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)
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
