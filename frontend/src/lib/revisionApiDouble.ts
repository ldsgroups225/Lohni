// Double de test : l’interface de cache de `revisionAPI`, adossée au vrai cache de lecture.
import { cachedDevice, invalidateRevisionCache, readOnDevice, rememberRevisionSnapshot, revisionSnapshot, revisionSnapshotStale } from './revisionReadCache'

export const revisionCacheDouble = { device: cachedDevice, snapshot: revisionSnapshot, snapshotStale: revisionSnapshotStale, read: readOnDevice }
export { invalidateRevisionCache, rememberRevisionSnapshot, revisionSnapshot }
