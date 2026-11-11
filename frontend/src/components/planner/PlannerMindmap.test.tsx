import { required } from '../../test/required'
// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import PlannerMindmap from './PlannerMindmap'

vi.mock('../../lib/api', () => ({ plannerMaterials: () => {} }))
const props = { tasks: [], plan: null, onPlan: () => {}, onAssist: () => {}, onUpdateStatus: () => {}, onUpload: () => {}, onDelete: () => {} }
const container = document.createElement('div')
const root = createRoot(container)
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => { act(() => root.render(null)); localStorage.clear() })

test('les anciennes bulles utilisent les couleurs du thème', async () => {
  localStorage.setItem('planner.customNodes', JSON.stringify([{ id: '1', x: 0, y: 0, label: 'Ancienne idée', color: '#ff0000' }]))
  await act(async () => root.render(<PlannerMindmap {...props} />))
  const node = [...container.querySelectorAll('[data-node]')].find(element => element.textContent?.includes('Ancienne idée'))
  expect(node).toBeTruthy()
  expect(required(node).innerHTML).not.toContain('#ff0000')
  expect(required(node).innerHTML).toContain('var(--color-secondary)')
})

test('la carte vide remplit la largeur disponible sur téléphone', async () => {
  await act(async () => root.render(<PlannerMindmap {...props} />))
  const svg = container.querySelector('svg[viewBox="90 50 550 230"]')
  expect(svg?.getAttribute('class')).toContain('w-full max-w-[520px]')
  expect(svg?.querySelector('[font-size="20"]')).toBeTruthy()
})
