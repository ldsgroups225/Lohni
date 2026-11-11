import { lazy, Suspense } from 'react'

const MarkdownContent = lazy(() => import('./MarkdownContent'))

export default function MarkdownView({ md, inline = false }: { md: string; inline?: boolean }) {
  const fallback = inline ? <span className="break-words">{md}</span> : <div className="whitespace-pre-wrap break-words">{md}</div>
  return <Suspense fallback={fallback}><MarkdownContent md={md} inline={inline} /></Suspense>
}
