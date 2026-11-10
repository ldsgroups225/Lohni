import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const element = vi.hoisted(() => ({ textContent: '42' }))
const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>)
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useEffect: (fn: () => void | (() => void)) => { effects.push(fn) }, useRef: () => ({ current: element }) }))
import { AnimatedNumber } from './AnimatedNumber'

test('en mouvement réduit, le nombre final est visible et annoncé sans animation', () => {
 const raf = vi.fn()
 vi.stubGlobal('requestAnimationFrame', raf)
 vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
 const html = renderToStaticMarkup(<AnimatedNumber value={42} />)
 expect(html).toContain('42')
 const cleanups = effects.splice(0).map(effect => effect())
 expect(raf).not.toHaveBeenCalled()
 expect(element.textContent).toBe('42')
 cleanups.forEach(cleanup => cleanup?.())
 vi.unstubAllGlobals()
})
