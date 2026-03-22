import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { Routes } from "./routes";
import { theme } from "./theme";
import { useIpcSync } from "./hooks/useIpcSync";

function AppInner() {
  useIpcSync();
  return <Routes />;
}

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <AppInner />
    </MantineProvider>
  );
}
