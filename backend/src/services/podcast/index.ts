import fs from "node:fs"
import llm from "../../utils/llm/llm"
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

function j1(s: string) {
  let d = 0, b = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "{") { if (d === 0) b = i; d++ }
    else if (c === "}") { d--; if (d === 0 && b !== -1) return s.slice(b, i + 1) }
  }
  return ""
}

export async function makeScript(input: string, topic?: string, duration?: "short" | "long"): Promise<POut> {
  const top = normalizeTopic(topic || "general")
  const m = [
    { role: "system", content: duration ? P.replace("8 et 16 segments", duration === "short" ? "8 et 12 segments" : "13 et 16 segments") : P },
    { role: "user", content: `sujet : ${top}\n\ncontenu :\n${input}\n\nréponds uniquement en JSON` }
  ] as any

  // Models sometimes cut the JSON short: ask once more before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    let r: Awaited<ReturnType<typeof llm.invoke>>
    try {
      r = await llm.invoke(m)
    } catch (error) {
      console.error("Échec de génération du script du podcast :", error)
      throw new Error("Le script du podcast n’a pas pu être généré. Réessaie.")
    }
    const t = (typeof r === "string" ? r : String((r as any)?.content || "")).trim()
    try {
      const o = JSON.parse(j1(t) || t)
      if (typeof o?.title === "string" && o.title.trim() && typeof o.summary === "string" && Array.isArray(o.segments) && o.segments.length && o.segments.every((segment: any) => segment && ["A", "B"].includes(segment.spk) && typeof segment.md === "string" && segment.md.trim())) return o as POut
    } catch { /* retried below */ }
  }
  throw new Error("Le script du podcast n’a pas pu être généré. Réessaie.")
}

export async function makeAudio(o: POut, dir: string, base: string, emit?: (m: any) => void) {
  await fs.promises.mkdir(dir, { recursive: true })
  const segs: TSeg[] = o.segments.map((x) => ({ text: x.md, voice: x.voice }))
  const out = await tts(segs, dir, base, emit)
  return out
}
