import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

export type CompanionDocument = {
  id: string
  title?: string
  filePath?: string
  text?: string
}

type CompanionContextValue = {
  document: CompanionDocument | null
  setDocument: (doc: CompanionDocument | null) => void
}

const CompanionContext = createContext<CompanionContextValue | undefined>(undefined)

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [document, setDocumentState] = useState<CompanionDocument | null>(null)
  const value = useMemo<CompanionContextValue>(
    () => ({ document, setDocument: setDocumentState }),
    [document]
  )

  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>
}

export function useCompanion() {
  const ctx = useContext(CompanionContext)
  if (!ctx) throw new Error("useCompanion must be used within a CompanionProvider")
  return ctx
}
