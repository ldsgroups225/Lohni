import MarkdownView from "../Chat/MarkdownView";
import type { UA } from "../../pages/Quiz";

export default function ResultsPanel({
  score, total, percentage, visual, answers, onRetake, onNewTopic
}: {
  score: number; total: number; percentage: number;
  visual: { msg: string; cls: string; icon: React.ReactNode };
  answers: UA[]; onRetake: () => void; onNewTopic: () => void;
}) {
  const wrong = answers.filter(a => !a.correct);
  return (
    <div id="resultsScreen" className="motion-enter space-y-4">
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 text-center">
        <div id="resultIcon" aria-hidden="true" className="motion-pop text-5xl">{visual.icon}</div>
        <h2 className="text-2xl font-bold text-foreground">Quiz terminé !</h2>
        <p className="text-foreground">
          <span id="finalScore" className="text-3xl font-bold text-primary">{score}/{total}</span>
          <span className="ml-2 text-muted">{percentage} % de réussite</span>
        </p>
        <p id="resultMessage" className={`rounded-xl p-3 font-medium ${visual.cls}`}>{visual.msg}</p>
        <p className="text-sm text-muted">{answers.length - wrong.length} bonne{answers.length - wrong.length > 1 ? "s" : ""} réponse{answers.length - wrong.length > 1 ? "s" : ""}, {wrong.length} erreur{wrong.length > 1 ? "s" : ""}.</p>
      </section>

      <details className="rounded-2xl border border-border p-5">
        <summary className="cursor-pointer font-semibold text-foreground">Revoir mes réponses ({answers.length})</summary>
        <ol className="mt-3 space-y-3">
          {answers.map((a, i) => (
            <li key={i} className="space-y-1 rounded-xl border border-border bg-surface p-3 text-sm">
              <p className="font-medium text-foreground">{i + 1}. <MarkdownView md={a.question} inline /></p>
              <p className="flex items-start gap-1 text-foreground"><span aria-hidden="true">{a.correct ? "✓" : "✗"}</span><span><span className="text-muted">Ta réponse : </span><MarkdownView md={a.selectedOption} inline />{a.correct ? " — correcte" : " — incorrecte"}</span></p>
              {!a.correct && <p className="text-foreground"><span className="text-muted">Bonne réponse : </span><MarkdownView md={a.correctOption} inline /></p>}
              {a.explanation && <div className="text-muted"><MarkdownView md={a.explanation} /></div>}
            </li>
          ))}
        </ol>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={onRetake} className="ui-button min-h-11">Refaire le quiz</button>
        <button onClick={onNewTopic} className="min-h-11 rounded-xl border border-border bg-surface px-4 text-foreground">Nouveau sujet</button>
      </div>
    </div>
  );
}
