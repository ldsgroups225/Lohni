import { Button } from '../components/ui/Button'
import { BackButton } from '../components/ui/BackButton'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { LoadingState } from '../components/ui/LoadingState'
import { PendingRead } from '../components/ui/PendingRead'
import { revisionCardVisibility } from '../components/ui/revisionPresentation'
import Mascotte from '../components/Mascotte/Mascotte'
import { CheckIcon, CloseIcon } from '../components/ui/NavigationIcons'
import { Progress } from '../components/ui/Progress'
import MarkdownView from '../components/Chat/MarkdownView'
import { useOverlayNavigation } from '../lib/useOverlayNavigation'
import { useLeaveConfirmation } from '../lib/useLeaveConfirmation'
import { withOccurrenceKeys } from '../lib/occurrenceKeys'
import { confirmDialog } from '../lib/confirm'
import { MENU_EXIT_MS, prefersReducedMotion, useExitTransition } from '../lib/motion'
import { SwipeCard } from '../components/Revision/SwipeCard'
import { SessionRecap } from '../components/Revision/SessionRecap'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useRevisionRead } from '../lib/useRevisionRead'
import { chatJSON, revisionAPI, revisionPolicy, revisionSyncStatus, syncRevisionAnswers, type RevisionCard, type RevisionProfile, type RevisionSession, type RevisionProgress, type RevisionChapter } from '../lib/api'

// Premier rendu instantané au retour : la dernière séance connue (hors séances ciblées) avec son profil.
function lastKnown(scoped: boolean) {
  const profile = revisionAPI.cached.profile(), session = revisionAPI.cached.session()
  return !scoped && profile && session ? { profile, session } : null
}

