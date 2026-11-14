import type { MessageContent } from '@langchain/core/messages'

export type Msg = { role: 'user' | 'assistant' | 'system'; content: MessageContent }

export interface LLM {
  invoke(m: Msg[], options?: { reasoning?: 'none'; signal?: AbortSignal }): Promise<any>
  call(m: Msg[], options?: { reasoning?: 'none'; signal?: AbortSignal }): Promise<any>
}

export type EmbeddingsLike = {
  embedDocuments(texts: string[]): Promise<number[][]>
  embedQuery(text: string): Promise<number[]>
}

export type MkLLM = (cfg: any) => LLM
export type MkEmb = (cfg: any) => EmbeddingsLike
