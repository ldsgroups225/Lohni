import type { MasteryStatus } from '../../lib/api'

export default function MasteryBadge({ status }: { status: MasteryStatus }) {
  return <span className={`mastery-badge ${status === 'Solide' ? 'mastery-badge-solid' : status === 'En cours' ? 'mastery-badge-ongoing' : 'mastery-badge-fragile'}`}>{status}</span>
}
