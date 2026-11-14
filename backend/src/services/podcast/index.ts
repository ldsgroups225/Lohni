import fs from "node:fs"
import llm from "../../utils/llm/llm"
import { generateStructured, StructuredOutputError } from "../../lib/ai/structured"
import { tts, type TSeg } from "../../utils/tts"
import { normalizeTopic } from "../../utils/text/normalize"

export type PSeg = { spk: string; voice?: string; md: string }
export type POut = { title: string; summary: string; segments: PSeg[] }

const P = `
Tu es scénariste professionnel de podcasts. Écris un dialogue naturel et captivant entre deux personnes qui explorent des idées, avec des exemples concrets du quotidien plutôt que de la mémorisation.
Réponds uniquement avec un objet JSON valide de cette forme :
{"title":"titre", "summary":"résumé", "segments":[{"spk":"A", "md":"dialogue parlé"}]}
Rédige le titre, le résumé et chaque segment en français, pour un élève du secondaire.
Écris entre 8 et 16 segments en alternant A et B, avec une à trois phrases par segment. Le ton est vivant, curieux et interactif.
Utilise uniquement du texte parlé, sans Markdown, liste, symbole ni émoji. Pose des questions, propose des analogies et des exemples concrets, explique les erreurs fréquentes et encourage la curiosité. Le résumé est concis et attrayant. Aucun texte hors du JSON.
`.trim()

export async function makeScript(input: string, topic?: string, duration?: "short" | "long", signal?: AbortSignal): Promise<POut> {
  const top = normalizeTopic(topic || "general")
  const m = [
    { role: "system", content: duration ? P.replace("8 et 16 segments", duration === "short" ? "8 et 12 segments" : "13 et 16 segments") : P },
    { role: "user", content: `sujet : ${top}\n\ncontenu :\n${input}\n\nréponds uniquement en JSON` }
  ] as any

  const failure = new Error("Le script du podcast n’a pas pu être généré. Réessaie.")
  try {
    // Models sometimes cut the JSON short: generateStructured asks once more before giving up.
    return await generateStructured<POut>({
      model: llm, messages: m, shape: "object", signal,
      validate: o => {
        const s = o as any
        return typeof s?.title === "string" && s.title.trim() && typeof s.summary === "string" && Array.isArray(s.segments) && s.segments.length && s.segments.every((segment: any) => segment && ["A", "B"].includes(segment.spk) && typeof segment.md === "string" && segment.md.trim()) ? s as POut : null
      },
    })
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (!(error instanceof StructuredOutputError)) console.error("Échec de génération du script du podcast :", error)
    throw failure
  }
}

export async function makeAudio(o: POut, dir: string, base: string, emit?: (m: any) => void, signal?: AbortSignal) {
  await fs.promises.mkdir(dir, { recursive: true })
  const segs: TSeg[] = o.segments.map((x) => ({ text: x.md, voice: x.voice }))
  const out = await tts(segs, dir, base, emit, signal)
  return out
}
