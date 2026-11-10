import { beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [state.values.shift(), () => {}] }))
vi.mock('../lib/api', () => ({ revisionAPI: {}, revisionPolicy: {}, revisionSyncStatus: () => ({ online: true, pending: 0 }) }))
import Home from './Home'
import Revision from './Revision'
const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
beforeEach(() => { state.values = [] })
test('accueil présente la session et les cartes vues par matière', () => {
 state.values = [{ profile: { schoolClass:'3e' }, state:'ready', totalCards: 6, cardCount: 6, estimatedMinutes:5, daysUntilExam:null }, { streak:3, xp:100, subjects:[{subjectId:'m',name:'Mathématiques',mastery:98,status:'Fragile'}] }, false, '', '', 0, [{subjectId:'m',seenCards:2,cards:[1,2,3]}]]
 const html = render(<Home />)
 expect(html).toContain('Salut !')
 expect(html).toContain('2 cartes vues sur 3')
 expect(html).not.toContain('href="/tutor"')
})
test('une carte propose de quitter sans lien d’import', () => {
 const card={id:'1',kind:'basic',question:'Quelle réponse ?',answer:'Oui',origin:'ai'}
 state.values=[{schoolClass:'3e',subjects:['Mathématiques']},{cards:[card],position:0,complete:false},null,false,{online:true,pending:0},'',false,undefined,'','',null]
 const html=render(<Revision />)
 expect(html).toContain('aria-label="Quitter la session"')
 expect(html).not.toContain('Importer mon cours')
})
test('la carte révélée propose les deux réponses et garde une sortie', () => {
 const card={id:'1',kind:'basic',question:'Quelle réponse ?',answer:'Oui',origin:'ai'}
 state.values=[{schoolClass:'3e',subjects:['Mathématiques']},{cards:[card],position:0,complete:false},null,false,{online:true,pending:0},'',true,undefined,'','',null]
 const html=render(<Revision />)
 expect(html).toContain('Je savais')
 expect(html).toContain('Je ne savais pas')
 expect(html).toContain('Quitter la session')
})
test('la fin de session propose un retour à l’accueil', () => {
 state.values=[{schoolClass:'3e',subjects:['Mathématiques']},{cards:[],position:2,complete:true,earnedXP:70},{xp:100,streak:3},false,{online:true,pending:0},'',false,undefined,'','',null]
 const html=render(<Revision />)
 expect(html).toContain('Revenir à l’accueil')
 expect(html).toContain('Lohni, en fête')
 expect(html).toContain('+70')
})
test('une carte ratée reste à retravailler pendant la session mais disparaît à la fin', () => {
 const card={id:'1',kind:'basic',question:'Quelle réponse ?',answer:'Oui',origin:'ai'}
 const profile={schoolClass:'3e',subjects:['Mathématiques']}
 const sync={online:true,pending:0}
 state.values=[profile,{cards:[card],position:0,complete:false},null,false,sync,'',false,undefined,'','',card]
 const ongoing=render(<Revision />)
 expect(ongoing).toContain('À retravailler')
 expect(ongoing).toContain('Explique-moi')
 state.values=[profile,{cards:[card],position:1,complete:true,earnedXP:0},null,false,sync,'',false,undefined,'','',card]
 const finished=render(<Revision />)
 expect(finished).toContain('Session terminée !')
 expect(finished).not.toContain('À retravailler')
 expect(finished).not.toContain('Explique-moi')
})

test.each([true, false])('fin de session : continuation selon les cartes disponibles (%s)', moreCards => {
 state.values=[{schoolClass:'3e',subjects:['Mathématiques']},{id:'s',cards:[],position:2,complete:true,earnedXP:70},{xp:100,streak:3},false,{online:true,pending:0},'',false,undefined,'','',null,null,moreCards]
 expect(render(<Revision />).includes('Continuer avec les cartes restantes')).toBe(moreCards)
})
