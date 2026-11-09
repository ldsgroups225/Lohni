export const REVISION_POLICY = {
  sessionCards: 20,
  sessionMinutes: 15,
  minNewCards: 3,
  maxNewCards: 10,
  defaultNewCards: 5,
  retention: 0.9,
  knownXP: 10,
  missedXP: 2,
  sessionXP: 50,
  solidMastery: 85,
  ongoingMastery: 60,
  minimumSeenRatio: 0.5,
} as const
