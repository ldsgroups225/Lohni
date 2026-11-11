import { useState, useEffect } from "react"
import { useLocation } from "react-router-dom"
import { podcastStart, connectPodcastStream, type PodcastEvent } from "../../lib/api"

export default function PodcastGenerator() {
  const location = useLocation()
  const [topic, setTopic] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [audioFile, setAudioFile] = useState<string | null>(null)
  const [audioFilename, setAudioFilename] = useState<string | null>(null)

  useEffect(() => {
    // Check if we were navigated here with a podcast already started
    if (location.state?.podcastPid) {
      const { podcastPid, podcastTopic } = location.state
      setTopic(podcastTopic || "")
      setBusy(true)
      setStatus("Connexion au générateur de podcast…")

      // Connect to the existing podcast stream
      const { close } = connectPodcastStream(podcastPid, (ev: PodcastEvent) => {
        if (ev.type === "ready") {
          setStatus("Connexion établie, création…")
        }
        if (ev.type === "phase") {
          setStatus("Création en cours…")
        }
        if (ev.type === "script") {
          setStatus("Texte prêt, création de l’audio…")
        }
        if (ev.type === "audio") {
          const audioUrl = ev.file || ev.staticUrl || ""
          setAudioFile(audioUrl)
          setAudioFilename(ev.filename || "podcast.mp3")
          setStatus("Ton podcast est prêt !")
        }
        if (ev.type === "done") {
          clearTimeout(timeout)
          setStatus("Terminé")
          setBusy(false)
          setTimeout(() => {
            close()
          }, 1000)
        }
        if (ev.type === "error") {
          clearTimeout(timeout)
          setStatus("Impossible de créer le podcast. Réessaie.")
          close()
          setBusy(false)
        }
      })

      const timeout = setTimeout(() => {
        setStatus("La création prend trop de temps. Réessaie.")
        setBusy(false)
        close()
      }, 120000)

      return () => {
        clearTimeout(timeout)
        close()
      }
    }
  }, [location.state])

  const onGenerate = async () => {
    if (!topic.trim() || busy) return

    setBusy(true)
    setStatus("Démarrage…")
    setAudioFile(null)
    setAudioFilename(null)

    try {
      const { pid } = await podcastStart({ topic })

      await new Promise(resolve => setTimeout(resolve, 100))

      const { close } = connectPodcastStream(pid, (ev: PodcastEvent) => {
        if (ev.type === "ready") {
          setStatus("Connexion établie, création…")
        }
        if (ev.type === "phase") {
          setStatus("Création en cours…")
        }
        if (ev.type === "script") {
          setStatus("Texte prêt, création de l’audio…")
        }
        if (ev.type === "audio") {
          const audioUrl = ev.file || ev.staticUrl || ""

          setAudioFile(audioUrl)
          setAudioFilename(ev.filename || "podcast.mp3")
          setStatus("Ton podcast est prêt !")
        }
        if (ev.type === "done") {
          clearTimeout(timeout)
          setStatus("Terminé")
          setBusy(false)
          setTimeout(() => {
            close()
          }, 1000)
        }
        if (ev.type === "error") {
          clearTimeout(timeout)
          setStatus("Impossible de créer le podcast. Réessaie.")
          close()
          setBusy(false)
        }
      })

      const timeout = setTimeout(() => {
        setStatus("La création prend trop de temps. Réessaie.")
        setBusy(false)
        close()
      }, 120000)

      const originalClose = close
      const closeWithCleanup = () => {
        clearTimeout(timeout)
        originalClose()
      }

      return { close: closeWithCleanup }
    } catch {
      setStatus("Impossible de créer le podcast. Réessaie.")
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl bg-surface border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">Écouter pour réviser</div>
          </div>
          <h2 className="text-foreground font-semibold text-xl mb-2">Podcast IA</h2>
          <div className="text-muted text-sm leading-relaxed">
            Transforme un sujet ou tes notes en podcast pour réviser où tu veux.
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Sujet ou notes…"
              aria-label="Sujet ou notes du podcast"
              className="min-h-11 w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder-muted focus:ring-2 focus:ring-primary outline-none"
              onKeyDown={(e) => e.key === "Enter" && onGenerate()}
            />
          </div>
          <button
            onClick={onGenerate}
            disabled={busy || !topic.trim()}
            className="ui-button min-h-11 px-6 disabled:opacity-50"
          >
            {busy ? "Création…" : "Créer le podcast"}
          </button>
        </div>

        {status && (
          <div role="status" className="p-4 rounded-xl bg-tint border border-border text-foreground font-medium">
            {status}

          </div>
        )}

        {audioFile && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-surface border border-border">
              <div className="text-sm text-muted mb-2">Écouter :</div>
              <audio
                controls
                className="w-full"
                src={audioFile}
              >
                Ton navigateur ne prend pas en charge la lecture audio.
              </audio>
            </div>

            <a
              href={audioFile}
              download={audioFilename || "podcast.mp3"}
              className="block p-4 rounded-xl bg-gradient-to-r from-secondary to-secondary hover:from-secondary hover:to-secondary text-on-secondary font-medium text-center transition-[transform,opacity] duration-300 shadow-lg "
            >
              Télécharger le podcast
            </a>
          </div>
        )}

      </div>
    </section>
  )
}
