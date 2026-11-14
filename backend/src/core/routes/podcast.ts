import path from "node:path"
import fs from "node:fs"
import { makeScript, makeAudio } from "../../services/podcast"
import { emitToAll } from "../../utils/chat/ws"
import { config } from "../../config/env"

const sockets = new Map<string, Set<any>>()
const controllers = new Map<string, AbortController>()
const pendingJobs = new Map<string, () => Promise<void>>()

function emit(id: string, msg: any) {
  const s = sockets.get(id)
  emitToAll(s, msg)
}

async function startJobIfReady(pid: string) {
  const job = pendingJobs.get(pid)
  const hasSockets = (sockets.get(pid)?.size ?? 0) > 0
  
  if (job && hasSockets) {
    pendingJobs.delete(pid)
    try {
      await job()
    } catch (err) {
      console.error("[Podcast] Échec de création :", err)
      emit(pid, { type: "error", error: "Impossible de créer le podcast. Réessaie." })
    }
  }
}

export function podcastRoutes(app: any) {
  app.ws("/ws/podcast", (ws: any, req: any) => {
    const u = new URL(req.url, config.baseUrl || "http://dummy")
    const pid = u.searchParams.get("pid")
    
    if (!pid) {
      return ws.close(1008, "pid required")
    }
    
    const set = sockets.get(pid) ?? new Set()
    sockets.set(pid, set)
    set.add(ws)
    
    ws.on("close", () => {
      set.delete(ws)
      if (set.size === 0) {
        sockets.delete(pid)
      }
    })
    
    const readyMsg = JSON.stringify({ type: "ready", pid })
    ws.send(readyMsg)
    
    setTimeout(() => {
      startJobIfReady(pid).catch(err => {
        console.error(`[Podcast WS] Error starting job:`, err)
      })
    }, 100)
  })

  app.delete("/podcast/:pid", (req: any, res: any) => {
    controllers.get(req.params.pid)?.abort()
    controllers.delete(req.params.pid)
    pendingJobs.delete(req.params.pid)
    res.send({ ok: true })
  })

  app.post("/podcast", async (req: any, res: any, next: any) => {
    try {
      const topic = String(req.body?.topic || req.body?.title || "").trim()
      
      if (!topic) {
        return res.status(400).send({ error: "topic required" })
      }

      const duration = req.body?.duration
      if (duration !== undefined && duration !== "short" && duration !== "long") {
        return res.status(400).send({ error: "Durée du podcast invalide." })
      }

      const pid = cryptoRandom()
      const controller = new AbortController()
      controllers.set(pid, controller)
      setTimeout(() => { controller.abort(); controllers.delete(pid); pendingJobs.delete(pid) }, 10 * 60 * 1000).unref?.()
      const dir = path.join(process.cwd(), "storage", "podcasts", pid)
      const base = topic.replace(/[^a-z0-9]/gi, "_").slice(0, 50) || "podcast"

      res.status(202).send({ ok: true, pid, stream: `/ws/podcast?pid=${pid}` })

      const job = async () => {
        try {
          const script = await makeScript(topic, topic, duration, controller.signal)
          controller.signal.throwIfAborted()
          emit(pid, { type: "script", data: script })

          let outPath: string
          try {
            outPath = await makeAudio(script, dir, base, (m) => { if (!controller.signal.aborted) emit(pid, m) }, controller.signal)
          } catch (error) {
            if (controller.signal.aborted) return
            console.error("[Podcast] Échec de synthèse vocale :", error)
            emit(pid, { type: "error", error: "La synthèse vocale est indisponible. Réessaie dans un moment.", code: "tts_error" })
            return
          }
          controller.signal.throwIfAborted()
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
          emit(pid, audioMessage)
          
          emit(pid, { type: "done" })
        } catch (e: any) {
          if (controller.signal.aborted) return
          console.error("[Podcast] Échec de création :", e)
          emit(pid, { type: "error", error: "Impossible de créer le podcast. Réessaie." })
        } finally {
          controllers.delete(pid)
          if (controller.signal.aborted) await fs.promises.rm(dir, { recursive: true, force: true }).catch(error => console.error("[Podcast] Échec de nettoyage :", error))
        }
      }
      
      pendingJobs.set(pid, job)
      
      startJobIfReady(pid).catch(err => {
        console.error(`[Podcast POST] Error starting job:`, err)
      })
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
              res.status(500).send({ error: 'Download failed' })
            }
          })
          return
        }
      }
      
      return res.status(404).send({ error: "File not found" })
    } catch (e) {
      next(e)
    }
  })
}

function cryptoRandom() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
