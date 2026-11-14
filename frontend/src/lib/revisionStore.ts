import type { RevisionPlan } from '../../../backend/src/services/revision/plan'
import { daysBetween, localDay } from '../../../backend/src/services/revision/day'
import { REVISION_POLICY as revisionPolicy } from '../../../backend/src/services/revision/policy'
import { advanceSession } from '../../../backend/src/services/revision/session'
import { env } from '../config/env'
import { APIError, req } from './http'
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


export type RevisionExam = { id: string; title: string; date: string; subjects: string[]; chapterIds: string[] };
export type RevisionProfile = { schoolClass: string; series?: string; subjects: string[]; examDate?: string };
export type RevisionSettings = { dailyMinutes: number; restDays: number[] };
export type RevisionCard = {
  id: string; chapterId: string; kind: 'basic' | 'mcq'; question: string; answer: string;
  options?: string[]; correct?: number; origin: 'ai' | 'import'; due: string; reviews: number;
};
export type RevisionSession = {
  kind?: 'exam' | 'express' | 'missed' | 'chapter';
  id: string; localDate: string; cards: RevisionCard[]; position: number; complete: boolean; repeated: string[]; elapsedMs: number; earnedXP: number;
  summary?: {
    quiz: { total: number; correct: number };
    flashcards: { total: number; knew: number };
    missed: { cardId: string; question: string; kind: 'basic' | 'mcq' }[];
  };
};
export type MasteryStatus = 'Fragile' | 'En cours' | 'Solide';
export type RevisionProgress = {
  streak: number; streakStarted: boolean; xp: number; learnedCards: number; completedDates?: string[];
  subjects: { subjectId: string; name: string; mastery: number | null; status: MasteryStatus }[];
};
export type RevisionChapter = {
  id: string; subjectId: string; subject: string; title: string; summary: string; origin: 'ai' | 'import';
  cards: RevisionCard[]; seenCards: number; mastery: number | null; status: MasteryStatus;
};
export type RevisionCardInput = { kind: 'basic'; question: string; answer: string } | {
  kind: 'mcq'; question: string; answer: string; options: string[]; correct: number;
};
export type RevisionHome = {
  profile: RevisionProfile; nextExam: Pick<RevisionExam, 'id' | 'title' | 'date'> | null; daysUntilExam: number | null; totalCards: number;
  cardCount: number; reviewCards?: number; newCards?: number; estimatedMinutes: number; moreCards: boolean; started: boolean; state: 'ready' | 'done' | 'empty';
};

const revisionHttpsError = 'Ouvre Lohni en HTTPS dans un navigateur à jour pour sauvegarder tes réponses hors ligne.';

export function revisionDeviceId(): string {
  if (!globalThis.crypto?.randomUUID || !navigator.locks) throw new Error(revisionHttpsError);
  let deviceId = localStorage.getItem('lohni-device-id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('lohni-device-id', deviceId);
  }
  return deviceId;
}

function revisionLocalDate(): string {
  return localDay();
}

class RevisionConnectionError extends Error {}

async function revisionRequest<T>(path: string, method = 'GET', body?: unknown, localDate = revisionLocalDate(), timeout = Math.max(env.timeout, 120000), signal?: AbortSignal): Promise<T> {
  const deviceId = revisionDeviceId();
  const multipart = body instanceof FormData;
  try {
    const result = await req<{ data: T }>(`${env.backend}/revision${path}`, {
      method,
      headers: { ...(!multipart && { 'Content-Type': 'application/json' }), 'X-Device-Id': deviceId, 'X-Local-Date': localDate },
      body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
      timeout, signal,
    });
    return result.data;
  } catch (error) {
    if (error instanceof APIError && error.code === 'NETWORK') throw new RevisionConnectionError('Connexion impossible. Tes réponses restent enregistrées sur cet appareil.');
    if (signal?.aborted) throw error;
    if (error instanceof APIError && error.code === 'TIMEOUT') throw new RevisionConnectionError('Le chargement prend trop de temps. Tes réponses restent enregistrées sur cet appareil.');
    throw error;
  }
}

