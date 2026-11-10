import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const state = vi.hoisted(() => ({ visible: false }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [state.visible, () => {}] }))
import Sidebar from './Sidebar'
const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>)
test('la navigation disparaît pendant une carte et revient hors session', () => {
 state.visible = true
 expect(render('/revision')).not.toContain('Navigation principale')
 expect(render('/')).toContain('Navigation principale')
 state.visible = false
 expect(render('/revision')).toContain('Navigation principale')
})
