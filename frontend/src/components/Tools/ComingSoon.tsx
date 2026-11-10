export default function ComingSoon() {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          D’autres outils à venir
        </h2>
        <div className="flex-1 h-px bg-gradient-to-r from-tint to-transparent"></div>
        <div className="px-3 py-1 rounded-full bg-tint border border-border text-foreground text-xs font-medium">
          EN DÉVELOPPEMENT
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* AI Study Planner */}
        <div className="group rounded-2xl bg-surface border border-border p-4 hover:border-primary transition-[transform,opacity] duration-300  ">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs uppercase tracking-wide text-primary font-semibold">
                  planning de révision
                </div>
              </div>
              <div className="text-foreground font-semibold text-lg mb-2">
                Planning de révision IA
              </div>
              <div className="text-muted text-sm leading-relaxed">
                Prépare un planning de révision adapté à tes échéances.
              </div>
            </div>
            <div className="p-3 rounded-xl bg-tint border border-border">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-5 text-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Mind Map Generator */}
        <div className="group rounded-2xl bg-surface border border-border p-4 hover:border-border transition-[transform,opacity] duration-300  ">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs uppercase tracking-wide text-foreground font-semibold">
                  apprentissage visuel
                </div>
              </div>
              <div className="text-foreground font-semibold text-lg mb-2">
                Créateur de cartes mentales
              </div>
              <div className="text-muted text-sm leading-relaxed">
                Transforme un sujet complexe en carte mentale interactive.
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gradient-to-br from-tint to-tint border border-border">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-5 text-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Presentation Builder */}
        <div className="group rounded-2xl bg-surface border border-border p-4 hover:border-border transition-[transform,opacity] duration-300  ">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs uppercase tracking-wide text-foreground font-semibold">
                  création de présentations
                </div>
              </div>
              <div className="text-foreground font-semibold text-lg mb-2">
                Créateur de diaporamas
              </div>
              <div className="text-muted text-sm leading-relaxed">
                Crée des présentations avec des diapositives et des notes.
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gradient-to-br from-tint to-tint border border-border">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-5 text-foreground"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" /></svg>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-tint to-tint border border-border">
          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-primary animate-pulse"></div>
          <span className="text-foreground text-sm font-medium">
            De nouveaux outils sont en préparation
          </span>
        </div>
      </div>
    </div>
  );
}