type RevisionAnswer = { answerId: string; sessionId: string; cardId: string; position: number; knew: boolean; choice?: number; durationMs: number };
type QueuedAnswer = { answer: RevisionAnswer; localDate: string };
type OfflineRevision = { session?: RevisionSession; pending: QueuedAnswer[]; cache: Record<string, unknown>; cacheDates?: Record<string, string> };
let syncError = '';
let syncing: Promise<void> | undefined;
const offlineKey = () => `lohni-revision-offline:${revisionDeviceId()}`;
function readOffline(): OfflineRevision {
  const key = offlineKey();
  const value = localStorage.getItem(key);
  try { if (value) return JSON.parse(value); }
  catch { localStorage.removeItem(key); }
  return { pending: [], cache: {} };
}
async function updateOffline(update: (state: OfflineRevision) => void): Promise<void> {
  const save = () => {
    const state = readOffline();
    update(state);
    try { localStorage.setItem(offlineKey(), JSON.stringify(state)); }
    catch { throw new Error('Stockage de l’appareil plein ou indisponible. Libère de la place avant de répondre.'); }
    window.dispatchEvent(new Event('revision-sync'));
  };
  // Le verrou protège la file quand deux onglets répondent ou synchronisent en même temps.
  if (!navigator.locks) throw new Error(revisionHttpsError);
  await navigator.locks.request('lohni-revision-offline', save);
}
export function revisionSyncStatus() {
  if (!globalThis.crypto?.randomUUID || !navigator.locks) return { pending: 0, error: revisionHttpsError, online: navigator.onLine };
  return { pending: readOffline().pending.length, error: syncError, online: navigator.onLine };
}
export function syncRevisionAnswers(): Promise<void> {
  if (syncing) return syncing;
  const device = cachedDevice();
  syncing = Promise.resolve().then(async () => {
    syncError = '';
    try {
      while (navigator.onLine && cachedDevice() === device) {
        const queued = readOffline().pending[0];
        if (!queued) break;
        let session: RevisionSession | undefined;
        try { session = await revisionRequest<RevisionSession>('/session/answer', 'POST', queued.answer, queued.localDate, 8000); }
        catch (error) {
          if (!(error instanceof APIError && error.status === 400 && error.code === 'REVISION_LOCAL_DATE_OUT_OF_RANGE')) throw error;
        }
        if (cachedDevice() !== device) break;
        await updateOffline(state => {
          if (cachedDevice() !== device) return;
          state.pending = state.pending.filter(item => item.answer.answerId !== queued.answer.answerId);
          if (session && !state.pending.length && (!state.session || state.session.id !== session.id || state.session.position <= session.position)) state.session = session;
        });
      }
    } catch (error) {
      syncError = error instanceof Error ? error.message : 'Synchronisation impossible. Réessaie.';
    }
  }).finally(() => {
    syncing = undefined;
    window.dispatchEvent(new Event('revision-sync'));
  });
  return syncing;
}
const revisionReads = new Map<string, Promise<unknown>>()
async function sharedRevisionRead<T>(path: string, read: () => Promise<T>): Promise<T> {
  const device = revisionDeviceId()
  const version = currentRevisionCacheVersion()
  const day = revisionLocalDate()
  const key = JSON.stringify([device, version, day, path])
  const pending = revisionReads.get(key)
  if (pending) return pending as Promise<T>
  const request = read().then(value => {
    if (cachedDevice() !== device) throw new Error('Les données ont changé. Actualise la page.')
    if (currentRevisionCacheVersion() !== version || revisionLocalDate() !== day) return sharedRevisionRead(path, read)
    rememberRevisionSnapshot(path, value)
    return value
  }, error => {
    if (cachedDevice() === device && (currentRevisionCacheVersion() !== version || revisionLocalDate() !== day)) return sharedRevisionRead(path, read)
    throw error
  }).finally(() => { revisionReads.delete(key) })
  revisionReads.set(key, request)
  return request
}
async function cachedRevisionReadSource<T>(path: string): Promise<{ value: T; offline: boolean }> {
    await syncRevisionAnswers()
    const device = cachedDevice()
    const version = currentRevisionCacheVersion()
    const day = revisionLocalDate()
    const saved = readOffline()
    const cached = (path === '/profile' || path === '/exams' || path === '/plan') || (saved.cacheDates?.[path] === day && !saved.pending.length) ? saved.cache[path] : undefined
    try {
      if (!navigator.onLine) throw new RevisionConnectionError('Hors ligne. Connecte-toi pour charger ces données.')
      const result = await revisionRequest<T>(path, 'GET', undefined, undefined, 8000)
      await updateOffline(state => {
        if (cachedDevice() === device && currentRevisionCacheVersion() === version && revisionLocalDate() === day) {
          state.cache[path] = result
          state.cacheDates ??= {}
          state.cacheDates[path] = day
        }
      })
      return { value: result, offline: false }
    } catch (error) {
      if (error instanceof RevisionConnectionError && cached !== undefined) return { value: cached as T, offline: true }
      throw error
    }
}
function cachedRevisionRead<T>(path: string): Promise<T> {
  return sharedRevisionRead(path, async () => (await cachedRevisionReadSource<T>(path)).value)
}
async function revisionSession(continueSession = false): Promise<RevisionSession> {
  await syncRevisionAnswers();
  const device = revisionDeviceId();
  const saved = readOffline();
  if (saved.pending.length && saved.session) {
    if (continueSession) throw new Error('Tes réponses doivent être envoyées avant de continuer. Reconnecte-toi puis réessaie.');
    return saved.session;
  }
  try {
    if (!navigator.onLine) throw new RevisionConnectionError('Hors ligne. Charge une session avec le réseau pour commencer.');
    const next = await revisionRequest<RevisionSession>(continueSession ? '/session/continue' : '/session', continueSession ? 'POST' : 'GET', undefined, undefined, 8000);
    if (cachedDevice() !== device) throw new DeviceChangedError();
    await updateOffline(state => {
      if (cachedDevice() === device && !state.pending.length && (!state.session || state.session.id !== next.id || state.session.position <= next.position)) state.session = next;
    });
    if (cachedDevice() !== device) throw new DeviceChangedError();
    const session = readOffline().session;
    if (!session) throw new Error('Session introuvable. Recharge la page puis réessaie.');
    rememberRevisionSnapshot('/session', session);
    return session;
  } catch (error) {
    if (!continueSession && error instanceof RevisionConnectionError && saved.session) return saved.session;
    throw error;
  }
}
const examAnswerIds = new Map<string, string>();
// Séances ciblées (cartes ratées, chapitre) : créées côté serveur, répondues en ligne comme les séances d’examen.
async function scopedSession(path: string): Promise<RevisionSession> {
  if (!navigator.onLine) throw new Error('Connecte-toi pour lancer cette révision.');
  await syncRevisionAnswers();
  if (readOffline().pending.length) throw new Error('Reconnecte-toi pour envoyer tes réponses avant de continuer.');
  const device = revisionDeviceId();
  const session = await revisionRequest<RevisionSession>(path, 'POST', undefined, undefined, 8000);
  if (cachedDevice() !== device) throw new DeviceChangedError();
  return session;
}
// Efface la date persistée des lectures périmées : elles ne servent plus hors ligne.
function forgetDates(state: OfflineRevision, write: RevisionWrite) {
  if (state.cacheDates) for (const path of staleReads(write)) delete state.cacheDates[path];
}
async function revisionAnswer(input: Omit<RevisionAnswer, 'answerId'>): Promise<RevisionSession> {
  let next: RevisionSession | undefined;
  await updateOffline(state => {
    const session = state.session;
    const card = session?.cards[session.position];
    if (!session || session.complete || session.id !== input.sessionId || session.position !== input.position || card?.id !== input.cardId) {
      throw new Error('Cette carte a déjà été répondue. Recharge ta session.');
    }
    const knew = input.knew && (card.kind !== 'mcq' || input.choice === card.correct);
    const answer = { ...input, answerId: crypto.randomUUID() };
    state.pending.push({ answer, localDate: session.localDate });
    forgetDates(state, 'answer');
    advanceSession(session, knew, input.durationMs);
    delete session.summary; // périmé : le récap le recharge une fois les réponses envoyées
    next = session;
  });
  revisionWrote('answer');
  void syncRevisionAnswers();
  if (!next) throw new Error('Session introuvable. Recharge la page puis réessaie.');
  rememberRevisionSnapshot('/session', next);
  return next;
}
async function revisionMutation<T>(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  await syncRevisionAnswers();
  if (readOffline().pending.length) throw new Error('Reconnecte-toi pour envoyer tes réponses avant de modifier tes cours ou ton profil.');
  signal?.throwIfAborted();
  const device = revisionDeviceId();
  let result: T;
  try { result = await revisionRequest<T>(path, method, body, undefined, undefined, signal); } catch (error) {
    if (device !== cachedDevice()) throw new DeviceChangedError();
    if (signal?.aborted || (error instanceof APIError && error.chapterId)) revisionWrote('change');
    throw error;
  }
  if (device !== cachedDevice()) throw new DeviceChangedError();
  if (path === '/profile') {
    // Le profil change tout le plan, mais l’accueil reste affichable pendant sa relecture avec le nouveau profil.
    const home = revisionSnapshot<RevisionHome | null>('/home'), progress = revisionSnapshot<RevisionProgress>('/progress')
    invalidateRevisionCache()
    if (home) rememberRevisionSnapshot('/home', { ...home, profile: result as RevisionProfile })
    if (progress) rememberRevisionSnapshot('/progress', progress)
  }
  else revisionWrote('change')
  await updateOffline(state => { if (device === cachedDevice()) {
    forgetDates(state, 'change');
    if (path === '/profile') { state.cache['/profile'] = result; delete state.cache['/home']; }
    if (path === '/exams' || path.startsWith('/exams/')) {
      const exams = (state.cache['/exams'] as RevisionExam[] | undefined) ?? [];
      const id = path.startsWith('/exams/') ? decodeURIComponent(path.slice('/exams/'.length)) : undefined;
      state.cache['/exams'] = method === 'DELETE' ? exams.filter(exam => exam.id !== id) : [...exams.filter(exam => exam.id !== (result as RevisionExam).id), result as RevisionExam];
      delete state.cache['/home'];
    }
  } });
  if (path === '/profile') {
    if (device !== cachedDevice()) throw new DeviceChangedError();
    rememberRevisionSnapshot('/profile', result);
  }
  return result;
}

