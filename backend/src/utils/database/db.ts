import fs from "node:fs"
import path from "node:path"
import { Document } from "@langchain/core/documents"
import type { EmbeddingsInterface } from "@langchain/core/embeddings"

const memoryStores: Record<string, any> = {}
const retrieverCache: Record<string, any> = {}

export async function saveDocuments(
  collection: string,
  docs: Document[],
  _embeddings: EmbeddingsInterface
) {
  const file = path.join(process.cwd(), "storage", "json", `${collection}.json`)
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify(
      docs.map(d => ({
        pageContent: typeof d.pageContent === "string" ? d.pageContent : String(d.pageContent ?? ""),
        metadata: d.metadata || {}
      })),
      null,
      2
    )
  )
  delete memoryStores[collection]
  delete retrieverCache[collection]
}

export async function getRetriever(
  collection: string,
  embeddings: EmbeddingsInterface
) {
  if (retrieverCache[collection]) return retrieverCache[collection]

  const file = path.join(process.cwd(), "storage", "json", `${collection}.json`)
  const docsRaw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : []
  const docs = docsRaw.map((d: any) => new Document({
    pageContent: typeof d.pageContent === "string" ? d.pageContent : String(d.pageContent ?? ""),
    metadata: d.metadata || {},
  }))
  if (!memoryStores[collection]) {
    const { MemoryVectorStore } = await import("@langchain/classic/vectorstores/memory")
    memoryStores[collection] = await MemoryVectorStore.fromDocuments(docs, embeddings)
  }
  retrieverCache[collection] = memoryStores[collection].asRetriever({ k: 4 })
  return retrieverCache[collection]
}
