import Sidebar from "./components/Sidebar";
import { Outlet, useLocation } from "react-router-dom";
import { AdaptiveToastProvider } from '@cognicatch/react';
import { CompanionProvider } from "./components/Companion/CompanionProvider";
import CompanionDock from "./components/Companion/CompanionDock";

export default function App() {
  const { pathname } = useLocation()
  return (
    <CompanionProvider>
      <AdaptiveToastProvider
        theme="dark"
      />
      <div className="bg-background text-foreground min-h-screen flex flex-col">
        <Sidebar />
        <div key={pathname} className="motion-route flex-1 relative">
          <Outlet />
        </div>
      </div>
      <CompanionDock />
    </CompanionProvider>
  );
}
