import React from "react";

type Props = {
  selected: { text: string; x: number; y: number } | null;
  addNote: (text: string) => void;
  askDoubt: (text: string) => void;
  popupRef: React.RefObject<HTMLDivElement | null>;
};

export default function SelectionPopup({ selected, addNote, askDoubt, popupRef }: Props) {
  if (!selected) return null;
  return (
    <div
      ref={popupRef}
      className="absolute z-[45] flex max-w-[calc(100vw-1rem)] flex-wrap gap-1 bg-surface border border-border rounded-xl p-2 shadow-xl"
      style={{ left: Math.max(8, Math.min(selected.x, window.innerWidth - 296)), top: selected.y + 10, transition: "opacity .15s" }}
    >
      <button
        onClick={() => addNote(selected.text)}
        className="bg-surface hover:bg-tint border border-border hover:border-border text-foreground px-3 py-1.5 rounded-lg text-xs transition-[transform,opacity] duration-200 active:scale-95 mr-1"
      >
        📝 Enregistrer une note
      </button>
      <button
        onClick={() => askDoubt(selected.text)}
        className="bg-surface hover:bg-tint border border-border hover:border-border text-foreground px-3 py-1.5 rounded-lg text-xs transition-[transform,opacity] duration-200 active:scale-95 ml-1"
      >
        ❓ Demander une explication
      </button>
    </div>
  );
}