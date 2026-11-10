import Sidebar from "./components/Sidebar";
import { Outlet } from "react-router-dom";
import { AdaptiveToastProvider } from '@cognicatch/react';
import { CompanionProvider } from "./components/Companion/CompanionProvider";
import CompanionDock from "./components/Companion/CompanionDock";

export default function App() {
  return (
    <CompanionProvider>
      <AdaptiveToastProvider
        theme="dark"
      />
      <div className="bg-background text-foreground min-h-screen flex flex-col">
        <Sidebar />
        <div className="flex-1 relative bg-black text-stone-300">
          <Outlet />
        </div>
      </div>
      <CompanionDock />
    </CompanionProvider>
  );
}
