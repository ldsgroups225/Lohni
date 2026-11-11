export function cachedDevice() {
  try { return localStorage.getItem('lohni-device-id') } catch { return null }
}

let revisionCacheVersion = 0
export const currentRevisionCacheVersion = () => revisionCacheVersion
export const invalidateRevisionCache = () => { revisionCacheVersion++ }
