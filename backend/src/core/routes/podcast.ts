import crypto from "node:crypto"
import path from "node:path"
import fs from "node:fs"
import { makeScript, makeAudio } from "../../services/podcast"
import { createTaskRegistry, type TaskContext } from "../../utils/tasks/registry"
import { config } from "../../config/env"

const podcasts = createTaskRegistry() // démarre quand le premier socket s’abonne

export function podcastRoutes(app: any) {
  app.ws("/ws/podcast", (ws: any, req: any) => {
    const u = new URL(req.url, config.baseUrl || "http://dummy")
    const pid = u.searchParams.get("pid")
    
    if (!pid) {
      return ws.close(1008, "pid required")
    }
    
    ws.send(JSON.stringify({ type: "ready", pid }))
    if (!podcasts.subscribe(pid, ws)) ws.close(1008, "unknown pid")
  })

  app.delete("/podcast/:pid", (req: any, res: any) => {
    if (podcasts.cancel(req.params.pid, req.headers?.["x-device-id"]) === "forbidden") return res.status(403).send({ ok: false, error: "Ce podcast appartient à un autre appareil." })
    res.send({ ok: true })
  })

  app.post("/podcast", async (req: any, res: any, next: any) => {
    try {
      const topic = String(req.body?.topic || req.body?.title || "").trim()
      
      if (!topic) {
        return res.status(400).send({ error: "Indique un sujet pour le podcast." })
      }

      const duration = req.body?.duration
      if (duration !== undefined && duration !== "short" && duration !== "long") {
        return res.status(400).send({ error: "Durée du podcast invalide." })
      }

      const pid = crypto.randomUUID()
      const dir = path.join(process.cwd(), "storage", "podcasts", pid)
      const base = topic.replace(/[^a-z0-9]/gi, "_").slice(0, 50) || "podcast"

      const job = async ({ signal, emit }: TaskContext) => {
        try {
          const script = await makeScript(topic, topic, duration, signal)
          signal.throwIfAborted()
          emit({ type: "script", data: script })

          let outPath: string
          try {
            outPath = await makeAudio(script, dir, base, (m) => { if (!signal.aborted) emit(m) }, signal)
          } catch (error) {
            if (signal.aborted) return
            console.error("[Podcast] Échec de synthèse vocale :", error)
            emit({ type: "error", error: "La synthèse vocale est indisponible. Réessaie dans un moment.", code: "tts_error" })
            return
          }
          signal.throwIfAborted()
          if (!fs.existsSync(outPath)) {
            throw new Error(`Audio file not created at ${outPath}`)
          }
          const filename = path.basename(outPath)
          const downloadUrl = `${config.baseUrl}/podcast/download/${pid}/${filename}`
          const rel = path.relative(process.cwd(), outPath).split(path.sep).join("/")
          const staticUrl = `${config.baseUrl}/${rel}`
          
          const audioMessage = { 
            type: "audio", 
            file: downloadUrl,
            staticUrl: staticUrl,
            filename: filename,
          }
          emit(audioMessage)
          
          emit({ type: "done" })
        } catch (e: any) {
          if (signal.aborted) return
          console.error("[Podcast] Échec de création :", e)
          emit({ type: "error", error: "Impossible de créer le podcast. Réessaie." })
        } finally {
          if (signal.aborted) await fs.promises.rm(dir, { recursive: true, force: true }).catch(error => console.error("[Podcast] Échec de nettoyage :", error))
        }
      }
      
      podcasts.start({ owner: req.headers?.["x-device-id"], startOn: "subscribe", run: job, id: pid })
      res.status(202).send({ ok: true, pid, stream: `/ws/podcast?pid=${pid}` })
    } catch (e) {
      next(e)
    }
  })

  app.get("/podcast/download/:pid/:filename", async (req: any, res: any, next: any) => {
    try {
      const { pid, filename } = req.params
      const dirPath = path.join(process.cwd(), "storage", "podcasts", pid)
      if (fs.existsSync(dirPath)) {
        const filesInDir = fs.readdirSync(dirPath)
        const actualFilename = filesInDir.find(f => f.toLowerCase() === filename.toLowerCase())
        if (actualFilename) {
          const filePath = path.join(dirPath, actualFilename)
          const fileStats = fs.statSync(filePath)
          
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Disposition', `attachment; filename="${actualFilename}"`)
          res.setHeader('Content-Length', fileStats.size)

          const fileStream = fs.createReadStream(filePath)
          fileStream.pipe(res)
          fileStream.on('error', (_err) => {
            if (!res.headersSent) {
              res.status(500).send({ error: 'Impossible de télécharger le podcast.' })
            }
          })
          return
        }
      }
      
      return res.status(404).send({ error: "Fichier introuvable." })
    } catch (e) {
      next(e)
    }
  })
}
