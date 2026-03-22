import "./deck-mock"; // must be first — provides window.deck stub in browser mode
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
