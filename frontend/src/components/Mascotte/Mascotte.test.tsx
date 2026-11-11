import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>)
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => { effects.push(effect) },
  useRef: (initial?: unknown) => ({ current: initial ?? { style: {}, getBoundingClientRect: () => ({ top: 0, bottom: 10 }) } }),
}))
import Mascotte from './Mascotte'

test('la mascotte reste fixe quand la réduction des animations est demandée', () => {
  const raf = vi.fn()
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('IntersectionObserver', class { callback: (entries: unknown[]) => void; constructor(callback: (entries: unknown[]) => void) { this.callback = callback } observe() { this.callback([{ isIntersecting: true }]) } disconnect() {} })
  renderToStaticMarkup(<Mascotte humeur="au repos" taille={120} />)
  const cleanups = effects.splice(0).map(effect => effect())
  expect(raf).not.toHaveBeenCalled()
  cleanups.forEach(cleanup => cleanup?.())
  vi.unstubAllGlobals()
})

test.each([['au repos', 'repos'], ['contente', 'contente'], ['en fête', 'fete'], ['pensive', 'pensive'], ['désolée', 'desolee'], ['endormie', 'endormie']] as const)(
  'l’humeur %s présente ses yeux et sa bouche et est annoncée', (humeur, fichier) => {
    const html = renderToStaticMarkup(<Mascotte humeur={humeur} taille={120} />)
    expect(html).toContain(`aria-label="Lohni, ${humeur}"`)
    expect(html.split(`<img src="/mascotte/yeux-${fichier}.webp"`)).toHaveLength(3) // deux calques pour le fondu
    expect(html.split(`<img src="/mascotte/bouche-${fichier}.webp"`)).toHaveLength(3)
  },
)

test('une mascotte décorative est masquée aux lecteurs d’écran', () => {
  const html = renderToStaticMarkup(<Mascotte humeur="contente" taille={120} decorative />)
  expect(html).toContain('aria-hidden="true"')
  expect(html).not.toContain('aria-label=')
})

test('la boucle anime quand elle est visible, puis s’arrête au démontage', () => {
  effects.length = 0
  const frames: Array<(time: number) => void> = []
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('IntersectionObserver', class { callback: (entries: unknown[]) => void; constructor(callback: (entries: unknown[]) => void) { this.callback = callback } observe() { this.callback([{ isIntersecting: true }]) } disconnect() {} })
  renderToStaticMarkup(<Mascotte humeur="pensive" taille={120} />)
  const cleanups = effects.splice(0).map(effect => effect())
  expect(frames).toHaveLength(1)
  for (let time = 0; time < 12000; time += 16) frames[frames.length - 1](time)
  cleanups.forEach(cleanup => cleanup?.())
  expect(cancel).toHaveBeenCalled()
  vi.unstubAllGlobals()
})
