import type React from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onPickFile: () => void
  onRemoveFile: () => void
  stagedFileName: string | null
  busy: boolean
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
  children: React.ReactNode
}

export default function PromptBox({ value, onChange, onSend, onPickFile, onRemoveFile, stagedFileName, busy, onDragOver, onDrop, children }: Props) {
  return <fieldset aria-label="Question et pièce jointe" className="rounded-3xl border border-border bg-surface p-4" onDragOver={onDragOver} onDrop={onDrop}>
    <label htmlFor="tutor-question" className="text-sm font-semibold text-muted">Ta question</label>
    <textarea id="tutor-question" placeholder="Une question, un sujet, un exercice…" className="mt-3 min-h-[72px] w-full resize-none bg-transparent text-base outline-offset-2" value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend() } }} />
    {stagedFileName && <div className="mb-2 flex items-center gap-2 text-sm"><span className="min-w-0 break-all">{stagedFileName}</span><button type="button" className="min-h-11 px-2 underline" onClick={onRemoveFile}>Retirer le fichier</button></div>}
    <div className="flex items-center gap-2">
      <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background" aria-label="Joindre un fichier" onClick={onPickFile} disabled={busy}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></svg></button>
      {children}
      <button type="button" onClick={onSend} disabled={busy || (!value.trim() && !stagedFileName)} className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-50" aria-label="Envoyer"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6"><path d="M4 12h16m-7-7 7 7-7 7" /></svg></button>
    </div>
  </fieldset>
}
