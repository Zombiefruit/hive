import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { Routes } from "./routes";
import { theme } from "./theme";
import { useIpcSync } from "./hooks/useIpcSync";
import { FloatingTrigger, FloatingPanel } from "./components/ManagerChat";
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
      <FloatingTrigger />
      <FloatingPanel dockedWidth={DOCKED_WIDTH} />
    </div>
  );
}

// Global scrollbar styles — hide ugly native scrollbars, use thin styled ones
const SCROLLBAR_CSS = `
  * {
    scrollbar-width: thin;
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
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
`;

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <style>{SCROLLBAR_CSS}</style>
      <AppInner />
    </MantineProvider>
  );
}
