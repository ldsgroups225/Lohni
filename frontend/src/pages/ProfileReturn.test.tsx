// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import Profile from './Profile'

const api = vi.hoisted(() => ({ profile: vi.fn(), progress: vi.fn(), saveProfile: vi.fn() }))
vi.mock('../lib/api', () => ({ revisionAPI: api }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
beforeEach(() => { vi.resetAllMocks() })
const profile = { schoolClass: '3e', subjects: ['Mathématiques'] }
const progress = { xp: 10, streak: 1, learnedCards: 2, subjects: [] }

async function setup(device: string) {
  localStorage.setItem('lohni-device-id', device)
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
  const router = createMemoryRouter([{ path: '/me', element: <Profile /> }, { path: '/tutor', element: <p>Tuteur</p> }], { initialEntries: ['/me'] })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<RouterProvider router={router} />))
  return { router, host, close() { act(() => root.unmount()); router.dispose(); host.remove(); localStorage.removeItem('lohni-device-id') } }
}

test('Moi garde le formulaire au retour puis met les données à jour en place', async () => {
  api.profile.mockResolvedValueOnce(profile)
  api.progress.mockResolvedValueOnce(progress)
  const { router, host, close } = await setup('profil-retour')
  try {
    expect(host.textContent).toContain('Mon parcours')
    await act(async () => { await router.navigate('/tutor') })
    let resolve!: (value: typeof profile) => void
    api.profile.mockReturnValueOnce(new Promise(r => { resolve = r }))
    api.progress.mockResolvedValueOnce({ ...progress, xp: 20 })
    await act(async () => { await router.navigate('/me') })
    const form = host.querySelector('form')
    expect(form).not.toBeNull()
    expect(host.textContent).not.toContain('On récupère ton parcours')
    await act(async () => resolve({ ...profile, schoolClass: '5e' }))
    expect(host.querySelector('form')).toBe(form)
    expect(host.querySelector('select')!.value).toBe('5e')
    expect(host.querySelector('dl')!.textContent).toContain('20')
  } finally { close() }
})

test('Moi ne restaure pas le cache d’un autre appareil', async () => {
  api.profile.mockReturnValueOnce(new Promise(() => {}))
  api.progress.mockReturnValueOnce(new Promise(() => {}))
  const { host, close } = await setup('profil-autre')
  try {
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('Mon parcours')
  } finally { close() }
})


test('une réponse tardive du précédent appareil ne remplit pas le cache du nouveau', async () => {
  let resolve!: (value: typeof profile) => void
  api.profile.mockReturnValueOnce(new Promise(r => { resolve = r })).mockReturnValueOnce(new Promise(() => {}))
  api.progress.mockResolvedValueOnce(progress).mockReturnValueOnce(new Promise(() => {}))
  const { host, close } = await setup('profil-ancien')
  try {
    localStorage.setItem('lohni-device-id', 'profil-nouveau')
    await act(async () => resolve(profile))
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('Mon parcours')
  } finally { close() }
})

test('un échec de revalidation garde les données connues et signale l’erreur', async () => {
  api.profile.mockResolvedValueOnce(profile).mockRejectedValueOnce(new Error('Réseau indisponible'))
  api.progress.mockResolvedValue(progress)
  const { router, host, close } = await setup('profil-hors-ligne')
  try {
    await act(async () => { await router.navigate('/tutor') })
    await act(async () => { await router.navigate('/me') })
    expect(host.querySelector('form')).not.toBeNull()
    expect(host.querySelector('select')!.value).toBe('3e')
    expect(host.textContent).toContain('Réseau indisponible')
    expect(host.textContent).not.toContain('On récupère ton parcours')
  } finally { close() }
})


