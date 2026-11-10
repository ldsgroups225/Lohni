import Mascotte from './Mascotte/Mascotte'

export default function MobileHeader() {
  return (
    <header className="lg:hidden bg-surface border border-border rounded-2xl p-4 flex items-center gap-3">
      <Mascotte humeur="au repos" taille={40} decorative />
      <h2 className="text-xl font-semibold text-foreground">Lohni</h2>
    </header>
  );
}
