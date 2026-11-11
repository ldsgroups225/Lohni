import { Link } from 'react-router-dom'

export default function NotFound() {
  return <main className="min-h-dvh bg-background text-foreground px-6 flex flex-col items-center justify-center text-center gap-6">
    <h1 className="text-7xl font-bold">404</h1>
    <h2 className="text-3xl">Cette page est introuvable</h2>
    <p className="text-muted">Retrouve tes révisions depuis l’accueil.</p>
    <nav aria-label="Liens utiles" className="flex flex-wrap justify-center gap-4">
      <Link className="text-primary underline" to="/">Retour à l’accueil</Link>
      <Link className="text-primary underline" to="/chat">Discussion</Link>
      <Link className="text-primary underline" to="/quiz">Faire un quiz</Link>
    </nav>
    <p className="text-muted">« Chaque erreur permet d’apprendre »</p>
  </main>
}
