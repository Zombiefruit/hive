import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { Routes } from "./routes";
import { theme } from "./theme";
import { useIpcSync } from "./hooks/useIpcSync";
import { FloatingTrigger, FloatingPanel } from "./components/ManagerChat";

function AppInner() {
  useIpcSync();
  return (
    <>
      <Routes />
      <FloatingTrigger />
      <FloatingPanel />
    </>
  );
}

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <AppInner />
    </MantineProvider>
  );
}
