import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { Routes } from "./routes";
import { theme } from "./theme";

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Routes />
    </MantineProvider>
  );
}
