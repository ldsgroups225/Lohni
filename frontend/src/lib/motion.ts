import { useEffect, useState } from 'react'

// Guards SSR/tests where window or matchMedia is missing.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Closed form of a unit-mass spring step response; damping is a ratio (Compose convention).
export function springStep(t: number, stiffness: number, damping: number): number {
  if (t <= 0) return 0
  const w = Math.sqrt(stiffness)
  const a = damping * w
  if (Math.abs(damping - 1) < 1e-6) return 1 - Math.exp(-w * t) * (1 + w * t)
  if (damping < 1) {
    const wd = w * Math.sqrt(1 - damping * damping)
    return 1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t))
  }
  const s = w * Math.sqrt(damping * damping - 1)
  return 1 - Math.exp(-a * t) * (Math.cosh(s * t) + (a / s) * Math.sinh(s * t))
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

// CSS cannot run a spring, so sample it into linear() and let the compositor animate.
export function springLinear(stiffness: number, damping: number, samples = 40): { easing: string; durationMs: number } {
  const step = 1 / 240
  let settled = 0
  // Settle time = last instant the curve is still outside the tolerance band.
  for (let t = 0; t < 10; t += step) if (Math.abs(1 - springStep(t, stiffness, damping)) >= 0.002) settled = t + step
  const duration = Math.max(settled, step)
  const pts = Array.from({ length: samples }, (_, i) => {
    if (i === 0) return 0
    return round3(springStep((duration * i) / samples, stiffness, damping))
  })
  return { easing: `linear(${pts.join(', ')}, 1)`, durationMs: round3(duration * 1000) }
}

type SpringOpts = {
  from: number
  to: number
  velocity?: number
  stiffness?: number
  damping?: number
  onUpdate: (x: number) => void
  onDone?: () => void
}

const SUBSTEP = 1 / 240
const MAX_DT = 1 / 30

export function spring({ from, to, velocity = 0, stiffness = 260, damping = 0.85, onUpdate, onDone }: SpringOpts): () => void {
  let cancelled = false
  const finish = (): void => {
    onUpdate(to)
    onDone?.()
  }
  if (prefersReducedMotion()) {
    queueMicrotask(() => { if (!cancelled) finish() })
    return () => { cancelled = true }
  }
  const c = 2 * damping * Math.sqrt(stiffness)
  let x = from
  let v = velocity
  let last: number | null = null
  let raf = 0
  const frame = (ts: number): void => {
    if (cancelled) return
    // Clamp so a resumed background tab does not teleport the integrator.
    let dt = last === null ? SUBSTEP : Math.min((ts - last) / 1000, MAX_DT)
    last = ts
    while (dt > 1e-9) {
      const h = Math.min(dt, SUBSTEP)
      v += (-stiffness * (x - to) - c * v) * h
      x += v * h
      dt -= h
    }
    if (Math.abs(x - to) < 0.1 && Math.abs(v) < 5) return finish()
    onUpdate(x)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
  }
}

// Keeps the node mounted while its exit animation plays.
export function useExitTransition(open: boolean, durationMs: number): { mounted: boolean; state: 'enter' | 'exit' } {
  const [shown, setShown] = useState(open)
  const reduced = prefersReducedMotion()
  if (open && !shown) setShown(true) // dérivé pendant le rendu : pas d'image sans nœud entre deux états
  useEffect(() => {
    if (open) return
    if (reduced) { setShown(false); return }
    const id = setTimeout(() => setShown(false), durationMs)
    return () => clearTimeout(id)
  }, [open, durationMs, reduced])
  return { mounted: open || (shown && !reduced), state: open ? 'enter' : 'exit' }
}
