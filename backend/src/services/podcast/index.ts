import fs from "fs"
import llm from "../../utils/llm/llm"
import { tts, type TSeg } from "../../utils/tts"
import { normalizeTopic } from "../../utils/text/normalize"

export type PSeg = { spk: string; voice?: string; md: string }
export type POut = { title: string; summary: string; segments: PSeg[] }

const P = `
ROLE
You are a professional podcast scriptwriter. 
You craft highly engaging, interactive, and natural-sounding scripts where two speakers explore ideas in a way that feels lively, curious, and practical. 
The conversation should discourage rote learning and instead highlight real-world applications, relatable daily problems, and thought-provoking examples.

OUTPUT
Return only one valid JSON object in this format:
{
 "title": "string",
 "summary": "string",
 "segments": [
   {"spk":"A|B","md":"spoken dialogue as plain text"},
   ...
 ]
}

RULES
- 8–16 segments total
- Alternate speakers A and B consistently
- Each segment = 1–3 sentences max (natural spoken rhythm)
- Tone: casual, flowing, interactive — like two people thinking together, not lecturing
- Plain spoken text only: no Markdown, lists, symbols or emojis (a voice reads it aloud)
- Speakers should:
  * Ask and answer questions
  * Use analogies, metaphors, and relatable daily examples
  * Tie abstract ideas to concrete real-world scenarios
  * Highlight common mistakes and misconceptions
  * Encourage curiosity and exploration over memorization
- Summary: concise and enticing, like show notes
- Avoid filler; every segment should add value, humor, or a new perspective
- Make it sound alive: energy, curiosity, humor, and quick reactions
- No code fences or extra text outside the JSON
- Write the title, summary and every segment in French, for a French-speaking secondary-school student

GOAL
The script should feel ready to record for a professional podcast that makes listeners think, laugh, and connect ideas to their daily lives — surpassing rote-learning style and beating competitors in engagement and clarity.
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

export async function makeScript(input: string, topic?: string): Promise<POut> {
  const top = normalizeTopic(topic || "general")
  const m = [
    { role: "system", content: P },
    { role: "user", content: `topic: ${top}\n\nmaterial:\n${input}\n\nreturn only json` }
  ] as any

  // Models sometimes cut the JSON short: ask once more before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    let r
    try {
      r = await llm.invoke(m)
    } catch (error) {
      console.error("Échec de génération du script du podcast :", error)
      throw new Error("Le script du podcast n’a pas pu être généré. Réessaie.")
    }
    const t = (typeof r === "string" ? r : String((r as any)?.content || "")).trim()
    try {
      const o = JSON.parse(j1(t) || t)
      if (Array.isArray(o?.segments) && o.segments.length) return o as POut
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
