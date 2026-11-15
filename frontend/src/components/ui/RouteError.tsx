import { Link, useRouteError } from 'react-router-dom'
import { ErrorNotice } from './ErrorNotice'

// Écran de secours de l'application : un plantage d'écran reste dans l'univers Lohni au lieu de la page développeur de React Router.
export default function RouteError() {
  console.error(useRouteError())
  return <main className="loop-screen ui-page"><div className="ui-page-body space-y-4">
    <h1 className="ui-title">Oups, un souci est survenu</h1>
    <ErrorNotice message="Cet écran n’a pas pu s’afficher. Recharge la page ; tes données sont conservées." retryLabel="Recharger" onRetry={() => window.location.reload()} />
    <Link className="ui-button-secondary" to="/">Retour à l’accueil</Link>
  </div></main>
}
