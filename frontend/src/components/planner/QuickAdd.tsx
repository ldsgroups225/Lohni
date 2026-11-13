import { ZapIcon, PaperclipIcon } from '../ui/NavigationIcons'
import { useState, useRef } from "react"
import { withOccurrenceKeys } from "../../lib/occurrenceKeys"

interface QuickAddProps {
    onAdd: (data: { text?: string; files?: File[] }) => Promise<boolean>
    loading: boolean
    error?: string
}

export default function QuickAdd({ onAdd, loading, error }: QuickAddProps) {
    const [text, setText] = useState("")
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSubmit = async () => {
        if (!text.trim() && selectedFiles.length === 0) return
        if (!(await onAdd({ text, files: selectedFiles }))) return
        setText("")
        setSelectedFiles([])
    }

    const handleFileSelect = (files: FileList | null) => {
        if (!files) return
        const newFiles = Array.from(files).filter(f =>
            f.size <= 10 * 1024 * 1024 && // 10MB limit
            (f.type.includes('pdf') || f.type.includes('image') || f.type.includes('text') || f.type.includes('document'))
        )
        setSelectedFiles(prev => [...prev, ...newFiles])
    }

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    }

    return (
        <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-foreground font-medium mb-3 flex items-center gap-2">
                <ZapIcon />
                Ajouter une tâche
            </h2>

            <div className="space-y-3">
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Ex. : maths demain"
                    aria-label="Nouvelle tâche"
                    enterKeyHint="send"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    onChange={e => handleFileSelect(e.target.files)}
                    className="hidden"
                />
                <div className="flex gap-2">
                    <button type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="press-icon grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-tint text-foreground"
                        title="Ajouter les fichiers du devoir"
                        aria-label="Joindre des fichiers au devoir"
                    >
                        <PaperclipIcon />
                    </button>
                    <button type="button"
                        onClick={handleSubmit}
                        disabled={loading || (!text.trim() && selectedFiles.length === 0)}
                        className="min-h-11 flex-1 rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:bg-tint disabled:text-muted"
                    >
                        {loading ? "Ajout…" : "Ajouter la tâche"}
                    </button>
                </div>

                {error && <p role="alert" className="rounded-lg border border-primary bg-tint px-3 py-2 text-sm text-foreground">{error}</p>}

                {/* Selected Files Display */}
                {selectedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {withOccurrenceKeys(selectedFiles, file => JSON.stringify([file.name, file.size, file.lastModified])).map(({ value: file, key }, i) => (
                            <div key={key} className="flex items-center gap-1 px-2 py-1 bg-tint rounded text-xs text-foreground">
                                <span className="truncate max-w-32" title={file.name}>{file.name}</span>
                                <span className="text-muted">({Math.round(file.size / 1024)}KB)</span>
                                <button type="button"
                                    onClick={() => removeFile(i)}
                                    className="text-muted hover:text-foreground ml-1"
                                >×</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Quick Templates */}
                <div className="flex flex-wrap gap-2">
                    <div className="w-full text-xs text-muted">Exemples</div>
                    <button type="button"
                        onClick={() => setText("Devoir de maths pour demain à 20 h, environ 1 h 30")}
                        className="min-h-10 rounded-xl bg-tint px-3 text-sm text-foreground"
                    >
                        Devoir de maths
                    </button>
                    <button type="button"
                        onClick={() => setText("Lire le chapitre d’anglais pour vendredi, environ 30 min")}
                        className="min-h-10 rounded-xl bg-tint px-3 text-sm text-foreground"
                    >
                        Lecture
                    </button>
                    <button type="button"
                        onClick={() => setText("Réviser le contrôle de la semaine prochaine, environ 2 h")}
                        className="min-h-10 rounded-xl bg-tint px-3 text-sm text-foreground"
                    >
                        Révision
                    </button>
                </div>
            </div>
        </div>
    )
}
