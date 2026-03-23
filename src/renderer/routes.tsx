import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Dashboard } from "./pages/index";
import { AgentDetail } from "./pages/agent/[agentId]";
import { History } from "./pages/history";
import { Notifications } from "./pages/notifications";
import { Debug } from "./pages/debug";

const router = createBrowserRouter([
  { path: "/", element: <Dashboard /> },
  { path: "/agent/:agentId", element: <AgentDetail /> },
  { path: "/history", element: <History /> },
  { path: "/notifications", element: <Notifications /> },
  { path: "/debug", element: <Debug /> },
]);

export function Routes() {
  return <RouterProvider router={router} />;
}