// Réveils de la synchro (retour en ligne, retour sur l’onglet, 30 s) : posés par prepareRevisionStartup, une seule fois, retirés si le module est remplacé à chaud.
let stopSyncTriggers: (() => void) | undefined
function startSyncTriggers() {
  if (stopSyncTriggers) return
  const sync = () => { void syncRevisionAnswers() }
  const timer = window.setInterval(() => { if (revisionSyncStatus().pending) sync() }, 30000)
  window.addEventListener('online', sync)
  window.addEventListener('focus', sync)
  stopSyncTriggers = () => { clearInterval(timer); window.removeEventListener('online', sync); window.removeEventListener('focus', sync); stopSyncTriggers = undefined }
}
import.meta.hot?.dispose(() => stopSyncTriggers?.())

export type RevisionImportedChapter = { id: string; title: string; summary: string; origin: 'import' };
export type RevisionImportQuota = { remaining: number; resetsAt: string };

export type TimetableBlock = { day: number; start: string; end: string; subject: string };

async function revisionHome() {
  let home: RevisionHome | null;
  try { home = await cachedRevisionRead<RevisionHome | null>('/home'); }
  catch (error) {
    const saved = readOffline();
    const profile = saved.cache['/profile'] as RevisionProfile | undefined;
    if (!(error instanceof RevisionConnectionError) || !profile || !saved.session) throw error;
    home = { profile, nextExam: null, daysUntilExam: null,
      totalCards: saved.session.cards.length, cardCount: 0, estimatedMinutes: 0, moreCards: false, started: false, state: 'empty' };
  }
  if (home) {
    rememberRevisionSnapshot('/profile', home.profile);
    try {
      const exams = await cachedRevisionRead<RevisionExam[]>('/exams');
      const next = exams.filter(exam => exam.date >= revisionLocalDate()).sort ( (a, b) => a.date.localeCompare(b.date))[0];
      home = { ...home, nextExam: next ? { id: next.id, title: next.title, date: next.date } : null, daysUntilExam: next ? daysBetween(revisionLocalDate(), next.date) : null };
    } catch (error) { if (!(error instanceof RevisionConnectionError)) throw error; home = { ...home, nextExam: null, daysUntilExam: null }; }
  }
  const session = readOffline().session;
  if (home && session && (session.localDate === revisionLocalDate() || readOffline().pending.length) && (!navigator.onLine || readOffline().pending.length)) {
    const cardCount = session.complete ? 0 : session.cards.length - session.position;
    const newCards = session.complete ? 0 : session.cards.slice(session.position).filter((card, index) =>
      card.reviews === 0 && !session.cards.slice(0, session.position + index).some(previous => previous.id === card.id)).length;
    return { ...home, newCards, reviewCards: cardCount - newCards, moreCards: false, started: !session.complete && session.position > 0, state: session.complete ? 'done' as const : 'ready' as const, cardCount, estimatedMinutes: Math.ceil(cardCount * revisionPolicy.sessionMinutes / revisionPolicy.sessionCards) };
  }
  return home;
}

