export default function LoadingIndicator({
  label = "Préparation de la réponse…",
}: { label?: string }) {
  return (
    <div className="w-full max-w-4xl rounded-2xl p-6 border border-border bg-surface">
      <div className="flex items-center gap-4">
        <div className="relative h-5 w-5">
          <span className="absolute inset-0 rounded-full border-2 border-border animate-ping" />
          <span className="absolute inset-0 rounded-full border-2 border-border" />
        </div>
        <div className="text-foreground">{label}</div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-3 rounded bg-tint animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-tint animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-tint animate-pulse" />
      </div>
    </div>
  );
}