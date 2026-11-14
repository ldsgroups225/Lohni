import type { LLM, Msg } from '../../utils/llm/models/types'

/** Raised when the model never returned a usable value; `raw` is its last reply. */
export class StructuredOutputError extends Error {
  constructor(readonly raw: string) { super('Le modèle n’a pas renvoyé de réponse exploitable. Réessaie.') }
}

export function toText(out: any): string {
  if (!out) return ''
  if (typeof out === 'string') return out
  if (typeof out?.content === 'string') return out.content
  if (Array.isArray(out?.content)) return out.content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('')
  if (Array.isArray(out?.generations) && out.generations[0]?.text) return out.generations[0].text
  return String(out)
}

function firstObject(s: string): string {
  let depth = 0, start = -1
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') { if (depth === 0) start = i; depth++ }
    else if (s[i] === '}') { depth--; if (depth === 0 && start !== -1) return s.slice(start, i + 1) }
  }
  return ''
}

export function parseModelJson(raw: string, shape: 'array' | 'object'): unknown {
  const text = raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim()
  const part = shape === 'array' ? text.match(/\[[\s\S]*\]/)?.[0] : firstObject(text)
  for (const candidate of [part, text]) {
    if (!candidate) continue
    try { return JSON.parse(candidate) } catch { /* try the next candidate */ }
  }
  return undefined
}

type StructuredOptions<T> = {
  model: Pick<LLM, 'invoke'>
  messages: Msg[]
  /** Stricter prompt for the second attempt; defaults to `messages`. */
  retryMessages?: Msg[]
  shape: 'array' | 'object'
  /** Normalises and validates the parsed JSON; return null when it is unusable. */
  validate: (parsed: unknown) => T | null
  /** Last chance on a reply that does not parse (e.g. cut by the token limit). */
  salvage?: (raw: string) => T | null
  attempts?: number
  /** Sends `reasoning: 'none'` unless true (tutor, chat keep the model's own reasoning). */
  keepReasoning?: boolean
  signal?: AbortSignal
}

export async function generateStructured<T>(opts: StructuredOptions<T>): Promise<T> {
  const attempts = opts.attempts ?? 2
  let raw = ''
  for (let attempt = 0; attempt < attempts; attempt++) {
    opts.signal?.throwIfAborted()
    const messages = attempt > 0 && opts.retryMessages ? opts.retryMessages : opts.messages
    const reply = await opts.model.invoke(messages, { ...(opts.keepReasoning ? {} : { reasoning: 'none' as const }), signal: opts.signal })
    opts.signal?.throwIfAborted()
    raw = toText(reply).trim()
    const parsed = parseModelJson(raw, opts.shape)
    const value = parsed === undefined ? opts.salvage?.(raw) ?? null : opts.validate(parsed)
    if (value !== null && value !== undefined) return value
  }
  throw new StructuredOutputError(raw)
}
