import { Button, ButtonLink } from '../components/ui/Button'
import { revisionCardVisibility } from '../components/ui/revisionPresentation'
import Mascotte from '../components/Mascotte/Mascotte'
import { CheckIcon, CloseIcon, FlameIcon } from '../components/ui/NavigationIcons'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Progress } from '../components/ui/Progress'
import MarkdownView from '../components/Chat/MarkdownView'
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
  const startedAt = useRef(Date.now())
  const card = session?.cards[session.position]
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
    revisionAPI.progress().then(value => { if (active) setProgress(value) }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Impossible de charger ta progression.')
    })
    return () => { active = false }
  }, [session?.id, session?.complete, sync.pending, sync.online])

  function generate(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      setSubject(subject.trim())
      await revisionAPI.generateChapter({ subject: subject.trim(), title: title.trim() })
      display(await revisionAPI.continue())
    })
  }
  function answer(knew: boolean) {
    if (!session || !card) return
    void run(async () => {
      const next = await revisionAPI.answer({
        sessionId: session.id, cardId: card.id, position: session.position, knew, choice,
        durationMs: Math.max(0, Date.now() - startedAt.current),
      })
      setFeedback({ id: Date.now(), knew: knew && (card.kind !== 'mcq' || choice === card.correct) })
      setMissed(!knew || (card.kind === 'mcq' && choice !== card.correct) ? card : null)
      display(next)
    })
  }
  function explain() {
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
    <main className="loop-screen min-h-screen px-4 pt-8 pb-36 md:pl-28">
      <div className="mx-auto max-w-xl space-y-6">
        {session && !session.complete && card ? <header><Link to="/" aria-label="Quitter la session" className="inline-block rounded-xl p-2 text-muted"><CloseIcon /></Link></header> : !(session && session.position > 0) && <header><h1 className="text-2xl font-semibold text-foreground">Session de révision</h1></header>}
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
        {busy && <p role="status">Chargement…</p>}
        {feedback && <span key={feedback.id} aria-hidden="true" className="motion-feedback" onAnimationEnd={() => setFeedback(null)}>{feedback.knew ? 'Bien joué !' : 'À revoir'}</span>}
        {missed && !session?.complete && <aside className="space-y-3 rounded-2xl border border-danger p-4" aria-live="polite">
          <p>À retravailler : <MarkdownView md={missed.question} inline /></p>
          <Button disabled={busy || !sync.online} onClick={explain}>Explique-moi</Button>
        </aside>}
        {session && !session.complete && card ? (
          <section className="space-y-6" aria-label="Session de révision" aria-busy={busy}>
            <div>
              <p className="mb-2">Carte {session.position + 1} sur {session.cards.length}</p>
              <div className="motion-progress" aria-hidden="true"><span style={{ transform: `scaleX(${session.cards.length ? session.position / session.cards.length : 0})` }} /></div>
              <Progress className="sr-only" value={session.position} max={session.cards.length} aria-label="Progression de la session" />
            </div>
            <article key={`${card.id}-${session.position}-${revealed}`} className={`space-y-5 rounded-2xl border border-border bg-surface p-6 ${revealed ? 'motion-flip' : 'motion-enter'}`}>
              {card.origin === 'ai' && <p className="text-xs text-muted">Générée par IA · Peut contenir des erreurs</p>}
              <h2 className="text-xl text-foreground"><MarkdownView md={card.question} inline /></h2>
              {card.kind === 'mcq' && <fieldset disabled={busy || revealed} className="space-y-3">
                <legend className="mb-3">Choisis ta réponse</legend>
                {card.options?.map((option, i) => <label key={i} className="flex items-start gap-3 rounded-xl border border-border p-3">
                  <input type="radio" name="answer" value={i + 1} checked={choice === i + 1} onChange={() => setChoice(i + 1)} className="mt-1" />
                  <span>{i + 1}. <MarkdownView md={option} inline /></span>
                </label>)}
              </fieldset>}
              {revealed ? <div className="space-y-3 border-t border-border pt-5" aria-live="polite">
                {card.kind === 'mcq' && <p className={choice === card.correct ? 'bg-success text-on-success rounded-xl p-3' : 'bg-danger text-on-danger rounded-xl p-3'}>
                  {choice === card.correct ? 'Bonne réponse !' : <>Bonne réponse : <MarkdownView md={card.options?.[(card.correct ?? 1) - 1] ?? ''} inline /></>}
                </p>}
                <MarkdownView md={card.answer} />
              </div> : <Button disabled={busy || (card.kind === 'mcq' && choice === undefined)} onClick={() => setRevealed(true)}>Révéler la réponse</Button>}
            </article>
            {revealed && <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border bg-surface px-2 py-3 text-sm text-foreground disabled:cursor-wait disabled:opacity-50 sm:text-base" disabled={busy} onClick={() => answer(false)}><CloseIcon />Je ne savais pas</button>
              <button className="flex items-center justify-center gap-2 rounded-xl bg-success px-2 py-3 text-sm font-semibold text-on-success disabled:opacity-50 sm:text-base" disabled={busy || (card.kind === 'mcq' && choice !== card.correct)} onClick={() => answer(true)}><CheckIcon />Je savais</button>
            </div>}
            <button disabled={busy || !sync.online || sync.pending > 0} className="text-sm text-muted underline" onClick={() => void run(async () => {
              await revisionAPI.deleteCard(card.id)
              display(await revisionAPI.session())
            })}>Supprimer cette carte</button>
          </section>
        ) : !busy && <>
          {session && (session.position > 0 ? <section className="flex flex-col items-center gap-4 text-center" aria-live="polite">
            {!error && <span className="motion-celebrate"><Mascotte humeur="en fête" taille={160} /></span>}
            <h2 className="text-2xl font-bold">Session terminée !</h2>
            <p>{session.position} réponses enregistrées{sync.pending ? ' sur cet appareil' : ''}. À demain pour la suite.</p>
            <div className="motion-enter flex gap-3">
              <div className="rounded-2xl border border-border bg-surface p-4"><strong className="block text-3xl"><AnimatedNumber value={session.earnedXP} prefix="+" /></strong><span>XP gagnés</span></div>
              {!sync.pending && progress && <div className="rounded-2xl bg-tint p-4"><span className="flex items-center justify-center gap-2"><FlameIcon /><strong className="text-3xl"><AnimatedNumber value={progress.streak} /></strong></span><span>jour{progress.streak > 1 ? 's' : ''} de série</span></div>}
            </div>
            {!sync.pending && progress && <p><AnimatedNumber value={progress.xp} /> XP au total</p>}
            <ButtonLink className="w-full" to="/">Revenir à l’accueil</ButtonLink>
            {moreCards && <button className="text-primary underline disabled:opacity-50" disabled={busy || !sync.online || sync.pending > 0} onClick={() => void run(async () => display(await revisionAPI.continue()))}>Continuer avec les cartes restantes</button>}
          </section> : <section className="space-y-4 rounded-2xl border border-border p-6" aria-live="polite">
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
