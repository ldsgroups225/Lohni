import { useRef, useState } from 'react'
import MarkdownContent from '../Chat/MarkdownContent'
import { Button } from '../ui/Button'

export default function ChapterSummary({ title, subject, summary, cards, onBack, onCards }: {
  title: string; subject: string; summary: string; cards: { id: string; answer: string }[]; onBack: () => void; onCards: () => void
}) {
  const [tab, setTab] = useState<'summary' | 'key'>('summary')
  const [message, setMessage] = useState('')
  const content = useRef<HTMLDivElement>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(content.current?.innerText ?? content.current?.textContent ?? '')
      setMessage('Résumé copié')
    } catch {
      setMessage('Impossible de copier le résumé. Vérifie les autorisations du navigateur.')
    }
  }
  return <main className="loop-screen mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-28 pt-4 md:pl-28">
    <header className="flex items-center gap-2">
      <button type="button" aria-label="Retour au chapitre" onClick={onBack} className="grid size-11 shrink-0 place-items-center rounded-xl text-2xl text-foreground">‹</button>
      <div className="min-w-0"><h1 className="break-words text-xl font-extrabold text-foreground">{title}</h1><p className="text-sm text-muted">{subject} · Résumé</p></div>
    </header>
    <div role="tablist" aria-label="Contenu du chapitre" className="mt-3 flex gap-1 rounded-2xl bg-border p-1">
      <button type="button" role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')} className={`min-h-11 flex-1 rounded-xl font-bold ${tab === 'summary' ? 'bg-surface text-foreground' : 'text-muted'}`}>Résumé</button>
      <button type="button" role="tab" aria-selected={tab === 'key'} onClick={() => setTab('key')} className={`min-h-11 flex-1 rounded-xl font-bold ${tab === 'key' ? 'bg-surface text-foreground' : 'text-muted'}`}>À retenir</button>
    </div>
    <div className="flex-1 py-4">
      <div hidden={tab !== 'summary'} ref={content} className="rounded-3xl border border-border bg-surface p-5 text-foreground [&_strong]:rounded-md [&_strong]:bg-tint [&_strong]:px-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:rounded-2xl [&_.katex-display]:bg-background [&_.katex-display]:p-3">
        {summary.trim() ? <MarkdownContent md={summary} /> : <p>Aucun résumé disponible pour ce chapitre.</p>}
      </div>
      {tab === 'key' && (cards.length ? <ol className="space-y-2">{cards.map((card, index) => <li key={card.id} className="flex gap-3 rounded-3xl border border-border bg-surface p-4 text-foreground"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-tint text-sm font-bold text-primary">{index + 1}</span><MarkdownContent md={card.answer} /></li>)}</ol> : <p>Aucune carte disponible pour ce chapitre.</p>)}
      <p className="mt-4 text-center text-sm text-muted">Généré par IA : peut contenir des erreurs.</p>
    </div>
    {message && <p role="status" className="mb-3 rounded-2xl bg-foreground p-4 text-sm text-background">{message}</p>}
    <div className="flex gap-2 border-t border-border pt-3">
      <button type="button" aria-label="Copier le résumé" onClick={() => void copy()} disabled={!summary.trim()} className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-primary text-primary disabled:opacity-50"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></svg></button>
      <Button className="min-h-14 flex-1 rounded-2xl" disabled={!cards.length} onClick={onCards}>Réviser avec les cartes</Button>
    </div>
    {!cards.length && <p className="mt-2 text-sm text-muted">Ajoute des cartes à ce chapitre pour les réviser.</p>}
  </main>
}
