import crypto from "node:crypto"
import { emitToAll } from "../chat/ws"

export type TaskContext = { signal: AbortSignal; emit: (msg: unknown) => void }
type Entry = { owner?: string; controller: AbortController; sockets: Set<any>; history: unknown[]; pending?: () => void }

// Cancellable generation jobs: one device starts one, only that device cancels it, it expires.
// Messages emitted are kept so a socket opening after the job finished still receives them.
export function createTaskRegistry(opts: { ttlMs?: number; schedule?: (fn: () => void, ms: number) => void } = {}) {
  const ttlMs = opts.ttlMs ?? 10 * 60 * 1000
  const schedule = opts.schedule ?? ((fn, ms) => { setTimeout(fn, ms).unref?.() })
  const entries = new Map<string, Entry>()

  return {
    // startOn "now": run immediately; "subscribe": run when the first socket subscribes.
    start(o: { owner?: string; startOn: "now" | "subscribe"; run: (ctx: TaskContext) => Promise<void>; id?: string }): string {
      const id = o.id ?? crypto.randomUUID()
      const entry: Entry = { owner: o.owner, controller: new AbortController(), sockets: new Set(), history: [] }
      const emit = (msg: unknown) => { entry.history.push(msg); emitToAll(entry.sockets, msg) }
      const go = () => { o.run({ signal: entry.controller.signal, emit }).catch(e => console.error("[tasks] run failed:", e)) }
      if (o.startOn === "now") go(); else entry.pending = go
      entries.set(id, entry)
      schedule(() => { entry.controller.abort(); entries.delete(id) }, ttlMs)
      return id
    },
    subscribe(id: string, ws: any): boolean {
      const entry = entries.get(id)
      if (!entry) return false
      entry.sockets.add(ws)
      ws.on("close", () => { entry.sockets.delete(ws) })
      for (const msg of entry.history) emitToAll(new Set([ws]), msg)
      const start = entry.pending
      entry.pending = undefined
      start?.()
      return true
    },
    cancel(id: string, device: string | undefined): "ok" | "forbidden" {
      const entry = entries.get(id)
      if (!entry) return "ok"
      if (entry.owner !== device) return "forbidden"
      entry.controller.abort()
      entries.delete(id)
      return "ok"
    },
  }
}
