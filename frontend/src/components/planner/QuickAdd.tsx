import { useState, useRef } from "react"

interface QuickAddProps {
    onAdd: (data: { text?: string; files?: File[] }) => Promise<void>
    loading: boolean
}

export default function QuickAdd({ onAdd, loading }: QuickAddProps) {
    const [text, setText] = useState("")
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSubmit = async () => {
        if (!text.trim() && selectedFiles.length === 0) return
        await onAdd({ text, files: selectedFiles })
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
            <div className="text-foreground font-medium mb-3 flex items-center gap-2">
                <span>⚡</span>
                Ajouter une tâche
            </div>

            <div className="space-y-3">
                <div className="flex gap-2">
                    <input
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Ex. : devoir de maths chapitre 5 pour demain à 20 h, environ 2 h"
                        className="min-w-0 flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted outline-none focus:ring-1 focus:ring-border"
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
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-2 rounded-lg bg-tint text-foreground border border-border hover:bg-tint"
                        title="Ajouter les fichiers du devoir"
                    >
                        📎
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || (!text.trim() && selectedFiles.length === 0)}
                        className="px-4 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-60 hover:bg-primary"
                    >
                        {loading ? "Ajout…" : "Ajouter"}
                    </button>
                </div>

                {/* Selected Files Display */}
                {selectedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {selectedFiles.map((file, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-1 bg-tint rounded text-xs text-foreground">
                                <span className="truncate max-w-32" title={file.name}>{file.name}</span>
                                <span className="text-muted">({Math.round(file.size / 1024)}KB)</span>
                                <button
                                    onClick={() => removeFile(i)}
                                    className="text-muted hover:text-foreground ml-1"
                                >×</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Quick Templates */}
                <div className="flex flex-wrap gap-2">
                    <div className="text-muted text-xs">Exemples :</div>
                    <button
                        onClick={() => setText("Devoir de maths pour demain à 20 h, environ 1 h 30")}
                        className="text-xs px-2 py-1 rounded bg-tint text-foreground hover:bg-tint"
                    >
                        Devoir de maths
                    </button>
                    <button
                        onClick={() => setText("Lire le chapitre d’anglais pour vendredi, environ 30 min")}
                        className="text-xs px-2 py-1 rounded bg-tint text-foreground hover:bg-tint"
                    >
                        Lecture
                    </button>
                    <button
                        onClick={() => setText("Réviser le contrôle de la semaine prochaine, environ 2 h")}
                        className="text-xs px-2 py-1 rounded bg-tint text-foreground hover:bg-tint"
                    >
                        Révision
                    </button>
                </div>
            </div>
        </div>
    )
}