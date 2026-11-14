// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import Timetable from './Timetable'
import { revisionAPI as revisionDouble } from '../../lib/api'
import { revisionCacheDouble } from '../../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

const api = vi.hoisted(() => ({ timetable: vi.fn(), readTimetablePhotos: vi.fn(), saveTimetable: vi.fn(), saveProfile: vi.fn() }))
vi.mock('../../lib/api', () => ({ revisionAPI: api }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

test('la matière corrigée avec des espaces demande un choix et peut être rattachée', async () => {
  api.timetable.mockResolvedValue([])
  api.readTimetablePhotos.mockResolvedValue({ blocks: [{ day: 1, start: '08:00', end: '09:00', subject: 'Physique' }] })
  api.saveTimetable.mockImplementation(async value => value)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<Timetable profile={{ schoolClass: '3e', subjects: ['Mathématiques'] }} onProfile={() => {}} />))
    const file = host.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(file, 'files', { value: [new File(['x'], 'photo.png', { type: 'image/png' })] })
    await act(async () => file.dispatchEvent(new Event('change', { bubbles: true })))
    const subject = host.querySelector('input[maxlength]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(subject, ' Physique ')
      subject.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.textContent).toContain('Que faire de « Physique » ?')
    const select = Array.from(host.querySelectorAll('select')).find(element => element.textContent?.includes('Rattacher à Mathématiques'))!
    await act(async () => { select.value = 'link:Mathématiques'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    const save = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Enregistrer l’emploi'))!
    await act(async () => save.click())
    expect(api.saveTimetable).toHaveBeenCalledWith([{ day: 1, start: '08:00', end: '09:00', subject: 'Mathématiques' }])
  } finally { act(() => root.unmount()); host.remove() }
})

test('une réponse tardive ne montre pas les cours du précédent appareil', async () => {
  localStorage.setItem('lohni-device-id', 'emploi-ancien')
  let resolve!: (value: { day: number; start: string; end: string; subject: string }[]) => void
  api.timetable.mockReturnValueOnce(new Promise(r => { resolve = r }))
  api.timetable.mockResolvedValueOnce([{ day: 2, start: '10:00', end: '11:00', subject: 'Nouveau cours' }])
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<Timetable profile={{ schoolClass: '3e', subjects: ['Mathématiques'] }} onProfile={() => {}} />))
    localStorage.setItem('lohni-device-id', 'emploi-nouveau')
    await act(async () => resolve([{ day: 1, start: '08:00', end: '09:00', subject: 'Ancien cours' }]))
    expect((host.querySelector('input[maxlength]') as HTMLInputElement).value).toBe('Nouveau cours')
    expect(host.textContent).not.toContain('Ancien cours')
    expect(Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Ajouter un cours'))?.disabled).toBe(false)
  } finally { act(() => root.unmount()); host.remove(); localStorage.removeItem('lohni-device-id') }
})
