import { beforeEach, expect, test, vi } from 'vitest'
import llm from '../../../utils/llm/llm'
import { askWithContext } from '../ask'

vi.mock('../../../utils/llm/llm', () => ({ default: { invoke: vi.fn() } }))
vi.mock('../../../agents/runtime', () => ({ execDirect: vi.fn() }))

const reply = (answer: string) => vi.mocked(llm.invoke).mockResolvedValue(JSON.stringify({ topic: 'T', answer, flashcards: [] }) as any)
const ask = () => askWithContext({ question: `q${Math.random()}`, context: 'c', isCacheable: () => false })
beforeEach(() => { vi.mocked(llm.invoke).mockReset() })

test('une réponse entièrement enveloppée dans un bloc markdown est affichée comme du texte mis en forme', async () => {
  reply('```markdown\n## Titre\n\nUn **mot**.\n```')
  expect((await ask()).answer).toBe('## Titre\n\nUn **mot**.')
})

test('un vrai bloc de code dans la réponse est gardé', async () => {
  reply('Voici :\n```python\nprint(1)\n```')
  expect((await ask()).answer).toBe('Voici :\n```python\nprint(1)\n```')
})
