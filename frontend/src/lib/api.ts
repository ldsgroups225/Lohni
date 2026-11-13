import type { RevisionPlan } from '../../../backend/src/services/revision/plan';
import { cachedDevice, currentRevisionCacheVersion, invalidateRevisionCache, rememberRevisionSnapshot } from "./cachedDevice";
import { env } from "../config/env";
import { REVISION_POLICY as revisionPolicy } from "../../../backend/src/services/revision/policy";
import { advanceSession } from "../../../backend/src/services/revision/session";

export type ChatStartResponse = { ok: true; chatId: string; stream: string };
export type ChatMessage = { role: "user" | "assistant"; content: string; at: number };
export type ChatInfo = { id: string; title?: string; createdAt?: number };
export type ChatsList = { ok: true; chats: ChatInfo[] };
export type ChatDetail = { ok: true; chat: ChatInfo; messages: ChatMessage[] };
export type ChatJSONBody = { q: string; chatId?: string };
export type ChatPhase = "upload_start" | "upload_done" | "generating";
export type FlashCard = { q: string; a: string; tags?: string[] };
export type Question = { id: number; question: string; options: string[]; correct: number; hint: string; explanation: string; };
export type QuizStartResponse = { ok: true; quizId: string; stream: string }
export type QuizEvent = { type: "ready" | "phase" | "quiz" | "done" | "error" | "ping"; quizId?: string; value?: string; quiz?: unknown; error?: string; t?: number }
export type SmartNotesStart = { ok: true; noteId: string; stream: string }
export type CompanionHistoryEntry = { role: "user" | "assistant"; content: string }
export type CompanionAnswer = { topic: string; answer: string; flashcards: FlashCard[] }
export type CompanionAskResponse = { ok: boolean; companion: CompanionAnswer }
export type SavedFlashcard = {
  id: string;
  question: string;
  answer: string;
  tag: string;
  created: number;
};
export type ExamEvent =
  | { type: "ready"; runId: string }
  | { type: "phase"; value: string; examId?: string }
  | { type: "exam"; examId: string; payload: Question[] }
  | { type: "done" }
  | { type: "error"; examId?: string; error: string };
export type PodcastEvent =
  | { type: "ready"; pid: string }
  | { type: "phase"; value: string }
  | { type: "file"; filename: string; mime: string }
  | { type: "warn"; message: string }
  | { type: "script"; data: any }
  | { type: "audio"; file: string; filename?: string; staticUrl?: string }
  | { type: "done" }
  | { type: "error"; error: string }
export type SmartNotesEvent =
  | { type: "ready"; noteId: string }
  | { type: "phase"; value: string }
  | { type: "file"; file: string }
  | { type: "done" }
  | { type: "error"; error: string }
  | { type: "ping"; t: number }
export type StudyMaterials = {
  summary: string;
  keyPoints: string[];
  topics: string[];
  categories: string[];
  searchableKeywords: string[];
  studyGuide: {
    mainConcepts: string[];
    importantTerms: { term: string; definition: string; }[];
    questions: string[];
    takeaways: string[];
  };
  timestamps?: { time: number; content: string; topic: string; }[];
};

export type TranscriptionResponse = {
  ok: boolean;
  transcription?: string;
  error?: string;
  studyMaterials?: StudyMaterials;
}
export type ChatEvent =
  | { type: "ready"; chatId: string }
  | { type: "phase"; value: ChatPhase }
  | { type: "file"; filename: string; mime: string }
  | { type: "answer"; answer: AnswerPayload }
  | { type: "done" }
  | { type: "error"; error: string };

type O<T> = Promise<T>;
type AnswerPayload = string | { answer: string; flashcards?: FlashCard[] };

const timeoutCtl = (ms: number) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

class APIError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function req<T = unknown>(
  url: string,
  init: RequestInit & { timeout?: number } = {}
): O<T> {
  const { timeout = env.timeout, ...rest } = init;
  const { signal, done } = timeoutCtl(timeout);
  try {
    const r = await fetch(url, { signal, ...rest });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      let detail: { error?: unknown; code?: unknown } | undefined;
      try { detail = JSON.parse(txt); } catch { /* Non-JSON responses keep their HTTP status. */ }
      throw new APIError(typeof detail?.error === "string" ? detail.error : `http ${r.status}: ${txt || r.statusText}`,
        r.status, typeof detail?.code === 'string' ? detail.code : undefined);
    }
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) return (await r.json()) as T;
    return (await r.text()) as unknown as T;
  } finally {
    done();
  }
}

