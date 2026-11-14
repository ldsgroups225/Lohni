// Double de test : l’interface de cache de `revisionAPI`, adossée au vrai cache de lecture.
import { deviceGuard, invalidateRevisionCache, rememberRevisionSnapshot, revisionCached, revisionSnapshot } from '../lib/revisionStore'

export const revisionCacheDouble = { cached: revisionCached, deviceGuard }
export { invalidateRevisionCache, rememberRevisionSnapshot, revisionSnapshot }
