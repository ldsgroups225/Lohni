import { makeEmbeddings, makeLLM } from './openrouter'
import { config } from '../../../config/env'
import type { EmbeddingsLike, LLM } from './types'

export function makeModels(): { llm: LLM; embeddings: EmbeddingsLike } {
  return { llm: makeLLM(config), embeddings: makeEmbeddings(config) }
}
