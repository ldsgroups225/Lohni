import { required } from '../test/required'
import { afterEach, expect, test, vi } from 'vitest'
import { prefersReducedMotion, spring, springLinear, springStep } from './motion'

afterEach(() => vi.unstubAllGlobals())

function fakeRaf() {
  let q: Array<(t: number) => void> = []
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => q.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => { q = [] })
  return (maxFrames = 600) => {
    for (let i = 0; i < maxFrames && q.length; i++) { const cb = required(q.shift()); cb(i * 16) }
  }
}
const reduce = (matches: boolean) => vi.stubGlobal('window', { matchMedia: () => ({ matches }) })

test('prefersReducedMotion sûr sans window', () => {
  expect(prefersReducedMotion()).toBe(false)
  reduce(true)
  expect(prefersReducedMotion()).toBe(true)
})

test('springStep démarre à 0 et converge vers 1', () => {
  for (const z of [0.45, 0.85, 1, 2]) {
    expect(springStep(0, 260, z)).toBe(0)
    expect(springStep(5, 260, z)).toBeCloseTo(1, 3)
  }
})

test('sous-amorti dépasse 1, amorti critique jamais', () => {
  const ts = Array.from({ length: 400 }, (_, i) => i / 200)
  expect(Math.max(...ts.map(t => springStep(t, 260, 0.45)))).toBeGreaterThan(1.1)
  expect(Math.max(...ts.map(t => springStep(t, 260, 1)))).toBeLessThanOrEqual(1)
  expect(Math.max(...ts.map(t => springStep(t, 260, 2)))).toBeLessThanOrEqual(1)
})

test('springLinear : chaîne linear() et durée plausible', () => {
  const { easing, durationMs } = springLinear(260, 0.85)
  expect(easing.startsWith('linear(0')).toBe(true)
  expect(easing.endsWith('1)')).toBe(true)
  expect(durationMs).toBeGreaterThan(100)
  expect(durationMs).toBeLessThan(2000)
})

test('spring converge vers to avec vitesse initiale, onDone une fois', () => {
  const run = fakeRaf()
  const xs: number[] = []
  const done = vi.fn()
  spring({ from: 0, to: 100, velocity: 800, onUpdate: x => xs.push(x), onDone: done })
  run()
  expect(xs.at(-1)).toBe(100)
  expect(xs[0]).toBeGreaterThan(0)
  expect(done).toHaveBeenCalledTimes(1)
})

test('cancel empêche onDone', () => {
  const run = fakeRaf()
  const done = vi.fn()
  const cancel = spring({ from: 0, to: 100, onUpdate: () => {}, onDone: done })
  cancel()
  run()
  expect(done).not.toHaveBeenCalled()
})

test('reduced motion : saute à to sans frame', async () => {
  reduce(true)
  const raf = vi.fn()
  vi.stubGlobal('requestAnimationFrame', raf)
  const upd = vi.fn(); const done = vi.fn()
  spring({ from: 0, to: 50, onUpdate: upd, onDone: done })
  await Promise.resolve()
  expect(upd).toHaveBeenCalledWith(50)
  expect(done).toHaveBeenCalledTimes(1)
  expect(raf).not.toHaveBeenCalled()
})
