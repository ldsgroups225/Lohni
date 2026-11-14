import { beforeEach, expect, test, vi } from 'vitest'
import llm from '../../../utils/llm/llm'
import { askWithContext } from '../ask'

vi.mock('../../../utils/llm/llm', () => ({ default: { call: vi.fn() } }))
vi.mock('../../../agents/runtime', () => ({ execDirect: vi.fn() }))

beforeEach(() => { vi.mocked(llm.call).mockReset().mockResolvedValue('{"topic":"T","answer":"R","flashcards":[]}' as any) })
const ask = (reasoning?: 'none') => askWithContext({ question: `q${Math.random()}`, context: 'c', reasoning, isCacheable: () => false })

test('sans option, le tuteur garde le raisonnement du modèle', async () => {
  await ask()
  expect('reasoning' in (vi.mocked(llm.call).mock.calls[0][1] as object)).toBe(false)
})

test('avec reasoning none, il est transmis', async () => {
  await ask('none')
  expect(vi.mocked(llm.call).mock.calls[0][1]).toMatchObject({ reasoning: 'none' })
})