export const revisionAPI = {
  // Pour les pages : lectures déjà en cache, garde « appareil changé » et dernière série vue (le reste du cache reste interne).
  cached: revisionCached,
  deviceGuard,
  lastStreak: (streak: number): number | null => {
    const key = `lohni-last-streak:${revisionDeviceId()}`;
    const previous = localStorage.getItem(key);
    localStorage.setItem(key, String(streak));
    const value = Number(previous);
    return previous !== null && Number.isFinite(value) && value < streak ? value : null;
  },
  timetable: () => revisionRequest<TimetableBlock[]>('/timetable'),
  saveTimetable: (blocks: TimetableBlock[]) => revisionMutation<TimetableBlock[]>('/timetable', 'PUT', blocks),
  readTimetablePhotos: (files: File[]) => { const form = new FormData(); files.forEach(file => { form.append('file', file) }); return revisionMutation<{ blocks: TimetableBlock[]; unknownSubjects: string[] }>('/timetable/photos', 'POST', form); },
  home: async () => {
    const startDevice = cachedDevice(), startVersion = currentRevisionCacheVersion();
    const result = await revisionHome();
    if (result && cachedDevice() === startDevice && currentRevisionCacheVersion() === startVersion) rememberRevisionSnapshot('/home', result);
    return result;
  },
  plan: () => sharedRevisionRead('/plan:source', async () => { const { value, offline } = await cachedRevisionReadSource<RevisionPlan>('/plan'); return { plan: value, offline }; }),
  progress: () => cachedRevisionRead<RevisionProgress>('/progress'),
  exams: () => cachedRevisionRead<RevisionExam[]>('/exams'),
  saveExam: (exam: Omit<RevisionExam, 'id'> & { id?: string }) => revisionMutation<RevisionExam>(exam.id ? `/exams/${encodeURIComponent(exam.id)}` : '/exams', exam.id ? 'PUT' : 'POST', exam),
  deleteExam: (id: string) => revisionMutation<null>(`/exams/${encodeURIComponent(id)}`, 'DELETE'),
  profile: () => cachedRevisionRead<RevisionProfile | null>('/profile'),
  settings: () => revisionRequest<RevisionSettings>('/settings'),
  saveSettings: (settings: RevisionSettings) => revisionMutation<RevisionSettings>('/settings', 'PUT', settings),
  chapters: () => cachedRevisionRead<RevisionChapter[]>('/chapters'),
  deleteChapter: (id: string) => revisionMutation<null>(`/chapters/${encodeURIComponent(id)}`, 'DELETE'),
  updateCard: (id: string, card: RevisionCardInput) => revisionMutation<null>(`/cards/${encodeURIComponent(id)}`, 'PUT', card),
  saveProfile: (profile: RevisionProfile) => revisionMutation<RevisionProfile>('/profile', 'PUT', profile),
  saveTutorNote: (note: { subject: string; title: string; question: string; answer: string }) => revisionMutation<{ id: string }>('/notes', 'POST', note),
  generateChapter: (input: { subject: string; title: string }) => revisionMutation<{ id: string }>('/chapters', 'POST', input),
  importQuota: () => sharedRevisionRead('/import/quota', () => revisionRequest<RevisionImportQuota>('/import/quota')),
  retryImport: (id: string, signal?: AbortSignal) => revisionMutation<RevisionImportedChapter>(`/import/${encodeURIComponent(id)}/retry`, 'POST', undefined, signal),
  discardImport: (id: string) => revisionMutation<null>(`/import/${encodeURIComponent(id)}`, 'DELETE'),
  importChapter: (input: { subject: string; title: string; text?: string; file?: File }, signal?: AbortSignal) => {
    if (!input.file) return revisionMutation<RevisionImportedChapter>('/import', 'POST', input, signal);
    const form = new FormData();
    form.append('q', JSON.stringify({ title: input.title, subject: input.subject }));
    form.append('file', input.file);
    return revisionMutation<RevisionImportedChapter>('/import', 'POST', form, signal);
  },
  missedSession: (sourceId: string) => scopedSession(`/session/${encodeURIComponent(sourceId)}/review-missed`),
  chapterSession: (chapterId: string) => scopedSession(`/chapters/${encodeURIComponent(chapterId)}/session`),
  examSession: async (id: string, continuing = false) => {
    if (!navigator.onLine) throw new Error('Connecte-toi pour lancer une révision d’examen.')
    await syncRevisionAnswers()
    if (readOffline().pending.length) throw new Error('Reconnecte-toi pour envoyer tes réponses avant de continuer.')
    const device = revisionDeviceId()
    const session = await revisionRequest<RevisionSession>(`/exams/${encodeURIComponent(id)}/session${continuing ? '/continue' : ''}`, continuing ? 'POST' : 'GET', undefined, undefined, 8000)
    if (cachedDevice() !== device) throw new DeviceChangedError()
    return session
  },
  examAnswer: async (input: Omit<RevisionAnswer, 'answerId'>) => {
    if (!navigator.onLine) throw new Error('Connecte-toi pour continuer cette révision.')
    const device = revisionDeviceId()
    const key = `${device}:${input.sessionId}:${input.position}`
    const answerId = examAnswerIds.get(key) ?? crypto.randomUUID()
    examAnswerIds.set(key, answerId)
    const session = await revisionRequest<RevisionSession>('/session/answer', 'POST', { ...input, answerId }, undefined, 8000)
    if (cachedDevice() !== device) throw new DeviceChangedError()
    examAnswerIds.delete(key)
    revisionWrote('answer')
    return session
  },
  session: () => revisionSession(),
  continue: async () => { const session = await revisionSession(true); revisionWrote('answer'); return session; },
  answer: revisionAnswer,
  deleteCard: (id: string) => revisionMutation<null>(`/cards/${encodeURIComponent(id)}`, 'DELETE'),
};

// Restore only snapshots whose device and local day are known before React renders.
export function prepareRevisionStartup() {
  startSyncTriggers()
  try {
    revisionDeviceId()
    const saved = readOffline()
    if (saved.cache['/profile'] !== undefined) rememberRevisionSnapshot('/profile', saved.cache['/profile'])
    // L’accueil s’affiche complet ou pas du tout : ses trois lectures reviennent ensemble, sinon il les attend derrière l’écran de démarrage.
    const homeKeys = ['/home', '/progress', '/chapters']
    if (!saved.pending.length && homeKeys.every(key => saved.cacheDates?.[key] === revisionLocalDate() && saved.cache[key] !== undefined)) for (const key of homeKeys) rememberRevisionSnapshot(key, saved.cache[key])
    void syncRevisionAnswers()
  } catch { /* The page reports unavailable storage or device support. */ }
}

export type { RevisionPlan }
