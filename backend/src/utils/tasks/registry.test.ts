import { expect, test, vi } from "vitest"
import { createTaskRegistry } from "./registry"

const socket = () => ({ readyState: 1, send: vi.fn(), on: vi.fn() })
const manualClock = () => {
  const timers: Array<{ fn: () => void; at: number }> = []
  let now = 0
  return { schedule: (fn: () => void, ms: number) => { timers.push({ fn, at: now + ms }) }, advance: (ms: number) => { now += ms; timers.filter(t => t.at <= now).forEach(t => { t.fn(); timers.splice(timers.indexOf(t), 1) }) } }
}

test("seul l’appareil qui a lancé la tâche peut l’annuler", () => {
  const registry = createTaskRegistry()
  let signal!: AbortSignal
  const id = registry.start({ owner: "a", startOn: "now", run: async ctx => { signal = ctx.signal } })
  expect(registry.cancel(id, "b")).toBe("forbidden")
  expect(signal.aborted).toBe(false)
  expect(registry.cancel(id, "a")).toBe("ok")
  expect(signal.aborted).toBe(true)
  expect(registry.cancel(id, "b")).toBe("ok") // déjà annulée : plus rien à protéger
})

test("une tâche lancée « à l’abonnement » démarre au premier socket, et un socket tardif reçoit l’historique", async () => {
  const registry = createTaskRegistry()
  const run = vi.fn(async ({ emit }) => { emit({ type: "done" }) })
  const id = registry.start({ startOn: "subscribe", run })
  expect(run).not.toHaveBeenCalled()
  const first = socket()
  expect(registry.subscribe(id, first)).toBe(true)
  await Promise.resolve()
  expect(first.send).toHaveBeenCalledWith(JSON.stringify({ type: "done" }))
  const late = socket()
  registry.subscribe(id, late)
  expect(late.send).toHaveBeenCalledWith(JSON.stringify({ type: "done" }))
  expect(run).toHaveBeenCalledTimes(1)
  expect(registry.subscribe("inconnu", socket())).toBe(false)
})

test("une tâche expire après le délai : abandonnée et introuvable", () => {
  const clock = manualClock()
  const registry = createTaskRegistry({ ttlMs: 1000, schedule: clock.schedule })
  let signal!: AbortSignal
  const id = registry.start({ startOn: "now", run: async ctx => { signal = ctx.signal } })
  clock.advance(999)
  expect(signal.aborted).toBe(false)
  clock.advance(1)
  expect(signal.aborted).toBe(true)
  expect(registry.subscribe(id, socket())).toBe(false)
})
