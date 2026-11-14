import { expect, test } from 'vitest'
import { priorityLabel } from './priorityLabel'

test('la priorité est dite en français clair', () => {
  expect([5, 4, 3, 2, 1].map(priorityLabel)).toEqual(['À faire en priorité', 'À faire en priorité', 'Assez important', 'Peut attendre', 'Peut attendre'])
})
