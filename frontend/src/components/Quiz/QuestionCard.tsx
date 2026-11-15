import { LightbulbIcon } from '../ui/NavigationIcons'
import { useRef } from "react";
import MarkdownView from "../Chat/MarkdownView";
import { useRevealButton } from "../../lib/useRevealButton";
import type { Question } from "../../pages/Quiz";
import { withOccurrenceKeys } from "../../lib/occurrenceKeys";

const Check = () => <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Cross = () => <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>;

export default function QuestionCard({
  q, selected, showExp, showHint, onSelect, onHint, onNext, onRetry, onExplain, explaining, isLast
}:{
  q:Question; selected:number|null; showExp:boolean; showHint:boolean;
  onSelect:(i:number)=>void; onHint:()=>void; onNext:()=>void; onRetry?:()=>void; onExplain?:()=>void; explaining?:boolean; isLast:boolean;
}) {
  const next = useRef<HTMLButtonElement>(null);
  const keyboardAnswer = useRef(false);
  useRevealButton(next, showExp, keyboardAnswer);

  const ok = selected === q.correct;
  return (
    <div id="quizContent" className="motion-enter space-y-4">
      <div id="questionCard" className="space-y-4 p-5 ui-card">
        <h2 id="questionText" className="ui-section-title"><MarkdownView md={q.question} inline /></h2>

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
                {isWrongSel && <span className="flex items-center gap-1 pt-0.5 text-sm"><Cross />Ton choix</span>}
              </button>
            );
          })}
        </fieldset>

        {!showExp && (
          <div>
            {!showHint && (
              <button type="button" onClick={onHint} className="ui-button-secondary">
                <LightbulbIcon /> Afficher un indice
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
            {onExplain && <button type="button" onClick={onExplain} disabled={explaining} className="ui-button-secondary">{explaining ? "Ouverture…" : "Explique-moi"}</button>}
          </div>
        )}
      </div>

      <button ref={next} type="button" onClick={onNext} disabled={!showExp} className="ui-button min-h-11 w-full disabled:bg-tint disabled:text-muted disabled:opacity-100">
        {!showExp ? "Choisis une réponse" : isLast ? "Voir mon résultat" : "Continuer"}
      </button>
      {showExp && onRetry && <button type="button" onClick={onRetry} className="ui-button-secondary w-full">Recommencer cette question</button>}
    </div>
  );
}
