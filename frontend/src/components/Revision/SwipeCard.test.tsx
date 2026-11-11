// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

type SpringOpts = { from: number; to: number; velocity?: number; onUpdate: (x: number) => void; onDone?: () => void }
const springs = vi.hoisted(() => [] as { opts: SpringOpts; cancelled: boolean }[])
const markdown = vi.hoisted(() => vi.fn())
vi.mock('../../lib/motion', () => ({
  spring: (opts: SpringOpts) => { const s = { opts, cancelled: false }; springs.push(s); return () => { s.cancelled = true } },
}))
vi.mock('../Chat/MarkdownView', () => ({ default: ({ md }: { md: string }) => { markdown(md); return <span>{md}</span> } }))
import { SwipeCard } from './SwipeCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLElement
const onSwipe = vi.fn(), onToggle = vi.fn()
beforeEach(() => {
  springs.length = 0; onSwipe.mockReset(); onToggle.mockReset(); markdown.mockClear()
  Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
  Element.prototype.setPointerCapture = vi.fn()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const render = (props: Partial<{ revealed: boolean; enabled: boolean }> = {}) =>
  act(async () => root.render(<SwipeCard question="Q ?" answer="R" revealed={props.revealed ?? true} enabled={props.enabled ?? true} onToggle={onToggle} onSwipe={onSwipe} />))
const card = () => host.querySelector('[aria-roledescription="carte"]') as HTMLElement
function fire(type: string, clientX: number, timeStamp: number, pointerId = 1) {
  const e = new MouseEvent(type, { bubbles: true, clientX })
  Object.defineProperties(e, { pointerId: { value: pointerId }, timeStamp: { value: 1000 + timeStamp } }) // 0 serait remplacé par Date.now()
  act(() => { card().dispatchEvent(e) })
}
const drag = (from: number, steps: [number, number][], end: number, pointerId = 1) => {
  fire('pointerdown', from, 0, pointerId)
  for (const [dx, t] of steps) fire('pointermove', from + dx, t, pointerId)
  fire('pointerup', from + steps.at(-1)![0], end, pointerId)
}

test('retourner la carte ne recalcule pas ses deux faces', async () => {
  await render({ revealed: false })
  expect(markdown).toHaveBeenCalledTimes(2)
  await render({ revealed: true })
  expect(markdown).toHaveBeenCalledTimes(2)
  expect(card().getAttribute('aria-label')).toBe('Réponse')
})

test('un toucher sans déplacement retourne la carte et ne répond pas', async () => {
  await render()
  drag(200, [[2, 20]], 40)
  expect(onToggle).toHaveBeenCalledTimes(1); expect(onSwipe).not.toHaveBeenCalled()
})

test('un glissement avant la révélation ne répond pas et la carte revient en place', async () => {
  await render({ revealed: false })
  drag(200, [[30, 20], [90, 40], [140, 60]], 70)
  expect(onSwipe).not.toHaveBeenCalled()
  expect(springs.at(-1)!.opts.to).toBe(0)
})

test('un glissement lent et court revient en ressort sans répondre', async () => {
  await render()
  drag(200, [[20, 100], [40, 220], [50, 340]], 600) // doigt immobile avant le lâcher : vitesse nulle
  expect(onSwipe).not.toHaveBeenCalled()
  const s = springs.at(-1)!; expect(s.opts.to).toBe(0); expect(s.opts.velocity).toBe(0)
})

test('au-delà de 80 px la carte sort à droite avec la vitesse du doigt puis répond « je savais » une fois', async () => {
  await render()
  drag(200, [[40, 30], [90, 60], [120, 90]], 100)
  const s = springs.at(-1)!
  expect(s.opts.to).toBe(480) // 1,2 × largeur d'écran
  expect(s.opts.velocity).toBeGreaterThan(500) // vitesse réelle, pas nulle
  act(() => s.opts.onUpdate(399)); expect(onSwipe).not.toHaveBeenCalled()
  act(() => s.opts.onUpdate(401)); act(() => s.opts.onDone?.())
  expect(onSwipe).toHaveBeenCalledTimes(1); expect(onSwipe).toHaveBeenCalledWith(true)
})

test('un flick rapide de moins de 80 px est compté, à gauche aussi', async () => {
  await render()
  drag(200, [[-30, 15], [-60, 30], [-70, 40]], 45)
  const s = springs.at(-1)!
  expect(s.opts.to).toBe(-480)
  act(() => s.opts.onDone?.())
  expect(onSwipe).toHaveBeenCalledWith(false)
})

test('un second doigt est ignoré et un pointercancel pendant la sortie ne coupe pas la réponse', async () => {
  await render()
  drag(200, [[40, 30], [90, 60], [120, 90]], 100)
  const exit = springs.at(-1)!
  const before = springs.length
  drag(100, [[200, 20]], 40, 2) // second doigt pendant la sortie
  fire('pointercancel', 0, 120)
  expect(exit.cancelled).toBe(false); expect(springs.length).toBe(before)
  act(() => exit.opts.onDone?.())
  expect(onSwipe).toHaveBeenCalledTimes(1)
})

test('les flèches du clavier répondent seulement une fois la réponse vue', async () => {
  await render({ revealed: false })
  act(() => { card().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
  expect(springs.length).toBe(0)
  await render({ revealed: true })
  act(() => { card().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
  act(() => { card().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })) })
  act(() => springs[0].opts.onDone?.())
  expect(springs.length).toBe(1) // la seconde flèche est ignorée : une seule réponse par carte
  expect(onSwipe).toHaveBeenCalledTimes(1); expect(onSwipe).toHaveBeenCalledWith(true)
})

test('la carte est un groupe étiqueté dont la face cachée est masquée aux lecteurs d’écran', async () => {
  await render({ revealed: false })
  expect(card().getAttribute('role')).toBe('group'); expect(card().getAttribute('aria-label')).toBe('Question')
  const faces = [...host.querySelectorAll('[aria-hidden]')].map(face => face.getAttribute('aria-hidden'))
  expect(faces).toEqual(['false', 'true'])
})

test('relâcher un glissement après une flèche du clavier ne coupe pas la sortie en cours', async () => {
  await render()
  fire('pointerdown', 200, 0); fire('pointermove', 240, 20)
  act(() => { card().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
  const exit = springs.at(-1)!, count = springs.length
  fire('pointerup', 240, 60)
  expect(exit.cancelled).toBe(false); expect(springs.length).toBe(count)
  act(() => exit.opts.onDone?.())
  expect(onSwipe).toHaveBeenCalledTimes(1)
})

test('sans geste : deux boutons masqués à l’écran mais présents une fois la réponse vue, qui font sortir la carte une seule fois', async () => {
  await render({ revealed: false })
  expect(host.querySelectorAll('button').length).toBe(0)
  await render({ revealed: true })
  const [no, yes] = [...host.querySelectorAll('button')] as HTMLButtonElement[]
  expect(no.textContent).toBe('Je ne savais pas'); expect(yes.textContent).toBe('Je savais')
  expect(no.parentElement!.className).toContain('sr-only') // pas d'espace pris à l'écran
  act(() => yes.click()); act(() => no.click())
  expect(springs.length).toBe(1)
  act(() => springs[0].opts.onDone?.())
  expect(onSwipe).toHaveBeenCalledTimes(1); expect(onSwipe).toHaveBeenCalledWith(true)
})
