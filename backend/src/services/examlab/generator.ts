import { StateGraph, Annotation } from "@langchain/langgraph"
import llm from "../../utils/llm/llm"
import { GenSpec, QuizLikeItem } from "./types"
import { normalizeTopic } from "../../utils/text/normalize"

export type QuizItem = {
  id: number
  question: string
  options: string[]
  correct: number
  hint: string
  explanation: string
}

const SYS = (count: number, style?: string, difficulty?: string, topic?: string) => `Génère exactement ${count} questions à choix multiples sur le sujet donné.
Réponds uniquement avec un tableau JSON de ${count} objets, sans Markdown ni texte supplémentaire.
Chaque objet contient :
"id" : de 1 à ${count}
"question" : question sans ambiguïté, de 12 à 160 caractères
"options" : exactement quatre chaînes distinctes de 6 à 80 caractères, précédées de A), B), C), D) ou de 1), 2), 3), 4)
"correct" : 1, 2, 3 ou 4, indice de la bonne option à partir de 1
"hint" : indice de 6 à 120 caractères
"explanation" : explication de 12 à 200 caractères
Écris en français avec les accents et tutoie l’élève. Texte brut uniquement, sans LaTeX ni champs supplémentaires.
${style ? `Style : ${style}` : ""} ${difficulty ? `Difficulté : ${difficulty}` : ""} ${topic ? `Sujet : ${topic}` : ""}`.trim()

const SYS_STRICT = (count: number) => `Nouvel essai : respecte strictement le format.
Réponds uniquement avec un tableau JSON de ${count} objets, sans Markdown ni texte supplémentaire.
Chaque objet doit contenir id (de 1 à ${count}), question (12 à 160 caractères), options (quatre chaînes précédées de A), B), C), D) ou 1), 2), 3), 4)), correct (de 1 à 4), hint (6 à 120 caractères) et explanation (12 à 200 caractères). Rédige en français.`

function stripFences(s: string) {
  return s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim()
}
function extractArray(s: string) {
  const m = s.match(/\[[\s\S]*\]/)
  return m ? m[0] : s
}
function tryParse<T = unknown>(s: string): T | null {
  try { return JSON.parse(s) as T } catch { return null }
}
function nstr(x: any, min = 1, max = 240) {
  const t = String(x ?? "").replace(/\s+/g, " ").trim()
  return t.length < min ? "" : t.slice(0, max)
}
function to1_4(v: any) {
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= 4 ? v : 0
  const t = String(v ?? "").trim().toUpperCase()
  if (/^[1-4]$/.test(t)) return Number(t)
  if (t.startsWith("A")) return 1
  if (t.startsWith("B")) return 2
  if (t.startsWith("C")) return 3
  if (t.startsWith("D")) return 4
  const d = t.match(/\d/)
  if (d) { const n = Number(d[0]); if (n >= 1 && n <= 4) return n }
  return 0
}
function splitOptions(v: any) {
  if (Array.isArray(v)) return v
  if (typeof v === "string") return v.split(/[,;|]\s*/).map(s => s.trim()).filter(Boolean)
  return []
}
function cleanOptions(v: any) {
  const raw = splitOptions(v)
  if (raw.length !== 4 || raw.some(s => typeof s !== "string")) return []
  const out = raw.map(s => s.replace(/^\s*(?:[A-D]\)|[1-4]\))\s*/i, "").trim())
  if (out.some(s => !s) || new Set(out.map(s => s.toLowerCase())).size !== 4) return []
  const pref = Math.random() < 0.5 ? ["A) ", "B) ", "C) ", "D) "] : ["1) ", "2) ", "3) ", "4) "]
  return out.slice(0, 4).map((t, i) => (pref[i] + t).trim())
}
// Drops unusable items instead of inventing them: validation then rejects a short list.
function coerce(items: any, count: number): QuizItem[] {
  const arr = Array.isArray(items) ? items : []
  return arr.flatMap((o: any): QuizItem[] => {
    const question = nstr(o?.question, 12, 160)
    const options = cleanOptions(o?.options)
    if (!question || !options.length) return []
    const hint = nstr(o?.hint, 6, 120) || "Reviens à l’idée principale du cours."
    const explanation = nstr(o?.explanation, 12, 200) || "La bonne réponse correspond à l’idée principale ; les autres non."
    return [{ id: 0, question, options, correct: to1_4(o?.correct), hint, explanation }]
  }).slice(0, count).map((q, i) => ({ ...q, id: i + 1 }))
}
function validItem(x: any) {
  return x
    && typeof x.id === "number"
    && typeof x.question === "string"
    && Array.isArray(x.options) && x.options.length === 4 && x.options.every((o: any) => typeof o === "string")
    && typeof x.correct === "number" && x.correct >= 1 && x.correct <= 4
    && typeof x.hint === "string"
    && typeof x.explanation === "string"
}
function validQuiz(a: any, count: number): a is QuizItem[] {
  return Array.isArray(a) && a.length === count && a.every(validItem)
}

