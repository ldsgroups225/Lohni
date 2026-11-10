import { REVISION_POLICY as policy } from '../revision/policy'
import { validQuiz } from "./validation"
import llm from "../../utils/llm/llm"
import { normalizeTopic } from "../../utils/text/normalize"

export type QuizItem = {
  id: number
  question: string
  options: string[]
  correct: number
  hint: string
  explanation: string
}

const SYS = String.raw`PRIMARY OBJECTIVE
Generate exactly ${policy.generatedMCQCards} multiple-choice questions about the given topic.

OUTPUT CONTRACT
Return only a JSON array with ${policy.generatedMCQCards} objects.
No code fences or prose outside the JSON. Markdown is allowed inside JSON string values.

SCHEMA
"id": 1..${policy.generatedMCQCards}
"question": plain English, 12..160 chars, unambiguous
"options": array of exactly 4 distinct strings; each 6..80 chars; no A) or 1) prefixes; the UI labels the options
"correct": 1|2|3|4 (1-based index into options)
"hint": 6..120 chars
"explanation": 12..200 chars

STYLE
Use Markdown in questions, options, hints and explanations. Write math in LaTeX using $...$ or $$...$$.
Escape every LaTeX backslash for JSON: for example "question":"Calculate $\\frac{1}{2}$".
No extra keys or nesting.

VALIDATION
Exactly ${policy.generatedMCQCards} items
Each item has all 6 keys
options length is 4
correct in [1,2,3,4]
All strings trimmed and non-empty
All options should have Oppropriate content, actual options.

FAIL-SAFE
If uncertain, pick the standard interpretation of the topic.
Output only the JSON array.`

const SYS_STRICT = String.raw`RETRY: STRICT FORMAT ONLY

OUTPUT
Only a JSON array with ${policy.generatedMCQCards} objects. No code fences or extra text.

FIELDS
id 1..${policy.generatedMCQCards}
question 12..160 chars
options exactly 4 strings without A) or 1) prefixes; the UI labels the options
correct 1|2|3|4
hint 6..120 chars
explanation 12..200 chars
Markdown is allowed inside JSON string values. Write LaTeX math in $...$ or $$...$$.
Escape every backslash for JSON, e.g. "question":"Calculate $\\frac{1}{2}$".`

function stripFences(s: string) { return s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim() }
function extractArray(s: string) { const m = s.match(/\[[\s\S]*\]/); return m ? m[0] : s }
function tryParse<T = unknown>(s: string): T | null { try { return JSON.parse(s) as T } catch { return null } }
function normalizeQuiz(items: QuizItem[]): QuizItem[] {
  return items.map((item, index) => ({
    id: index + 1,
    question: item.question.trim(),
    options: item.options.map(option => option.replace(/^\s*(?:[A-D]\)|[1-4]\))\s*/i, "").trim()),
    correct: item.correct,
    hint: item.hint.trim(),
    explanation: item.explanation.trim(),
  }))
}

async function ask(topicIn: any, sys: string) {
  const topic = normalizeTopic(topicIn)
  const msgs = [
    { role: "system", content: sys },
    { role: "user", content: `Topic:\n${topic}\nReturn only the JSON array.` }
  ] as const
  const r = await llm.invoke([...msgs] as any)
  const raw = typeof r === "string" ? r : String((r as any)?.content ?? "")
  const txt = extractArray(stripFences(raw))
  return tryParse<any>(txt)
}

export async function handleQuiz(topic: string, language: "en" | "fr" = "en"): Promise<QuizItem[]> {
  const french = (prompt: string) => language === "fr" ? prompt.replace("plain English", "français") + "\nToutes les questions, options et explications doivent être en français." : prompt
  const parsed = await ask(topic, french(SYS))
  if (validQuiz(parsed)) return normalizeQuiz(parsed)
  const parsed2 = await ask(topic, french(SYS_STRICT))
  if (!validQuiz(parsed2)) throw new Error("Invalid quiz JSON from model")
  return normalizeQuiz(parsed2)
}
