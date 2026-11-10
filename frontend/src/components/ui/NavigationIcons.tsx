const svgProps = { 'aria-hidden': true as const, viewBox: '0 0 24 24', className: 'size-5' }
const strokeProps = { stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 }

export function HomeIcon() {
  return <svg {...svgProps}><g fill="none" {...strokeProps}><path fill="currentColor" d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path fill="currentColor" d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></g></svg>
}

export function CoursesIcon() {
  return <svg {...svgProps}><path fill="none" {...strokeProps} d="M12 5v16m8.001-2A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2a5 5 0 0 1 4-2z"/></svg>
}

export function TutorIcon() {
  return <svg {...svgProps}><path fill="none" {...strokeProps} d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092a10 10 0 1 0-4.777-4.719"/></svg>
}

export function ProfileIcon() {
  return <svg {...svgProps}><g fill="none" {...strokeProps}><circle fill="currentColor" cx="12" cy="8" r="5"/><path fill="currentColor" d="M20 21a8 8 0 0 0-16 0"/></g></svg>
}