export default function Revision() {
  const [params] = useSearchParams()
  // L’accueil demande les cartes restantes : on enchaîne au lieu de rouvrir le bilan de la séance finie.
  const continueOnArrival = useRef((useLocation().state as { continue?: boolean } | null)?.continue === true).current
  const examId = params.get('exam')
  const missedId = params.get('missed')
  const scopeChapter = params.get('chapter')
  const scoped = !!(examId || missedId || scopeChapter)
  const loadSession = useCallback((continuing = false) => examId ? revisionAPI.examSession(examId, continuing)
    : missedId ? revisionAPI.missedSession(missedId) : scopeChapter ? revisionAPI.chapterSession(scopeChapter)
    : continuing ? revisionAPI.continue() : revisionAPI.session(), [examId, missedId, scopeChapter])
  const navigate = useNavigate()
  const [profile, setProfile] = useState<RevisionProfile | null>(() => lastKnown(scoped)?.profile ?? null)
  const [session, setSession] = useState<RevisionSession | null>(() => lastKnown(scoped)?.session ?? null)
  // Depuis le cache : la ligne matière · chapitre est là dès la première carte au lieu de la pousser vers le bas.
  const [chapters, setChapters] = useState<RevisionChapter[]>(() => revisionAPI.cached.chapters() ?? [])
  const [progress, setProgress] = useState<RevisionProgress | null>(null)
  const [busy, setBusy] = useState(true)
  const [validated, setValidated] = useState(false)
  const [sync, setSync] = useState(revisionSyncStatus)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [choice, setChoice] = useState<number>()
  const [subject, setSubject] = useState(() => lastKnown(scoped)?.profile.subjects[0] ?? '')
  const [title, setTitle] = useState('')
  const [missed, setMissed] = useState<RevisionCard | null>(null)
  const [feedback, setFeedback] = useState<{ id: number; knew: boolean } | null>(null)
  const [moreCards, setMoreCards] = useState(false)
  const [menu, setMenu] = useOverlayNavigation('revision-menu')
  const sending = useRef(false) // une seule réponse par carte, même si un geste et un bouton se suivent
  const menuButton = useRef<HTMLButtonElement>(null)
  const focusMenuItem = useCallback((button: HTMLButtonElement | null) => { button?.focus() }, [])
  const menuExit = useExitTransition(menu, MENU_EXIT_MS)
  const continueButton = useRef<HTMLButtonElement>(null)
  const keyboardAnswer = useRef(false)
  const [generating, setGenerating] = useState(false)
  const [slow, setSlow] = useState(false)
  // QCM: la réponse est enregistrée au choix ; la carte suivante n’apparaît qu’au clic sur « Continuer ».
  const [verdict, setVerdict] = useState<{ choice: number; next: RevisionSession } | null>(null)
  const startedAt = useRef(Date.now())
  const card = session?.cards[session.position]
  const chapterId = card?.chapterId
  const chapter = chapters.find(value => value.id === chapterId)
  useLeaveConfirmation(!!session && !session.complete && !!card, 'Quitter la session ? Ta progression est enregistrée.')
  // Après un QCM : fait défiler jusqu'à l'indice et « Continuer », avec une marge sous le bouton.
  // Deuxième passage : le Markdown se charge à la demande et peut allonger la page après le premier.
  useEffect(() => {
    if (!verdict) return
    if (keyboardAnswer.current) continueButton.current?.focus({ preventScroll: true })
    keyboardAnswer.current = false
    const go = () => continueButton.current?.scrollIntoView({ block: 'end', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    go()
    const timer = window.setTimeout(go, 350)
    return () => window.clearTimeout(timer)
  }, [verdict])
  // Pendant que l'élève lit cette carte, la suivante est rendue (Markdown, KaTeX) au repos : la transition n'a plus ce travail à faire.
  const nextCard = session && !session.complete ? session.cards[session.position + 1] : undefined
  useEffect(() => {
    if (!nextCard) return
    const texts = [{ md: nextCard.question, inline: true }, { md: nextCard.answer }, ...(nextCard.options ?? []).map(md => ({ md, inline: true }))]
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    // Un texte par moment de repos : un geste qui commence n'attend jamais tout le rendu de la carte suivante.
    let handle = 0, stopped = false
    const step = () => { handle = idle(() => { void import('../components/Chat/MarkdownContent').then(module => { const text = texts.shift(); if (stopped || !text) return; module.prerenderMarkdown([text]); if (texts.length) step() }) }) }
    step()
    return () => { stopped = true; cancel(handle) }
  }, [nextCard])
  const secondaryButton = 'rounded-xl border border-border bg-surface px-4 py-3 text-foreground disabled:opacity-50 disabled:cursor-wait'
  const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(revisionCardVisibility, { detail: !!session && !session.complete && !!card }))
    return () => { window.dispatchEvent(new CustomEvent(revisionCardVisibility, { detail: false })) }
  }, [session, card])

  useEffect(() => {
    if (!feedback) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const clear = () => { if (motion.matches) setFeedback(null) }
    clear()
    motion.addEventListener('change', clear)
    return () => motion.removeEventListener('change', clear)
  }, [feedback])

  const display = useCallback((next: RevisionSession) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) // pas de saut : on repart du haut avant d'afficher la carte suivante
    setSession(next)
    setValidated(true)
    setRevealed(false)
    setChoice(undefined)
    setVerdict(null)
    setMenu(false)
    sending.current = false
    startedAt.current = Date.now()
  }, [setMenu])
  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await operation() }
    catch (e) { setError(e instanceof Error ? e.message : 'Impossible de charger la révision.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    const update = () => setSync(revisionSyncStatus())
    window.addEventListener('revision-sync', update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('revision-sync', update)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  useRevisionRead(async () => { setBusy(true); const saved = await revisionAPI.profile(); return [saved, saved ? await loadSession(continueOnArrival) : null] as const }, {
    accept: ([saved, current]) => {
      setProfile(saved)
      setSubject(subject => saved?.subjects.includes(subject) ? subject : saved?.subjects[0] ?? '')
      if (current) display(current)
    },
    onChanged: () => { setProfile(null); setSession(null); setValidated(false) },
    fail: e => setError(e instanceof Error ? e.message : 'Impossible de charger la révision.'),
    settled: () => setBusy(false),
  }, [display, loadSession, continueOnArrival])
  useRevisionRead(async () => validated && chapterId ? revisionAPI.chapters() : undefined, { accept: values => { if (values) setChapters(values) } }, [validated, chapterId])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Recharger le bilan pour chaque nouvelle session terminée.
  useEffect(() => {
    setMoreCards(false)
    setRecapLoading(false)
    if (!session?.complete) return
    setProgress(null)
    setChapters([])
    if (sync.pending || !sync.online) return
    let active = true
    if (missedId || scopeChapter) setMoreCards(false)
    else if (examId) setMoreCards(true)
    // Bilan complet ou rien : il s'affiche une fois toutes ses lectures revenues (réussies ou non), pas morceau par morceau.
    setRecapLoading(session.position > 0)
    void Promise.allSettled([
      examId || missedId || scopeChapter ? undefined : revisionAPI.home().then(value => { if (active) setMoreCards(value?.moreCards ?? false) }),
      missedId || scopeChapter ? undefined : loadSession().then(fresh => { if (active) setSession(current => current && current.id === fresh.id ? { ...current, summary: fresh.summary } : current) }),
      session.position > 0 ? revisionAPI.chapters().then(value => { if (active) setChapters(value) }) : undefined,
      revisionAPI.progress().then(value => { if (active) setProgress(value) }).catch(error => {
        if (active) setError(error instanceof Error ? error.message : 'Impossible de charger ta progression.')
      }),
    ]).then(() => { if (active) setRecapLoading(false) })
    return () => { active = false }
  }, [session?.id, session?.complete, sync.pending, sync.online])

  // Déclaré en dernier : les tests de page fournissent les états précédents dans l'ordre.
  const [recapLoading, setRecapLoading] = useState(false)
  function generate(event: FormEvent) {
    event.preventDefault()
    setGenerating(true)
    setSlow(false)
    const timer = window.setTimeout(() => setSlow(true), 20000) // vrai temps écoulé, pas une progression simulée
    void run(async () => {
      setSubject(subject.trim())
      await revisionAPI.generateChapter({ subject: subject.trim(), title: title.trim() })
      display(await loadSession(true))
    }).finally(() => { window.clearTimeout(timer); setGenerating(false); setSlow(false) })
  }
  function answer(knew: boolean, selected?: number) {
    if (!session || !card || verdict || sending.current || (card.kind === 'mcq' && selected === undefined)) return
    sending.current = true
    void run(async () => {
      let next: RevisionSession
      try {
        next = await (scoped ? revisionAPI.examAnswer : revisionAPI.answer)({
          sessionId: session.id, cardId: card.id, position: session.position, knew, choice: selected,
          durationMs: Math.max(0, Date.now() - startedAt.current),
        })
      } catch (e) { sending.current = false; throw e }
      if (card.kind === 'mcq' && selected !== undefined) { setChoice(selected); setVerdict({ choice: selected, next }); return }
      setFeedback({ id: Date.now(), knew })
      setMissed(knew ? null : card)
      display(next)
    })
  }
  function next() {
    if (!verdict || !card) return
    const ok = verdict.choice === card.correct
    setFeedback({ id: Date.now(), knew: ok })
    setMissed(ok ? null : card)
    display(verdict.next)
  }
  async function removeCard() {
    if (!card || !(await confirmDialog('Supprimer cette carte définitivement ?'))) return
    setMenu(false)
    void run(async () => {
      await revisionAPI.deleteCard(card.id)
      display(await loadSession())
    })
  }
  function explain(missed: RevisionCard | null | undefined) {
    if (!missed || !profile) return
    void run(async () => {
      const chapter = (await revisionAPI.chapters()).find(value => value.id === missed.chapterId)
      if (!chapter) throw new Error('Ce chapitre n’est plus disponible.')
      const q = `Explique-moi cette carte que je n’ai pas comprise, en français et à mon niveau.\nClasse : ${profile.schoolClass}${profile.series ? `, série ${profile.series}` : ''}.\nMatière : ${chapter.subject}.\nChapitre : ${chapter.title}.\nQuestion : ${missed.question}\n${missed.options ? `Choix : ${missed.options.join(' ; ')}\n` : ''}Réponse : ${missed.answer}`
      const result = await chatJSON({ q })
      navigate(`/chat?chatId=${encodeURIComponent(result.chatId)}`, { state: { allowLeave: true, q, revisionSubject: chapter.subject, revisionTitle: chapter.title, returnTo: `/revision${params.toString() ? `?${params}` : ''}` } })
    })
  }

  if (!busy && !error && !profile) return <Navigate to="/" replace />

  return (
    <main className={`loop-screen flex min-h-dvh flex-col overflow-clip px-4 md:pl-28 ${session && !session.complete && card ? `pt-1 ${verdict ? 'pb-[max(2rem,env(safe-area-inset-bottom))]' : 'pb-[max(.5rem,env(safe-area-inset-bottom))]'}` : 'pt-8 pb-36'}`}>
      <div className={`mx-auto flex w-full max-w-xl flex-1 flex-col ${session && !session.complete && card ? 'space-y-2' : 'space-y-6'}`}>
        {session && !session.complete && card ? <header className="flex items-center gap-3"><h1 className="sr-only">Session de révision</h1><BackButton fallback="/" label="Quitter la session" className="press-icon -ml-3 inline-grid size-11 place-items-center rounded-xl text-muted"><CloseIcon /></BackButton>{session && <div className="flex-1"><div className="motion-progress" aria-hidden="true"><span style={{ transform: `scaleX(${session.cards.length ? session.position / session.cards.length : 0})` }} /></div><Progress className="sr-only" value={session.position} max={session.cards.length} aria-label="Progression de la session" /></div>}{session && <span className="text-sm tabular-nums text-muted">{session.position + 1}/{session.cards.length}</span>}
          <fieldset aria-label="Options de révision" className="relative" onKeyDown={e => { if (e.key === 'Escape') { setMenu(false); menuButton.current?.focus() } }}>
            <button ref={menuButton} type="button" aria-label="Plus d’options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="press-icon -mr-2 grid size-11 place-items-center rounded-xl text-xl leading-none text-muted">⋯</button>
            {menuExit.mounted && <div role="menu" data-state={menuExit.state} className="motion-menu absolute right-0 top-full z-10 mt-1 rounded-xl border border-border bg-surface p-1 shadow-lg">
              <button type="button" role="menuitem" ref={focusMenuItem} disabled={busy || !validated || !!verdict || !sync.online || sync.pending > 0} className="whitespace-nowrap rounded-lg px-4 py-3 text-sm text-danger disabled:opacity-50" onClick={() => void removeCard()}>Supprimer cette carte</button>
            </div>}
          </fieldset>
        </header> : !(session && session.position > 0) && <ScreenHeader back="/" title="Session de révision" />}
        {!scoped && (!sync.online || (sync.pending > 0 && !!sync.error)) && <aside role="status" className="space-y-2 rounded-xl border border-border p-4 text-foreground">
          {!sync.online && <p>Hors ligne. Tu peux terminer ta session déjà chargée.</p>}
          {sync.pending > 0 && <p>{sync.pending} réponse{sync.pending > 1 ? 's' : ''} enregistrée{sync.pending > 1 ? 's' : ''} sur cet appareil, en attente d’envoi. Tes XP et ta série seront confirmés au retour du réseau.</p>}
          {sync.error && <p>{sync.error}</p>}
          {sync.online && sync.pending > 0 && <Button variant="secondary" onClick={() => void syncRevisionAnswers()}>Réessayer l’envoi</Button>}
        </aside>}
        {error && <div role="alert" className="rounded-xl border border-danger p-4 text-foreground">{!card && <Mascotte humeur="désolée" taille={96} />}{error}
          <Button variant="secondary" className="mt-3" disabled={busy} onClick={() => void run(async () => {
            const saved = await revisionAPI.profile()
            setProfile(saved)
            setSubject(current => saved?.subjects.includes(current) ? current : saved?.subjects[0] ?? '')
            if (saved) display(await loadSession())
            setProgress(await revisionAPI.progress())
          })}>Réessayer</Button>
        </div>}
        {generating ? <div className="space-y-2"><LoadingState label="Lohni prépare tes cartes…" />{slow && <p role="status" className="text-center text-sm text-muted">Ça prend plus de temps que d’habitude. Ta demande est toujours en cours, tu peux rester sur cette page.</p>}</div> : busy && !session && <PendingRead title="Ta session" label="On prépare ta session…" />}
        {feedback && <span key={feedback.id} aria-hidden="true" className="motion-feedback" onAnimationEnd={() => setFeedback(null)}>{feedback.knew ? 'Bien joué !' : 'À revoir'}</span>}
        {session && !session.complete && card ? (<>
          <section className="flex flex-1 flex-col space-y-4" aria-label="Session de révision" aria-busy={busy}>
            {card.kind === 'basic' ? <SwipeCard key={`${card.id}-${session.position}`} question={card.question} answer={card.answer} context={chapter ? `${chapter.subject} · ${chapter.title}` : undefined} origin={card.origin} onExplain={() => explain(card)} explainDisabled={busy || !sync.online} revealed={revealed} enabled={!busy && validated} onToggle={() => setRevealed(value => !value)} onSwipe={answer} />
            : <article key={`${card.id}-${session.position}-${revealed}`} className={`shrink-0 space-y-4 rounded-2xl border border-border bg-surface p-5 ${revealed && card.kind !== 'mcq' ? 'motion-flip' : 'motion-enter'}`}>
              {chapter && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{chapter.subject} · {chapter.title}</p>}
              {card.origin === 'ai' && <p className="text-xs text-muted">Générée par IA · Peut contenir des erreurs</p>}
              <h2 className="text-xl text-foreground"><MarkdownView md={card.question} inline /></h2>
              {card.kind === 'mcq' && <fieldset disabled={busy || !validated || !!verdict} className="space-y-3">
                <legend className="mb-3">Choisis ta réponse</legend>
                {withOccurrenceKeys(card.options ?? [], option => option).map(({ value: option, key }, i) => {
                  const n = i + 1
                  const tone = !verdict ? 'border-border' : n === card.correct ? 'border-success bg-success/10' : n === verdict.choice ? 'border-danger bg-danger/10' : 'border-border opacity-60'
                  return <button key={key} type="button" aria-pressed={choice === n} disabled={busy || !validated || !!verdict} onClick={event => { keyboardAnswer.current = event.detail === 0; answer(n === card.correct, n) }} className={`flex min-h-14 w-full items-start gap-3 rounded-xl border p-3 text-left text-foreground focus-visible:outline-2 focus-visible:outline-primary ${tone}`}>
                    <span className="flex-1">{n}. <MarkdownView md={option} inline /></span>
                    {/* Emplacement fixe : afficher la marque ne change ni la largeur du texte ni la hauteur du choix. */}
                    <span data-mark-slot="" className="grid size-6 shrink-0 place-items-center">
                      {verdict && n === card.correct && <span className="motion-pop text-success"><CheckIcon /><span className="sr-only">Bonne réponse</span></span>}
                      {verdict && n === verdict.choice && n !== card.correct && <span className="motion-pop text-danger"><CloseIcon /><span className="sr-only">Ta réponse</span></span>}
                    </span>
                  </button>
                })}
              </fieldset>}
              {verdict ? <div className="space-y-3 border-t border-border pt-5" aria-live="polite">
                <p className="flex items-center gap-2 font-semibold">{verdict.choice === card.correct ? <><span className="motion-pop text-success"><CheckIcon /></span>Bonne réponse !</> : <><span className="motion-pop text-danger"><CloseIcon /></span>Réponse incorrecte</>}</p>
                <MarkdownView md={card.answer} />
              </div> : card.kind === 'mcq' ? null : revealed ? <div className="space-y-3 border-t border-border pt-5" aria-live="polite">
                                <MarkdownView md={card.answer} />
              </div> : <Button disabled={busy || !validated} onClick={() => setRevealed(true)}>Révéler la réponse</Button>}
            </article>}
            {verdict && <Button ref={continueButton} className="w-full scroll-mb-8" onClick={next}>Continuer</Button>}
          </section>
          {/* Sous la carte : un encart au-dessus pousserait la carte suivante vers le bas à chaque réponse. */}
          {missed && <aside className="motion-enter space-y-3 rounded-2xl border border-danger p-4" aria-live="polite">
            <p>À retravailler : <MarkdownView md={missed.question} inline /></p>
            <Button disabled={busy || !sync.online} onClick={() => explain(missed)}>Explique-moi</Button>
          </aside>}
        </>) : (!busy || !!session) && <>
          {session && (session.position > 0 ? <SessionRecap session={session} progress={progress} chapters={chapters} pending={sync.pending} loading={recapLoading && !error} moreCards={moreCards} busy={busy || !validated} online={sync.online} error={!!error} onExplain={id => explain(session.cards.find(c => c.id === id))} onReviewMissed={() => navigate(`/revision?missed=${encodeURIComponent(session.id)}`)} onContinue={() => void run(async () => display(await loadSession(true)))} /> : <section className="space-y-4 rounded-2xl border border-border p-6" aria-live="polite">
            {!error && <Mascotte humeur="au repos" taille={112} />}
            <h2 className="text-xl">{session.kind === 'express' ? 'Rien de fragile à revoir pour cet examen. Bravo !' : 'Aucune carte à réviser pour le moment'}</h2>
            {session.kind !== 'express' && <p>Les nouvelles cartes arrivent progressivement chaque jour. Tu peux aussi préparer un autre chapitre.</p>}
            <button type="button" className={secondaryButton} disabled={busy || !validated || !sync.online || sync.pending > 0} onClick={() => void run(async () => display(await loadSession(true)))}>Continuer</button>
          </section>)}
          {!scoped && profile && !(session && session.position > 0) && <form onSubmit={generate} className="space-y-4 rounded-2xl border border-border p-6">
            <h2 className="text-xl text-foreground">Préparer un chapitre</h2>
            <label className="block space-y-2"><span>Matière</span><select className={input} required value={subject} onChange={e => setSubject(e.target.value)}>{profile.subjects.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="block space-y-2"><span>Chapitre étudié</span><input className={input} required maxLength={revisionPolicy.maxTitleChars} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. : Les fractions" /></label>
            {session && session.position > 0 ? <button type="submit" className={secondaryButton} disabled={busy || !validated || !sync.online || sync.pending > 0}>Générer mes cartes</button> : <Button type="submit" disabled={busy || !validated || !sync.online || sync.pending > 0}>Générer mes cartes</Button>}
          </form>}
        </>}
        {!scoped && profile && !(session && !session.complete && card) && !(session && session.position > 0) && <Link to="/import" className="block rounded-xl border border-border p-4 text-center text-foreground">Importer mon cours</Link>}
      </div>
    </main>
  )
}