async function ask(sys: string, user: string, tag: string) {
  const msgs = [
    { role: "system", content: sys },
    { role: "user", content: user }
  ] as const
  const r = await llm.invoke([...msgs] as any)
  const raw = typeof r === "string" ? r : String((r as any)?.content ?? "")
  const txt = extractArray(stripFences(raw))
  return tryParse<any>(txt)
}

type Ctx = {
  sys: string
  user: string
  count: number
  arr: any
  norm: QuizItem[]
}

const S = Annotation.Root({
  sys: Annotation<string>(),
  user: Annotation<string>(),
  count: Annotation<number>(),
  arr: Annotation<any>(),
  norm: Annotation<QuizItem[]>(),
})

const nGen = async (s: Ctx) => {
  const parsed = await ask(s.sys, s.user, "gen")
  if (parsed) return { ...s, arr: parsed }
  return s
}
const nRetry = async (s: Ctx) => {
  if (Array.isArray(s.arr)) return s
  const parsed = await ask(SYS_STRICT(s.count), s.user, "retry")
  if (parsed) return { ...s, arr: parsed }
  return s
}
const nNormalize = async (s: Ctx) => {
  const n = coerce(s.arr, s.count)
  return { ...s, norm: n }
}
const nValidate = async (s: Ctx) => {
  if (!validQuiz(s.norm, s.count)) throw new Error("Invalid exam JSON from model")
  return s
}

const g = new StateGraph(S)
g.addNode("gen", nGen)
g.addNode("retry", nRetry)
g.addNode("normalize", nNormalize)
g.addNode("validate", nValidate)
  ; (g as any).addEdge("__start__", "gen")
  ; (g as any).addEdge("gen", "retry")
  ; (g as any).addEdge("retry", "normalize")
  ; (g as any).addEdge("normalize", "validate")
  ; (g as any).addEdge("validate", "__end__")

const compiled = g.compile()

export async function generateSectionItems(gen: GenSpec, seed: string): Promise<QuizLikeItem[]> {
  if (gen.type === "mcq") {
    const count = Math.max(1, Number(gen.count || 5))
    const sys = SYS(count, gen.style, gen.difficulty, normalizeTopic(gen.topic))
    const promptNorm = normalizeTopic(gen.prompt)
    const user = `${promptNorm}\nGraine : ${seed}\nRéponds uniquement avec le tableau JSON de ${count} objets.`
    const s = await compiled.invoke({ sys, user, count, arr: null, norm: [] })
    return s.norm
  }
  if (gen.type === "short") {
    const count = Math.max(1, Number(gen.count || 5))
    const sys = SYS(count, gen.style, gen.difficulty, normalizeTopic(gen.topic))
    const promptNorm = normalizeTopic(gen.prompt)
    const user = `Imagine d’abord ${count} bonnes questions à réponse courte sur le sujet, puis transforme chacune en QCM à quatre options avec une seule bonne réponse. Les réponses doivent être factuelles et concises.\n\n${promptNorm}\nGraine : ${seed}\nRéponds uniquement avec le tableau JSON de ${count} objets.`
    const s = await compiled.invoke({ sys, user, count, arr: null, norm: [] })
    return s.norm
  }
  return []
}