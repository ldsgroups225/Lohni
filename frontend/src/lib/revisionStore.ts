import { localDay } from '../../../backend/src/services/revision/day'
import type { RevisionChapter, RevisionHome, RevisionImportQuota, RevisionProfile, RevisionProgress, RevisionSession } from './api'
export const DEVICE_CHANGED = 'L’appareil a changé. Recharge la page avant de continuer.'
// Signal typé : l’appareil a changé pendant une opération, la page doit se recharger.
export class DeviceChangedError extends Error { constructor() { super(DEVICE_CHANGED) } }
// Mémorise l’appareil courant : `changed()` le compare, `assert()` lève DeviceChangedError s’il a changé (avant d’appliquer un résultat).
export function deviceGuard() {
  const device = cachedDevice()
  const changed = () => device !== cachedDevice()
  return { changed, assert() { if (changed()) throw new DeviceChangedError() } }
}

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

// Une seule table : ce qu’une écriture rend périmé. `/plan:source` est la lecture partagée du plan.
const homeReads = ['/home', '/progress', '/chapters', '/plan:source'] as const
const staleAfter = {
  answer: homeReads,
  change: [...homeReads, '/import/quota'],
} as const
export type RevisionWrite = keyof typeof staleAfter
export const staleReads = (write: RevisionWrite): readonly string[] => staleAfter[write]
export const revisionWrote = (write: RevisionWrite) => invalidateRevisionCache(...staleAfter[write])

// Lecture du cache pour les pages, par nom de lecture : instantané de l’appareil et du jour, ou `undefined`.
export const revisionCached = {
  home: () => revisionSnapshot<RevisionHome | null>('/home'),
  profile: () => revisionSnapshot<RevisionProfile | null>('/profile'),
  progress: () => revisionSnapshot<RevisionProgress>('/progress'),
  chapters: () => revisionSnapshot<RevisionChapter[]>('/chapters'),
  session: () => revisionSnapshot<RevisionSession>('/session'),
  importQuota: () => revisionSnapshot<RevisionImportQuota>('/import/quota'),
  // Vrai si une des lectures a été rendue périmée par une écriture.
  stale: (...reads: ('chapters' | 'progress' | 'importQuota')[]) => revisionSnapshotStale(...reads.map(read => read === 'importQuota' ? '/import/quota' : `/${read}`)),
}

const snapshots = new Map<string, { device: string | null; day: string; value: unknown; stale?: boolean }>()
export function revisionSnapshot<T>(path: string): T | undefined {
  const item = snapshots.get(path)
  return item && item.device === cachedDevice() && item.day === localDay() ? item.value as T : undefined
}
export const revisionSnapshotStale = (...paths: string[]) => paths.some(path => snapshots.get(path)?.stale)
export function rememberRevisionSnapshot(path: string, value: unknown) {
  snapshots.set(path, { device: cachedDevice(), day: localDay(), value })
}

// Lit sur l’appareil courant : si l’appareil change pendant la lecture (réponse ou erreur), la valeur est écartée, `onChanged` remet l’écran à zéro et la lecture repart.
export async function readOnDevice<T>(read: () => Promise<T>, onChanged: () => void = () => {}, isActive: () => boolean = () => true): Promise<T> {
  const device = cachedDevice()
  const same = () => !device || device === cachedDevice()
  try { const value = await read(); if (same() || !isActive()) return value }
  catch (error) { if (same() || !isActive()) throw error }
  onChanged()
  return readOnDevice(read, onChanged, isActive)
}
