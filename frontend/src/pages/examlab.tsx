import { PartyIcon, TrophyIcon, BookIcon, DumbbellIcon } from '../components/ui/NavigationIcons'
import { useEffect, useMemo, useRef, useState } from "react"
import { runTask } from "../lib/taskRun"
import { getExams, startExam, cancelExam, connectExamStream, revisionAPI, type ExamEvent } from "../lib/api"
import LoadingIndicator from "../components/Chat/LoadingIndicator"
import { LoadingState } from "../components/ui/LoadingState"
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
  const [fragileCard, setFragileCard] = useState<string>()
  const [ready, setReady] = useState(false)

  const runRef = useRef<{ cancel: () => void } | null>(null)
  function cancel() {
    runRef.current?.cancel()
    runRef.current = null
    setConnecting(false)
    setActiveExam(null)
  }

  const total = qs.length
  const q = qs[idx]

  const percentage = useMemo(
    () => (total ? Math.round((score / total) * 100) : 0),
    [score, total]
  )

  const resultVisual = useMemo(() => {
    if (percentage >= 90) return { msg: "Excellent!", cls: "bg-success border border-success text-on-success", icon: <TrophyIcon className="size-14" /> }
    if (percentage >= 70) return { msg: "Bravo !", cls: "bg-tint border border-primary text-foreground", icon: <PartyIcon className="size-14" /> }
    if (percentage >= 50) return { msg: "Bon travail !", cls: "bg-tint border border-border text-foreground", icon: <BookIcon className="size-14" /> }
    return { msg: "Continue à réviser !", cls: "bg-tint border border-primary text-foreground", icon: <DumbbellIcon className="size-14" /> }
  }, [percentage])

  useEffect(() => {
    void revisionAPI.chapters().then(chapters => {
      const fragile = chapters.filter(chapter => chapter.seenCards > 0).sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))[0]
      setFragileCard(fragile?.cards.filter(card => card.reviews > 0).sort((a, b) => a.due.localeCompare(b.due))[0]?.question)
    }).catch(() => {})
    ;(async () => {
      try {
        const r = await getExams()
        setExams(r.exams || [])
      } finally {
        setLoadingExams(false)
      }
    })()
    return () => { runRef.current?.cancel() }
  }, [])

  async function start(id: string) {
    runRef.current?.cancel()
    setReady(false)
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

    runRef.current = runTask<ExamEvent>({
      start: async () => (await startExam(id)).runId,
      connect: connectExamStream,
      cancel: cancelExam,
      streamError: "Impossible de préparer l’examen. Réessaie.",
      onStartError: () => { setFailure("Impossible de lancer l’examen. Vérifie ta connexion et réessaie."); setConnecting(false) },
      onEvent: (ev: ExamEvent) => {
        if (ev.type === "exam") {
          const arr = Array.isArray(ev.payload) ? ev.payload : []
          setQs(arr.map((q: any) => ({ ...q, correct: Math.max(0, q.correct - 1) })))
          setIdx(0)
          setConnecting(false)
          setReady(true)
          runRef.current = null
        }
        if (ev.type === "error") setFailure(ev.error)
        if (ev.type === "done" || ev.type === "error") {
          runRef.current = null
          setConnecting(false)
        }
      },
    })
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

      <div className="rounded-2xl border border-border bg-surface p-4">
        <button type="button" disabled className="min-h-11 text-left font-semibold text-muted">Examen à réponse rédigée</button>
        <p className="text-sm text-muted">Indisponible pour le moment : les examens proposés sont des QCM.</p>
      </div>

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
            <LoadingState label="Préparation de ton examen" expectedDuration={45} steps={[{ after: 0, message: "Choix des questions dans tes chapitres…" }, { after: 10, message: "Rédaction des questions…" }, { after: 25, message: "Encore un instant, c’est normal pour un examen complet." }]} onCancel={cancel} fragileCard={fragileCard} />
          </div>
        )}

        {failure && !qs.length && (
          <div role="alert" className="mt-10 space-y-4 text-center">
            <p className="text-foreground">{failure}</p>
            <button type="button" onClick={() => setActiveExam(null)} className="ui-button min-h-11">Retour aux examens</button>
          </div>
        )}

        {ready && <section className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 py-12 text-center" role="status">
          <span aria-hidden="true" className="grid size-18 place-items-center rounded-full bg-success text-3xl text-on-success">✓</span>
          <h2 className="text-2xl font-bold">Ton examen est prêt</h2>
          <button type="button" className="ui-button min-h-11 w-full" onClick={() => setReady(false)}>Commencer</button>
        </section>}
        {qs.length > 0 && !ready && !done && q && (
          <>
            <QuizHeader topic={exams.find(e => e.id === activeExam)?.name ?? activeExam} idx={idx} total={total} score={score} segmented />
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
