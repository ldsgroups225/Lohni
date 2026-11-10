import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, () => {}],
}))
vi.mock('../../lib/api', () => ({ plannerMaterials: () => {} }))
import PlannerMindmap from './PlannerMindmap'

const props = { tasks: [], plan: null, onPlan: () => {}, onAssist: () => {}, onUpdateStatus: () => {}, onUpload: () => {}, onDelete: () => {} }

test('les anciennes bulles utilisent les couleurs du thème', () => {
  state.values = [{}, null, null, null, { x: 0, y: 0 }, 1.25, [{ id: '1', x: 0, y: 0, label: 'Ancienne idée', color: '#ff0000' }]]
  const html = renderToStaticMarkup(<PlannerMindmap {...props} />)
  expect(html).toContain('Ancienne idée')
  expect(html).not.toContain('#ff0000')
  expect(html).toContain('var(--color-secondary)')
})

test('la carte vide remplit la largeur disponible sur téléphone', () => {
  state.values = []
  const html = renderToStaticMarkup(<PlannerMindmap {...props} />)
  expect(html).toContain('viewBox="90 50 550 230"')
  expect(html).toContain('w-full max-w-[520px]')
  expect(html).toContain('font-size="20"')
})
