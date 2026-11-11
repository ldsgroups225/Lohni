import { useEffect, useRef } from 'react'

type Humeur = 'au repos' | 'contente' | 'en fête' | 'pensive' | 'désolée' | 'endormie'
const fichiers: Record<Humeur, string> = {
  'au repos': 'repos', contente: 'contente', 'en fête': 'fete',
  pensive: 'pensive', désolée: 'desolee', endormie: 'endormie',
}

type Fond = { humeur: Humeur; actif: 0 | 1; fichiers: [string, string]; duree: number }
// Float par humeur : amplitude (px) et période (ms) ; reste discret.
const mouvement: Record<Humeur, { amp: number; periode: number }> = {
  'au repos': { amp: 2, periode: 700 }, contente: { amp: 2.2, periode: 650 }, 'en fête': { amp: 3, periode: 520 },
  pensive: { amp: 2.6, periode: 800 }, désolée: { amp: 1.5, periode: 900 }, endormie: { amp: 1, periode: 1200 },
}
const pauseClin = () => 2000 + Math.random() * 2800

export default function Mascotte({ humeur, taille, decorative = false }: { humeur: Humeur; taille: number; decorative?: boolean }) {
  const cadre = useRef<HTMLSpanElement>(null)
  const ombre = useRef<HTMLImageElement>(null)
  const corps = useRef<HTMLImageElement>(null)
  const yeuxA = useRef<HTMLImageElement>(null)
  const yeuxB = useRef<HTMLImageElement>(null)
  const boucheA = useRef<HTMLImageElement>(null)
  const boucheB = useRef<HTMLImageElement>(null)
  // Deux calques par partie du visage : on fond l'ancien vers le nouveau sans setState.
  const fond = useRef<Fond>({ humeur, actif: 0, fichiers: [fichiers[humeur], fichiers[humeur]], duree: 400 })
  const f = fond.current
  if (f.humeur !== humeur) {
    const sommeil = f.humeur === 'endormie' || humeur === 'endormie'
    f.actif = f.actif === 0 ? 1 : 0
    f.fichiers[f.actif] = fichiers[humeur]
    f.duree = sommeil ? 700 : 400
    f.humeur = humeur
  }

  useEffect(() => {
    // Précharge les visages pour que le fondu ne montre pas d'image vide.
    if (typeof Image === 'undefined') return
    for (const fichier of Object.values(fichiers)) for (const partie of ['yeux', 'bouche']) new Image().src = `/mascotte/${partie}-${fichier}.webp`
  }, [])

  useEffect(() => {
    const element = cadre.current
    if (!element) return
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    // Safari < 14 n'a que addListener/removeListener sur MediaQueryList.
    const onMotion = (add: boolean) => {
      if (!motion) return
      if (motion.addEventListener) add ? motion.addEventListener('change', update) : motion.removeEventListener('change', update)
      else add ? motion.addListener(update) : motion.removeListener(update)
    }
    const { amp, periode } = mouvement[humeur]
    const dort = humeur === 'endormie'
    const box = element.getBoundingClientRect()
    let visible = box.bottom > 0 && box.top < window.innerHeight // évite une pose de repos le temps du premier callback
    let frame = 0
    let clinDebut = -1
    let clinProchain = 0
    const calques = [corps, yeuxA, yeuxB, boucheA, boucheB, ombre]
    const reset = () => {
      for (const c of calques) if (c.current) c.current.style.transform = ''
      if (ombre.current) ombre.current.style.opacity = ''
    }
    const tick = (time: number) => {
      const s = Math.sin(time / periode)
      const float = s * amp
      const gaze = Math.sin(time / 1600) * 1.5
      // Clignement Hermes : fermeture 70 ms jusqu'à 10 %, réouverture 130 ms, puis pause aléatoire.
      let blink = 1
      if (!dort) {
        if (clinProchain === 0) clinProchain = time + pauseClin()
        if (clinDebut < 0 && time >= clinProchain) clinDebut = time
        if (clinDebut >= 0) {
          const t = time - clinDebut
          if (t < 70) blink = 1 - 0.9 * (t / 70)
          else if (t < 200) blink = 0.1 + 0.9 * ((t - 70) / 130)
          else { clinDebut = -1; clinProchain = time + pauseClin() }
        }
      }
      const breath = humeur === 'pensive' ? 1 + (Math.sin(time / 800) + 1) * 0.01 : 1
      const bas = Math.max(0, s) ** 4 * 0.03 // écrasement au bas du flottement
      const haut = (1 - s) / 2 // 1 quand le corps est au plus haut
      const sy = breath * (1 - bas)
      const sx = breath * (1 + bas * 0.8)
      const base = `translateY(${float}px) scale(${sx}, ${sy})`
      if (corps.current) { corps.current.style.transformOrigin = '50% 90%'; corps.current.style.transform = base }
      for (const c of [boucheA, boucheB]) if (c.current) { c.current.style.transformOrigin = '50% 90%'; c.current.style.transform = base }
      for (const c of [yeuxA, yeuxB]) if (c.current) c.current.style.transform = `translate(${gaze}px, ${float}px) scale(${breath}, ${breath * blink})`
      if (ombre.current) {
        ombre.current.style.transformOrigin = '50% 90%'
        ombre.current.style.transform = `scale(${1 - 0.1 * haut})`
        ombre.current.style.opacity = String(1 - 0.3 * haut)
      }
      frame = requestAnimationFrame(tick)
    }
    const update = () => {
      cancelAnimationFrame(frame)
      frame = 0
      if (visible && !document.hidden && !motion?.matches) frame = requestAnimationFrame(tick)
      else reset()
    }
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; update() })
    observer?.observe(element)
    document.addEventListener('visibilitychange', update)
    onMotion(true)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', update)
      onMotion(false)
      cancelAnimationFrame(frame)
      reset()
    }
  }, [humeur])

  const layer = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%' }
  const fondu = (i: 0 | 1) => ({ ...layer, opacity: f.actif === i ? 1 : 0, transition: `opacity ${f.duree}ms ease` })
  return <span ref={cadre} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `Lohni, ${humeur}`} aria-hidden={decorative || undefined} style={{ display: 'inline-block', position: 'relative', width: taille, height: taille }}>
    <img ref={ombre} src="/mascotte/ombre.webp" alt="" style={layer} />
    <img ref={corps} src="/mascotte/corps.webp" alt="" style={layer} />
    <img ref={yeuxA} src={`/mascotte/yeux-${f.fichiers[0]}.webp`} alt="" style={fondu(0)} />
    <img ref={yeuxB} src={`/mascotte/yeux-${f.fichiers[1]}.webp`} alt="" style={fondu(1)} />
    <img ref={boucheA} src={`/mascotte/bouche-${f.fichiers[0]}.webp`} alt="" style={fondu(0)} />
    <img ref={boucheB} src={`/mascotte/bouche-${f.fichiers[1]}.webp`} alt="" style={fondu(1)} />
  </span>
}
