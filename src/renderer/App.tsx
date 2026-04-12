import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "./aegen.css";
import { Routes } from "./routes";
import { theme } from "./theme";
import { useIpcSync } from "./hooks/useIpcSync";
import { OrchestratorOrbiter } from "./components/Orbiter/OrchestratorOrbiter";
import { useManagerStore } from "./stores/manager-store";
import { useState, useEffect } from "react";

const DOCKED_WIDTH = 480;
const HIDE_ORB_ROUTES = new Set(["/settings", "/onboarding"]);

function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const update = () => setRoute(window.location.hash.replace(/^#/, "") || "/");
    // React Router hash router uses pushState — listen to both popstate and hashchange
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    // Also poll since pushState doesn't fire events
    const interval = setInterval(update, 200);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
      clearInterval(interval);
    };
  }, []);
  return route;
}

function AppInner() {
  useIpcSync();
  const isPinned = useManagerStore((s) => s.isPinned);
  const route = useHashRoute();
  const hideOrb = HIDE_ORB_ROUTES.has(route);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ flex: 1, minWidth: 0, transition: "margin-right 0.2s ease", marginRight: isPinned ? DOCKED_WIDTH : 0 }}>
        <Routes />
      </div>
      <OrchestratorOrbiter hidden={hideOrb} />
    </div>
  );
}

// Global scrollbar styles — hide ugly native scrollbars, use thin styled ones
// Plus shared card hover/focus styles used by .deck-card and .notif-card
// Scrollbar colors adapt to light/dark via Mantine's data-mantine-color-scheme selector
const SCROLLBAR_CSS = `
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }
  [data-mantine-color-scheme="dark"] * {
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  }
  *::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  *::-webkit-scrollbar-track {
    background: transparent;
  }
  *::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3);
  }
  [data-mantine-color-scheme="dark"] *::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
  }
  [data-mantine-color-scheme="dark"] *::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <style>{SCROLLBAR_CSS}</style>
      <AppInner />
    </MantineProvider>
  );
}
