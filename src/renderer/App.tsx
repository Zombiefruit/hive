import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "./aegen.css";
import { Routes } from "./routes";
import { theme } from "./theme";
import { useIpcSync } from "./hooks/useIpcSync";
import { OrchestratorOrbiter } from "./components/Orbiter/OrchestratorOrbiter";
import { useManagerStore } from "./stores/manager-store";

const DOCKED_WIDTH = 480;

function AppInner() {
  useIpcSync();
  const isPinned = useManagerStore((s) => s.isPinned);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ flex: 1, minWidth: 0, transition: "margin-right 0.2s ease", marginRight: isPinned ? DOCKED_WIDTH : 0 }}>
        <Routes />
      </div>
      <OrchestratorOrbiter />
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
  .deck-card:hover { background-color: var(--mantine-color-default-hover) !important; }
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .deck-card:focus-visible { outline: 2px solid var(--mantine-color-blue-5); outline-offset: 2px; }
  .notif-card:hover { background-color: var(--mantine-color-default-hover) !important; }
  .notif-card:focus-visible { outline: 2px solid var(--mantine-color-blue-5); outline-offset: 2px; }
`;

export function App() {
  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <style>{SCROLLBAR_CSS}</style>
      <AppInner />
    </MantineProvider>
  );
}
