import Sidebar from "./components/Sidebar";
import { Suspense } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { LoadingState } from "./components/ui/LoadingState";
import { AdaptiveToastProvider } from '@cognicatch/react';
import { CompanionProvider } from "./components/Companion/CompanionProvider";
import CompanionDock from "./components/Companion/CompanionDock";

export default function App() {
  const { pathname } = useLocation()
  return (
    <CompanionProvider>
      <AdaptiveToastProvider
        theme="system"
      />
      <div className="bg-background text-foreground min-h-screen flex flex-col">
        <Sidebar />
        <div key={pathname} className="motion-route flex-1 relative">
          <Suspense fallback={<LoadingState fullPage />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
      <CompanionDock />
      <ScrollRestoration />
    </CompanionProvider>
  );
}
