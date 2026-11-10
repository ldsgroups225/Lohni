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
  const startedAt = useRef(Date.now())
  const card = session?.cards[session.position]
  const button = 'rounded-xl bg-stone-800 px-4 py-3 text-white hover:bg-stone-700 disabled:opacity-50 disabled:cursor-wait'
  const input = 'w-full rounded-xl border border-stone-700 bg-stone-950 p-3 text-white'

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
    if (!session?.complete || sync.pending) return
    let active = true
    revisionAPI.progress().then(value => { if (active) setProgress(value) }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Impossible de charger ta progression.')
    })
    return () => { active = false }
  }, [session?.id, session?.complete, sync.pending])

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
    <main className="min-h-screen px-4 pt-8 pb-36 md:pl-28">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-white">Session de révision</h1>
          <div className="flex gap-4"><Link to="/courses" className="underline">Cours</Link><Link to="/" className="underline">Accueil</Link></div>
        </header>
        {(!sync.online || sync.pending > 0) && <aside role="status" className="space-y-2 rounded-xl border border-sky-900 p-4 text-sky-200">
          {!sync.online && <p>Hors ligne. Tu peux terminer ta session déjà chargée.</p>}
          {sync.pending > 0 && <p>{sync.pending} réponse{sync.pending > 1 ? 's' : ''} enregistrée{sync.pending > 1 ? 's' : ''} sur cet appareil, en attente d’envoi. Tes XP et ta série seront confirmés au retour du réseau.</p>}
          {sync.error && <p>{sync.error}</p>}
          {sync.online && sync.pending > 0 && <button className="underline" onClick={() => void syncRevisionAnswers()}>Réessayer l’envoi</button>}
        </aside>}
        {error && <div role="alert" className="rounded-xl border border-red-800 p-4 text-red-200">{error}
          <button className="ml-3 underline" disabled={busy} onClick={() => void run(async () => {
            const saved = await revisionAPI.profile()
            setProfile(saved)
            setSubject(saved?.subjects[0] ?? '')
            if (saved) display(await revisionAPI.session())
            setProgress(await revisionAPI.progress())
          })}>Réessayer</button>
        </div>}
        {busy && <p role="status">Chargement…</p>}
        {missed && <aside className="space-y-3 rounded-2xl border border-orange-900 p-4" aria-live="polite">
          <p>À retravailler : <MarkdownView md={missed.question} inline /></p>
          <button className={button} disabled={busy || !sync.online} onClick={explain}>Explique-moi</button>
        </aside>}
        {session && !session.complete && card ? (
          <section className="space-y-6" aria-busy={busy}>
            <div>
              <p className="mb-2">Carte {session.position + 1} sur {session.cards.length}</p>
              <progress className="w-full" value={session.position} max={session.cards.length} aria-label="Progression de la session" />
            </div>
            <article className="space-y-5 rounded-2xl border border-stone-800 bg-stone-950 p-6">
              {card.origin === 'ai' && <p className="text-xs text-stone-400">Générée par IA · Peut contenir des erreurs</p>}
              <h2 className="text-xl text-white"><MarkdownView md={card.question} inline /></h2>
              {card.kind === 'mcq' && <fieldset disabled={busy || revealed} className="space-y-3">
                <legend className="mb-3">Choisis ta réponse</legend>
                {card.options?.map((option, i) => <label key={i} className="flex items-start gap-3 rounded-xl border border-stone-700 p-3">
                  <input type="radio" name="answer" value={i + 1} checked={choice === i + 1} onChange={() => setChoice(i + 1)} className="mt-1" />
                  <span>{i + 1}. <MarkdownView md={option} inline /></span>
                </label>)}
              </fieldset>}
              {revealed ? <div className="space-y-3 border-t border-stone-700 pt-5" aria-live="polite">
                {card.kind === 'mcq' && <p className={choice === card.correct ? 'text-green-300' : 'text-orange-300'}>
                  {choice === card.correct ? 'Bonne réponse !' : <>Bonne réponse : <MarkdownView md={card.options?.[(card.correct ?? 1) - 1] ?? ''} inline /></>}
                </p>}
                <MarkdownView md={card.answer} />
              </div> : <button className={button} disabled={busy || (card.kind === 'mcq' && choice === undefined)} onClick={() => setRevealed(true)}>Révéler la réponse</button>}
            </article>
            {revealed && <div className="grid grid-cols-2 gap-3">
              <button className={`${button} border border-orange-800`} disabled={busy} onClick={() => answer(false)}>Je ne savais pas</button>
              <button className={`${button} border border-green-800`} disabled={busy || (card.kind === 'mcq' && choice !== card.correct)} onClick={() => answer(true)}>Je savais</button>
            </div>}
            <button disabled={busy || !sync.online || sync.pending > 0} className="text-sm text-stone-400 underline" onClick={() => void run(async () => {
              await revisionAPI.deleteCard(card.id)
              display(await revisionAPI.session())
            })}>Supprimer cette carte</button>
          </section>
        ) : !busy && <>
          {session && <section className="space-y-4 rounded-2xl border border-stone-800 p-6" aria-live="polite">
            <h2 className="text-xl text-white">{session.position > 0 ? 'Session terminée !' : 'Aucune carte à réviser pour le moment'}</h2>
            <p>{session.position > 0 ? `${session.position} réponses enregistrées${sync.pending ? " sur cet appareil" : ""}. Tu peux revenir demain ou continuer les cartes restantes.` : 'Les nouvelles cartes arrivent progressivement chaque jour. Tu peux aussi préparer un autre chapitre.'}</p>
            {session.position > 0 && <p className="text-lg text-green-300">{session.earnedXP} XP gagnés pendant cette session</p>}
            {!sync.pending && progress && <p>{progress.xp} XP au total · Série : {progress.streak} jour{progress.streak > 1 ? 's' : ''}</p>}
            <p className="text-sm text-stone-400">{revisionPolicy.knownXP} XP par carte sue, {revisionPolicy.missedXP} XP par oubli et {revisionPolicy.sessionXP} XP à la fin d’une session.</p>
            {session.position > 0 && <p>Pour réviser ton vrai cours, <Link to="/import" className="text-sky-300 underline">importe ton cours</Link> : il deviendra un chapitre avec tes propres cartes.</p>}
            <button className={button} disabled={busy || !sync.online || sync.pending > 0} onClick={() => void run(async () => display(await revisionAPI.continue()))}>Continuer</button>
          </section>}
          {profile && <form onSubmit={generate} className="space-y-4 rounded-2xl border border-stone-800 p-6">
            <h2 className="text-xl text-white">Préparer un chapitre</h2>
            <label className="block space-y-2"><span>Matière</span><select className={input} required value={subject} onChange={e => setSubject(e.target.value)}>{profile.subjects.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="block space-y-2"><span>Chapitre étudié</span><input className={input} required maxLength={revisionPolicy.maxTitleChars} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. : Les fractions" /></label>
            <button className={button} disabled={busy || !sync.online || sync.pending > 0}>Générer mes cartes</button>
          </form>}
        </>}
        {profile && <Link to="/import" className="block rounded-xl border border-stone-700 p-4 text-center text-white">Importer mon cours</Link>}
      </div>
    </main>
  )
}
