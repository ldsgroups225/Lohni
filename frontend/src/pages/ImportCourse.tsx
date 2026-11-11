import { Button } from '../components/ui/Button'
import { BackButton } from '../components/ui/BackButton'
import { LoadingState } from '../components/ui/LoadingState'
import Mascotte from '../components/Mascotte/Mascotte'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MarkdownView from '../components/Chat/MarkdownView'
import { revisionAPI, revisionPolicy, type RevisionProfile, type RevisionImportedChapter, type RevisionImportQuota } from '../lib/api'

export default function ImportCourse() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<RevisionProfile | null>(null)
  const [quota, setQuota] = useState<RevisionImportQuota>()
  const [imported, setImported] = useState<RevisionImportedChapter>()
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File>()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const field = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await operation() }
    catch (error) { setError(error instanceof Error ? error.message : 'Impossible d’importer le cours. Réessaie.') }
    finally { setBusy(false) }
  }
  async function load() {
    const [saved, currentQuota] = await Promise.all([revisionAPI.profile(), revisionAPI.importQuota()])
    setProfile(saved)
    setSubject(saved?.subjects[0] ?? '')
    setQuota(currentQuota)
  }
  useEffect(() => { void run(load) }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (mode !== 'text' && (!file || file.size > revisionPolicy.maxUploadMB * 1024 * 1024)) throw new Error(`Choisis un fichier de ${revisionPolicy.maxUploadMB} Mo maximum.`)
      const chapter = await revisionAPI.importChapter({ title, subject, ...(mode !== 'text' ? { file } : { text }) })
      setImported(chapter)
      setQuota(await revisionAPI.importQuota())
    })
  }

  return <main className="loop-screen min-h-screen px-4 pt-8 pb-36 md:pl-28">
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <BackButton fallback="/courses" /><h1 className="flex-1 text-2xl font-semibold text-foreground">Importer mon cours</h1>
        <Link to="/revision" className="underline">Révision</Link>
      </header>
      {error && <div role="alert" className="rounded-xl border border-danger p-4 text-foreground"><Mascotte humeur="désolée" taille={96} />{error}
        <button className="ml-3 underline" disabled={busy} onClick={() => void run(load)}>Actualiser</button>
      </div>}
      {busy && !error && <Mascotte humeur="pensive" taille={112} />}
      {busy && <LoadingState label={profile ? 'Préparation du chapitre… Cela peut prendre un moment.' : 'On prépare ton import…'} />}
      {quota && <p className="text-sm text-muted" aria-live="polite">
        {quota.remaining === 0 ? `Tu as atteint tes ${revisionPolicy.dailyImports} imports du jour.` : `${quota.remaining} import${quota.remaining > 1 ? 's' : ''} restant${quota.remaining > 1 ? 's' : ''} aujourd’hui.`}
        {' '}Recharge le {new Date(quota.resetsAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} (heure de ton appareil).
      </p>}
      {!busy && !profile && quota && <p>Crée d’abord ton profil pour ranger ton cours dans une matière. <Link to="/" className="underline">Commencer</Link></p>}
      {imported ? <section className="space-y-4 rounded-2xl border border-border p-6" aria-live="polite">
        <h2 className="text-xl text-foreground">{imported.title} : chapitre prêt !</h2>
        <p>Le résumé, les cartes et les QCM sont enregistrés. Les cartes rejoignent tes prochaines sessions.</p>
        <p className="text-xs text-muted">Préparé par IA à partir de ton cours · Peut contenir des erreurs</p>
        <MarkdownView md={imported.summary} />
        <Button disabled={busy} onClick={() => void run(async () => { await revisionAPI.continue(); navigate('/revision') })}>Commencer à réviser</Button>
        <button className="block underline" disabled={busy} onClick={() => setImported(undefined)}>Importer un autre cours</button>
        <button className="block text-sm text-muted underline" disabled={busy} onClick={() => void run(async () => { await revisionAPI.deleteChapter(imported.id); setImported(undefined) })}>Supprimer ce chapitre</button>
      </section> : profile && <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy || quota?.remaining === 0} className="space-y-4 rounded-2xl border border-border p-6 disabled:opacity-60">
          <legend className="px-2 text-base text-foreground">Cours à réviser</legend>
          <label className="block space-y-2"><span>Matière</span><select className={field} required value={subject} onChange={event => setSubject(event.target.value)}>{profile.subjects.map(name => <option key={name}>{name}</option>)}</select></label>
          <label className="block space-y-2"><span>Titre du chapitre</span><input className={field} required maxLength={revisionPolicy.maxTitleChars} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex. : Les fractions" /></label>
          <label className="block space-y-2"><span>Source du cours</span><select className={field} value={mode} onChange={event => { setMode(event.target.value); setFile(undefined) }}><option value="text">Coller du texte</option><option value="file">Choisir un fichier</option><option value="photo">Photo de mon cahier</option></select></label>
          {mode === 'text'
            ? <label className="block space-y-2"><span>Texte du cours</span><textarea className={field} rows={10} required maxLength={revisionPolicy.maxTextChars} value={text} onChange={event => setText(event.target.value)} /></label>
            : <label className="block space-y-2"><span>{mode === 'photo' ? `Photo nette et bien éclairée (JPEG, PNG, WebP) · ${revisionPolicy.maxUploadMB} Mo maximum` : `Fichier texte, PDF, Word (.docx) ou Markdown · ${revisionPolicy.maxUploadMB} Mo maximum`}</span><input key={mode} className={field} type="file" required accept={mode === 'photo' ? 'image/jpeg,image/png,image/webp' : '.txt,.pdf,.docx,.md,.markdown'} onChange={event => setFile(event.target.files?.[0])} /></label>}
          <p className="text-sm text-muted">Le résumé, les cartes et les QCM sont créés automatiquement.</p>
          <Button type="submit">Importer et créer mon chapitre</Button>
        </fieldset>
      </form>}
    </div>
  </main>
}
