import Mascotte from './Mascotte/Mascotte'

export default function MobileHeader() {
  return (
    <header className="lg:hidden bg-surface border border-border rounded-2xl p-4 mb-6 mt-4 flex items-center justify-between">
      <Mascotte humeur="au repos" taille={40} decorative />
      <h2 className="text-xl font-semibold text-foreground">Lohni</h2>
      <button className="p-2 hover:bg-tint rounded-xl duration-300 transition-[transform,opacity]" aria-label="Menu">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
    </header>
  );
}