import { useEffect, useRef } from "react";
import MarkdownView from "../Chat/MarkdownView";
import { prefersReducedMotion } from "../../lib/motion";
import type { Question } from "../../pages/Quiz";
import { withOccurrenceKeys } from "../../lib/occurrenceKeys";

const Check = () => <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Cross = () => <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>;

export default function QuestionCard({
  q, selected, showExp, showHint, onSelect, onHint, onNext, isLast
}:{
  q:Question; selected:number|null; showExp:boolean; showHint:boolean;
  onSelect:(i:number)=>void; onHint:()=>void; onNext:()=>void; isLast:boolean;
}) {
  const next = useRef<HTMLButtonElement>(null);
  const keyboardAnswer = useRef(false);
  // Après la réponse : défiler jusqu'à l'explication et « Continuer », avec une marge sous le bouton.
  // Second passage : le Markdown se charge à la demande et peut allonger la page.
  useEffect(() => {
    if (!showExp) return;
    if (keyboardAnswer.current) next.current?.focus({ preventScroll: true });
    keyboardAnswer.current = false;
    const go = () => next.current?.scrollIntoView({ block: "end", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    go();
    const timer = window.setTimeout(go, 350);
    return () => window.clearTimeout(timer);
  }, [showExp]);

  const ok = selected === q.correct;
  return (
    <div id="quizContent" className="motion-enter space-y-4">
      <div id="questionCard" className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <h2 id="questionText" className="text-xl font-semibold text-foreground"><MarkdownView md={q.question} inline /></h2>

        <fieldset id="answerOptions" className="space-y-3">
          <legend className="sr-only">Choisis ta réponse</legend>
          {withOccurrenceKeys(q.options, option => option).map(({ value: opt, key }, i) => {
            const isSel = selected === i;
            const isCorrect = showExp && i === q.correct;
            const isWrongSel = showExp && isSel && i !== q.correct;
            const tone = isCorrect ? "border-success bg-success/10" : isWrongSel ? "border-danger bg-danger/10" : showExp ? "border-border opacity-60" : "border-border";
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSel}
                disabled={showExp}
                onClick={event => { keyboardAnswer.current = event.detail === 0; onSelect(i); }}
                className={`flex min-h-14 w-full items-start gap-3 rounded-xl border p-3 text-left text-foreground focus-visible:outline-2 focus-visible:outline-primary ${tone}`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-xs font-bold">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1 pt-0.5"><MarkdownView md={opt} inline /></span>
                {isCorrect && <span className="flex items-center gap-1 pt-0.5 text-sm"><Check />Bonne réponse</span>}
                {isWrongSel && <span className="flex items-center gap-1 pt-0.5 text-sm"><Cross />Ta réponse</span>}
              </button>
            );
          })}
        </fieldset>

        {!showExp && (
          <div>
            {!showHint && (
              <button type="button" onClick={onHint} className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-foreground">
                <span aria-hidden="true">💡</span> Afficher un indice
              </button>
            )}
            {showHint && (
              <p role="status" className="rounded-xl bg-tint p-4 text-sm text-foreground"><strong>Indice :</strong> <MarkdownView md={q.hint} inline /></p>
            )}
          </div>
        )}

        {showExp && (
          <div role="status" className="space-y-3 border-t border-border pt-4">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              {ok ? <><span className="motion-pop text-success"><Check /></span>Bonne réponse !</> : <><span className="motion-pop text-danger"><Cross /></span>Réponse incorrecte</>}
            </p>
            {q.explanation && <MarkdownView md={q.explanation} />}
          </div>
        )}
      </div>

      {showExp && (
        <button ref={next} type="button" onClick={onNext} className="ui-button w-full scroll-mb-8">
          {isLast ? "Voir mon résultat" : "Continuer"}
        </button>
      )}
    </div>
  );
}
