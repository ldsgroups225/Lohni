import Sidebar from "./components/Sidebar";
import { Suspense } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { LoadingState } from "./components/ui/LoadingState";
import { AdaptiveToastProvider } from '@cognicatch/react';
import { CompanionProvider } from "./components/Companion/CompanionProvider";
import CompanionDock from "./components/Companion/CompanionDock";

export default function App() {
  return (
    <CompanionProvider>
      <AdaptiveToastProvider
        theme="system"
      />
      <div className="bg-background text-foreground min-h-dvh flex flex-col">
        <Sidebar />
        <div className="flex-1 relative">
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
