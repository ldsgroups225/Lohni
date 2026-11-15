import { env } from "../config/env";
import { REVISION_POLICY as revisionPolicy } from "../../../backend/src/services/revision/policy";
import { revisionDeviceId } from "./revisionStore";
import { APIError, req } from "./http";
export { APIError };
export * from "./revisionStore";

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
  | { type: "error"; error: string; code?: string }
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

type AnswerPayload = string | { answer: string; flashcards?: FlashCard[] };

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
      if (ev.type === "error") { close(); reject(new Error(ev.error || "La conversation a échoué. Réessaie.")); }
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
  if (!question) throw new Error("La question est obligatoire.");

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
      headers: deviceHeaders(true),
      body: JSON.stringify({ examId }),
    }
  )
}

export async function cancelExam(runId: string) {
  return req(`${env.backend}/exam/${encodeURIComponent(runId)}`, { method: "DELETE", headers: deviceHeaders() })
}

// Socket of a server task: a close before the end of the task is a failure ("stream_error").
function connectTaskSocket<E extends { type: string }>(path: string, onEvent: (ev: E) => void, invalid?: E) {
  const ws = new WebSocket(wsURL(path))
  let finished = false
  const fail = () => {
    if (!finished) {
      finished = true
      onEvent({ type: "error", error: "stream_error" } as unknown as E)
    }
  }
  ws.onmessage = (m) => {
    try {
      const event = JSON.parse(m.data as string) as E
      if (event.type === "done" || event.type === "error") finished = true
      onEvent(event)
    } catch { if (invalid) onEvent(invalid) }
  }
  ws.onerror = fail
  ws.onclose = fail
  return { ws, close: () => { finished = true; try { ws.close() } catch { } } }
}