test('enregistrer le profil met aussi à jour les données restaurées au retour', async () => {
  api.profile.mockResolvedValueOnce(profile).mockReturnValueOnce(new Promise(() => {}))
  api.progress.mockResolvedValue(progress)
  api.saveProfile.mockResolvedValue({ ...profile, schoolClass: '5e' })
  const { router, host, close } = await setup('profil-enregistre')
  try {
    await act(async () => host.querySelector('form')!.requestSubmit())
    await act(async () => { await router.navigate('/tutor') })
    await act(async () => { await router.navigate('/me') })
    expect(host.querySelector('select')!.value).toBe('5e')
    expect(host.textContent).not.toContain('On récupère ton parcours')
  } finally { close() }
})

test('un enregistrement tardif ne conserve pas le profil pour un autre appareil', async () => {
  api.profile.mockResolvedValueOnce(profile)
  api.progress.mockResolvedValueOnce(progress)
  let resolve!: (value: typeof profile) => void
  api.saveProfile.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const { host, close } = await setup('profil-enregistrement-ancien')
  try {
    await act(async () => host.querySelector('form')!.requestSubmit())
    localStorage.setItem('lohni-device-id', 'profil-enregistrement-nouveau')
    await act(async () => resolve(profile))
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('L’appareil a changé')
  } finally { close() }
})

test('une modification du profil reste intacte pendant la revalidation', async () => {
  api.profile.mockResolvedValueOnce(profile)
  api.progress.mockResolvedValue(progress)
  const { router, host, close } = await setup('profil-modification-revalidation')
  try {
    await act(async () => { await router.navigate('/tutor') })
    let resolve!: (value: typeof profile) => void
    api.profile.mockReturnValueOnce(new Promise(r => { resolve = r }))
    await act(async () => { await router.navigate('/me') })
    const select = host.querySelector('select')!
    expect(select.disabled).toBe(false)
    await act(async () => { select.value = '5e'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => resolve(profile))
    expect(select.value).toBe('5e')
  } finally { close() }
})

test('un enregistrement pendant la revalidation ne peut pas être remplacé par la réponse ancienne', async () => {
  api.profile.mockResolvedValueOnce(profile)
  api.progress.mockResolvedValue(progress)
  const { router, host, close } = await setup('profil-enregistrement-revalidation')
  try {
    await act(async () => { await router.navigate('/tutor') })
    let resolve!: (value: typeof profile) => void
    api.profile.mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValue({ ...profile, schoolClass: '5e' })
    api.saveProfile.mockResolvedValue({ ...profile, schoolClass: '5e' })
    await act(async () => { await router.navigate('/me') })
    const select = host.querySelector('select')!
    await act(async () => { select.value = '5e'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => host.querySelector('form')!.requestSubmit())
    await act(async () => resolve(profile))
    expect(host.querySelector('select')!.value).toBe('5e')
  } finally { close() }
})

test('le retour pendant un enregistrement attend sa fin avant de réactiver le formulaire', async () => {
  api.profile.mockResolvedValue(profile)
  api.progress.mockResolvedValue(progress)
  let resolve!: (value: typeof profile) => void
  api.saveProfile.mockReturnValue(new Promise(r => { resolve = r }))
  const { router, host, close } = await setup('profil-retour-enregistrement')
  try {
    await act(async () => host.querySelector('form')!.requestSubmit())
    await act(async () => { await router.navigate('/tutor') })
    await act(async () => { await router.navigate('/me') })
    expect(host.querySelector('select')!.disabled).toBe(true)
    await act(async () => resolve(profile))
    expect(host.querySelector('select')!.disabled).toBe(false)
  } finally { close() }
})

test('un changement d’appareil pendant une revalidation échouée masque aussitôt le profil précédent', async () => {
  api.profile.mockResolvedValueOnce(profile)
  api.progress.mockResolvedValue(progress)
  const { router, host, close } = await setup('profil-avant-changement')
  try {
    await act(async () => { await router.navigate('/tutor') })
    let reject!: (error: Error) => void
    api.profile.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail })).mockReturnValue(new Promise(() => {}))
    await act(async () => { await router.navigate('/me') })
    localStorage.setItem('lohni-device-id', 'profil-apres-changement')
    await act(async () => reject(new Error('Les données ont changé. Actualise la page.')))
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).not.toContain('Les données ont changé')
  } finally { close() }
})
