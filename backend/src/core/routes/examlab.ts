import { withTimeout } from "../../utils/quiz/promise"
import { handleExam } from "../../services/examlab/generate"
import { loadAllExams } from "../../services/examlab/loader"
import { createTaskRegistry } from "../../utils/tasks/registry"

// Generation starts on POST; the socket may open before or after it finishes.
const runs = createTaskRegistry()
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

    if (!runs.subscribe(runId, ws)) {
      send({ type: "error", error: "Cet examen n’est plus disponible. Relance-le." })
      return ws.close(1008, "unknown runId")
    }

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
    if (runs.cancel(req.params.id, req.headers?.["x-device-id"]) === "forbidden") return res.status(403).send({ ok: false, error: "Cet examen appartient à un autre appareil." })
    res.send({ ok: true })
  })

  app.post("/exam", async (req: any, res: any) => {
    try {
      const examId = String(req.body?.examId || "").trim()
      if (!examId) return res.status(400).send({ ok: false, error: "examId required" })

      const runId = runs.start({
        owner: req.headers?.["x-device-id"],
        startOn: "now",
        run: async ({ signal, emit }) => {
          try {
            const exam = await withTimeout(handleExam(examId, signal), 180000, "handleExam")
            // Sections number their items from 1; the screen needs one continuous list.
            emit({ type: "exam", payload: exam.sections.flatMap(section => section.items).map((item, i) => ({ ...item, id: i + 1 })) })
            emit({ type: "done" })
          } catch (e: any) {
            log("run err", e?.message || e)
            emit({ type: "error", error: "Impossible de préparer l’examen. Réessaie." })
          }
        },
      })
      res.status(202).send({ ok: true, runId, stream: `/ws/exams?runId=${runId}` })
    } catch (e: any) {
      log("500 single err", e?.message || e)
      res.status(500).send({ ok: false, error: e?.message || "internal" })
    }
  })
}