export function withOccurrenceKeys<T>(items: readonly T[], identify: (item: T) => string) {
  const counts = new Map<string, number>()
  return items.map(value => {
    const identity = identify(value)
    const occurrence = counts.get(identity) ?? 0
    counts.set(identity, occurrence + 1)
    return { key: JSON.stringify([identity, occurrence]), value }
  })
}
