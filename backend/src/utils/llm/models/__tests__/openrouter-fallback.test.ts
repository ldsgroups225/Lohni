import { describe, it, expect, vi } from 'vitest'

const calls: { model: string; invoke: ReturnType<typeof vi.fn> }[] = []
vi.mock('@langchain/openai', () => {
  const ChatOpenAI = vi.fn(function (this: any, opts: any) {
    this.invoke = vi.fn()
    calls.push({ model: opts.model, invoke: this.invoke })
  })
  return { ChatOpenAI, OpenAIEmbeddings: vi.fn() }
})

import { makeLLM } from '../openrouter'

describe('openrouter fallback', () => {
  it('essaie chaque modèle dans l’ordre jusqu’à une réponse', async () => {
    calls.length = 0
    const llm = makeLLM({ openrouter_model: 'a/haiku, b/deepseek ,openrouter/free' })
    expect(calls.map(c => c.model)).toEqual(['a/haiku', 'b/deepseek', 'openrouter/free'])
    calls[0].invoke.mockRejectedValue(new Error('402 credits'))
    calls[1].invoke.mockRejectedValue(new Error('402 credits'))
    calls[2].invoke.mockResolvedValue({ content: 'ok' })
    await expect(llm.invoke([{ role: 'user', content: 'x' }])).resolves.toEqual({ content: 'ok' })
    expect(calls[2].invoke).toHaveBeenCalledOnce()
  })

  it('relance la dernière erreur si tous les modèles échouent', async () => {
    calls.length = 0
    const llm = makeLLM({ openrouter_model: 'a/x,b/y' })
    calls[0].invoke.mockRejectedValue(new Error('first'))
    calls[1].invoke.mockRejectedValue(new Error('last'))
    await expect(llm.invoke([{ role: 'user', content: 'x' }])).rejects.toThrow('last')
  })
})