const jsonHeaders = (_?: unknown) => {
  const h = new Headers();
  h.set("content-type", "application/json");
  return h;
};

export function wsURL(path: string) {
  const u = new URL(env.backend);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}${path}`;
}

export async function chatJSON(body: ChatJSONBody) {
  return req<ChatStartResponse>(`${env.backend}/chat`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify(body),
  });
}

export async function chatMultipart(q: string, files: File[], chatId?: string) {
  const f = new FormData();
  f.append("q", q);
  if (chatId) f.append("chatId", chatId);
  for (const file of files) f.append("file", file, file.name);
  return req<ChatStartResponse>(`${env.backend}/chat`, {
    method: "POST",
    body: f,
    timeout: Math.max(env.timeout, 300000),
  });
}

export function connectChatStream(chatId: string, onEvent: (ev: ChatEvent) => void) {
  const url = wsURL(`/ws/chat?chatId=${encodeURIComponent(chatId)}`);
  const ws = new WebSocket(url);
  ws.onmessage = (m) => {
    try {
      const data = JSON.parse(m.data as string) as ChatEvent;
      onEvent(data);
    } catch { }
  };
  ws.onerror = () => {
    onEvent({ type: "error", error: "stream_error" });
  };
  return { ws, close: () => { try { ws.close(); } catch { } } };
}

export async function chatAskOnce(opts: {
  q: string;
  files?: File[];
  chatId?: string;
  onEvent?: (ev: ChatEvent) => void;
}) {
  const { q, files = [], chatId, onEvent } = opts;
  const start = files.length ? await chatMultipart(q, files, chatId) : await chatJSON({ q, chatId });
  let answer = "";
  let flashcards: FlashCard[] | undefined;

  await new Promise<void>((resolve, reject) => {
    const { close } = connectChatStream(start.chatId, (ev) => {
      onEvent?.(ev);
      if (ev.type === "answer") {
        const p = ev.answer;
        if (typeof p === "string") {
          answer = p;
        } else if (p && typeof p === "object") {
          answer = p.answer ?? "";
          if (Array.isArray(p.flashcards)) flashcards = p.flashcards;
        }
      }
      if (ev.type === "done") { close(); resolve(); }
      if (ev.type === "error") { close(); reject(new Error(ev.error || "chat failed")); }
    });
  });

  return { chatId: start.chatId, answer, flashcards };
}

export async function companionAsk(input: {
  question: string;
  filePath?: string;
  documentText?: string;
  documentTitle?: string;
  topic?: string;
  history?: CompanionHistoryEntry[];
}) {
  const question = (input.question || "").trim();
  if (!question) throw new Error("Question is required");

  const payload: Record<string, unknown> = { question };
  if (input.filePath) payload.filePath = input.filePath;
  if (input.documentText) payload.documentText = input.documentText;
  if (input.documentTitle) payload.documentTitle = input.documentTitle;
  if (input.topic) payload.topic = input.topic;
  if (input.history?.length) {
    payload.history = input.history.map((h) => ({ role: h.role, content: h.content }));
  }

  return req<CompanionAskResponse>(`${env.backend}/api/companion/ask`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify(payload),
    timeout: Math.max(env.timeout, 120000),
  });
}

export function getChats() {
  return req<ChatsList>(`${env.backend}/chats`, { method: "GET" });
}

export function getChatDetail(id: string) {
  return req<ChatDetail>(`${env.backend}/chats/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function createFlashcard(input: {
  question: string;
  answer: string;
  tag: string;
}) {
  return req<{ ok: true; flashcard: SavedFlashcard }>(`${env.backend}/flashcards`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify(input),
  });
}

export async function listFlashcards() {
  return req<{ ok: true; flashcards: SavedFlashcard[] }>(`${env.backend}/flashcards`, {
    method: "GET",
  });
}

