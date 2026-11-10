import MarkdownView from "../Chat/MarkdownView";
import type { UA } from "../../pages/Quiz";

export default function ReviewModal({ answers, onClose }:{ answers:UA[]; onClose:()=>void }) {
  return (
    <div role="dialog" aria-modal="true" onKeyDown={e => e.key === "Escape" && onClose()} className="fixed inset-0 bg-background z-[60] flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl p-6 max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Revoir les réponses</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-[transform,opacity] duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="size-6 text-muted hover:text-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="np-scroll space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          {answers.map((a, i) => {
            const ok = a.correct;
            return (
              <div key={i} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  {ok ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-6 text-foreground flex-shrink-0" fill="currentColor">
                      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75S21.75 6.615 21.75 12 17.385 21.75 12 21.75 2.25 17.385 2.25 12Zm13.36-2.31a.75.75 0 1 0-1.22-.9l-3.41 4.62-1.62-1.62a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.16-.09l3.9-5.28Z" clipRule="evenodd"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="size-6 text-foreground flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm3.53 6.72a.75.75 0 0 0-1.06-1.06L12 10.38 9.53 7.91a.75.75 0 0 0-1.06 1.06L10.94 11.5l-2.47 2.47a.75.75 0 1 0 1.06 1.06L12 12.56l2.47 2.47a.75.75 0 1 0 1.06-1.06L13.06 11.5l2.47-2.53Z" clipRule="evenodd"/>
                    </svg>
                  )}
                  <div className="flex-1">
                    <h3 className="text-foreground font-medium mb-2">Question {i + 1}</h3>
                    <p className="text-foreground text-sm mb-3"><MarkdownView md={a.question} inline /></p>
                    <div className="space-y-1 text-sm">
                      <p className={ok ? "text-foreground" : "text-foreground"}>Ta réponse : <MarkdownView md={a.selectedOption} inline /></p>
                      {!ok && <p className="text-foreground">Bonne réponse : <MarkdownView md={a.correctOption} inline /></p>}
                      {a.explanation && <div className="text-muted">Explication : <MarkdownView md={a.explanation} /></div>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!answers.length && <div className="text-muted">Aucune réponse pour le moment.</div>}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-surface hover:bg-tint border border-border text-foreground transition-opacity">
            Fermer
          </button>
        </div>
      </div>

      <style>{`
        .np-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .np-scroll::-webkit-scrollbar-track { background: var(--color-surface); border-radius: 9999px; }
        .np-scroll::-webkit-scrollbar-thumb { background: var(--color-muted); border-radius: 9999px; border: 2px solid var(--color-surface); }
        .np-scroll::-webkit-scrollbar-thumb:hover { background: var(--color-foreground); }
        .np-scroll { scrollbar-width: thin; scrollbar-color: var(--color-muted) var(--color-surface); }
      `}</style>
    </div>
  );
}