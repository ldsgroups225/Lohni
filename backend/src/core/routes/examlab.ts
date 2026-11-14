import crypto from "node:crypto"
import { withTimeout } from "../../utils/quiz/promise"
import { handleExam } from "../../services/examlab/generate"
import { loadAllExams } from "../../services/examlab/loader"
import type { QuizLikeItem } from "../../services/examlab/types"

// Generation starts on POST; the socket may open before or after it finishes.
const runs = new Map<string, { promise: Promise<QuizLikeItem[]>; controller: AbortController; owner?: string }>()
const RUN_TTL_MS = 10 * 60 * 1000
const log = (...a: any) => console.log("[exam]", ...a)

function okSpec(x: any) {
  return x && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.sections) && x.sections.every((s: any) => s?.gen?.type)
}

export function examRoutes(app: any) {
  app.ws("/ws/exams", (ws: any, req: any) => {
    const u = new URL(req.url, "http://localhost")
    const runId = u.searchParams.get("runId")
    if (!runId) return ws.close(1008, "runId required")

    log("ws open", runId)
    const send = (m: unknown) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(m)) } catch { } }
    send({ type: "ready", runId })
    ws.on("error", (e: any) => log("ws err", runId, e?.message || e))

    const run = runs.get(runId)
    if (!run) {
      send({ type: "error", error: "Cet examen n’est plus disponible. Relance-le." })
      return ws.close(1008, "unknown runId")
    }
    run.promise.then(
      payload => { send({ type: "exam", payload }); send({ type: "done" }) },
      e => { log("run err", runId, e?.message || e); send({ type: "error", error: "Impossible de préparer l’examen. Réessaie." }) },
    )

    const iv = setInterval(() => {
      try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping", t: Date.now() })) } catch { }
    }, 15000)
    ws.on("close", () => clearInterval(iv))
  })

  app.get("/exams", (_req: any, res: any) => {
    try {
      const all = loadAllExams().filter(okSpec)
      const list = all.map(e => ({
        id: e.id,
        name: e.name,
        sections: e.sections.map(s => ({
          id: s.id,
          title: s.title,
          durationSec: s.durationSec,
          gen: { type: s.gen?.type, count: (s.gen as any)?.count ?? ((s.gen as any)?.tasks?.length || 0) }
        }))
      }))
      res.send({ ok: true, exams: list })
    } catch (e: any) {
      log("list err", e?.message || e)
      res.status(500).send({ ok: false, error: e?.message || "internal" })
    }
  })

  app.delete("/exam/:id", (req: any, res: any) => {
    const run = runs.get(req.params.id)
    if (run && run.owner !== req.headers?.["x-device-id"]) return res.status(403).send({ ok: false, error: "Cet examen appartient à un autre appareil." })
    run?.controller.abort()
    runs.delete(req.params.id)
    res.send({ ok: true })
  })

  app.post("/exam", async (req: any, res: any) => {
    try {
      const examId = String(req.body?.examId || "").trim()
      if (!examId) return res.status(400).send({ ok: false, error: "examId required" })

      const runId = crypto.randomUUID()
      res.status(202).send({ ok: true, runId, stream: `/ws/exams?runId=${runId}` })

      const controller = new AbortController()
      const run = withTimeout(handleExam(examId, controller.signal), 180000, "handleExam")
        // Sections number their items from 1; the screen needs one continuous list.
        .then(exam => exam.sections.flatMap(section => section.items).map((item, i) => ({ ...item, id: i + 1 })))
      run.catch(() => { })
      runs.set(runId, { promise: run, controller, owner: req.headers?.["x-device-id"] })
      setTimeout(() => runs.delete(runId), RUN_TTL_MS).unref?.()
    } catch (e: any) {
      log("500 single err", e?.message || e)
      res.status(500).send({ ok: false, error: e?.message || "internal" })
    }
  })
}