export async function deleteFlashcard(id: string) {
  return req<{ ok: true }>(`${env.backend}/flashcards/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getExams() {
  return req<{ ok: true; exams: { id: string; name: string; sections: any[] }[] }>(
    `${env.backend}/exams`,
    { method: "GET" }
  )
}

export async function startExam(examId: string) {
  return req<{ ok: true; runId: string; stream: string }>(
    `${env.backend}/exam`,
    {
      method: "POST",
      headers: jsonHeaders({}),
      body: JSON.stringify({ examId }),
    }
  )
}

export function connectExamStream(runId: string, onEvent: (ev: ExamEvent) => void) {
  const url = wsURL(`/ws/exams?runId=${encodeURIComponent(runId)}`)
  const ws = new WebSocket(url)
  let finished = false
  const fail = () => {
    if (!finished) {
      finished = true
      onEvent({ type: "error", error: "stream_error" })
    }
  }
  ws.onmessage = (m) => {
    try {
      const event = JSON.parse(m.data as string) as ExamEvent
      if (event.type === "done" || event.type === "error") finished = true
      onEvent(event)
    } catch { }
  }
  ws.onerror = fail
  ws.onclose = fail
  return { ws, close: () => { finished = true; try { ws.close() } catch { } } }
}

export async function smartnotesStart(input: { topic?: string; notes?: string; filePath?: string }) {
  return req<SmartNotesStart>(`${env.backend}/smartnotes`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
}

export function connectSmartnotesStream(noteId: string, onEvent: (ev: SmartNotesEvent) => void) {
  const url = wsURL(`/ws/smartnotes?noteId=${encodeURIComponent(noteId)}`);
  const ws = new WebSocket(url);
  ws.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data as string) as SmartNotesEvent);
    } catch { }
  };
  ws.onerror = () => onEvent({ type: "error", error: "stream_error" });
  return { ws, close: () => { try { ws.close(); } catch { } } };
}

export function flashcards(topic: string) {
  return req<{ cards: unknown[] }>(`${env.backend}/flashcards`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ topic }),
  });
}

export async function quizStart(topic: string) {
  return req<QuizStartResponse>(`${env.backend}/quiz`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify({ topic })
  }
  )
}

export async function podcastStart(payload: { topic: string }) {
  const url = `${env.backend}/podcast`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to start podcast")
  return data
}

export function connectPodcastStream(pid: string, onEvent: (ev: any) => void) {
  const wsUrl = `${env.backend.replace(/^http/, "ws")}/ws/podcast?pid=${pid}`
  const ws = new WebSocket(wsUrl)

  ws.onopen = () => {
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      onEvent(msg)
    } catch {
      onEvent({ type: "error", error: "invalid_message" })
    }
  }

  ws.onclose = () => {
  }

  ws.onerror = () => onEvent({ type: "error", error: "stream_error" } as any)
  return { ws, close: () => { try { ws.close() } catch { } } }
}

export function connectQuizStream(quizId: string, onEvent: (ev: QuizEvent) => void) {
  const url = wsURL(`/ws/quiz?quizId=${encodeURIComponent(quizId)}`);
  const ws = new WebSocket(url); ws.onmessage = m => {
    try {
      onEvent(JSON.parse(m.data as string) as QuizEvent)
    } catch { }
  }; ws.onerror = () => onEvent({ type: "error", error: "stream_error" } as any); return { ws, close: () => { try { ws.close() } catch { } } }
}

export async function transcribeAudio(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return req<TranscriptionResponse>(`${env.backend}/transcriber`, {
    method: 'POST',
    body: formData,
    timeout: Math.max(env.timeout, 180000),
  });
}

export type PlannerTask = {
  id: string;
  course?: string;
  title: string;
  type?: string;
  notes?: string;
  dueAt: number;
  estMins: number;
  priority: 1 | 2 | 3 | 4 | 5;
  status: "todo" | "doing" | "done" | "blocked";
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  files?: { id: string; filename: string; originalName: string; mimeType: string; size: number; uploadedAt: number }[];
  steps?: string[];
};

export type PlannerSlot = { id: string; taskId: string; start: number; end: number; kind: "focus" | "review" | "buffer"; done?: boolean }
export type WeeklyPlan = { days: { date: string; slots: PlannerSlot[] }[] }

export type PlannerEvent =
  | { type: "ready"; sid: string }
  | { type: "phase"; value: string }
  | { type: "plan.update"; taskId: string; slots: PlannerSlot[] }
  | { type: "materials.chunk"; id: string; idx: number; total: number; more: boolean; encoding: string; data: string }
  | { type: "materials.done"; id: string; total: number }
  | { type: "reminder"; text: string; at: number; taskId?: string; scheduledFor?: string }
  | { type: "daily.digest"; date: string; due: { id: string; title: string; dueAt: number }[]; sessions: number; message: string }
  | { type: "evening.review"; date: string; stats: any; tomorrowTasks: { id: string; title: string }[]; message: string }
  | { type: "break.reminder"; text: string; at: string }
  | { type: "task.created"; task: PlannerTask }
  | { type: "task.updated"; task: PlannerTask }
  | { type: "task.deleted"; taskId: string }
  | { type: "task.files.added"; taskId: string; files: any[] }
  | { type: "task.file.removed"; taskId: string; fileId: string }
  | { type: "session.started"; session: { id: string; taskId: string; slotId?: string; startedAt: string; status: string } }
  | { type: "session.ended"; session: { id: string; endedAt: string; minutesWorked: number; completed: boolean; status: string } }
  | { type: "weekly.update"; plan: WeeklyPlan }
  | { type: "slot.update"; taskId: string; slotId: string; done: boolean; skip: boolean }
  | { type: "done" };

export async function plannerIngest(text: string) {
  return req<{ ok: boolean; task: PlannerTask }>(`${env.backend}/tasks/ingest`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify({ text })
  })
}

export async function plannerList(params?: { status?: string; dueBefore?: number; course?: string }) {
  const q = new URLSearchParams()
  if (params?.status) q.set("status", params.status)
  if (params?.dueBefore) q.set("dueBefore", String(params.dueBefore))
  if (params?.course) q.set("course", params.course)
  const url = `${env.backend}/tasks${q.toString() ? `?${q}` : ""}`
  return req<{ ok: boolean; tasks: PlannerTask[] }>(url, { method: "GET" })
}

export async function plannerPlan(id: string, cram?: boolean) {
  return req<{ ok: boolean; task: PlannerTask & { plan?: { slots: PlannerSlot[] } } }>(`${env.backend}/tasks/${encodeURIComponent(id)}/plan`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify({ cram: !!cram })
  })
}

export async function plannerWeekly(cram?: boolean) {
  return req<{ ok: boolean; plan: WeeklyPlan }>(`${env.backend}/planner/weekly`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify({ cram: !!cram })
  })
}

export async function plannerMaterials(id: string, kind: "summary" | "studyGuide" | "flashcards" | "quiz") {
  return req<{ ok: boolean; data: any }>(`${env.backend}/tasks/${encodeURIComponent(id)}/materials`, {
    method: "POST",
    headers: jsonHeaders({}),
    body: JSON.stringify({ kind })
  })
}

export function connectPlannerStream(sid: string, onEvent: (ev: PlannerEvent) => void) {
  const url = wsURL(`/ws/planner?sid=${encodeURIComponent(sid)}`)
  const ws = new WebSocket(url)
  ws.onmessage = (m) => {
    try {
      const ev = JSON.parse(m.data as string)
      onEvent(ev)
    } catch { }
  }
  ws.onerror = () => { /* ignore for now */ }
  return { ws, close: () => { try { ws.close() } catch { } } }
}

export async function plannerUpdate(id: string, patch: Partial<PlannerTask>) {
  return req<{ ok: boolean; task: PlannerTask }>(`${env.backend}/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: jsonHeaders({}),
    body: JSON.stringify(patch)
  })
}

