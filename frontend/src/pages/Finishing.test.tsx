import { beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [state.values.shift(), () => {}] }))
vi.mock('../lib/api', () => ({ revisionAPI: {}, revisionPolicy: {}, revisionSyncStatus: () => ({ online: true, pending: 0 }) }))
import Home from './Home'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)
const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
beforeEach(() => { state.values = [] })
test('accueil présente la session et les cartes vues par matière', () => {
 state.values = [{ profile: { schoolClass:'3e' }, state:'ready', totalCards: 6, cardCount: 6, estimatedMinutes:5, daysUntilExam:null }, { streak:3, xp:100, subjects:[{subjectId:'m',name:'Mathématiques',mastery:98,status:'Fragile'}] }, false, '', '', 0, [{subjectId:'m',seenCards:2,cards:[1,2,3]}]]
 const html = render(<Home />)
 expect(html).toContain('Salut !')
 expect(html).toContain('2 cartes vues sur 3')
 expect(html).not.toContain('href="/tutor"')
})
