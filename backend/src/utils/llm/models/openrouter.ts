import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import type { MkLLM, MkEmb, EmbeddingsLike, Msg } from './types'

// OPENROUTER_MODEL peut lister plusieurs modèles séparés par des virgules, essayés dans l'ordre.
// Une erreur (ex. 402 crédit épuisé) passe au modèle suivant ; la dernière erreur est relancée.
export const makeLLM: MkLLM = (cfg: any) => {
  const models = cfg.openrouter_model.split(',').map((m: string) => m.trim()).filter(Boolean)
  const chats = models.map((model: string) => new ChatOpenAI({
    model,
    apiKey: cfg.openrouter || '',
    configuration: { baseURL: 'https://openrouter.ai/api/v1' },
    temperature: cfg.temp ?? 0.7,
    maxTokens: cfg.max_tokens,
  }))
  const invoke = async (ms: Msg[], options?: { signal?: AbortSignal }) => {
    let lastError: unknown
    for (const chat of chats) {
      try { return await chat.invoke(ms, options) } catch (error) { if (options?.signal?.aborted) throw error; lastError = error }
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
