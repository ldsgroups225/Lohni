import { useState } from "react"
import { smartnotesStart, connectSmartnotesStream, type SmartNotesEvent } from "../../lib/api"

export default function SmartNotes() {
  const [topic, setTopic] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [filePath, setFilePath] = useState<string | null>(null)

  const onGenerate = async () => {
    if (!topic.trim() || busy) return
    setBusy(true)
    setStatus("Démarrage…")
    setFilePath(null)

    try {
      const { noteId } = await smartnotesStart({ topic })
      const { close } = connectSmartnotesStream(noteId, (ev: SmartNotesEvent) => {
        if (ev.type === "phase") setStatus("Création en cours…")
        if (ev.type === "file") { setFilePath(ev.file); setStatus("Prêt") }
        if (ev.type === "done") { setStatus("Terminé"); close(); setBusy(false) }
        if (ev.type === "error") { setStatus(`Erreur : ${ev.error}`); close(); setBusy(false) }
      })
    } catch (e: any) {
      setStatus(e.message || "Échec")
      setBusy(false)
    }
  }

  return (
    <div className="group rounded-2xl bg-surface border border-border p-4 hover:border-primary transition-[transform,opacity] duration-300  ">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs uppercase tracking-wide text-primary font-semibold">créateur de fiches</div>
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-primary animate-pulse"></div>
          </div>
          <div className="text-foreground font-semibold text-xl mb-2">Fiches de cours</div>
          <div className="text-foreground text-sm leading-relaxed">
            Transforme un sujet en fiches structurées pour préparer tes examens.
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ton sujet…"
              className="w-full px-4 py-3 pr-16 rounded-xl bg-surface border border-border text-foreground placeholder-muted focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-[transform,opacity] duration-300"
              onKeyDown={(e) => e.key === "Enter" && onGenerate()}
            />
          </div>
          <button type="button"
            onClick={onGenerate}
            disabled={busy || !topic.trim()}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary disabled:opacity-50 disabled:cursor-not-allowed text-on-primary font-medium transition-[transform,opacity] duration-300"
          >
            {busy ? "Création…" : "Créer"}
          </button>
        </div>

        {status && (
          <div className="p-4 rounded-xl bg-tint border border-primary text-foreground font-medium">{status}</div>
        )}

        {filePath && (
          <a
            href={filePath}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 rounded-xl bg-gradient-to-r from-secondary to-secondary text-on-secondary font-medium text-center"
          >
            Télécharger les fiches
          </a>
        )}
      </div>
    </div>
  )
}