export async function plannerDelete(id: string) {
  return req<{ ok: boolean }>(`${env.backend}/tasks/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function plannerCreateWithFiles(data: { text?: string; title?: string; course?: string; type?: string; files?: File[] }) {
  const formData = new FormData()
  if (data.text) formData.append('q', data.text)
  if (data.title) formData.append('title', data.title)
  if (data.course) formData.append('course', data.course)
  if (data.type) formData.append('type', data.type)
  if (data.files) {
    for (const file of data.files) {
      formData.append('file', file, file.name)
    }
  }

  return req<{ ok: boolean; task: PlannerTask & { files?: any[] } }>(`${env.backend}/tasks`, {
    method: "POST",
    body: formData,
    timeout: Math.max(env.timeout, 300000),
  })
}

export async function plannerUploadFiles(taskId: string, files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('file', file, file.name)
  }

  return req<{ ok: boolean; files: any[] }>(`${env.backend}/tasks/${encodeURIComponent(taskId)}/files`, {
    method: "POST",
    body: formData,
    timeout: Math.max(env.timeout, 300000),
  })
}

export async function plannerDeleteFile(taskId: string, fileId: string) {
  return req<{ ok: boolean }>(`${env.backend}/tasks/${encodeURIComponent(taskId)}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE"
  })
}

