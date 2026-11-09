import type { QuizItem } from "./index"

export function validItem(x: any) {
  return x && typeof x.id === "number" && typeof x.question === "string"
    && Array.isArray(x.options) && x.options.length === 4 && x.options.every((o: any) => typeof o === "string")
    && typeof x.correct === "number" && x.correct >= 1 && x.correct <= 4
    && typeof x.hint === "string" && typeof x.explanation === "string"
}
export function validQuiz(a: any): a is QuizItem[] { return Array.isArray(a) && a.length === 5 && a.every(validItem) }

