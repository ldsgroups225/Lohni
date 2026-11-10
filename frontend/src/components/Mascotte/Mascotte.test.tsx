import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>)
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => { effects.push(effect) },
  useRef: () => ({ current: { style: {} } }),
}))
import Mascotte from './Mascotte'

test('la mascotte reste fixe quand la réduction des animations est demandée', () => {
  const raf = vi.fn()
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('IntersectionObserver', class { constructor(private callback: (entries: unknown[]) => void) {} observe() { this.callback([{ isIntersecting: true }]) } disconnect() {} })
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
    expect(html).toContain(`/mascotte/yeux-${fichier}.webp`)
    expect(html).toContain(`/mascotte/bouche-${fichier}.webp`)
  },
)

test('une mascotte décorative est masquée aux lecteurs d’écran', () => {
  const html = renderToStaticMarkup(<Mascotte humeur="contente" taille={120} decorative />)
  expect(html).toContain('aria-hidden="true"')
  expect(html).not.toContain('aria-label=')
})
