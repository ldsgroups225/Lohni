import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import MarkdownView from '../Chat/MarkdownView'
import { spring } from '../../lib/motion'

// Valeurs reprises de la carte à glisser de KnowUnityFork.
const THRESHOLD = 80
const VELOCITY = 500 // px/s
const VELOCITY_DISTANCE = 40
const TAP_SLOP = 8

type Props = {
  question: string
  answer: string
  revealed: boolean
  enabled: boolean
  onToggle: () => void
  onSwipe: (knew: boolean) => void
}

/** Carte plein écran : toucher retourne, glisser à droite = « Je savais », à gauche = « Je ne savais pas ».
 *  Le glissement n'est actif qu'une fois la réponse vue. Flèches du clavier et boutons restent disponibles.
 *  Pendant le geste, la carte suit le doigt sans rendu React ; au lâcher, un ressort repart de la vitesse réelle. */
export function SwipeCard({ question, answer, revealed, enabled, onToggle, onSwipe }: Props) {
  const card = useRef<HTMLDivElement>(null)
  const x = useRef(0)
  const stop = useRef<(() => void) | null>(null)
  const drag = useRef<{ origin: number; start: number; points: [number, number][]; moved: boolean } | null>(null)
  const sent = useRef(false)
  const [hint, setHint] = useState(false)

  function apply(value: number) {
    x.current = value
    const el = card.current
    if (!el) return
    const strength = Math.min(1, Math.max(0, (Math.abs(value) - THRESHOLD * 0.65) / (THRESHOLD * 0.35)))
    el.style.transform = `translate3d(${value}px,0,0) rotate(${(value / 200) * 15}deg)`
    el.style.opacity = String(1 - 0.5 * Math.min(1, Math.max(0, (Math.abs(value) - 100) / 100)))
    el.style.setProperty('--swipe-border', `color-mix(in srgb, ${value > 0 ? 'var(--color-success)' : 'var(--color-danger)'} ${strength * 100}%, var(--color-border))`)
  }
  function animate(to: number, velocity: number, onUpdate?: (value: number) => void, onDone?: () => void) {
    stop.current?.()
    stop.current = spring({ from: x.current, to, velocity, onUpdate: value => { apply(value); onUpdate?.(value) }, onDone })
  }
  function rate(knew: boolean, velocity = 0) {
    if (!enabled || !revealed || sent.current) return
    sent.current = true
    // La réponse part dès que la carte quitte l'écran ; le ressort n'a pas à finir.
    let called = false
    const send = () => { if (!called) { called = true; onSwipe(knew) } }
    animate((knew ? 1 : -1) * window.innerWidth * 1.2, velocity, value => { if (Math.abs(value) >= window.innerWidth) send() }, send)
  }

  useEffect(() => () => stop.current?.(), [])
  useEffect(() => {
    if (!enabled) return
    sent.current = false
    stop.current?.()
    apply(0)
  }, [enabled])

  function down(e: PointerEvent) {
    if (!enabled || sent.current) return
    stop.current?.()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { origin: e.clientX, start: e.clientX - x.current, points: [[e.timeStamp, e.clientX]], moved: false }
  }
  function move(e: PointerEvent) {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.abs(e.clientX - d.origin) > TAP_SLOP) d.moved = true
    d.points.push([e.timeStamp, e.clientX])
    while (d.points.length > 2 && e.timeStamp - d.points[0][0] > 100) d.points.shift() // fenêtre glissante de 100 ms
    if (d.moved && revealed) apply(e.clientX - d.start)
  }
  function up(e: PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) return onToggle()
    if (!revealed) { setHint(true); return }
    // Vitesse réelle du doigt (px/s) ; un doigt immobile avant le lâcher ne garde pas une vitesse ancienne.
    const [t0, x0] = d.points[0]
    const [t1, x1] = d.points[d.points.length - 1]
    const v = e.timeStamp - t1 > 80 || t1 === t0 ? 0 : ((x1 - x0) / (t1 - t0)) * 1000
    const dx = x.current
    if (dx >= THRESHOLD || (dx > VELOCITY_DISTANCE && v > VELOCITY)) return rate(true, v)
    if (dx <= -THRESHOLD || (dx < -VELOCITY_DISTANCE && v < -VELOCITY)) return rate(false, v)
    animate(0, v)
  }
  function cancel() {
    drag.current = null
    animate(0, 0)
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') rate(true)
    else if (e.key === 'ArrowLeft') rate(false)
    else if (e.key === ' ' || e.key === 'Enter') onToggle()
    else return
    e.preventDefault()
  }

  const face = 'absolute inset-0 flex touch-pan-y overflow-y-auto rounded-3xl border border-[color:var(--swipe-border)] bg-surface px-6 pb-10 pt-6 [backface-visibility:hidden]'
  return (
    <div className="flex min-h-[55dvh] flex-1 flex-col">
      <div
        ref={card} role="group" aria-roledescription="carte" aria-label={revealed ? 'Réponse' : 'Question'} aria-describedby="swipe-hint" tabIndex={0}
        onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        className="motion-card relative flex-1 touch-pan-y select-none will-change-transform [perspective:1000px]"
      >
        <div className="absolute inset-0 transition-transform duration-[360ms] ease-[var(--ease-lohni)] [transform-style:preserve-3d]" style={{ transform: `rotateY(${revealed ? 180 : 0}deg)` }}>
          <div className={face} aria-hidden={revealed}>
            <div className="m-auto w-full text-center">
              <p className="mb-3 text-xs uppercase tracking-wide text-muted">Question</p>
              <div className="text-2xl font-semibold leading-snug text-foreground"><MarkdownView md={question} inline /></div>
            </div>
          </div>
          <div className={face} style={{ transform: 'rotateY(180deg)' }} aria-hidden={!revealed}>
            <div className="m-auto w-full text-center">
              <p className="mb-3 text-xs uppercase tracking-wide text-muted">Réponse</p>
              <div className="text-xl leading-relaxed text-foreground"><MarkdownView md={answer} /></div>
            </div>
          </div>
        </div>
        <p id="swipe-hint" className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted">
          {!revealed ? 'Touche la carte pour voir la réponse' : hint ? 'Glisse la carte à gauche ou à droite' : '← Je ne savais pas · Je savais →'}
        </p>
      </div>
    </div>
  )
}
