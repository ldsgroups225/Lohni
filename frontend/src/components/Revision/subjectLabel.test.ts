import { expect, test } from 'vitest'
import { deSubject } from './subjectLabel'

test('élide devant une voyelle ou un h muet', () => {
  for (const subject of ['Anglais', 'Histoire-Géographie', 'EPS', 'Éducation civique']) expect(deSubject(subject)).toBe(`d’${subject}`)
  expect(deSubject('Mathématiques')).toBe('de Mathématiques')
  expect(deSubject('Hockey')).toBe('de Hockey')
})
