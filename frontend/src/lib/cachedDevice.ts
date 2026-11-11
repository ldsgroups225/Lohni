export function cachedDevice() {
  try { return localStorage.getItem('lohni-device-id') } catch { return null }
}

let revisionCacheVersion = 0
export const currentRevisionCacheVersion = () => revisionCacheVersion
export const invalidateRevisionCache = (...paths: string[]) => {
  revisionCacheVersion++
  if (paths.length) paths.forEach(path => snapshots.delete(path))
  else snapshots.clear()
}

const snapshots = new Map<string, { device: string | null; day: string; value: unknown }>()
export function revisionSnapshot<T>(path: string): T | undefined {
  const item = snapshots.get(path)
  return item && item.device === cachedDevice() && item.day === new Date().toDateString() ? item.value as T : undefined
}
export function rememberRevisionSnapshot(path: string, value: unknown) {
  snapshots.set(path, { device: cachedDevice(), day: new Date().toDateString(), value })
}
