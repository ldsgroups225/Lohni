import { ToolPage } from '../components/ui/ToolPage'
import { Link } from 'react-router-dom'
import SmartNotes from "../components/Tools/SmartNotes"
import PodcastGenerator from "../components/Tools/PodcastGenerator"
import Transcriber from "../components/Tools/Transcriber"
import ComingSoon from "../components/Tools/ComingSoon"

export default function Tools() {
  return (
    <ToolPage title="Podcast et outils">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <Link to="/revision" className="rounded-2xl border border-border bg-surface px-5 py-4 text-foreground hover:bg-tint">Session de révision →</Link>
          <SmartNotes />
          <PodcastGenerator />
          <Transcriber />
          <ComingSoon />
        </div>
    </ToolPage>
  )
}
