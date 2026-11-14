import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import type { MkLLM, MkEmb, EmbeddingsLike, Msg } from './types'

// OPENROUTER_MODEL peut lister plusieurs modèles séparés par des virgules, essayés dans l'ordre.
// Une erreur (ex. 402 crédit épuisé) passe au modèle suivant ; la dernière erreur est relancée.
export const makeLLM: MkLLM = (cfg: any) => {
  const models = cfg.openrouter_model.split(',').map((m: string) => m.trim()).filter(Boolean)
  const createChat = (model: string, reasoning = false) => new ChatOpenAI({
    model,
    apiKey: cfg.openrouter || '',
    configuration: { baseURL: 'https://openrouter.ai/api/v1' },
    temperature: cfg.temp ?? 0.7,
    maxTokens: cfg.max_tokens,
    ...(reasoning ? { modelKwargs: { reasoning: { effort: 'none' } } } : {}),
  })
  const chats = models.map((model: string) => createChat(model))
  const noReasoningChats = models.map((model: string) => createChat(model, true))
  const invoke = async (ms: Msg[], options?: { reasoning?: 'none' }) => {
    let lastError: unknown
    for (let i = 0; i < chats.length; i++) {
      try {
        return await (options?.reasoning === 'none' ? noReasoningChats[i] : chats[i]).invoke(ms)
      } catch (error) {
        if (options?.reasoning === 'none' && error instanceof Error &&
          (error as Error & { status?: number }).status === 400 && error.message.includes('Reasoning is mandatory')) {
          try { return await chats[i].invoke(ms) } catch (retryError) { lastError = retryError }
        } else lastError = error
      }
    }
    throw lastError
  }
  return { invoke, call: invoke }
}

export const makeEmbeddings: MkEmb = (cfg: any): EmbeddingsLike => {
  return new OpenAIEmbeddings({
    model: cfg.openrouter_embed_model,
    apiKey: cfg.openrouter,
    configuration: { baseURL: 'https://openrouter.ai/api/v1' },
  })
}
