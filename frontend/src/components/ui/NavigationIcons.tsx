const svgProps = { viewBox: '0 0 24 24', className: 'size-5' }
const strokeProps = { stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 }

export function HomeIcon() {
  return <svg aria-hidden="true" {...svgProps}><g fill="none" {...strokeProps}><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></g></svg>
}

export function CoursesIcon() {
  return <svg aria-hidden="true" {...svgProps}><path fill="none" {...strokeProps} d="M12 5v16m8.001-2A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2a5 5 0 0 1 4-2z"/></svg>
}

export function TutorIcon() {
  return <svg aria-hidden="true" {...svgProps}><path fill="none" {...strokeProps} d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092a10 10 0 1 0-4.777-4.719"/></svg>
}

export function ProfileIcon() {
  return <svg aria-hidden="true" {...svgProps}><g fill="none" {...strokeProps}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></g></svg>
}

export function FlameIcon() {
  return <svg aria-hidden="true" {...svgProps}><path fill="none" {...strokeProps} d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0a5 5 0 0 1 1-3a1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/></svg>
}
export function CheckIcon() {
  return <svg aria-hidden="true" {...svgProps}><path fill="none" {...strokeProps} d="M20 6L9 17l-5-5"/></svg>
}
export function CloseIcon() {
  return <svg aria-hidden="true" {...svgProps}><path fill="none" {...strokeProps} d="M18 6L6 18M6 6l12 12"/></svg>
}

export function NoteIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4m-4 4h4m-4 4h4m-4 4h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></g></svg>
}

export function HelpIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><circle cx="12" cy="12" r="10"/><path d="M9 9.5a3 2.5 0 0 1 6 0c0 2-2 2-3 3.5m0 4h.01"/></g></svg>
}

export function LightbulbIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4"/></g></svg>
}

export function ZapIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z"/></g></svg>
}

export function PaperclipIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="m16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></g></svg>
}

export function TargetIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></g></svg>
}

export function PartyIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M5.8 11.3L2 22l10.7-3.79M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10m8 3l-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17M11 2l.33.82c.34.86-.2 1.82-1.11 1.98c-.7.1-1.22.72-1.22 1.43V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5s-3.07-.07-5-2s-2.83-4.17-2-5s3.07.07 5 2"/></g></svg>
}

export function TrophyIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M10 14.66V17a1 1 0 0 1-1 1a2 2 0 0 0-2 2v2m7-7.34V17a1 1 0 0 0 1 1a2 2 0 0 1 2 2v2m.916-12H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/></g></svg>
}

export function BookIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M12 5v16m8.001-2A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2a5 5 0 0 1 4-2z"/></g></svg>
}

export function DumbbellIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829zM2.5 21.5l1.4-1.4M20.1 3.9l1.4-1.4M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829zM9.6 14.4l4.8-4.8"/></g></svg>
}

export function ClipboardIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m4 7h4m-4 5h4m-8-5h.01M8 16h.01"/></g></svg>
}

export function DebateIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2zm4-1a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></g></svg>
}

export function HeadphonesIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></g></svg>
}

export function CalendarIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M8 2v3m8-3v3"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></g></svg>
}

export function ThumbsUpIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88M7 10v12"/></g></svg>
}

export function ThumbsDownIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88M17 14V2"/></g></svg>
}

export function ScaleIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M12 3v18m7-13l3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2a17 17 0 0 0 8 2h1M5 8l3 8a5 5 0 0 1-6 0zV7m2 14h10"/></g></svg>
}

export function FlagIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></g></svg>
}

export function BotIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2m16 0h2m-7-1v2m-6-2v2"/></g></svg>
}

export function HandshakeIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="m11 17l2 2a1 1 0 1 0 3-3"/><path d="m14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3l1 11h-2M3 3L2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8"/></g></svg>
}

export function ChartIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M3 3v16a2 2 0 0 0 2 2h16m-3-4V9m-5 8V5M8 17v-3"/></g></svg>
}

export function TrendingDownIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="M16 17h6v-6"/><path d="m22 17l-8.5-8.5l-5 5L2 7"/></g></svg>
}

export function AlertIcon({ className = svgProps.className }: { className?: string } = {}) {
  return <svg aria-hidden="true" viewBox={svgProps.viewBox} className={className}><g fill="none" {...strokeProps}><path d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01"/></g></svg>
}
