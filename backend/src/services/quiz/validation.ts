import { REVISION_POLICY as policy } from '../revision/policy'
import type { QuizItem } from "./index"

export function validItem(x: any) {
  return x && typeof x.id === "number" && typeof x.question === "string" && !!x.question.trim()
    && Array.isArray(x.options) && x.options.length === 4 && x.options.every((o: any) => typeof o === "string" && !!o.trim())
    && new Set(x.options).size === x.options.length
    && Number.isInteger(x.correct) && x.correct >= 1 && x.correct <= 4
    && typeof x.hint === "string" && typeof x.explanation === "string" && !!x.explanation.trim()
}
export function validQuiz(a: any): a is QuizItem[] { return Array.isArray(a) && a.length === policy.generatedMCQCards && a.every(validItem) }

