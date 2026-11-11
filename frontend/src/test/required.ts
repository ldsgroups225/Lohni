export function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Valeur attendue absente')
  return value
}
