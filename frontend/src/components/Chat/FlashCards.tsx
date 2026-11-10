import MarkdownView from "./MarkdownView";
import type { FlashCard } from "../../lib/api";

type Props = {
  items?: FlashCard[];
  onAdd: (item: { kind: "flashcard" | "note"; title: string; content: string }) => void;
  onToggleCollapse?: () => void;
  disabled?: boolean;
};

export default function FlashCards({ items = [], onAdd, onToggleCollapse, disabled }: Props) {
  return (
    <div className="w-full">
      <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-8rem)] flex flex-col">
        <div className="mb-4">
          <div className="rounded-2xl bg-surface border border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-foreground font-semibold tracking-wide text-sm">Cartes à retenir</h3>
              <span className="text-[11px] font-medium text-muted bg-surface px-2 py-0.5 rounded-full border border-border">
                {items.length}
              </span>
            </div>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-opacity"
                title="Masquer les cartes"
                aria-label="Masquer les cartes"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scroll space-y-4 mb-8">
          {items.length === 0 ? (
            <div className="text-muted text-sm bg-surface border border-border rounded-2xl p-6 text-center">
              Aucune carte pour le moment
            </div>
          ) : (
            items.map((c, i) => {
              const title = c.q;
              const content = c.a;
              return (
                <div
                  key={`${i}-${title}`}
                  className="group rounded-2xl bg-surface border border-border hover:bg-surface transition-opacity "
                >
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-foreground text-sm font-medium leading-5">
                          <MarkdownView md={title} inline />
                        </h4>
                        <div className="text-muted text-xs leading-5 mt-1 line-clamp-3">
                          <MarkdownView md={content} />
                        </div>
                      </div>
                      <button
                        disabled={disabled}
                        onClick={() => onAdd({ kind: "flashcard", title, content })}
                        className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-xl bg-surface border border-border text-muted hover:text-foreground hover:bg-tint transition-opacity"
                        aria-label="Enregistrer dans mes révisions"
                        title="Enregistrer dans mes révisions"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M19 12H5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
