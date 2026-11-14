import { expect, test, vi } from "vitest"
import { runTask } from "./taskRun"

type Ev = { type: string; error?: string }
function setup(startImpl?: () => Promise<string>) {
  let emit!: (ev: Ev) => void
  let resolveId!: (id: string) => void
  const close = vi.fn()
  const cancel = vi.fn(async (_id: string) => {})
  const onEvent = vi.fn()
  const task = runTask<Ev>({
    start: startImpl ?? (() => new Promise(r => { resolveId = r })),
    connect: (_id, on) => { emit = on; return { close } },
    cancel, onEvent, onStartError: vi.fn(), streamError: "Connexion perdue. Réessaie.",
  })
  return { task, emit: (ev: Ev) => emit(ev), resolveId: (id: string) => resolveId(id), close, cancel, onEvent }
}
const tick = () => new Promise(r => setTimeout(r, 0))

test("annuler avant de recevoir l’id annule dès qu’il arrive, sans ouvrir le flux", async () => {
  const t = setup()
  t.task.cancel()
  expect(t.cancel).not.toHaveBeenCalled()
  t.resolveId("run-1")
  await tick()
  expect(t.cancel).toHaveBeenCalledWith("run-1")
})

test("la fermeture du socket en cours de route est un échec immédiat en français", async () => {
  const t = setup(async () => "run-2")
  await tick()
  t.emit({ type: "error", error: "stream_error" })
  expect(t.onEvent).toHaveBeenCalledWith({ type: "error", error: "Connexion perdue. Réessaie." })
  await tick()
  expect(t.cancel).toHaveBeenCalledWith("run-2")
})

test("après la fin, annuler ne contacte plus le serveur", async () => {
  const t = setup(async () => "run-3")
  await tick()
  t.emit({ type: "done" })
  t.task.cancel()
  expect(t.cancel).not.toHaveBeenCalled()
  expect(t.close).toHaveBeenCalled()
})
