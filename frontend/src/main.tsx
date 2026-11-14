import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routes } from "./routes";
import "./index.css";
import { prepareRevisionStartup } from "./lib/api";
import { navigationTransitions } from "./navigationTransitions";

prepareRevisionStartup();

const root = document.getElementById("root")
if (!root) throw new Error("Élément racine introuvable")
ReactDOM.createRoot(root).render(
  <RouterProvider router={navigationTransitions(createBrowserRouter(routes))} />
);
// L’accueil retire l’écran de démarrage quand il est prêt ; ailleurs il part tout de suite, et jamais plus de 5 s.
const hideSplash = () => document.getElementById('splash')?.remove()
if (location.pathname === '/') setTimeout(hideSplash, 5000)
else hideSplash()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(error => console.error('Cache hors ligne indisponible.', error));
  });
}
