const SUGGESTIONS = ["Les fractions", "La photosynthèse", "La Révolution française", "Le passé simple"];

export default function TopicBar({
  value,
  onChange,
  onStart,
  phase,
  isLoading = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onStart: () => void;
  phase?: string;
  isLoading?: boolean;
}) {
  const disabled = !value.trim() || isLoading;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!disabled) onStart(); }}
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">Sur quel sujet veux-tu t’entraîner ?</h2>
        <p className="mt-1 text-sm text-muted">Lohni prépare un quiz à choix multiples. Tu vois la correction après chaque question.</p>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Sujet du quiz (ex. : les fractions)"
        aria-label="Sujet du quiz"
        enterKeyHint="go"
        className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-primary"
      />
      <div>
        <p className="mb-2 text-xs text-muted">Idées</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => onChange(suggestion)} className="min-h-10 rounded-xl bg-tint px-3 text-sm text-foreground">
              {suggestion}
            </button>
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="ui-button min-h-11 w-full disabled:bg-tint disabled:text-muted disabled:opacity-100"
      >
        {isLoading ? "Création…" : "Commencer le quiz"}
      </button>
      {phase && <p className="text-xs text-muted">État : {phase}</p>}
    </form>
  );
}
