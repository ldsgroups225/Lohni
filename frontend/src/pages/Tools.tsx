import { Link } from 'react-router-dom'
import SmartNotes from "../components/Tools/SmartNotes"
import PodcastGenerator from "../components/Tools/PodcastGenerator"
import Transcriber from "../components/Tools/Transcriber"
import ComingSoon from "../components/Tools/ComingSoon"

export default function Tools() {
  return (
    <div className="bg-background text-foreground min-h-screen w-full px-4 md:pl-28 lg:pr-4">
      <div className="max-w-6xl mx-auto pt-6 px-4 pb-28 md:pb-14">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              to='/'
              className="p-2 rounded-xl bg-surface border border-border hover:bg-surface transition-colors"
              aria-label="Retour"
            >
              <svg viewBox="0 0 24 24" className="size-5 text-foreground" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">Outils</h1>
          </div>
          <div className="px-3 py-1 rounded-full bg-gradient-to-r from-primary to-primary border border-primary text-primary text-xs font-medium">
            BÊTA
          </div>
        </div>

        <div className="grid gap-6 mb-12">
          <Link to="/revision" className="rounded-2xl border border-border bg-surface p-6 text-lg text-foreground hover:bg-surface">Session de révision →</Link>
          <SmartNotes />
          <PodcastGenerator />
          <Transcriber />
          <ComingSoon />
        </div>
      </div>
    </div>
  )
}
