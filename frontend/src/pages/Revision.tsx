import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { revisionCardVisibility } from '../components/ui/revisionPresentation'
import Mascotte from '../components/Mascotte/Mascotte'
import { CheckIcon, CloseIcon } from '../components/ui/NavigationIcons'
import { Progress } from '../components/ui/Progress'
import MarkdownView from '../components/Chat/MarkdownView'
import { confirmDialog } from '../lib/confirm'
import { MENU_EXIT_MS, useExitTransition } from '../lib/motion'
import { SwipeCard } from '../components/Revision/SwipeCard'
import { SessionRecap } from '../components/Revision/SessionRecap'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { chatJSON, revisionAPI, revisionPolicy, revisionSyncStatus, syncRevisionAnswers, type RevisionCard, type RevisionProfile, type RevisionSession, type RevisionProgress } from '../lib/api'

export default function Revision() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<RevisionProfile | null>(null)
  const [session, setSession] = useState<RevisionSession | null>(null)
  const [progress, setProgress] = useState<RevisionProgress | null>(null)
  const [busy, setBusy] = useState(true)
  const [sync, setSync] = useState(revisionSyncStatus)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [choice, setChoice] = useState<number>()
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [missed, setMissed] = useState<RevisionCard | null>(null)
  const [feedback, setFeedback] = useState<{ id: number; knew: boolean } | null>(null)
  const [moreCards, setMoreCards] = useState(false)
  const [menu, setMenu] = useState(false)
  const sending = useRef(false) // une seule réponse par carte, même si un geste et un bouton se suivent
  const menuButton = useRef<HTMLButtonElement>(null)
  const menuExit = useExitTransition(menu, MENU_EXIT_MS)
  const continueButton = useRef<HTMLButtonElement>(null)
  const [generating, setGenerating] = useState(false)
  const [slow, setSlow] = useState(false)
  // QCM: la réponse est enregistrée au choix ; la carte suivante n’apparaît qu’au clic sur « Continuer ».
  const [verdict, setVerdict] = useState<{ choice: number; next: RevisionSession } | null>(null)
  const startedAt = useRef(Date.now())
  const card = session?.cards[session.position]
  useEffect(() => { if (verdict) continueButton.current?.scrollIntoView({ block: 'nearest' }) }, [verdict])
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

  function display(next: RevisionSession) {
    setSession(next)
    setRevealed(false)
    setChoice(undefined)
    setVerdict(null)
    setMenu(false)
    sending.current = false
    startedAt.current = Date.now()
  }
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
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const saved = await revisionAPI.profile()
        const current = saved ? await revisionAPI.session() : null
        if (!active) return
        setProfile(saved)
        setSubject(saved?.subjects[0] ?? '')
        if (current) display(current)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Impossible de charger la révision.')
      } finally { if (active) setBusy(false) }
    }
    void load()
    return () => { active = false }
  }, [])
  useEffect(() => {
    setMoreCards(false)
    if (!session?.complete || sync.pending || !sync.online) return
    let active = true
    revisionAPI.home().then(value => { if (active) setMoreCards(value?.moreCards ?? false) }).catch(() => {})
    revisionAPI.session().then(fresh => { if (active) setSession(current => current && current.id === fresh.id ? { ...current, summary: fresh.summary } : current) }).catch(() => {})
    revisionAPI.progress().then(value => { if (active) setProgress(value) }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Impossible de charger ta progression.')
    })
    return () => { active = false }
  }, [session?.id, session?.complete, sync.pending, sync.online])

  function generate(event: FormEvent) {
    event.preventDefault()
    setGenerating(true)
    setSlow(false)
    const timer = window.setTimeout(() => setSlow(true), 20000) // vrai temps écoulé, pas une progression simulée
    void run(async () => {
      setSubject(subject.trim())
      await revisionAPI.generateChapter({ subject: subject.trim(), title: title.trim() })
      display(await revisionAPI.continue())
    }).finally(() => { window.clearTimeout(timer); setGenerating(false); setSlow(false) })
  }
  function answer(knew: boolean, selected?: number) {
    if (!session || !card || verdict || sending.current) return
    sending.current = true
    void run(async () => {
      let next: RevisionSession
      try {
        next = await revisionAPI.answer({
          sessionId: session.id, cardId: card.id, position: session.position, knew, choice: selected,
          durationMs: Math.max(0, Date.now() - startedAt.current),
        })
      } catch (e) { sending.current = false; throw e }
      if (card.kind === 'mcq') { setChoice(selected); setVerdict({ choice: selected!, next }); return }
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
      display(await revisionAPI.session())
    })
  }
  function explain(missed: RevisionCard | null | undefined) {
    if (!missed || !profile) return
    void run(async () => {
      const chapter = (await revisionAPI.chapters()).find(value => value.id === missed.chapterId)
      if (!chapter) throw new Error('Ce chapitre n’est plus disponible.')
      const q = `Explique-moi cette carte que je n’ai pas comprise, en français et à mon niveau.\nClasse : ${profile.schoolClass}${profile.series ? `, série ${profile.series}` : ''}.\nMatière : ${chapter.subject}.\nChapitre : ${chapter.title}.\nQuestion : ${missed.question}\n${missed.options ? `Choix : ${missed.options.join(' ; ')}\n` : ''}Réponse : ${missed.answer}`
      const result = await chatJSON({ q })
      navigate(`/chat?chatId=${encodeURIComponent(result.chatId)}`, { state: { q, revisionSubject: chapter.subject, revisionTitle: chapter.title } })
    })
  }

  if (!busy && !error && !profile) return <Navigate to="/" replace />

  return (
    <main className={`loop-screen flex min-h-dvh flex-col px-4 md:pl-28 ${session && !session.complete && card ? 'pt-1 pb-[max(.5rem,env(safe-area-inset-bottom))]' : 'pt-8 pb-36'}`}>
      <div className={`mx-auto flex w-full max-w-xl flex-1 flex-col ${session && !session.complete && card ? 'space-y-2' : 'space-y-6'}`}>
        {session && !session.complete && card ? <header className="flex items-center gap-3"><h1 className="sr-only">Session de révision</h1><Link to="/" aria-label="Quitter la session" className="press-icon -ml-3 inline-grid size-11 place-items-center rounded-xl text-muted"><CloseIcon /></Link>{session && <div className="flex-1"><div className="motion-progress" aria-hidden="true"><span style={{ transform: `scaleX(${session.cards.length ? session.position / session.cards.length : 0})` }} /></div><Progress className="sr-only" value={session.position} max={session.cards.length} aria-label="Progression de la session" /></div>}{session && <span className="text-sm tabular-nums text-muted">{session.position + 1}/{session.cards.length}</span>}
          <div className="relative" onKeyDown={e => { if (e.key === 'Escape') { setMenu(false); menuButton.current?.focus() } }}>
            <button ref={menuButton} type="button" aria-label="Plus d’options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(value => !value)} className="press-icon -mr-2 grid size-11 place-items-center rounded-xl text-xl leading-none text-muted">⋯</button>
            {menuExit.mounted && <div role="menu" data-state={menuExit.state} className="motion-menu absolute right-0 top-full z-10 mt-1 rounded-xl border border-border bg-surface p-1 shadow-lg">
              <button role="menuitem" autoFocus disabled={busy || !!verdict || !sync.online || sync.pending > 0} className="whitespace-nowrap rounded-lg px-4 py-3 text-sm text-danger disabled:opacity-50" onClick={() => void removeCard()}>Supprimer cette carte</button>
            </div>}
          </div>
        </header> : !(session && session.position > 0) && <header><h1 className="text-2xl font-semibold text-foreground">Session de révision</h1></header>}
        {(!sync.online || sync.pending > 0) && <aside role="status" className="space-y-2 rounded-xl border border-border p-4 text-foreground">
          {!sync.online && <p>Hors ligne. Tu peux terminer ta session déjà chargée.</p>}
          {sync.pending > 0 && <p>{sync.pending} réponse{sync.pending > 1 ? 's' : ''} enregistrée{sync.pending > 1 ? 's' : ''} sur cet appareil, en attente d’envoi. Tes XP et ta série seront confirmés au retour du réseau.</p>}
          {sync.error && <p>{sync.error}</p>}
          {sync.online && sync.pending > 0 && <button className="underline" onClick={() => void syncRevisionAnswers()}>Réessayer l’envoi</button>}
        </aside>}
        {error && <div role="alert" className="rounded-xl border border-danger p-4 text-foreground">{!card && <Mascotte humeur="désolée" taille={96} />}{error}
          <button className="ml-3 underline" disabled={busy} onClick={() => void run(async () => {
            const saved = await revisionAPI.profile()
            setProfile(saved)
            setSubject(saved?.subjects[0] ?? '')
            if (saved) display(await revisionAPI.session())
            setProgress(await revisionAPI.progress())
          })}>Réessayer</button>
        </div>}
        {generating ? <div className="space-y-2"><LoadingState label="Lohni prépare tes cartes…" />{slow && <p role="status" className="text-center text-sm text-muted">Ça prend plus de temps que d’habitude. Ta demande est toujours en cours, tu peux rester sur cette page.</p>}</div> : busy && !session && <LoadingState label="On prépare ta session…" />}
        {feedback && <span key={feedback.id} aria-hidden="true" className="motion-feedback" onAnimationEnd={() => setFeedback(null)}>{feedback.knew ? 'Bien joué !' : 'À revoir'}</span>}
        {missed && !session?.complete && <aside className="space-y-3 rounded-2xl border border-danger p-4" aria-live="polite">
          <p>À retravailler : <MarkdownView md={missed.question} inline /></p>
          <Button disabled={busy || !sync.online} onClick={() => explain(missed)}>Explique-moi</Button>
        </aside>}
        {session && !session.complete && card ? (
          <section className="flex flex-1 flex-col space-y-4" aria-label="Session de révision" aria-busy={busy}>
            {card.kind === 'basic' ? <>
              {card.origin === 'ai' && <p className="text-center text-xs text-muted">Générée par IA · Peut contenir des erreurs</p>}
              <SwipeCard key={`${card.id}-${session.position}`} question={card.question} answer={card.answer} revealed={revealed} enabled={!busy} onToggle={() => setRevealed(value => !value)} onSwipe={answer} />
            </> : <article key={`${card.id}-${session.position}-${revealed}`} className={`shrink-0 space-y-4 rounded-2xl border border-border bg-surface p-5 ${revealed && card.kind !== 'mcq' ? 'motion-flip' : 'motion-enter'}`}>
              {card.origin === 'ai' && <p className="text-xs text-muted">Générée par IA · Peut contenir des erreurs</p>}
              <h2 className="text-xl text-foreground"><MarkdownView md={card.question} inline /></h2>
              {card.kind === 'mcq' && <fieldset disabled={busy || !!verdict} className="space-y-3">
                <legend className="mb-3">Choisis ta réponse</legend>
                {card.options?.map((option, i) => {
                  const n = i + 1
                  const tone = !verdict ? 'border-border' : n === card.correct ? 'border-success bg-success/10' : n === verdict.choice ? 'border-danger bg-danger/10' : 'border-border opacity-60'
                  return <label key={i} className={`flex items-start gap-3 rounded-xl border p-3 ${tone}`}>
                    <input type="radio" name="answer" value={n} checked={choice === n} onChange={() => answer(n === card.correct, n)} className="mt-1" />
                    <span className="flex-1">{n}. <MarkdownView md={option} inline /></span>
                    {verdict && n === card.correct && <span className="flex items-center gap-1 text-sm"><CheckIcon />Bonne réponse</span>}
                    {verdict && n === verdict.choice && n !== card.correct && <span className="flex items-center gap-1 text-sm"><CloseIcon />Ta réponse</span>}
                  </label>
                })}
              </fieldset>}
              {verdict ? <div className="space-y-3 border-t border-border pt-5" aria-live="polite">
                <p className="flex items-center gap-2 font-semibold">{verdict.choice === card.correct ? <><span className="motion-pop text-success"><CheckIcon /></span>Bonne réponse !</> : <><span className="motion-pop text-danger"><CloseIcon /></span>Réponse incorrecte</>}</p>
                <MarkdownView md={card.answer} />
              </div> : card.kind === 'mcq' ? null : revealed ? <div className="space-y-3 border-t border-border pt-5" aria-live="polite">
                                <MarkdownView md={card.answer} />
              </div> : <Button disabled={busy} onClick={() => setRevealed(true)}>Révéler la réponse</Button>}
            </article>}
            {verdict && <Button ref={continueButton} className="w-full" onClick={next}>Continuer</Button>}
            {card.kind === 'basic' && <div className={`grid grid-cols-2 gap-3 ${revealed ? '' : 'invisible'}`} aria-hidden={!revealed}>
              <button className="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border bg-surface px-2 py-3 [&>svg]:shrink-0 text-sm text-foreground disabled:cursor-wait disabled:opacity-50 sm:text-base" disabled={busy || !revealed} onClick={() => answer(false)}><CloseIcon />Je ne savais pas</button>
              <button className="flex items-center justify-center gap-2 rounded-xl bg-success px-2 py-3 [&>svg]:shrink-0 text-sm font-semibold text-on-success disabled:opacity-50 sm:text-base" disabled={busy || !revealed} onClick={() => answer(true)}><CheckIcon />Je savais</button>
            </div>}
          </section>
        ) : !busy && <>
          {session && (session.position > 0 ? <SessionRecap session={session} progress={progress} pending={sync.pending} moreCards={moreCards} busy={busy} online={sync.online} error={!!error} onExplain={id => explain(session.cards.find(c => c.id === id))} onContinue={() => void run(async () => display(await revisionAPI.continue()))} /> : <section className="space-y-4 rounded-2xl border border-border p-6" aria-live="polite">
            {!error && <Mascotte humeur="au repos" taille={112} />}
            <h2 className="text-xl">Aucune carte à réviser pour le moment</h2>
            <p>Les nouvelles cartes arrivent progressivement chaque jour. Tu peux aussi préparer un autre chapitre.</p>
            <button className={secondaryButton} disabled={busy || !sync.online || sync.pending > 0} onClick={() => void run(async () => display(await revisionAPI.continue()))}>Continuer</button>
          </section>)}
          {profile && !(session && session.position > 0) && <form onSubmit={generate} className="space-y-4 rounded-2xl border border-border p-6">
            <h2 className="text-xl text-foreground">Préparer un chapitre</h2>
            <label className="block space-y-2"><span>Matière</span><select className={input} required value={subject} onChange={e => setSubject(e.target.value)}>{profile.subjects.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="block space-y-2"><span>Chapitre étudié</span><input className={input} required maxLength={revisionPolicy.maxTitleChars} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. : Les fractions" /></label>
            {session && session.position > 0 ? <button className={secondaryButton} disabled={busy || !sync.online || sync.pending > 0}>Générer mes cartes</button> : <Button type="submit" disabled={busy || !sync.online || sync.pending > 0}>Générer mes cartes</Button>}
          </form>}
        </>}
        {profile && !(session && !session.complete && card) && !(session && session.position > 0) && <Link to="/import" className="block rounded-xl border border-border p-4 text-center text-foreground">Importer mon cours</Link>}
      </div>
    </main>
  )
}
