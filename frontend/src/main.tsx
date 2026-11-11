import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routes } from "./routes";
import "./index.css";
import { navigationTransitions } from "./navigationTransitions";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={navigationTransitions(createBrowserRouter(routes))} />
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(error => console.error('Cache hors ligne indisponible.', error));
  });
}
