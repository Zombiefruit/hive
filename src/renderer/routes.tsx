import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Dashboard } from "./pages/index";
import { AgentDetail } from "./pages/agent/[agentId]";
import { History } from "./pages/history";

const router = createBrowserRouter([
  { path: "/", element: <Dashboard /> },
  { path: "/agent/:agentId", element: <AgentDetail /> },
  { path: "/history", element: <History /> },
]);

export function Routes() {
  return <RouterProvider router={router} />;
}
