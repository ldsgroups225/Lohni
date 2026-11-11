import React from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onPickFile: () => void;
  onRemoveFile: () => void;
  stagedFileName: string | null;
  busy?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
};

export default function PromptBox({
  value,
  onChange,
  onSend,
  onPickFile,
  onRemoveFile,
  stagedFileName,
  busy,
  onDragOver,
  onDrop,
}: Props) {

  return (
    <div
      className="rounded-3xl bg-surface border border-border shadow-[inset_0_3px_15px] shadow-border flex flex-col md:flex-row md:items-start md:rounded-bl-none"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex-1 p-3">
        {stagedFileName && (
          <div className="mb-3 inline-flex items-center gap-3 bg-surface border border-border rounded-2xl px-3 py-2">
            <div className="w-10 h-10 rounded-xl bg-tint border border-primary flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 text-foreground" fill="currentColor">
                <path d="M9 2a1 1 0 0 0-1 1v4H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2V3a1 1 0 0 0-1-1H9Zm5 5H10V4h4v3Z" />
              </svg>
            </div>
            <div className="flex flex-col -space-y-0.5">
              <span className="text-foreground text-sm">{stagedFileName}</span>
              <span className="text-muted text-xs">Fichier joint</span>
            </div>
            <button onClick={onRemoveFile} className="ml-2 text-foreground hover:text-foreground p-1 rounded-lg hover:bg-tint" aria-label="Retirer le fichier">
              ✕
            </button>
          </div>
        )}

        <textarea
          rows={1}
          placeholder="Une question, un sujet, un exercice…"
          className="w-full text-foreground bg-transparent rounded-2xl p-2.5 outline-none resize-none leading-6 min-h-[72px] md:min-h-[40px] text-base"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          aria-label="Ta question"
        />
      </div>

      <div className="w-full md:w-fit p-2 pt-0 md:pt-2 flex flex-row md:flex-col justify-between md:space-y-2">
        <button
          className="rounded-full bg-surface hover:bg-tint duration-300 transition-[transform,opacity] hover:text-foreground size-11 md:size-auto md:p-2.5 flex items-center justify-center"
          aria-label="Joindre un fichier"
          onClick={onPickFile}
          disabled={busy}
          title={stagedFileName ?? "Ajouter des fichiers"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-5">
            <path
              fillRule="evenodd"
              d="M5.5 17a4.5 4.5 0 0 1-1.44-8.765 4.5 4.5 0 0 1 8.302-3.046 3.5 3.5 0 0 1 4.504 4.272A4 4 0 0 1 15 17H5.5Zm3.75-2.75a.75.75 0 0 0 1.5 0V9.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0l-3.25 3.5a.75.75 0 1 0 1.1 1.02l1.95-2.1v4.59Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <button
          onClick={onSend}
          disabled={busy || (!value.trim() && !stagedFileName)}
          className="rounded-full bg-primary text-on-primary md:bg-surface md:text-inherit hover:bg-primary md:hover:bg-tint duration-300 transition-[transform,opacity] md:hover:text-foreground size-11 md:size-auto md:p-2.5 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Envoyer"
          title={busy ? "Patiente…" : "Envoyer"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
