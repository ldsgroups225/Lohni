export default function QuizHeader({ topic, idx, total, score, segmented = false }:{ topic:string; idx:number; total:number; score:number; segmented?:boolean }) {
  const current = Math.min(idx + 1, total);
  return (
    <div id="quizHeader" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p className="min-w-0 truncate font-semibold text-foreground">{topic}</p>
        <p className="shrink-0 tabular-nums text-muted">Question {current}/{total} · Score {score}</p>
      </div>
      {segmented ? <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={idx} aria-label="Progression de l’examen">
        {Array.from({ length: total }, (_, i) => i + 1).map(position => <span key={position} className={`h-2 flex-1 rounded-full ${position <= idx ? "bg-success" : position === idx + 1 ? "bg-primary" : "bg-tint"}`} />)}
      </div> : <div className="motion-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={idx} aria-label="Progression du quiz">
        <span style={{ transform: `scaleX(${total ? idx / total : 0})` }} />
      </div>}
    </div>
  );
}
