// biome-ignore-all lint/a11y/useSemanticElements: Le fieldset natif empêche le positionnement de la face de carte.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex: La carte doit recevoir les flèches et les touches de retournement.
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import MarkdownView from '../Chat/MarkdownView'
import { spring } from '../../lib/motion'

const CardMarkdown = memo(MarkdownView)

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
  context?: string
  origin?: string
  onExplain?: () => void
  explainDisabled?: boolean
  onToggle: () => void
  onSwipe: (knew: boolean) => void
}

/** Carte plein écran : toucher retourne, glisser à droite = « Je savais », à gauche = « Je ne savais pas ».
 *  Le glissement n'est actif qu'une fois la réponse vue. Flèches du clavier et boutons restent disponibles.
 *  Pendant le geste, la carte suit le doigt sans rendu React ; au lâcher, un ressort repart de la vitesse réelle. */
export function SwipeCard({ question, answer, revealed, enabled, context, origin, onExplain, explainDisabled, onToggle, onSwipe }: Props) {
  const card = useRef<HTMLDivElement>(null)
  const x = useRef(0)
  const stop = useRef<(() => void) | null>(null)
  const drag = useRef<{ id: number; origin: number; start: number; points: [number, number][]; moved: boolean } | null>(null)
  const sent = useRef(false)
  const [hint, setHint] = useState(false)

  const apply = useCallback((value: number) => {
    x.current = value
    const el = card.current
    if (!el) return
    const strength = Math.min(1, Math.max(0, (Math.abs(value) - THRESHOLD * 0.65) / (THRESHOLD * 0.35)))
    el.style.transform = `translate3d(${value}px,0,0) rotate(${(value / 200) * 15}deg)`
    el.style.opacity = String(1 - 0.5 * Math.min(1, Math.max(0, (Math.abs(value) - 100) / 100)))
    el.style.setProperty('--swipe-border', `color-mix(in srgb, ${value > 0 ? 'var(--color-success)' : 'var(--color-danger)'} ${strength * 100}%, var(--color-border))`)
  }, [])
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
  }, [enabled, apply])

  function down(e: PointerEvent) {
    if (!enabled || sent.current || drag.current) return // un seul doigt à la fois
    stop.current?.()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, origin: e.clientX, start: e.clientX - x.current, points: [[e.timeStamp, e.clientX]], moved: false }
  }
  function move(e: PointerEvent) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved && Math.abs(e.clientX - d.origin) > TAP_SLOP) d.moved = true
    d.points.push([e.timeStamp, e.clientX])
    while (d.points.length > 2 && e.timeStamp - d.points[0][0] > 100) d.points.shift() // fenêtre glissante de 100 ms
    if (d.moved && revealed) apply(e.clientX - d.start)
  }
  function up(e: PointerEvent) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (sent.current) return // la sortie est lancée : ne pas la couper
    if (!d.moved) { if (x.current !== 0) animate(0, 0); return onToggle() }
    if (!revealed || !enabled) { if (!revealed) setHint(true); animate(0, 0); return }
    // Vitesse réelle du doigt (px/s) ; un doigt immobile avant le lâcher ne garde pas une vitesse ancienne.
    const [t0, x0] = d.points[0]
    const [t1, x1] = d.points[d.points.length - 1]
    const v = e.timeStamp - t1 > 80 || t1 === t0 ? 0 : ((x1 - x0) / (t1 - t0)) * 1000
    const dx = x.current
    if (dx >= THRESHOLD || (dx > VELOCITY_DISTANCE && v > VELOCITY)) return rate(true, v)
    if (dx <= -THRESHOLD || (dx < -VELOCITY_DISTANCE && v < -VELOCITY)) return rate(false, v)
    animate(0, v)
  }
  function cancel(e: PointerEvent) {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    if (!sent.current) animate(0, 0)
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') rate(true)
    else if (e.key === 'ArrowLeft') rate(false)
    else if (e.key === ' ' || e.key === 'Enter') onToggle()
    else return
    e.preventDefault()
  }

  return (
    <div className="motion-card flex min-h-[55dvh] flex-1 shrink-0 flex-col">
      <div
        role="group" ref={card} aria-roledescription="carte" aria-label={revealed ? 'Réponse' : 'Question'} aria-describedby="swipe-hint" tabIndex={0}
        onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        className="flex min-h-[55dvh] flex-1 touch-pan-y select-none flex-col rounded-3xl border border-[color:var(--swipe-border)] bg-surface p-5 will-change-transform"
      >
        <div className="flex-1 overflow-y-auto break-words">
          {context && <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">{context}</p>}
          <div className="text-2xl font-bold leading-snug text-foreground"><CardMarkdown md={question} inline /></div>
          <div className="mt-6 border-t border-border pt-5" hidden={!revealed}>
            <p className="mb-4 text-xs font-bold uppercase tracking-wide text-success">Réponse</p>
            <div className="text-xl leading-relaxed text-foreground"><CardMarkdown md={answer} /></div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
          <span>{origin === 'ai' ? 'Générée par IA · peut contenir des erreurs' : 'Cours importé'}</span>
          {onExplain && <button type="button" disabled={explainDisabled} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onClick={onExplain} className="min-h-11 shrink-0 text-sm font-semibold text-primary underline disabled:opacity-50">Explique-moi</button>}
        </div>
      </div>
      <p id="swipe-hint" className="py-3 text-center text-sm text-muted">
        {!revealed ? 'Touche la carte pour voir la réponse' : hint ? 'Glisse la carte à gauche ou à droite' : <>← <b className="font-semibold text-foreground">Je ne savais pas</b> · <b className="font-semibold text-foreground">Je savais</b> →</>}
      </p>
      {/* Sans geste : flèches du clavier ou ces boutons, masqués à l'écran mais lus et focalisables. */}
      {revealed && <div className="sr-only focus-within:not-sr-only focus-within:mt-2 focus-within:grid focus-within:grid-cols-2 focus-within:gap-3">
        <button type="button" disabled={!enabled} onClick={() => rate(false)} className="rounded-xl border border-border bg-surface px-2 py-3 text-foreground disabled:opacity-50">Je ne savais pas</button>
        <button type="button" disabled={!enabled} onClick={() => rate(true)} className="rounded-xl bg-success px-2 py-3 font-semibold text-on-success disabled:opacity-50">Je savais</button>
      </div>}
    </div>
  )
}
