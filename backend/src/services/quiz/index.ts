import { REVISION_POLICY as policy } from '../revision/policy'
import { validQuiz } from "./validation"
import llm from "../../utils/llm/llm"
import { generateStructured, StructuredOutputError } from "../../lib/ai/structured"
import { normalizeTopic } from "../../utils/text/normalize"

export type QuizItem = {
  id: number
  question: string
  options: string[]
  correct: number
  hint: string
  explanation: string
}

export class InvalidQuizError extends Error {}

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

function withExplanation(parsed: unknown) {
  return Array.isArray(parsed) ? parsed.map(item =>
    item && typeof item === "object" && item.explanation === undefined && typeof item.explication === "string"
      ? { ...item, explanation: item.explication } : item
  ) : parsed
}

export async function handleQuiz(topic: string, language: "en" | "fr" = "en", signal?: AbortSignal): Promise<QuizItem[]> {
  const french = (prompt: string) => language === "fr" ? `${prompt.replace("plain English", "français")}\nToutes les questions, options et explications doivent être en français.` : prompt
  const messages = (sys: string) => [
    { role: "system" as const, content: french(sys) },
    { role: "user" as const, content: `Topic:\n${normalizeTopic(topic)}\nReturn only the JSON array.` },
  ]
  try {
    return await generateStructured({
      model: llm, messages: messages(SYS), retryMessages: messages(SYS_STRICT), shape: "array", signal,
      validate: parsed => {
        const items = withExplanation(parsed)
        if (!validQuiz(items)) return null
        const normalized = normalizeQuiz(items)
        return validQuiz(normalized) ? normalized : null
      },
    })
  } catch (error) {
    if (error instanceof StructuredOutputError) throw new InvalidQuizError("Invalid quiz JSON from model")
    throw error
  }
}