export type DebateStartResponse = {
  ok: boolean;
  debateId: string;
  session: {
    id: string;
    topic: string;
    position: "for" | "against";
    createdAt: number;
  };
  stream: string;
  error?: string;
}

export type DebateSession = {
  id: string;
  topic: string;
  position: "for" | "against";
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>;
  createdAt: number;
}

export async function startDebate(topic: string, position: "for" | "against") {
  return req<DebateStartResponse>(`${env.backend}/debate/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, position }),
    timeout: 30000,
  })
}

export async function submitDebateArgument(debateId: string, argument: string) {
  return req<{ ok: boolean; message: string; error?: string }>(`${env.backend}/debate/${encodeURIComponent(debateId)}/argue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ argument }),
    timeout: 120000,
  })
}

export async function getDebateSession(debateId: string) {
  return req<{ ok: boolean; session: DebateSession; error?: string }>(`${env.backend}/debate/${encodeURIComponent(debateId)}`, {
    method: "GET",
  })
}

export async function listDebates() {
  return req<{ ok: boolean; debates: Array<any>; error?: string }>(`${env.backend}/debates`, {
    method: "GET",
  })
}

export async function deleteDebate(debateId: string) {
  return req<{ ok: boolean; message: string; error?: string }>(`${env.backend}/debate/${encodeURIComponent(debateId)}`, {
    method: "DELETE",
  })
}

