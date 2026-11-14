import { beforeEach, expect, test, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('../../utils/llm/llm', () => ({ default: { invoke } }))

import { generateSteps, parseTask } from './ai'

const task = { id: 't', title: 'Exercices de maths', type: 'homework', estMins: 60, dueAt: '2026-11-20T10:00:00.000Z', priority: 3 } as any
beforeEach(() => invoke.mockReset())

test('l’analyse d’un devoir est demandée en français, avec le style d’étude du planificateur', async () => {
  invoke.mockResolvedValueOnce('title: Exercices\nestMins: 90')
  await expect(parseTask('Maths exos pour vendredi')).resolves.toMatchObject({ title: 'Exercices', estMins: 90 })
  const [messages] = invoke.mock.calls[0]
  expect(messages[0]).toMatchObject({ role: 'system', content: expect.stringContaining('collège ou de lycée') })
  expect(messages[1].content).toContain('Analyse ce texte de devoir')
  expect(messages[1].content).toContain('estMins:')
  expect(messages[1].content).not.toMatch(/Parse this|Current date/)
})

test('les étapes d’un devoir sont demandées en français et lues dans la liste numérotée', async () => {
  invoke.mockResolvedValueOnce('1. Relire le cours\n2. Faire les exercices\n3. Vérifier')
  await expect(generateSteps(task)).resolves.toEqual(['Relire le cours', 'Faire les exercices', 'Vérifier'])
  const [messages] = invoke.mock.calls[0]
  expect(messages[0].role).toBe('system')
  expect(messages[1].content).toContain('liste numérotée')
  expect(messages[1].content).not.toContain('Generate a simple')
})

test('le modèle reçoit le jour de la semaine en toutes lettres pour situer « mardi prochain »', async () => {
  vi.useFakeTimers({ now: new Date(2026, 10, 14, 15, 0), toFake: ['Date'] })
  try {
    invoke.mockResolvedValueOnce('title: Contrôle')
    await parseTask('Contrôle de maths mardi prochain')
    expect(invoke.mock.calls[0][0][1].content).toContain('samedi 14 novembre 2026')
  } finally { vi.useRealTimers() }
})
