import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Dashboard } from "./pages/index";
import { AgentDetail } from "./pages/agent/[agentId]";

const router = createBrowserRouter([
  { path: "/", element: <Dashboard /> },
  { path: "/agent/:agentId", element: <AgentDetail /> },
]);

export function Routes() {
  return <RouterProvider router={router} />;
}
