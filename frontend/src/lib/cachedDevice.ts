export const DEVICE_CHANGED = 'L’appareil a changé. Recharge la page avant de continuer.'

export function cachedDevice() {
  try { return localStorage.getItem('lohni-device-id') } catch { return null }
}

let revisionCacheVersion = 0
export const currentRevisionCacheVersion = () => revisionCacheVersion
export const invalidateRevisionCache = (...paths: string[]) => {
  revisionCacheVersion++
  // Un chemin invalidé garde sa dernière valeur (affichable pendant la relecture) mais devient périmé ; sans chemin, tout est oublié.
  if (paths.length) paths.forEach(path => { const item = snapshots.get(path); if (item) item.stale = true })
  else snapshots.clear()
}

const snapshots = new Map<string, { device: string | null; day: string; value: unknown; stale?: boolean }>()
export function revisionSnapshot<T>(path: string): T | undefined {
  const item = snapshots.get(path)
  return item && item.device === cachedDevice() && item.day === new Date().toDateString() ? item.value as T : undefined
}
export const revisionSnapshotStale = (...paths: string[]) => paths.some(path => snapshots.get(path)?.stale)
export function rememberRevisionSnapshot(path: string, value: unknown) {
  snapshots.set(path, { device: cachedDevice(), day: new Date().toDateString(), value })
}
