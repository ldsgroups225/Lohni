import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getExams, startExam, connectExamStream, type ExamEvent } from "../lib/api"
import LoadingIndicator from "../components/Chat/LoadingIndicator"
import QuizHeader from "../components/Quiz/QuizHeader"
import QuestionCard from "../components/Quiz/QuestionCard"
import ResultsPanel from "../components/Quiz/ResultsPanel"
import ReviewModal from "../components/Quiz/ReviewModal"

export type Question = {
  id: number
  question: string
  options: string[]
  correct: number
  hint: string
  explanation: string
  imageHtml?: string
}

export type UA = {
  questionId: number
  selectedAnswer: number
  correct: boolean
  question: string
  selectedOption: string
  correctOption: string
  explanation: string
}

export default function ExamLabs() {
  const [exams, setExams] = useState<any[]>([])
  const [loadingExams, setLoadingExams] = useState(true)

  const [qs, setQs] = useState<Question[]>([])
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [showExp, setShowExp] = useState(false)
  const [done, setDone] = useState(false)
  const [answers, setAnswers] = useState<UA[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)

  const [connecting, setConnecting] = useState(false)
  const [activeExam, setActiveExam] = useState<string | null>(null)

  const closeRef = useRef<null | (() => void)>(null)
  const navigate = useNavigate()

  const total = qs.length
  const q = qs[idx]

  const percentage = useMemo(
    () => (total ? Math.round((score / total) * 100) : 0),
    [score, total]
  )

  const resultVisual = useMemo(() => {
    if (percentage >= 90) return { msg: "Excellent!", cls: "bg-tint border border-green-700 text-foreground", icon: "🏆" }
    if (percentage >= 70) return { msg: "Bravo !", cls: "bg-tint border border-primary text-primary", icon: "🎉" }
    if (percentage >= 50) return { msg: "Bon travail !", cls: "bg-tint border border-yellow-700 text-foreground", icon: "📚" }
    return { msg: "Continue à réviser !", cls: "bg-tint border border-red-700 text-foreground", icon: "💪" }
  }, [percentage])

  useEffect(() => {
    (async () => {
      try {
        const r = await getExams()
        setExams(r.exams || [])
      } finally {
        setLoadingExams(false)
      }
    })()
    return () => { if (closeRef.current) closeRef.current() }
  }, [])

  async function start(id: string) {
    if (closeRef.current) closeRef.current()
    setQs([])
    setIdx(0)
    setScore(0)
    setDone(false)
    setAnswers([])
    setSelected(null)
    setActiveExam(id)
    setConnecting(true)

    try {
      const { runId } = await startExam(id)
      const { close } = connectExamStream(runId, (ev: ExamEvent) => {
        if (ev.type === "exam") {
          const arr = Array.isArray(ev.payload) ? ev.payload : []
          setQs(arr.map((q: any) => ({ ...q, correct: Math.max(0, q.correct - 1) })))
          setIdx(0)
          setConnecting(false)
        }
        if (ev.type === "done" || ev.type === "error") {
          setConnecting(false)
        }
      })
      closeRef.current = close
    } catch {
      setConnecting(false)
    }
  }

  const onSelect = (i: number) => { if (!showExp) setSelected(i) }
  const onNext = () => {
    if (selected == null || !q) return
    const correct = selected === q.correct
    const ua: UA = {
      questionId: q.id,
      selectedAnswer: selected,
      correct,
      question: q.question,
      selectedOption: q.options[selected],
      correctOption: q.options[q.correct],
      explanation: q.explanation,
    }
    setAnswers(a => [...a, ua])
    setShowExp(true)
    if (correct) setScore(s => s + 1)
    setTimeout(() => {
      if (idx === total - 1) setDone(true)
      else {
        setIdx(n => n + 1)
        setSelected(null)
        setShowHint(false)
        setShowExp(false)
      }
    }, 350)
  }

  // --- UI: Exam List ---
  if (!activeExam) {
    return (
  <div className="bg-background text-foreground min-h-screen w-full px-4 md:pl-28 lg:pr-4">
    <div className="max-w-5xl mx-auto pt-10 pb-28 md:pb-14">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-surface border border-border hover:bg-surface transition-colors"
            aria-label="Retour"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5 text-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <h1 className="text-2xl font-semibold text-foreground">Examens</h1>
        </div>
        <div className="px-3 py-1 rounded-full bg-tint border border-border text-foreground text-xs font-medium">
          BÊTA
        </div>
      </div>

      {loadingExams && <LoadingIndicator label="Chargement des examens…" />}

      <div className="grid gap-6">
        {exams.map((ex) => (
          <div
            key={ex.id}
            onClick={() => start(ex.id)}
            className="group rounded-2xl bg-surface border border-border p-5 cursor-pointer hover:border-primary transition-all duration-300 hover:shadow-lg hover:shadow-primary/10"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold text-foreground">
                {ex.name}
              </div>
              <div className="px-3 py-1 rounded-full bg-tint text-primary text-xs font-medium">
                {ex.sections.length} sections
              </div>
            </div>
            <div className="text-sm text-muted">
              Clique pour commencer cet examen
            </div>
          </div>
        ))}
      </div>

      {!loadingExams && !exams.length && (
        <div className="mt-16 text-center text-muted">
          Aucun examen disponible.
        </div>
      )}
    </div>
  </div>
    )
  }

  // --- UI: Exam Taking ---
  return (
    <div className="bg-background text-foreground flex flex-col min-h-screen w-full px-4 md:pl-28 lg:pr-4">
      <div className="w-full max-w-4xl mx-auto p-4 pt-8 pb-24 my-auto">
        {connecting && (
          <div className="mt-10">
            <LoadingIndicator label="Préparation de ton examen…" />
          </div>
        )}

        {qs.length > 0 && !done && q && (
          <>
            <QuizHeader topic={activeExam || "Exam"} idx={idx} total={total} score={score} />
            <QuestionCard
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
            onRetake={() => start(activeExam)}
            onReview={() => setReviewOpen(true)}
            onNewTopic={() => setActiveExam(null)}
          />
        )}

        {reviewOpen && (
          <ReviewModal answers={answers} onClose={() => setReviewOpen(false)} />
        )}
      </div>
    </div>
  )
}
