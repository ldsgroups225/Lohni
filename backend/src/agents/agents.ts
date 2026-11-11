import { reg } from "./registry"
import { Agent } from "./types"
import { askTool } from "./tools/ask"
import { notesTool } from "./tools/notes"
import { quizTool } from "./tools/quiz"
import { examTool } from "./tools/examlab"
import { Ragsearch } from "./tools/Ragsearch"
import { nopTool } from "./tools/nop"

const tutor: Agent = reg({
  id: "tutor",
  name: "Tutor",
  sys: "You teach and assess.",
  tools: [nopTool, notesTool, quizTool, askTool],
})

const researcher: Agent = reg({
  id: "researcher",
  name: "Researcher",
  sys: "You aggregate context and draft outputs.",
  tools: [nopTool, Ragsearch, askTool],
})

const examiner: Agent = reg({
  id: "examiner",
  name: "Examiner",
  sys: "You design assessments.",
  tools: [nopTool, examTool, quizTool],
})

export const Agents = { tutor, researcher, examiner }