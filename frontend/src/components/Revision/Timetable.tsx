import { useEffect, useState } from 'react'
import { REVISION_POLICY as policy } from '../../../../backend/src/services/revision/policy'
import { revisionAPI, type RevisionProfile, type TimetableBlock } from '../../lib/api'
import { Button } from '../ui/Button'

const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const input = 'w-full rounded-xl border border-border bg-surface p-3 text-foreground'

export default function Timetable({ profile, onProfile }: { profile: RevisionProfile; onProfile: (profile: RevisionProfile) => void }) {
  const [blocks, setBlocks] = useState<TimetableBlock[] | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => { let active = true; revisionAPI.timetable().then(value => { if (active) setBlocks(value) }).catch(() => { if (active) setError('Impossible de charger ton emploi du temps.') }); return () => { active = false } }, [])
  const unknown = [...new Set((blocks ?? []).map(block => block.subject.trim()).filter(subject => subject && !profile.subjects.includes(subject)))]
  const update = (index: number, patch: Partial<TimetableBlock>) => { setBlocks(current => current?.map((block, i) => i === index ? { ...block, ...patch } : block) ?? null); setSaved(false) }
  async function save() {
    if (!blocks) return
    setBusy(true); setError(''); setSaved(false)
    try {
      const subjects = [...profile.subjects, ...unknown.filter(subject => choices[subject] === 'add' && !profile.subjects.includes(subject))]
      if (subjects.length !== profile.subjects.length) onProfile(await revisionAPI.saveProfile({ ...profile, subjects, examDate: undefined }))
      const mapped = blocks.map(block => { const subject = block.subject.trim(); return { ...block, subject: choices[subject]?.startsWith('link:') ? choices[subject].slice(5) : subject } })
      setBlocks(await revisionAPI.saveTimetable(mapped)); setReview(false); setChoices({}); setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer ton emploi du temps.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-2xl border border-border p-6">
    <h2 className="text-xl text-foreground">Emploi du temps</h2>
    {error && <p role="alert">{error}</p>}
    {review && <p>Relis et corrige les cours avant de les enregistrer.</p>}
    {/* biome-ignore lint/suspicious/noArrayIndexKey: les champs sont contrôlés et ne portent pas d’état propre. */}
    {blocks?.map((block, index) => <fieldset key={index} className="space-y-2 rounded-xl border border-border p-3" disabled={busy}>
      <legend>Cours {index + 1}</legend>
      <label className="block">Jour<select className={input} value={block.day} onChange={event => update(index, { day: Number(event.target.value) })}>{days.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
      <label className="block">Début<input className={input} type="time" value={block.start} onChange={event => update(index, { start: event.target.value })} /></label>
      <label className="block">Fin<input className={input} type="time" value={block.end} onChange={event => update(index, { end: event.target.value })} /></label>
      <label className="block">Matière<input className={input} maxLength={policy.maxTitleChars} value={block.subject} onChange={event => update(index, { subject: event.target.value })} /></label>
      <Button type="button" onClick={() => setBlocks(blocks.filter((_, i) => i !== index))}>Supprimer ce cours</Button>
    </fieldset>)}
    {review && unknown.map(subject => <label key={subject} className="block space-y-2">Que faire de « {subject} » ?
      <select className={input} value={choices[subject] ?? ''} onChange={event => setChoices({ ...choices, [subject]: event.target.value })}>
        <option value="">Choisis une action</option><option value="simple">Garder comme simple cours</option><option value="add">Ajouter à mes matières</option>{profile.subjects.map(item => <option key={item} value={`link:${item}`}>Rattacher à {item}</option>)}
      </select></label>)}
    {blocks && <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy || blocks.length >= policy.maxTimetableBlocks} onClick={() => { setBlocks([...blocks, { day: 1, start: '08:00', end: '09:00', subject: '' }]); setSaved(false) }}>Ajouter un cours</Button>
      <Button type="button" disabled={busy || (review && unknown.some(subject => !choices[subject]))} onClick={() => void save()}>Enregistrer l’emploi du temps</Button></div>}
    <label className="block space-y-2">Importer des photos ({policy.maxTimetablePhotos} maximum)<input className={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={async event => {
      const files = Array.from(event.target.files ?? []); event.target.value = ''
      if (!files.length) return
      if (files.length > policy.maxTimetablePhotos) { setError(`Choisis au plus ${policy.maxTimetablePhotos} photos.`); return }
      setBusy(true); setError(''); setSaved(false)
      try { const draft = await revisionAPI.readTimetablePhotos(files); setBlocks(draft.blocks); setChoices({}); setReview(true) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de lire tes photos.') }
      finally { setBusy(false) }
    }} /></label>
    {saved && <p role="status">Ton emploi du temps est enregistré.</p>}
  </section>
}
