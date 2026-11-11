import { useEffect, useMemo, useRef, useState } from "react"
import { getExams, startExam, connectExamStream, type ExamEvent } from "../lib/api"
import LoadingIndicator from "../components/Chat/LoadingIndicator"
import { ToolPage } from "../components/ui/ToolPage"
import QuizHeader from "../components/Quiz/QuizHeader"
import QuestionCard from "../components/Quiz/QuestionCard"
import ResultsPanel from "../components/Quiz/ResultsPanel"

export type Question = {
  id: number
  question: string
  options: string[]
  correct: number
  hint: string
  explanation: string
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

  const [connecting, setConnecting] = useState(false)
  const [activeExam, setActiveExam] = useState<string | null>(null)
  const [failure, setFailure] = useState("")

  const closeRef = useRef<null | (() => void)>(null)

  const total = qs.length
  const q = qs[idx]

  const percentage = useMemo(
    () => (total ? Math.round((score / total) * 100) : 0),
    [score, total]
  )

  const resultVisual = useMemo(() => {
    if (percentage >= 90) return { msg: "Excellent!", cls: "bg-success border border-success text-on-success", icon: "🏆" }
    if (percentage >= 70) return { msg: "Bravo !", cls: "bg-tint border border-primary text-foreground", icon: "🎉" }
    if (percentage >= 50) return { msg: "Bon travail !", cls: "bg-tint border border-border text-foreground", icon: "📚" }
    return { msg: "Continue à réviser !", cls: "bg-tint border border-primary text-foreground", icon: "💪" }
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
    setShowHint(false)
    setShowExp(false)
    setActiveExam(id)
    setFailure("")
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
        if (ev.type === "error") setFailure(ev.error === "stream_error" ? "Impossible de préparer l’examen. Réessaie." : ev.error)
        if (ev.type === "done" || ev.type === "error") {
          setConnecting(false)
        }
      })
      closeRef.current = close
    } catch {
      setFailure("Impossible de lancer l’examen. Vérifie ta connexion et réessaie.")
      setConnecting(false)
    }
  }

  const onSelect = (i: number) => {
    if (showExp || !q) return
    const correct = i === q.correct
    setSelected(i)
    const ua: UA = {
      questionId: q.id,
      selectedAnswer: i,
      correct,
      question: q.question,
      selectedOption: q.options[i],
      correctOption: q.options[q.correct],
      explanation: q.explanation,
    }
    setAnswers(a => [...a, ua])
    setShowExp(true)
    if (correct) setScore(s => s + 1)
  }
  const onNext = () => {
    if (!showExp) return
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
    if (idx === total - 1) setDone(true)
    else {
      setIdx(n => n + 1)
      setSelected(null)
      setShowHint(false)
      setShowExp(false)
    }
  }

  // --- UI: Exam List ---
  if (!activeExam) {
    return (
  <ToolPage title="Examens">

      {loadingExams && <LoadingIndicator label="Chargement des examens…" />}

      <div className="grid gap-6">
        {exams.map((ex) => (
          <button
            type="button"
            key={ex.id}
            onClick={() => start(ex.id)}
            className="w-full rounded-2xl bg-surface border border-border p-5 text-left hover:border-primary"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold text-foreground">
                {ex.name}
              </div>
              <div className="px-3 py-1 rounded-full bg-tint text-foreground text-xs font-medium">
                {ex.sections.length} sections
              </div>
            </div>
            <div className="text-sm text-muted">
              Commencer cet examen
            </div>
          </button>
        ))}
      </div>

      {!loadingExams && !exams.length && (
        <div className="mt-16 text-center text-muted">
          Aucun examen disponible.
        </div>
      )}
  </ToolPage>
    )
  }

  // --- UI: Exam Taking ---
  return (
    <ToolPage title="Examen">
        {connecting && (
          <div className="mt-10">
            <LoadingIndicator label="Préparation de ton examen…" />
          </div>
        )}

        {failure && !qs.length && (
          <div role="alert" className="mt-10 space-y-4 text-center">
            <p className="text-foreground">{failure}</p>
            <button type="button" onClick={() => setActiveExam(null)} className="ui-button min-h-11">Retour aux examens</button>
          </div>
        )}

        {qs.length > 0 && !done && q && (
          <>
            <QuizHeader topic={exams.find(e => e.id === activeExam)?.name ?? activeExam} idx={idx} total={total} score={score} />
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
            onNewTopic={() => setActiveExam(null)}
          />
        )}

    </ToolPage>
  )
}
