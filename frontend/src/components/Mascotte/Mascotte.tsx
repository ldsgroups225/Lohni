import { useEffect, useRef } from 'react'

type Humeur = 'au repos' | 'contente' | 'en fête' | 'pensive' | 'désolée' | 'endormie'
const fichiers: Record<Humeur, string> = {
  'au repos': 'repos', contente: 'contente', 'en fête': 'fete',
  pensive: 'pensive', désolée: 'desolee', endormie: 'endormie',
}

export default function Mascotte({ humeur, taille, decorative = false }: { humeur: Humeur; taille: number; decorative?: boolean }) {
  const cadre = useRef<HTMLSpanElement>(null)
  const corps = useRef<HTMLImageElement>(null)
  const yeux = useRef<HTMLImageElement>(null)
  const bouche = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const element = cadre.current
    if (!element) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    let frame = 0
    const reset = () => {
      for (const layer of [corps.current, yeux.current, bouche.current]) if (layer) layer.style.transform = ''
    }
    const tick = (time: number) => {
      const float = Math.sin(time / 700) * 2
      const gaze = Math.sin(time / 1600) * 1.5
      const blink = time % 5000 < 120 ? 0.12 : 1
      const breath = humeur === 'pensive' ? 1 + (Math.sin(time / 800) + 1) * 0.01 : 1
      if (corps.current) corps.current.style.transform = `translateY(${float}px) scale(${breath})`
      if (bouche.current) bouche.current.style.transform = `translateY(${float}px) scale(${breath})`
      if (yeux.current) yeux.current.style.transform = `translate(${gaze}px, ${float}px) scale(${breath}, ${breath * blink})`
      frame = requestAnimationFrame(tick)
    }
    const update = () => {
      cancelAnimationFrame(frame)
      frame = 0
      if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick)
      else reset()
    }
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; update() })
    observer.observe(element)
    document.addEventListener('visibilitychange', update)
    motion.addEventListener('change', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
      motion.removeEventListener('change', update)
      cancelAnimationFrame(frame)
      reset()
    }
  }, [humeur])

  const layer = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%' }
  const fichier = fichiers[humeur]
  return <span ref={cadre} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `Lohni, ${humeur}`} aria-hidden={decorative || undefined} style={{ display: 'inline-block', position: 'relative', width: taille, height: taille }}>
    <img src="/mascotte/ombre.webp" alt="" style={layer} />
    <img ref={corps} src="/mascotte/corps.webp" alt="" style={layer} />
    <img ref={yeux} src={`/mascotte/yeux-${fichier}.webp`} alt="" style={layer} />
    <img ref={bouche} src={`/mascotte/bouche-${fichier}.webp`} alt="" style={layer} />
  </span>
}