export async function surrenderDebate(debateId: string) {
  return req<{ ok: boolean; message: string; error?: string }>(`${env.backend}/debate/${encodeURIComponent(debateId)}/surrender`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
}

export type DebateAnalysis = {
  winner: "user" | "ai" | "draw";
  reason: string;
  userStrengths: string[];
  aiStrengths: string[];
  userWeaknesses: string[];
  aiWeaknesses: string[];
  keyMoments: string[];
  overallAssessment: string;
}

export async function analyzeDebate(debateId: string) {
  return req<{ ok: boolean; analysis: DebateAnalysis; session: DebateSession; error?: string }>(`${env.backend}/debate/${encodeURIComponent(debateId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeout: 60000,
  })
}

export function err(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export { revisionPolicy };

export type RevisionExam = { id: string; title: string; date: string; subjects: string[]; chapterIds: string[] };
export type RevisionProfile = { schoolClass: string; series?: string; subjects: string[]; examDate?: string };
export type RevisionSettings = { dailyMinutes: number; restDays: number[] };
export type RevisionCard = {
  id: string; chapterId: string; kind: 'basic' | 'mcq'; question: string; answer: string;
  options?: string[]; correct?: number; origin: 'ai' | 'import'; due: string; reviews: number;
};
export type RevisionSession = {
  id: string; localDate: string; cards: RevisionCard[]; position: number; complete: boolean; repeated: string[]; elapsedMs: number; earnedXP: number;
  summary?: {
    quiz: { total: number; correct: number };
    flashcards: { total: number; knew: number };
    missed: { cardId: string; question: string; kind: 'basic' | 'mcq' }[];
  };
};
export type MasteryStatus = 'Fragile' | 'En cours' | 'Solide';
export type RevisionProgress = {
  streak: number; streakStarted: boolean; xp: number; learnedCards: number;
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
  cardCount: number; estimatedMinutes: number; moreCards: boolean; started: boolean; state: 'ready' | 'done' | 'empty';
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
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
}

class RevisionConnectionError extends Error {}

async function revisionRequest<T>(path: string, method = 'GET', body?: unknown, localDate = revisionLocalDate(), timeout = Math.max(env.timeout, 120000)): Promise<T> {
  const deviceId = revisionDeviceId();
  const multipart = body instanceof FormData;
  try {
    const result = await req<{ data: T }>(`${env.backend}/revision${path}`, {
      method,
      headers: { ...(!multipart && { 'Content-Type': 'application/json' }), 'X-Device-Id': deviceId, 'X-Local-Date': localDate },
      body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
      timeout,
    });
    return result.data;
  } catch (error) {
    if (error instanceof TypeError) throw new RevisionConnectionError('Connexion impossible. Tes réponses restent enregistrées sur cet appareil.');
    if (error instanceof Error && error.name === 'AbortError') throw new RevisionConnectionError('Le chargement prend trop de temps. Tes réponses restent enregistrées sur cet appareil.');
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
function cachedRevisionRead<T>(path: string): Promise<T> {
  return sharedRevisionRead(path, async () => {
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
      return result
    } catch (error) {
      if (error instanceof RevisionConnectionError && cached !== undefined) return cached as T
      throw error
    }
  })
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
    if (cachedDevice() !== device) throw new Error('L’appareil a changé. Recharge la page avant de continuer.');
    await updateOffline(state => {
      if (cachedDevice() === device && !state.pending.length && (!state.session || state.session.id !== next.id || state.session.position <= next.position)) state.session = next;
    });
    if (cachedDevice() !== device) throw new Error('L’appareil a changé. Recharge la page avant de continuer.');
    const session = readOffline().session;
    if (!session) throw new Error('Session introuvable. Recharge la page puis réessaie.');
    return session;
  } catch (error) {
    if (!continueSession && error instanceof RevisionConnectionError && saved.session) return saved.session;
    throw error;
  }
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
    if (state.cacheDates) { delete state.cacheDates['/home']; delete state.cacheDates['/progress']; }
    advanceSession(session, knew, input.durationMs);
    delete session.summary; // périmé : le récap le recharge une fois les réponses envoyées
    next = session;
  });
  invalidateRevisionCache('/home', '/progress');
  void syncRevisionAnswers();
  if (!next) throw new Error('Session introuvable. Recharge la page puis réessaie.');
  return next;
}
async function revisionMutation<T>(path: string, method: string, body?: unknown): Promise<T> {
  await syncRevisionAnswers();
  if (readOffline().pending.length) throw new Error('Reconnecte-toi pour envoyer tes réponses avant de modifier tes cours ou ton profil.');
  const device = revisionDeviceId();
  const result = await revisionRequest<T>(path, method, body);
  if (device !== cachedDevice()) throw new Error('L’appareil a changé. Recharge la page avant de continuer.');
  if (path === '/profile') invalidateRevisionCache()
  else invalidateRevisionCache('/home', '/progress', '/chapters')
  await updateOffline(state => { if (device === cachedDevice()) {
    if (state.cacheDates) { delete state.cacheDates['/home']; delete state.cacheDates['/progress']; }
    if (path === '/profile') { state.cache['/profile'] = result; delete state.cache['/home']; }
    if (path === '/exams' || path.startsWith('/exams/')) {
      const exams = (state.cache['/exams'] as RevisionExam[] | undefined) ?? [];
      const id = path.startsWith('/exams/') ? decodeURIComponent(path.slice('/exams/'.length)) : undefined;
      state.cache['/exams'] = method === 'DELETE' ? exams.filter(exam => exam.id !== id) : [...exams.filter(exam => exam.id !== (result as RevisionExam).id), result as RevisionExam];
      delete state.cache['/home'];
    }
  } });
  if (path === '/profile') {
    if (device !== cachedDevice()) throw new Error('L’appareil a changé. Recharge la page avant de continuer.');
    rememberRevisionSnapshot('/profile', result);
  }
  return result;
}

window.addEventListener('online', () => { void syncRevisionAnswers(); });
window.addEventListener('focus', () => { void syncRevisionAnswers(); });
window.setInterval(() => { if (revisionSyncStatus().pending) void syncRevisionAnswers(); }, 30000);

export type RevisionImportedChapter = { id: string; title: string; summary: string; origin: 'import' };
export type RevisionImportQuota = { remaining: number; resetsAt: string };

export const revisionAPI = {
  home: async () => {
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
        home = { ...home, nextExam: next ? { id: next.id, title: next.title, date: next.date } : null, daysUntilExam: next ? (Date.parse(next.date) - Date.parse(revisionLocalDate())) / 86400000 : null };
      } catch (error) { if (!(error instanceof RevisionConnectionError)) throw error; home = { ...home, nextExam: null, daysUntilExam: null }; }
    }
    const session = readOffline().session;
    if (home && session && (session.localDate === revisionLocalDate() || readOffline().pending.length) && (!navigator.onLine || readOffline().pending.length)) {
      const cardCount = session.complete ? 0 : session.cards.length - session.position;
      return { ...home, moreCards: false, started: !session.complete && session.position > 0, state: session.complete ? 'done' as const : 'ready' as const, cardCount, estimatedMinutes: Math.ceil(cardCount * revisionPolicy.sessionMinutes / revisionPolicy.sessionCards) };
    }
    return home;
  },
  plan: () => cachedRevisionRead<RevisionPlan>('/plan'),
  progress: () => cachedRevisionRead<RevisionProgress>('/progress'),
  exams: () => cachedRevisionRead<RevisionExam[]>('/exams'),
  saveExam: (exam: Omit<RevisionExam, 'id'> & { id?: string }) => revisionMutation<RevisionExam>(exam.id ? `/exams/${encodeURIComponent(exam.id)}` : '/exams', exam.id ? 'PUT' : 'POST', exam),
  deleteExam: (id: string) => revisionMutation<null>(`/exams/${encodeURIComponent(id)}`, 'DELETE'),
  profile: () => cachedRevisionRead<RevisionProfile | null>('/profile'),
  settings: () => revisionRequest<RevisionSettings>('/settings'),
  saveSettings: (settings: RevisionSettings) => revisionMutation<RevisionSettings>('/settings', 'PUT', settings),
  chapters: () => sharedRevisionRead('/chapters', () => revisionRequest<RevisionChapter[]>('/chapters')),
  deleteChapter: (id: string) => revisionMutation<null>(`/chapters/${encodeURIComponent(id)}`, 'DELETE'),
  updateCard: (id: string, card: RevisionCardInput) => revisionMutation<null>(`/cards/${encodeURIComponent(id)}`, 'PUT', card),
  saveProfile: (profile: RevisionProfile) => revisionMutation<RevisionProfile>('/profile', 'PUT', profile),
  saveTutorNote: (note: { subject: string; title: string; question: string; answer: string }) => revisionMutation<{ id: string }>('/notes', 'POST', note),
  generateChapter: (input: { subject: string; title: string }) => revisionMutation<{ id: string }>('/chapters', 'POST', input),
  importQuota: () => revisionRequest<RevisionImportQuota>('/import/quota'),
  importChapter: (input: { subject: string; title: string; text?: string; file?: File }) => {
    if (!input.file) return revisionMutation<RevisionImportedChapter>('/import', 'POST', input);
    const form = new FormData();
    form.append('q', JSON.stringify({ title: input.title, subject: input.subject }));
    form.append('file', input.file);
    return revisionMutation<RevisionImportedChapter>('/import', 'POST', form);
  },
  session: () => revisionSession(),
  continue: async () => { const session = await revisionSession(true); invalidateRevisionCache('/home', '/progress'); return session; },
  answer: revisionAnswer,
  deleteCard: (id: string) => revisionMutation<null>(`/cards/${encodeURIComponent(id)}`, 'DELETE'),
};

// Restore only snapshots whose device and local day are known before React renders.
export function prepareRevisionStartup() {
  try {
    revisionDeviceId()
    const saved = readOffline()
    if (saved.cache['/profile'] !== undefined) rememberRevisionSnapshot('/profile', saved.cache['/profile'])
    if (!saved.pending.length) for (const key of ['/home', '/progress']) {
      if (saved.cacheDates?.[key] === revisionLocalDate() && saved.cache[key] !== undefined) rememberRevisionSnapshot(key, saved.cache[key])
    }
    void syncRevisionAnswers()
  } catch { /* The page reports unavailable storage or device support. */ }
}

export type { RevisionPlan };
