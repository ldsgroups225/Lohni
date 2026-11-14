import { cachedDevice, revisionSnapshot, revisionSnapshotStale } from '../lib/cachedDevice'
import { Button } from '../components/ui/Button'
import { BackButton } from '../components/ui/BackButton'
import { ErrorState, LoadingState } from '../components/ui/LoadingState'
import { PendingRead } from '../components/ui/PendingRead'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APIError, revisionAPI, revisionPolicy, type RevisionProfile, type RevisionImportedChapter, type RevisionImportQuota, type RevisionChapter } from '../lib/api'

export default function ImportCourse() {
  const sharedProfile = revisionSnapshot<RevisionProfile | null>('/profile')
  const navigate = useNavigate()
  const [profile, setProfile] = useState<RevisionProfile | null>(() => sharedProfile ?? null)
  const [quota, setQuota] = useState<RevisionImportQuota | undefined>(() => revisionSnapshotStale('/import/quota') ? undefined : revisionSnapshot<RevisionImportQuota>('/import/quota'))
  const [imported, setImported] = useState<RevisionImportedChapter>()
  const [subject, setSubject] = useState(() => sharedProfile?.subjects[0] ?? '')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'text' | 'file' | 'photo'>('text')
  const [step, setStep] = useState<'pick' | 'confirm' | 'work' | 'done'>('pick')
  const [cards, setCards] = useState<RevisionChapter['cards']>()
  const [suggested, setSuggested] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const importController = useRef<AbortController>(null)
  const [cancelled, setCancelled] = useState(false)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File>()
  const [busy, setBusy] = useState(sharedProfile === undefined)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState<string>()
  const [failedChapter, setFailedChapter] = useState<string>()
  const field = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError(''); setErrorCode(undefined)
    try { await operation() }
    catch (error) {
      if (importController.current?.signal.aborted) { setCancelled(true); setQuota(undefined); void revisionAPI.importQuota().then(setQuota).catch(() => {}) }
      else if (error instanceof APIError && error.chapterId) { setFailedChapter(error.chapterId); setError('') }
      else { setError(error instanceof Error ? error.message : 'Impossible d’importer le cours. Réessaie.'); setErrorCode(error instanceof APIError ? error.code : undefined) }
    }
    finally { importController.current = null; setBusy(false) }
  }
  const load = useCallback(async function load(isActive: () => boolean = () => true) {
    const device = cachedDevice()
    let saved: RevisionProfile | null, currentQuota: RevisionImportQuota
    try { [saved, currentQuota] = await Promise.all([revisionAPI.profile(), revisionAPI.importQuota()]) }
    catch (cause) {
      if (isActive() && device !== cachedDevice()) {
        setProfile(null); setQuota(undefined); setSubject(''); setBusy(true)
        return load(isActive)
      }
      throw cause
    }
    if (!isActive()) return
    if (device !== cachedDevice()) { setProfile(null); setQuota(undefined); setSubject(''); setBusy(true); return load(isActive) }
    setProfile(saved)
    setSubject(current => saved?.subjects.includes(current) ? current : saved?.subjects[0] ?? '')
    setQuota(currentQuota)
  }, [])
  useEffect(() => () => { importController.current?.abort() }, [])
  useEffect(() => {
    let active = true
    load(() => active).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger ton import.') })
      .finally(() => { if (active) { setBusy(false); setChecking(false) } })
    return () => { active = false }
  }, [load])

  function submit(event: FormEvent) {
    event.preventDefault()
    setCancelled(false)
    importController.current = new AbortController()
    setStep('work')
    void run(async () => {
      if (mode !== 'text' && (!file || file.size > revisionPolicy.maxUploadMB * 1024 * 1024)) throw new Error(`Choisis un fichier de ${revisionPolicy.maxUploadMB} Mo maximum.`)
      const chapter = await revisionAPI.importChapter({ title, subject, ...(mode !== 'text' ? { file } : { text }) }, importController.current?.signal)
      setImported(chapter)
      setStep('done')
      setFailedChapter(undefined)
      try { setCards((await revisionAPI.chapters()).find(item => item.id === chapter.id)?.cards) } catch { setCards(undefined) }
      try { setQuota(await revisionAPI.importQuota()) } catch { setQuota(undefined) }
    })
  }

  const readyReason = checking ? 'Vérification du quota en cours.' : !quota ? 'Impossible de vérifier le quota. Actualise la page.' : quota.remaining === 0 ? `Tu as atteint tes ${revisionPolicy.dailyImports} imports du jour.` : !title.trim() ? 'Donne un nom au chapitre.' : !subject ? 'Choisis une matière.' : mode === 'text' && !text.trim() ? 'Colle ton texte pour continuer.' : mode !== 'text' && !file ? 'Choisis un fichier pour continuer.' : file && mode !== 'text' && file.size > revisionPolicy.maxUploadMB * 1024 * 1024 ? `Choisis un fichier de ${revisionPolicy.maxUploadMB} Mo maximum.` : ''
  function chooseFile(source: 'photo' | 'file') {
    setMode(source)
    // The input is configured before the browser opens its picker.
    if (fileInput.current) {
      fileInput.current.accept = source === 'photo' ? 'image/jpeg,image/png,image/webp' : '.txt,.pdf,.docx,.md,.markdown,.jpg,.jpeg,.png,.webp'
      if (source === 'photo') fileInput.current.setAttribute('capture', 'environment')
      else fileInput.current.removeAttribute('capture')
      fileInput.current.click()
    }
  }
  function reset() { setImported(undefined); setCards(undefined); setTitle(''); setText(''); setFile(undefined); setSuggested(''); setStep('pick') }
  const back = () => { if (step === 'confirm') setStep('pick'); else if (step === 'done') reset(); else navigate('/courses') }
  const pickClass = 'flex min-h-24 w-full items-center gap-4 rounded-3xl border border-border bg-surface p-4 text-left'

  return <main className="loop-screen min-h-dvh px-4 pt-5 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center gap-3">
        {step === 'pick' ? <BackButton fallback="/courses" /> : step !== 'work' && <button type="button" aria-label="Retour" className="grid size-11 place-items-center text-2xl" onClick={back}>‹</button>}
        <h1 className="text-2xl font-bold text-foreground">{step === 'pick' ? 'Ajouter un cours' : step === 'confirm' ? 'Vérifie et crée' : step === 'work' ? 'Un instant' : 'Terminé'}</h1>
      </header>
      {busy && !profile && !error && <PendingRead title="Cours à réviser" label="On prépare ton import…" />}
      {failedChapter && !busy && !cancelled && <ErrorState title="Je n’ai pas pu créer tes cartes" detail="La création des cartes n’a pas abouti. Ton cours est bien enregistré, rien n’est perdu." actions={[
        { label: 'Réessayer', variant: 'primary', onClick: () => { setCancelled(false); importController.current = new AbortController(); setStep('work'); void run(async () => { const chapter = await revisionAPI.retryImport(failedChapter, importController.current?.signal); setImported(chapter); setFailedChapter(undefined); setStep('done'); try { setCards((await revisionAPI.chapters()).find(item => item.id === chapter.id)?.cards) } catch { setCards(undefined) }; try { setQuota(await revisionAPI.importQuota()) } catch { setQuota(undefined) } }) } },
        { label: 'Essayer avec un autre fichier', variant: 'outline', onClick: () => { const id = failedChapter; void run(async () => { try { await revisionAPI.discardImport(id) } catch { /* le cours vide reste visible dans Mes cours */ } setFailedChapter(undefined); setStep('pick') }) } },
        { label: 'Garder le cours sans cartes', variant: 'link', onClick: () => navigate('/courses') },
      ]}><div className="w-full rounded-2xl border border-border bg-surface p-4 text-left"><p className="font-semibold">{title} · {subject}</p><p className="text-sm text-muted">{file?.name ?? 'Texte du cours'} · enregistré</p></div></ErrorState>}
      {cancelled && !busy && <ErrorState title="Annulation demandée" detail="Si le cours était déjà enregistré, il reste dans tes cours. Vérifie avant de réessayer pour éviter un doublon." actions={[{ label: 'Voir mes cours', variant: 'primary', onClick: () => navigate('/courses') }, { label: 'Retour', variant: 'link', onClick: () => { setCancelled(false); if (!failedChapter) setStep('confirm') } }]} />}
      {error && !busy && <ErrorState title={errorCode === 'IMPORT_QUOTA' ? 'Limite d’imports atteinte' : errorCode === 'IMPORT_FILE' ? 'Ce cours ne peut pas être lu' : 'Impossible de préparer ton cours'} detail={error} actions={[{ label: 'Réessayer', variant: 'primary', onClick: () => { setError(''); if (!profile || !quota) void run(() => load()); else setStep('confirm') } }, { label: 'Retour', variant: 'link', onClick: () => { setError(''); setStep('pick') } }]} />}
      {!busy && !profile && quota && <p>Crée d’abord ton profil pour ranger ton cours dans une matière. <Link to="/" className="underline">Commencer</Link></p>}
      {profile && (!failedChapter || busy) && !error && !cancelled && <>
        {step === 'pick' && <section className="space-y-3">
          <p className="text-muted">Choisis comment ajouter ton cours. Lohni en fait des cartes à réviser.</p>
          <button type="button" className={pickClass} onClick={() => chooseFile('photo')}><span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-2xl">📷</span><span><strong className="block text-lg">Prendre en photo</strong><span className="text-sm text-muted">Ton cahier ou ton livre</span></span></button>
          <button type="button" className={pickClass} onClick={() => chooseFile('file')}><span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-2xl">▤</span><span><strong className="block text-lg">Choisir un fichier</strong><span className="text-sm text-muted">PDF, Word ou image</span></span></button>
          <button type="button" className={pickClass} onClick={() => { setMode('text'); setStep('confirm') }}><span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-2xl">☰</span><span><strong className="block text-lg">Coller du texte</strong><span className="text-sm text-muted">Depuis un site ou un message</span></span></button>
          <input ref={fileInput} type="file" className="hidden" tabIndex={-1} onChange={event => { const selected = event.target.files?.[0]; if (!selected) return; setFile(selected); setTitle(selected.name.replace(/\.[^.]+$/, '')); const match = profile.subjects.find(name => selected.name.toLocaleLowerCase('fr').includes(name.toLocaleLowerCase('fr'))); setSuggested(match ?? ''); if (match) setSubject(match); setStep('confirm'); event.target.value = '' }} />
          <p className="text-sm text-muted">Fichiers : {revisionPolicy.maxUploadMB} Mo maximum · Texte : {revisionPolicy.maxTextChars.toLocaleString('fr-FR')} caractères maximum.</p>
        </section>}
        {step === 'confirm' && <form onSubmit={submit} className="space-y-5">
          {mode === 'text' ? <label className="block space-y-2"><span className="font-semibold">Ton texte</span><textarea className={field} rows={6} maxLength={revisionPolicy.maxTextChars} value={text} onChange={event => setText(event.target.value)} /></label> : <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4"><span className="min-w-0 flex-1 truncate font-semibold">{file?.name}</span><button type="button" className="min-h-11 text-primary underline" onClick={() => setStep('pick')}>Changer</button></div>}
          <label className="block space-y-2"><span className="font-semibold">Nom du chapitre</span><input className={field} maxLength={revisionPolicy.maxTitleChars} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex. : Les fractions" /></label>
          <fieldset><legend className="font-semibold">Matière</legend><div className="mt-2 flex flex-wrap gap-2">{profile.subjects.map(name => <button type="button" key={name} aria-pressed={subject === name} onClick={() => setSubject(name)} className={`min-h-11 rounded-xl border px-4 ${subject === name ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface'}`}>{name}{suggested === name && <span className="ml-1 text-xs">suggérée</span>}</button>)}</div></fieldset>
          <Button className="w-full" type="submit" disabled={!!readyReason || busy}>Créer mes cartes</Button>
          <p className="text-center text-sm text-muted" aria-live="polite">{readyReason || 'Environ 10 secondes'}</p>
        </form>}
        {step === 'work' && <LoadingState label="Préparation de ton cours…" expectedDuration={10} steps={[{ after: 0, message: 'Lecture du cours…' }, { after: 3, message: 'Repérage des notions clés…' }, { after: 6, message: 'Création des cartes…' }]} onCancel={() => importController.current?.abort()} />}
        {step === 'done' && imported && <section className="space-y-5 text-center" aria-live="polite"><div className="text-4xl text-success" aria-hidden="true">✓</div><h2 className="text-2xl font-bold">{cards ? `${cards.length} cartes prêtes` : 'Tes cartes sont prêtes'}</h2><p className="text-muted">{imported.title} · {subject}</p>{cards?.[0] && <div className="rounded-2xl border border-border bg-surface p-4 text-left"><p className="text-xs font-bold uppercase text-muted">Exemple</p><p className="mt-2 font-semibold">{cards[0].question}</p><p className="mt-2 text-sm text-muted">{cards[0].answer}</p></div>}<p className="text-sm text-muted">Générées par IA : relis-les, elles peuvent contenir des erreurs.</p><Button className="w-full" disabled={busy} onClick={() => void run(async () => { await revisionAPI.continue(); navigate('/revision') })}>Commencer la révision</Button><button type="button" className="min-h-14 w-full rounded-xl border-2 border-primary font-semibold text-primary" disabled={busy} onClick={reset}>Ajouter un autre cours</button></section>}
      </>}
    </div>
  </main>
}
