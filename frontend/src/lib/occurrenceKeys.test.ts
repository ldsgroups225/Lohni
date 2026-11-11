import { expect, test } from 'vitest'
import { withOccurrenceKeys } from './occurrenceKeys'

test('distingue les doublons et conserve les clés des valeurs déplacées', () => {
  const first = withOccurrenceKeys(['a', 'b', 'a'], value => value)
  const reordered = withOccurrenceKeys(['b', 'a', 'a'], value => value)
  expect(new Set(first.map(item => item.key)).size).toBe(3)
  expect(reordered.map(item => item.key)).toEqual([first[1].key, first[0].key, first[2].key])
})
