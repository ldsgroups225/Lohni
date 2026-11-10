import { useEffect, useMemo, useRef, useState } from "react"
import { companionAsk, type FlashCard } from "../../lib/api"
import MarkdownView from "../Chat/MarkdownView"
import { useCompanion } from "./CompanionProvider"

type CompanionMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  at: number
  flashcards?: FlashCard[]
  topic?: string
}

const defaultSuggestions = [
  "Résume les idées principales",
  "Crée un petit quiz",
  "Explique-moi les bases"
]

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toHistoryPayload(messages: CompanionMessage[]) {
  return messages.map(msg => ({ role: msg.role, content: msg.content }))
}

export default function CompanionDock() {
  const { document, open, setOpen } = useCompanion()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<CompanionMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const hasDocument = !!document

  useEffect(() => {
    setMessages([])
    setError(null)
    setInput("")
  }, [document?.id, document?.text])

  useEffect(() => {
    if (!open) return
    const el = bodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, open])

  const headerTitle = useMemo(() => {
    if (document?.title) return document.title
    if (document?.filePath) return document.filePath.split(/[\\/]/).pop() || "Document"
    return "Assistant de cours"
  }, [document?.filePath, document?.title])

  const send = async (prompt?: string) => {
    if (!hasDocument || busy) return
    const question = (prompt ?? input).trim()
    if (!question) return

    const history = toHistoryPayload(messages)
    const userMessage: CompanionMessage = {
      id: makeId(),
      role: "user",
      content: question,
      at: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    if (!prompt) setInput("")
    setBusy(true)
    setError(null)

    try {
      const response = await companionAsk({
        question,
        filePath: document?.filePath,
        documentTitle: document?.title,
        documentText: document?.text,
        topic: document?.title,
        history
      })
      const payload = response?.companion
      const assistantContent = payload?.answer || "Impossible de répondre à partir de ce document."
      const assistantMessage: CompanionMessage = {
        id: makeId(),
        role: "assistant",
        content: assistantContent,
        at: Date.now(),
        flashcards: payload?.flashcards || [],
        topic: payload?.topic
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (err: any) {
      const msg = err?.message || "Impossible de joindre l’assistant"
      setError(msg)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setBusy(false)
    }
  }

  const disabled = !hasDocument || busy

  if (!hasDocument) return null

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-44 right-4 md:bottom-28 md:right-6 z-40 px-4 py-3 rounded-2xl bg-sky-500/90 hover:bg-sky-500 text-white font-medium shadow-lg shadow-sky-500/30 transition-colors"
        >
          Assistant de cours
        </button>
      )}

      <div
        className={cx(
          "fixed bottom-44 right-4 md:bottom-28 md:right-6 z-40 w-[min(360px,calc(100vw-2rem))] max-h-[min(85vh,640px)] rounded-3xl border border-slate-800 bg-stone-950/95 backdrop-blur-xl shadow-2xl shadow-black/40 transition-all duration-300",
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-white/5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-300/80 mb-1">Assistant IA</div>
            <div className="text-white text-base font-medium leading-snug">{headerTitle}</div>
            {document?.filePath && (
              <div className="text-[11px] text-stone-400 mt-1 truncate" title={document.filePath}>
                Contexte : {document.filePath}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={cx("inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px]", hasDocument ? "bg-emerald-500/10 text-emerald-300" : "bg-stone-800 text-stone-400")}>
              <span className="w-2 h-2 rounded-full bg-current" />
              {hasDocument ? "Document associé" : "Aucun document"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-full hover:bg-white/10 text-stone-300 transition-colors"
              aria-label="Fermer l’assistant"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7l6 6m0-6-6 6" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={bodyRef} className="px-5 py-4 space-y-4 overflow-y-auto custom-scroll">
          {!hasDocument && (
            <div className="text-sm text-stone-400">
              Ouvre une note ou un sujet pour utiliser l’assistant. Ses réponses s’appuieront sur ce document.
            </div>
          )}

          {hasDocument && !messages.length && (
            <div className="space-y-3">
              <div className="text-sm text-stone-300 leading-relaxed">
                Besoin d’un résumé, d’un quiz ou d’une explication ? Pose ta question sur ce document.
              </div>
              <div className="flex flex-wrap gap-2">
                {defaultSuggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => send(suggestion)}
                    disabled={disabled}
                    className="px-3 py-1.5 rounded-full bg-stone-900/70 border border-stone-700 text-xs text-stone-200 hover:border-sky-500 hover:text-white transition-colors disabled:opacity-60"
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={cx(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-sky-500/10 border border-sky-500/30 text-sky-100"
                    : "bg-stone-900/80 border border-stone-700 text-stone-100"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="space-y-3">
                    <MarkdownView md={msg.content} />
                    {msg.flashcards && msg.flashcards.length > 0 && (
                      <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-sky-300 mb-2">Cartes</div>
                        <ul className="space-y-2 text-sm text-sky-100">
                          {msg.flashcards.slice(0, 4).map((card, idx) => (
                            <li key={`${msg.id}-card-${idx}`}>
                              <div className="font-semibold">Q: <MarkdownView md={card.q} inline /></div>
                              <div className="text-sky-100/90">A: <MarkdownView md={card.a} /></div>
                            </li>
                          ))}
                          {msg.flashcards.length > 4 && (
                            <li className="text-xs text-sky-200/80">
                              +{msg.flashcards.length - 4} autres cartes créées dans cette réponse.
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="px-4 py-2 rounded-2xl bg-stone-900/80 border border-stone-700 text-xs text-stone-300 animate-pulse">
                Réflexion…
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={hasDocument ? "Pose une question sur ce document…" : "Ouvre un document pour commencer"}
              disabled={disabled && !hasDocument}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-stone-900/80 border border-stone-700 text-sm text-white placeholder-stone-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={disabled || !input.trim()}
              className="px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
