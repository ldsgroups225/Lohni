import { required } from '../test/required'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import Profile from './Profile'
import { rememberRevisionSnapshot } from '../test/revisionApiDouble'
import { revisionAPI as revisionDouble } from '../lib/api'
import { revisionCacheDouble } from '../test/revisionApiDouble'
Object.assign(revisionDouble, revisionCacheDouble)

const api = vi.hoisted(() => ({ timetable: vi.fn(async () => []), readTimetablePhotos: vi.fn(), saveTimetable: vi.fn(), exams: vi.fn(async () => []), chapters: vi.fn(async () => []), profile: vi.fn(), progress: vi.fn(), saveProfile: vi.fn(), settings: vi.fn(), saveSettings: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api, DEVICE_CHANGED: 'L’appareil a changé. Recharge la page avant de continuer.' }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
beforeEach(() => { vi.resetAllMocks() })
// Le vrai cache de lecture d’api.ts garde la dernière valeur lue ; le double d’api la reproduit.
const known = <T,>(path: string, value: T) => async () => { rememberRevisionSnapshot(path, value); return value }
const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
const progress = { xp: 10, streak: 1, learnedCards: 2, subjects: [] }

test('Moi enregistre les minutes et les jours de repos', async () => {
  api.profile.mockImplementation(known('/profile', profile))
  api.progress.mockImplementation(known('/progress', progress))
  api.settings.mockResolvedValue({ dailyMinutes: 15, restDays: [] })
  api.saveSettings.mockImplementation(async value => value)
  const { host, close } = await setup('profil-reglages', '/me/rythme')
  try {
    const section = required([...host.querySelectorAll('section')].find(item => item.textContent?.includes('Réglages de révision')))
    const radio = [...section.querySelectorAll<HTMLInputElement>('input[type=radio]')][1]
    const monday = required(section.querySelector<HTMLInputElement>('input[type=checkbox]'))
    await act(async () => { radio.click(); monday.click() })
    await act(async () => required(section.querySelector('form')).requestSubmit())
    expect(api.saveSettings).toHaveBeenCalledWith({ dailyMinutes: 30, restDays: [1] })
    expect(section.textContent).toContain('Tes réglages sont enregistrés.')
  } finally { close() }
})

async function setup(device: string, path = '/me/profil') {
  localStorage.setItem('lohni-device-id', device)
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
  const router = createMemoryRouter([{ path: '/me/*', element: <Profile /> }, { path: '/tutor', element: <p>Tuteur</p> }], { initialEntries: [path] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<RouterProvider router={router} />))
  return { router, host, close() { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') } }
}

test('Moi garde le formulaire au retour puis met les données à jour en place', async () => {
  api.profile.mockImplementationOnce(known('/profile', profile))
  api.progress.mockImplementationOnce(known('/progress', progress))
  const { router, host, close } = await setup('profil-retour')
  try {
    expect(host.textContent).toContain('Mon parcours')
    await act(async () => { await router.navigate('/tutor') })
    let resolve!: (value: typeof profile) => void
    api.profile.mockReturnValueOnce(new Promise(r => { resolve = r }))
    api.progress.mockImplementationOnce(known('/progress', { ...progress, xp: 20 }))
    await act(async () => { await router.navigate('/me/profil') })
    const form = host.querySelector('form')
    expect(form).not.toBeNull()
    expect(host.textContent).not.toContain('On récupère ton parcours')
    await act(async () => resolve({ ...profile, schoolClass: '5e' }))
    expect(host.querySelector('form')).toBe(form)
    expect(required(host.querySelector('select')).value).toBe('5e')
    await act(async () => { await router.navigate('/me') })
    expect(required(host.querySelector('dl')).textContent).toContain('20')
  } finally { close() }
})

test('une réponse tardive du précédent appareil ne remplit pas le cache du nouveau', async () => {
  let resolve!: (value: typeof profile) => void
  api.profile.mockReturnValueOnce(new Promise(r => { resolve = r })).mockReturnValueOnce(new Promise(() => {}))
  api.progress.mockImplementationOnce(known('/progress', progress)).mockReturnValueOnce(new Promise(() => {}))
  const { host, close } = await setup('profil-ancien')
  try {
    localStorage.setItem('lohni-device-id', 'profil-nouveau')
    await act(async () => resolve(profile))
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('Mon parcours')
  } finally { close() }
})

test('un échec de revalidation garde les données connues et signale l’erreur', async () => {
  api.profile.mockImplementationOnce(known('/profile', profile)).mockRejectedValueOnce(new Error('Réseau indisponible'))
  api.progress.mockImplementation(known('/progress', progress))
  const { router, host, close } = await setup('profil-hors-ligne')
  try {
    await act(async () => { await router.navigate('/tutor') })
    await act(async () => { await router.navigate('/me/profil') })
    expect(host.querySelector('form')).not.toBeNull()
    expect(required(host.querySelector('select')).value).toBe('3e')
    expect(host.textContent).toContain('Réseau indisponible')
    expect(host.textContent).not.toContain('On récupère ton parcours')
  } finally { close() }
})


test('enregistrer le profil met aussi à jour les données restaurées au retour', async () => {
  api.profile.mockImplementationOnce(known('/profile', profile)).mockReturnValueOnce(new Promise(() => {}))
  api.progress.mockImplementation(known('/progress', progress))
  api.saveProfile.mockImplementation(known('/profile', { ...profile, schoolClass: '5e' }))
  const { router, host, close } = await setup('profil-enregistre')
  try {
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => { await router.navigate('/tutor') })
    await act(async () => { await router.navigate('/me/profil') })
    expect(required(host.querySelector('select')).value).toBe('5e')
    expect(host.textContent).not.toContain('On récupère ton parcours')
  } finally { close() }
})

test('un enregistrement tardif ne conserve pas le profil pour un autre appareil', async () => {
  api.profile.mockImplementationOnce(known('/profile', profile))
  api.progress.mockImplementationOnce(known('/progress', progress))
  let resolve!: (value: typeof profile) => void
  api.saveProfile.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const { host, close } = await setup('profil-enregistrement-ancien')
  try {
    await act(async () => required(host.querySelector('form')).requestSubmit())
    localStorage.setItem('lohni-device-id', 'profil-enregistrement-nouveau')
    await act(async () => resolve(profile))
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('L’appareil a changé')
  } finally { close() }
})

test('une modification du profil reste intacte pendant la revalidation', async () => {
  api.profile.mockImplementationOnce(known('/profile', profile))
  api.progress.mockImplementation(known('/progress', progress))
  const { router, host, close } = await setup('profil-modification-revalidation')
  try {
    await act(async () => { await router.navigate('/tutor') })
    let resolve!: (value: typeof profile) => void
    api.profile.mockReturnValueOnce(new Promise(r => { resolve = r }))
    await act(async () => { await router.navigate('/me/profil') })
    const select = required(host.querySelector('select'))
    expect(select.disabled).toBe(false)
    await act(async () => { select.value = '5e'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => resolve(profile))
    expect(select.value).toBe('5e')
  } finally { close() }
})

test('un enregistrement pendant la revalidation ne peut pas être remplacé par la réponse ancienne', async () => {
  api.profile.mockImplementationOnce(known('/profile', profile))
  api.progress.mockImplementation(known('/progress', progress))
  const { router, host, close } = await setup('profil-enregistrement-revalidation')
  try {
    await act(async () => { await router.navigate('/tutor') })
    let resolve!: (value: typeof profile) => void
    api.profile.mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValue({ ...profile, schoolClass: '5e' })
    api.saveProfile.mockResolvedValue({ ...profile, schoolClass: '5e' })
    await act(async () => { await router.navigate('/me/profil') })
    const select = required(host.querySelector('select'))
    await act(async () => { select.value = '5e'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => resolve(profile))
    expect(required(host.querySelector('select')).value).toBe('5e')
  } finally { close() }
})

test('le retour pendant un enregistrement attend sa fin avant de réactiver le formulaire', async () => {
  api.profile.mockImplementation(known('/profile', profile))
  api.progress.mockImplementation(known('/progress', progress))
  let resolve!: (value: typeof profile) => void
  api.saveProfile.mockReturnValue(new Promise(r => { resolve = r }))
  const { router, host, close } = await setup('profil-retour-enregistrement')
  try {
    await act(async () => required(host.querySelector('form')).requestSubmit())
    await act(async () => { await router.navigate('/tutor') })
    await act(async () => { await router.navigate('/me/profil') })
    expect(required(host.querySelector('select')).disabled).toBe(true)
    await act(async () => resolve(profile))
    expect(required(host.querySelector('select')).disabled).toBe(false)
  } finally { close() }
})

test('un changement d’appareil pendant une revalidation échouée masque aussitôt le profil précédent', async () => {
  api.profile.mockImplementationOnce(known('/profile', profile))
  api.progress.mockImplementation(known('/progress', progress))
  const { router, host, close } = await setup('profil-avant-changement')
  try {
    await act(async () => { await router.navigate('/tutor') })
    let reject!: (error: Error) => void
    api.profile.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail })).mockReturnValue(new Promise(() => {}))
    await act(async () => { await router.navigate('/me/profil') })
    localStorage.setItem('lohni-device-id', 'profil-apres-changement')
    await act(async () => reject(new Error('Les données ont changé. Actualise la page.')))
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).not.toContain('Les données ont changé')
  } finally { close() }
})

test('la relecture des photos demande un choix avant enregistrement', async () => {
  api.profile.mockImplementation(known('/profile', profile))
  api.progress.mockImplementation(known('/progress', progress))
  api.settings.mockResolvedValue({ dailyMinutes: 15, restDays: [] })
  api.readTimetablePhotos.mockResolvedValue({ blocks: [{ day: 1, start: '08:00', end: '09:00', subject: 'Sport' }], unknownSubjects: ['Sport'] })
  api.saveTimetable.mockImplementation(async value => value)
  const { host, close } = await setup('profil-emploi', '/me/emploi-du-temps')
  try {
    const file = required(host.querySelector<HTMLInputElement>('input[type=file]'))
    Object.defineProperty(file, 'files', { configurable: true, value: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] })
    await act(async () => { file.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(host.textContent).toContain('Relis et corrige')
    const save = required([...host.querySelectorAll('button')].find(item => item.textContent?.includes('Enregistrer l’emploi du temps')))
    expect(save.disabled).toBe(true)
    const choice = required([...host.querySelectorAll('select')].find(item => item.textContent?.includes('Garder comme simple cours')))
    await act(async () => { choice.value = 'simple'; choice.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { save.click() })
    expect(api.saveTimetable).toHaveBeenCalledWith([{ day: 1, start: '08:00', end: '09:00', subject: 'Sport' }])
    expect(api.saveProfile).not.toHaveBeenCalled()
  } finally { close() }
})

test('Moi résume le parcours et ouvre les écrans dédiés', async () => {
  api.profile.mockImplementation(known('/profile', profile))
  api.progress.mockImplementation(known('/progress', progress))
  api.settings.mockResolvedValue({ dailyMinutes: 15, restDays: [] })
  const { router, host, close } = await setup('profil-navigation', '/me')
  try {
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('PageLM')
    expect(host.querySelector('a[href="/me/profil"]')).not.toBeNull()
    expect(host.querySelector('a[href="/me/examens"]')).not.toBeNull()
    await act(async () => { await router.navigate('/me/profil') })
    expect(host.querySelector('select')).not.toBeNull()
    expect(host.querySelector('a[href="/me"]')).not.toBeNull()
  } finally { close() }
})

 test('changer de classe conserve toutes les matières existantes', async () => {
  api.profile.mockImplementation(known('/profile', { schoolClass: '3e', subjects: ['Mathématiques', 'Matière personnelle'] }))
  api.progress.mockImplementation(known('/progress', progress))
  api.saveProfile.mockImplementation(async value => value)
  const { host, close } = await setup('profil-matieres-conservees')
  try {
    const select = required(host.querySelector('select'))
    await act(async () => { select.value = '5e'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(api.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ schoolClass: '5e', subjects: ['Mathématiques', 'Matière personnelle'] }))
  } finally { close() }
})

 test('les ressources de Moi reprennent sur le nouvel appareil après une réponse ancienne', async () => {
  api.profile.mockImplementation(known('/profile', profile)); api.progress.mockImplementation(known('/progress', progress))
  let exams!: (value: never[]) => void, chapters!: (value: never[]) => void, settings!: (value: { dailyMinutes: number; restDays: number[] }) => void, timetable!: (value: never[]) => void
  api.exams.mockReturnValueOnce(new Promise(r => { exams = r })).mockResolvedValue([])
  api.chapters.mockReturnValueOnce(new Promise(r => { chapters = r })).mockResolvedValue([{ id: 'new', subject: 'Mathématiques', title: 'Nouveau chapitre' }] as never[])
  api.settings.mockReturnValueOnce(new Promise(r => { settings = r })).mockResolvedValue({ dailyMinutes: 30, restDays: [] })
  api.timetable.mockReturnValueOnce(new Promise(r => { timetable = r })).mockResolvedValue([{ day: 1, start: '08:00', end: '09:00', subject: 'Mathématiques' }] as never[])
  const { host, close } = await setup('ressources-ancien', '/me/examens')
  try {
    localStorage.setItem('lohni-device-id', 'ressources-nouveau')
    await act(async () => { exams([{ id: 'old', title: 'Ancien examen' }] as never[]); chapters([{ id: 'old', title: 'Ancien chapitre' }] as never[]); settings({ dailyMinutes: 15, restDays: [] }); timetable([]) })
    expect(host.textContent).not.toContain('Ancien examen')
    const add = required([...host.querySelectorAll('button')].find(item => item.textContent === 'Ajouter un examen'))
    expect(add.disabled).toBe(false)
    await act(async () => add.click())
    await act(async () => required(host.querySelector<HTMLInputElement>('input[type=checkbox]')).click())
    expect(host.textContent).toContain('Nouveau chapitre')
    expect(host.textContent).not.toContain('Ancien chapitre')
    expect(api.settings).toHaveBeenCalledTimes(2)
    expect(api.timetable).toHaveBeenCalledTimes(2)
  } finally { close() }
})

 test('le rythme et le résumé affichent les nouvelles données après changement d’appareil', async () => {
  api.profile.mockImplementation(known('/profile', profile)); api.progress.mockImplementation(known('/progress', progress))
  let resolveSettings!: (value: { dailyMinutes: number; restDays: number[] }) => void
  api.settings.mockReturnValueOnce(new Promise(r => { resolveSettings = r })).mockResolvedValue({ dailyMinutes: 30, restDays: [] })
  const rhythm = await setup('rythme-ancien', '/me/rythme')
  try {
    localStorage.setItem('lohni-device-id', 'rythme-nouveau')
    await act(async () => resolveSettings({ dailyMinutes: 15, restDays: [] }))
    const checked = required(rhythm.host.querySelector<HTMLInputElement>('input[type=radio]:checked'))
    expect(checked.parentElement?.textContent).toContain('30 min')
    expect(required([...rhythm.host.querySelectorAll('button')].find(button => button.textContent === 'Enregistrer les réglages')).disabled).toBe(false)
  } finally { rhythm.close() }
  let resolveTimetable!: (value: never[]) => void
  api.timetable.mockReturnValueOnce(new Promise(r => { resolveTimetable = r })).mockResolvedValue([{ day: 1, start: '08:00', end: '09:00', subject: 'Mathématiques' }] as never[])
  const summary = await setup('resume-ancien', '/me')
  try {
    localStorage.setItem('lohni-device-id', 'resume-nouveau')
    await act(async () => resolveTimetable([]))
    expect(summary.host.textContent).toContain('1 cours')
  } finally { summary.close() }
})

 test('le résumé du rythme signale un échec de lecture', async () => {
  api.profile.mockImplementation(known('/profile', profile)); api.progress.mockImplementation(known('/progress', progress))
  api.settings.mockRejectedValue(new Error('Réglages indisponibles'))
  api.exams.mockResolvedValue([]); api.timetable.mockResolvedValue([]); api.chapters.mockResolvedValue([])
  const { host, close } = await setup('profil-rythme-erreur', '/me')
  try { expect(required(host.querySelector('a[href="/me/rythme"]')).textContent).toContain('Chargement impossible') } finally { close() }
})

test('modifier le prénom le conserve sur cet appareil sans le transmettre au profil', async () => {
  api.profile.mockImplementation(known('/profile', profile)); api.progress.mockImplementation(known('/progress', progress))
  api.saveProfile.mockResolvedValue(profile)
  const { host, close } = await setup('profil-prenom', '/me/profil')
  try {
    const input = required(host.querySelector<HTMLInputElement>('input[autocomplete="given-name"]'))
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).set).call(input, 'Awa'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(localStorage.getItem('lohni-first-name:profil-prenom')).toBe('Awa')
    expect(api.saveProfile).toHaveBeenCalledWith({ ...profile, examDate: undefined })
  } finally { close(); localStorage.removeItem('lohni-first-name:profil-prenom') }
})

test('un changement d’appareil ne copie pas le prénom en cours de modification', async () => {
  api.profile.mockImplementation(known('/profile', profile)); api.progress.mockImplementation(known('/progress', progress)); api.saveProfile.mockResolvedValue(profile)
  localStorage.removeItem('lohni-first-name:autre-prenom')
  localStorage.setItem('lohni-first-name:ancien-prenom', 'Awa')
  const { host, close } = await setup('ancien-prenom', '/me/profil')
  try {
    expect(required(host.querySelector<HTMLInputElement>('input[autocomplete="given-name"]')).value).toBe('Awa')
    localStorage.setItem('lohni-device-id', 'autre-prenom')
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(localStorage.getItem('lohni-first-name:autre-prenom')).toBeNull()
    expect(api.saveProfile).not.toHaveBeenCalled()
  } finally { close(); localStorage.removeItem('lohni-first-name:ancien-prenom'); localStorage.removeItem('lohni-first-name:autre-prenom') }
})

test('un échec de stockage du prénom signale que le profil est néanmoins enregistré', async () => {
  api.profile.mockImplementation(known('/profile', profile)); api.progress.mockImplementation(known('/progress', progress)); api.saveProfile.mockResolvedValue(profile)
  const { host, close } = await setup('profil-stockage', '/me/profil')
  const original = Storage.prototype.setItem
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (this === localStorage && key.startsWith('lohni-first-name:')) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    return original.call(this, key, value)
  })
  try {
    const input = required(host.querySelector<HTMLInputElement>('input[autocomplete="given-name"]'))
    await act(async () => { required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).set).call(input, 'Awa'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => required(host.querySelector('form')).requestSubmit())
    expect(host.textContent).toContain('Ton profil est enregistré.')
    expect(host.textContent).toContain('Impossible d’enregistrer ton prénom sur cet appareil.')
  } finally { storage.mockRestore(); close() }
})
