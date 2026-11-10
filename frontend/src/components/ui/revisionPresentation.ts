export const revisionCardVisibility = 'revision-card-visibility'

export function humeurSerie(streak = 0, xp = 0, done = false) {
  return done ? 'en fête' : streak > 0 ? 'contente' : xp > 0 ? 'endormie' : 'au repos'
}

export const listDelay = (index: number) => `${Math.min(index, 4) * 30}ms`
