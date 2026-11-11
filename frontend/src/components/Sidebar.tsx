import { revisionCardVisibility } from './ui/revisionPresentation'
import { navigationCancelled } from '../lib/useLeaveConfirmation'
import { prefersReducedMotion } from '../lib/motion'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CoursesIcon, HomeIcon, ProfileIcon, TutorIcon } from './ui/NavigationIcons'

const tabs = [
  { to: '/', label: 'Accueil', icon: HomeIcon },
  { to: '/courses', label: 'Cours', icon: CoursesIcon },
  { to: '/tutor', label: 'Tuteur', icon: TutorIcon },
  { to: '/me', label: 'Moi', icon: ProfileIcon },
]

export default function Sidebar() {
  const location = useLocation()
  const { pathname } = location
  const navigate = useNavigate()
  const homeIndex = useRef<number | null>(pathname === '/' && typeof window !== 'undefined' ? window.history.state?.idx ?? null : null)
  const pendingTab = useRef<{ to: string; index: number } | null>(null)
  useEffect(() => {
    const cancel = () => { pendingTab.current = null }
    window.addEventListener(navigationCancelled, cancel)
    return () => window.removeEventListener(navigationCancelled, cancel)
  }, [])
  useEffect(() => {
    const index = window.history.state?.idx
    if (pendingTab.current && index === pendingTab.current.index) {
      const { to } = pendingTab.current
      pendingTab.current = null
      if (to !== '/') navigate(to, { replace: true, state: { navigationTab: true } })
    } else if (pathname === '/' && typeof index === 'number' && homeIndex.current === null) {
      homeIndex.current = index
    }
  }, [location, navigate, pathname])
  const [cardVisible, setCardVisible] = useState(false)
  const nav = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const update = (event: Event) => setCardVisible((event as CustomEvent<boolean>).detail)
    window.addEventListener(revisionCardVisibility, update)
    return () => window.removeEventListener(revisionCardVisibility, update)
  }, [])
  useEffect(() => {
    const move = () => {
      const item = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
      const marker = indicator.current
      if (!item || !marker) return
      marker.style.width = `${item.offsetWidth}px`
      marker.style.height = `${item.offsetHeight}px`
      marker.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`
      marker.style.opacity = '1'
    }
    move()
    window.addEventListener('resize', move)
    return () => window.removeEventListener('resize', move)
  }, [pathname, cardVisible])
  if ((pathname === '/revision' && cardVisible)) return null
  const active = pathname === '/chat' ? '/tutor'
    : ['/import', '/cards', '/exam', '/debate', '/tools', '/planner', '/quiz'].includes(pathname) ? '/courses'
    : pathname === '/revision' ? '/' : pathname
  return <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-border bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:inset-x-auto md:left-3 md:top-4 md:bottom-4 md:w-20 md:rounded-card md:border md:px-1 md:py-6">
    <div ref={nav} className="relative flex justify-around md:h-full md:flex-col md:justify-center md:gap-5">
      <span ref={indicator} aria-hidden="true" className="navigation-indicator" />
      {tabs.map(tab => <Link key={tab.to} to={tab.to} state={{ navigationTab: true }} replace={pathname !== '/'} onClick={event => {
        const index = window.history.state?.idx
        const home = homeIndex.current
        if (home !== null && typeof index === 'number' && index > home && (tab.to === '/' || index > home + 1)) {
          event.preventDefault()
          const destination = tab.to === '/' ? home : home + 1
          pendingTab.current = { to: tab.to, index: destination }
          navigate(destination - index)
        } else if (pathname === tab.to) {
          event.preventDefault()
          window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
        }
      }} aria-current={active === tab.to ? 'page' : undefined}
        className={`relative flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-control p-2 text-xs focus-visible:outline-2 focus-visible:outline-secondary ${active === tab.to ? 'text-foreground' : 'text-muted hover:bg-tint hover:text-foreground'}`}>
        <span className={active === tab.to ? 'text-primary' : undefined}><tab.icon /></span>
        {tab.label}
      </Link>)}
    </div>
  </nav>
}
