import { Link, useLocation } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Accueil', icon: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { to: '/courses', label: 'Cours', icon: 'M4 3h7a3 3 0 0 1 3 3v15a4 4 0 0 0-4-2H4ZM14 6a3 3 0 0 1 3-3h4v16h-3a4 4 0 0 0-4 2' },
  { to: '/tutor', label: 'Tuteur', icon: 'M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z' },
  { to: '/me', label: 'Moi', icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2' },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const active = pathname === '/chat' ? '/tutor'
    : ['/import', '/cards', '/exam', '/debate', '/tools', '/planner', '/quiz'].includes(pathname) ? '/courses'
    : pathname === '/revision' ? '/' : pathname
  return <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-800 bg-stone-950/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:inset-x-auto md:left-3 md:top-4 md:bottom-4 md:w-20 md:rounded-3xl md:border md:px-1 md:py-6">
    <div className="flex justify-around md:h-full md:flex-col md:justify-center md:gap-5">
      {tabs.map(tab => <Link key={tab.to} to={tab.to} aria-current={active === tab.to ? 'page' : undefined}
        className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-xl p-2 text-xs focus-visible:outline-2 focus-visible:outline-sky-400 ${active === tab.to ? 'bg-stone-800 text-white' : 'text-stone-400 hover:bg-stone-900 hover:text-white'}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="size-5"><path d={tab.icon} /></svg>
        {tab.label}
      </Link>)}
    </div>
  </nav>
}