export function connectExamStream(runId: string, onEvent: (ev: ExamEvent) => void) {
  return connectTaskSocket(`/ws/exams?runId=${encodeURIComponent(runId)}`, onEvent)
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

export async function podcastStart(payload: { topic: string; duration?: "short" | "long" }) {
  const url = `${env.backend}/podcast`
  return req<{ pid: string }>(url, { method: "POST", headers: deviceHeaders(true), body: JSON.stringify(payload) })
}

export async function podcastCancel(pid: string) {
  await req(`${env.backend}/podcast/${encodeURIComponent(pid)}`, { method: 'DELETE', headers: deviceHeaders() })
}

export function connectPodcastStream(pid: string, onEvent: (ev: any) => void) {
  return connectTaskSocket<{ type: string; [k: string]: any }>(`/ws/podcast?pid=${encodeURIComponent(pid)}`, onEvent, { type: "error", error: "invalid_message" })
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

// Exam, podcast and planner data belong to the device: every call carries the same id as the revision calls.
const deviceHeaders = (json = false) => {
  const h = new Headers({ "X-Device-Id": revisionDeviceId() });
  if (json) h.set("content-type", "application/json");
  return h;
};

// The server sends ISO dates (backend/src/services/planner/types.ts); the screens work in milliseconds.
const ms = (v: unknown) => typeof v === "string" ? Date.parse(v) : v as number
export const plannerSlot = (s: PlannerSlot): PlannerSlot => ({ ...s, start: ms(s.start), end: ms(s.end) })
export const plannerTask = <T extends { dueAt?: unknown }>(t: T): T =>
  ({ ...t, dueAt: ms(t.dueAt), ...("createdAt" in t ? { createdAt: ms((t as any).createdAt) } : {}), ...("updatedAt" in t ? { updatedAt: ms((t as any).updatedAt) } : {}) })
const plannerUnavailable = () => new APIError("Le planning est indisponible. Réessaie dans un instant.", 0, "BAD_PAYLOAD")
async function plannerOne<R extends { task: PlannerTask }>(call: Promise<R>) {
  const res = await call
  if (!res?.task) throw plannerUnavailable()
  return { ...res, task: plannerTask(res.task) }
}

export async function plannerIngest(text: string) {
  return plannerOne(req<{ ok: boolean; task: PlannerTask }>(`${env.backend}/tasks/ingest`, {
    method: "POST",
    headers: deviceHeaders(true),
    body: JSON.stringify({ text })
  }))
}

export async function plannerList(params?: { status?: string; dueBefore?: number; course?: string }) {
  const q = new URLSearchParams()
  if (params?.status) q.set("status", params.status)
  if (params?.dueBefore) q.set("dueBefore", String(params.dueBefore))
  if (params?.course) q.set("course", params.course)
  const url = `${env.backend}/tasks${q.toString() ? `?${q}` : ""}`
  const res = await req<{ ok: boolean; tasks: PlannerTask[] }>(url, { method: "GET", headers: deviceHeaders() })
  // Not an array: an HTML page or an error payload answered with 200 (proxy, backend down).
  if (!Array.isArray(res?.tasks)) throw plannerUnavailable()
  return { ...res, tasks: res.tasks.map(plannerTask) }
}

export async function plannerPlan(id: string) {
  return plannerOne(req<{ ok: boolean; task: PlannerTask & { plan?: { slots: PlannerSlot[] } } }>(`${env.backend}/tasks/${encodeURIComponent(id)}/plan`, {
    method: "POST",
    headers: deviceHeaders(true),
    body: JSON.stringify({})
  }))
}

export async function plannerWeekly() {
  const res = await req<{ ok: boolean; plan?: { days?: { date: string; slots?: PlannerSlot[] }[] } }>(`${env.backend}/planner/weekly`, {
    method: "POST",
    headers: deviceHeaders(true),
    body: JSON.stringify({})
  })
  const days = Array.isArray(res?.plan?.days) ? res.plan.days : []
  return { ok: true, plan: { days: days.map(d => ({ date: d.date, slots: (Array.isArray(d.slots) ? d.slots : []).map(plannerSlot) })) } as WeeklyPlan }
}

export async function plannerMaterials(id: string, type: "summary" | "studyGuide" | "flashcards" | "quiz") {
  return req<{ ok: boolean; materials: any }>(`${env.backend}/tasks/${encodeURIComponent(id)}/materials`, {
    method: "POST",
    headers: deviceHeaders(true),
    body: JSON.stringify({ type })
  })
}

export function connectPlannerStream(onEvent: (ev: PlannerEvent) => void) {
  const url = wsURL(`/ws/planner?device=${encodeURIComponent(revisionDeviceId())}`)
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
  return plannerOne(req<{ ok: boolean; task: PlannerTask }>(`${env.backend}/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: deviceHeaders(true),
    body: JSON.stringify(patch)
  }))
}

export async function plannerDelete(id: string) {
  return req<{ ok: boolean }>(`${env.backend}/tasks/${encodeURIComponent(id)}`, { method: "DELETE", headers: deviceHeaders() })
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

  return plannerOne(req<{ ok: boolean; task: PlannerTask & { files?: any[] } }>(`${env.backend}/tasks`, {
    method: "POST",
    headers: deviceHeaders(),
    body: formData,
    timeout: Math.max(env.timeout, 300000),
  }))
}

export async function plannerUploadFiles(taskId: string, files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('file', file, file.name)
  }

  return req<{ ok: boolean; files: any[] }>(`${env.backend}/tasks/${encodeURIComponent(taskId)}/files`, {
    method: "POST",
    headers: deviceHeaders(),
    body: formData,
    timeout: Math.max(env.timeout, 300000),
  })
}

export async function plannerDeleteFile(taskId: string, fileId: string) {
  return req<{ ok: boolean }>(`${env.backend}/tasks/${encodeURIComponent(taskId)}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: deviceHeaders(),
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
  return req<{ ok: boolean; taskId: string; error?: string }>(`${env.backend}/debate/${encodeURIComponent(debateId)}/argue`, {
    method: "POST",
    headers: deviceHeaders(true),
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
  return req<{ ok: boolean; taskId: string; error?: string }>(`${env.backend}/debate/${encodeURIComponent(debateId)}/analyze`, {
    method: "POST",
    headers: deviceHeaders(true),
    timeout: 60000,
  })
}

export type DebateEvent = { type: string; [k: string]: any }

export function connectDebateStream(taskId: string, onEvent: (ev: DebateEvent) => void) {
  return connectTaskSocket<DebateEvent>(`/ws/debate?taskId=${encodeURIComponent(taskId)}`, onEvent, { type: "error", error: "invalid_message" })
}

export async function cancelDebateTask(taskId: string) {
  await req(`${env.backend}/debate/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE", headers: deviceHeaders() })
}

export { revisionPolicy };

