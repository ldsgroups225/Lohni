import { Link, useLocation } from 'react-router-dom'
import { CoursesIcon, HomeIcon, ProfileIcon, TutorIcon } from './ui/NavigationIcons'

const tabs = [
  { to: '/', label: 'Accueil', icon: HomeIcon },
  { to: '/courses', label: 'Cours', icon: CoursesIcon },
  { to: '/tutor', label: 'Tuteur', icon: TutorIcon },
  { to: '/me', label: 'Moi', icon: ProfileIcon },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const active = pathname === '/chat' ? '/tutor'
    : ['/import', '/cards', '/exam', '/debate', '/tools', '/planner', '/quiz'].includes(pathname) ? '/courses'
    : pathname === '/revision' ? '/' : pathname
  return <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:inset-x-auto md:left-3 md:top-4 md:bottom-4 md:w-20 md:rounded-card md:border md:px-1 md:py-6">
    <div className="flex justify-around md:h-full md:flex-col md:justify-center md:gap-5">
      {tabs.map(tab => <Link key={tab.to} to={tab.to} aria-current={active === tab.to ? 'page' : undefined}
        className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-control p-2 text-xs focus-visible:outline-2 focus-visible:outline-secondary ${active === tab.to ? 'bg-tint text-primary' : 'text-muted hover:bg-tint hover:text-foreground'}`}>
        <tab.icon />
        {tab.label}
      </Link>)}
    </div>
  </nav>
}
