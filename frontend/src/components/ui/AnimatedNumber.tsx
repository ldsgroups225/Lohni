import { useEffect, useRef } from 'react'

export function AnimatedNumber({ value, prefix = '', streak = false }: { value: number; prefix?: string; streak?: boolean }) {
  const visual = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = visual.current
    if (!element) return
    let from = 0
    if (streak) {
      try {
        const key = `lohni-last-streak:${localStorage.getItem('lohni-device-id') ?? ''}`
        const previous = localStorage.getItem(key)
        localStorage.setItem(key, String(value))
        if (previous === null || !Number.isFinite(Number(previous)) || Number(previous) >= value) return
        from = Number(previous)
      } catch { return }
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches || from === value) return
    const durationToken = getComputedStyle(element).getPropertyValue('--duration-slow').trim()
    const duration = Number.parseFloat(durationToken) * (durationToken.endsWith('ms') ? 1 : 1000)
    if (!Number.isFinite(duration) || duration <= 0) return
    let frame = 0
    let start: number | undefined
    const tick = (time: number) => {
      start ??= time
      const ratio = Math.min(1, (time - start) / duration)
      element.textContent = `${prefix}${Math.round(from + (value - from) * ratio)}`
      if (ratio < 1) frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (motion.matches) { cancelAnimationFrame(frame); element.textContent = `${prefix}${value}` }
    }
    motion.addEventListener('change', stop)
    element.textContent = `${prefix}${from}`
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', stop) }
  }, [value, prefix, streak])
  return <><span className="sr-only">{prefix}{value}</span><span aria-hidden="true" ref={visual}>{prefix}{value}</span></>
}
