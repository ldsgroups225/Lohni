import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { quizStart, connectQuizStream, type QuizEvent } from "../lib/api";
import { useLeaveConfirmation } from "../lib/useLeaveConfirmation";
import { LoadingState } from "../components/ui/LoadingState";
import { ToolPage } from "../components/ui/ToolPage";
import TopicBar from "../components/Quiz/TopicBar";
import QuizHeader from "../components/Quiz/QuizHeader";
import QuestionCard from "../components/Quiz/QuestionCard";
import ResultsPanel from "../components/Quiz/ResultsPanel";

export type Question = { id: number; question: string; options: string[]; correct: number; hint: string; explanation: string; imageHtml?: string };
export type UA = { questionId: number; selectedAnswer: number; correct: boolean; question: string; selectedOption: string; correctOption: string; explanation: string };

function takeQuizArray(a: unknown): Question[] {
  if (Array.isArray(a)) return a as Question[];
  if (Array.isArray((a as any)?.quiz)) return (a as any).quiz as Question[];
  return [];
}

export default function Quiz() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation() as any;

  const cacheKey = location.state?.quizCacheKey || location.key;
  const passedTopic = (location?.state && location.state.topic) || "";
  const initialTopic = search.get("topic") || passedTopic || "";

  const [topic, setTopic] = useState(initialTopic);
  const [qs, setQs] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [done, setDone] = useState(false);
  const [answers, setAnswers] = useState<UA[]>([]);

  const [connecting, setConnecting] = useState(false);

  const closeRef = useRef<null | (() => void)>(null);
  const startedTopicRef = useRef<string | null>(null);

  useLeaveConfirmation((connecting || qs.length > 0) && !done, "Quitter le quiz ? Ta progression sera perdue.");

  const total = qs.length;
  const q = qs[idx];

  const percentage = useMemo(() => (total ? Math.round((score / total) * 100) : 0), [score, total]);
  const resultVisual = useMemo(() => { if (percentage >= 90) return { msg: "Excellent ! Tu maîtrises ce sujet !", cls: "bg-success border border-success text-on-success", icon: "🏆" }; if (percentage >= 70) return { msg: "Bravo ! Tu as bien compris.", cls: "bg-tint border border-primary text-foreground", icon: "🎉" }; if (percentage >= 50) return { msg: "Bon travail ! Relis les notions puis réessaie.", cls: "bg-tint border border-border text-foreground", icon: "📚" }; return { msg: "Continue à réviser pour progresser.", cls: "bg-tint border border-primary text-foreground", icon: "💪" }; }, [percentage]);

  useEffect(() => () => { if (closeRef.current) closeRef.current(); }, []);
  useEffect(() => {
    if (!initialTopic) return;
    if (startedTopicRef.current === initialTopic) { startedTopicRef.current = null; return; }
    try {
      const cached = sessionStorage.getItem(`quiz:${cacheKey}:${initialTopic}`);
      if (cached) { setQs(JSON.parse(cached)); setTopic(initialTopic); return; }
    } catch { /* Le quiz reste utilisable si le stockage est indisponible. */ }
    start(initialTopic);
  }, [initialTopic, cacheKey]);

  function resetQuestionState() {
    setIdx(0);
    setSelected(null);
    setShowHint(false);
    setShowExp(false);
  }

  async function start(t: string) {
    const trimmed = t.trim();
    if (!trimmed) return;
    if (closeRef.current) closeRef.current();

    setQs([]);
    resetQuestionState();
    setScore(0);
    setDone(false);
    setAnswers([]);
    setConnecting(true);

    try {
      const s = await quizStart(trimmed);
      const { close } = connectQuizStream(s.quizId, (ev: QuizEvent) => {
        if (ev.type === "quiz") {
          const arr = takeQuizArray(ev.quiz).map(q => ({
            ...q,
            correct: typeof q.correct === "number" ? Math.max(0, q.correct - 1) : 0
          }));
          setQs(arr);
          try { sessionStorage.setItem(`quiz:${cacheKey}:${trimmed}`, JSON.stringify(arr)); } catch { /* Le stockage est facultatif. */ }
          resetQuestionState();
          setConnecting(false);
        }
        if (ev.type === "done" || ev.type === "error") {
          setConnecting(false);
        }
      });
      closeRef.current = close;

      if (search.get("topic") !== trimmed) {
        if (initialTopic !== trimmed) startedTopicRef.current = trimmed;
        navigate(`/quiz?topic=${encodeURIComponent(trimmed)}`, {
          replace: true,
          state: { topic: trimmed, quizCacheKey: cacheKey },
        });
      }
    } catch {
      setConnecting(false);
    }
  }

  // Comme en révision : la réponse est enregistrée au choix, le retour s'affiche tout de suite, « Continuer » passe à la suite.
  const onSelect = (i: number) => {
    if (showExp || !q) return;
    const correct = i === q.correct;
    setSelected(i);
    setAnswers(a => [...a, {
      questionId: q.id, selectedAnswer: i, correct, question: q.question,
      selectedOption: q.options[i], correctOption: q.options[q.correct], explanation: q.explanation,
    }]);
    if (correct) setScore(s => s + 1);
    setShowExp(true);
  };

  const onNext = () => {
    if (!showExp) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }); // repartir du haut : pas de saut à l'affichage de la question suivante
    if (idx === total - 1) setDone(true);
    else {
      setIdx(n => n + 1);
      setSelected(null);
      setShowHint(false);
      setShowExp(false);
    }
  };

  const newTopic = () => { setDone(false); setQs([]); setTopic(""); setAnswers([]); resetQuestionState(); setScore(0); };

  return (
    <ToolPage title="Quiz libre">
      {qs.length === 0 && !connecting && !done && (
        <TopicBar
          value={topic}
          onChange={setTopic}
          onStart={() => start(topic)}
        />
      )}

      {connecting && <LoadingState label="Lohni prépare ton quiz…" />}

      {qs.length > 0 && !done && q && (
        <>
          <QuizHeader topic={topic || "Quiz"} idx={idx} total={total} score={score} />
          <QuestionCard
            key={q.id}
            q={q}
            selected={selected}
            showExp={showExp}
            showHint={showHint}
            onSelect={onSelect}
            onHint={() => setShowHint(true)}
            onNext={onNext}
            isLast={idx === total - 1}
          />
        </>
      )}

      {done && (
        <ResultsPanel
          score={score}
          total={total}
          percentage={percentage}
          visual={resultVisual}
          answers={answers}
          onRetake={() => { resetQuestionState(); setScore(0); setDone(false); setAnswers([]); }}
          onNewTopic={newTopic}
        />
      )}
    </ToolPage>
  );
}
