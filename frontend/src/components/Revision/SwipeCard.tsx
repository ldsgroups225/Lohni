import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import MarkdownView from '../Chat/MarkdownView'

// Valeurs reprises de la carte à glisser de KnowUnityFork.
const THRESHOLD = 80
const VELOCITY = 0.5 // px/ms
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
 *  Le glissement n'est actif qu'une fois la réponse vue. Flèches du clavier et boutons restent disponibles. */
export function SwipeCard({ question, answer, revealed, enabled, onToggle, onSwipe }: Props) {
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const [hint, setHint] = useState(false)
  const drag = useRef<{ x: number; y: number; t: number; v: number; moved: boolean } | null>(null)
  const sent = useRef(false)

  useEffect(() => {
    if (!enabled) return
    sent.current = false
    setDx(0)
  }, [enabled])

  function rate(knew: boolean) {
    if (!enabled || !revealed || sent.current) return
    sent.current = true
    setSettling(true)
    setDx((knew ? 1 : -1) * window.innerWidth * 1.2)
    window.setTimeout(() => onSwipe(knew), 150)
  }
  function down(e: PointerEvent) {
    if (!enabled || sent.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, v: 0, moved: false }
    setSettling(false)
  }
  function move(e: PointerEvent) {
    const d = drag.current
    if (!d) return
    const delta = e.clientX - d.x
    if (Math.abs(delta) > TAP_SLOP) d.moved = true
    const dt = e.timeStamp - d.t
    if (dt > 0) d.v = (delta - dx) / dt
    d.t = e.timeStamp
    if (d.moved && revealed) setDx(delta)
  }
  function up() {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) return onToggle()
    if (!revealed) { setHint(true); return }
    if (dx >= THRESHOLD || (dx > VELOCITY_DISTANCE && d.v > VELOCITY)) return rate(true)
    if (dx <= -THRESHOLD || (dx < -VELOCITY_DISTANCE && d.v < -VELOCITY)) return rate(false)
    setSettling(true)
    setDx(0)
  }
  function cancel() {
    drag.current = null
    setSettling(true)
    setDx(0)
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') rate(true)
    else if (e.key === 'ArrowLeft') rate(false)
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle() }
    else return
    e.preventDefault()
  }

  const strength = Math.min(1, Math.max(0, (Math.abs(dx) - THRESHOLD * 0.65) / (THRESHOLD * 0.35)))
  const tone = dx > 0 ? 'var(--color-success)' : 'var(--color-danger)'
  const style = {
    transform: `translateX(${dx}px) rotate(${(dx / 200) * 15}deg)`,
    opacity: 1 - 0.5 * Math.min(1, Math.max(0, (Math.abs(dx) - 100) / 100)),
    '--swipe-border': `color-mix(in srgb, ${tone} ${strength * 100}%, var(--color-border))`,
    transition: settling ? 'transform var(--duration-slow) var(--ease-lohni), opacity var(--duration-slow) var(--ease-lohni)' : 'none',
  } as CSSProperties
  const face = 'absolute inset-0 flex overflow-y-auto rounded-3xl border border-[color:var(--swipe-border)] bg-surface p-6 [backface-visibility:hidden]'
  return (
    <div className="flex min-h-[55dvh] flex-1 flex-col gap-3">
      <div
        role="button" tabIndex={0} aria-pressed={revealed} aria-label={revealed ? 'Réponse. Touche pour revenir à la question.' : 'Question. Touche pour voir la réponse.'}
        onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        className="relative flex-1 touch-pan-y select-none [perspective:1000px]" style={style}
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
      </div>
      <p className="text-center text-xs text-muted" aria-live="polite">
        {!revealed ? 'Touche la carte pour voir la réponse' : hint ? 'Glisse la carte à gauche ou à droite' : '← Je ne savais pas · Je savais →'}
      </p>
    </div>
  )
}
