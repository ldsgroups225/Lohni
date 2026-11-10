import MarkdownView from "../Chat/MarkdownView";
import type { Question } from "../../pages/Quiz";

export default function QuestionCard({
  q, selected, showExp, showHint, onSelect, onHint, onNext, isLast
}:{
  q:Question; selected:number|null; showExp:boolean; showHint:boolean;
  onSelect:(i:number)=>void; onHint:()=>void; onNext:()=>void; isLast:boolean;
}) {
  return (
    <div id="quizContent" className="space-y-8">
      <div id="questionCard" className="bg-surface border border-border rounded-2xl p-6">
        <div className="mb-6">
          <h2 id="questionText" className="text-xl font-semibold text-foreground mb-4"><MarkdownView md={q.question} inline /></h2>
          <div id="questionImage" className={`${q.imageHtml ? "" : "hidden"} mb-4`} dangerouslySetInnerHTML={{ __html: q.imageHtml || "" }} />
        </div>

        <div id="answerOptions" className="space-y-3">
          {q.options.map((opt, i) => {
            const isSel = selected === i;
            const isCorrect = showExp && i === q.correct;
            const isWrongSel = showExp && selected === i && i !== q.correct;
            const cls = [
              "answer-option p-4 border rounded-xl cursor-pointer transition-all duration-200",
              "hover:border-border hover:bg-surface",
              "border-border",
              isSel ? "border-primary bg-tint" : "",
              isCorrect ? "border-success bg-success text-on-success" : "",
              isWrongSel ? "border-danger bg-danger text-on-danger" : "",
            ].join(" ");

            return (
              <div key={i} className={cls} onClick={() => onSelect(i)} style={{ pointerEvents: showExp ? "none" : "auto" }}>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center text-xs font-bold">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span><MarkdownView md={opt} inline /></span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col md:flex-row justify-between items-center">
          <button onClick={onHint} className="bg-surface hover:bg-tint border border-border hover:border-border text-foreground hover:text-foreground rounded-xl px-4 py-2 font-medium transition-all duration-300 flex items-center gap-2">
            <span className="text-lg">💡</span> Afficher un indice
          </button>
          <button onClick={onNext} disabled={selected == null}
            className="bg-surface hover:bg-tint border border-border hover:border-border text-foreground hover:text-foreground rounded-xl px-6 py-3 font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {isLast ? "Terminer le quiz" : "Question suivante"}
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
            </svg>
          </button>
        </div>

        <div className={`${showHint ? "" : "hidden"} mt-4 p-4 bg-tint border border-border rounded-xl`}>
          <p className="text-foreground text-sm"><strong>💡 Indice :</strong> <MarkdownView md={q.hint} inline /></p>
        </div>

        <div className={`${showExp ? "" : "hidden"} mt-4 p-4 bg-surface border border-border rounded-xl`}>
          <h3 className="text-foreground font-medium mb-2">Explication :</h3>
          <MarkdownView md={q.explanation} />
        </div>
      </div>
    </div>
  );
}