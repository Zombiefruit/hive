import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { useEffect, useState } from "react";
import { Loader, Center } from "@mantine/core";
import { Dashboard } from "./pages/index";
import { AgentDetail } from "./pages/agent/[agentId]";
import { History } from "./pages/history";
import { Notifications } from "./pages/notifications";
import { Schedule } from "./pages/schedule";
import { Debug } from "./pages/debug";
import { TaskDetail } from "./pages/task/[taskId]";
import { Settings } from "./pages/settings";
import { Onboarding } from "./pages/onboarding";

/**
 * Guard that redirects to /onboarding if no config exists.
 * Wraps all app routes except /onboarding itself.
 */
function ConfigGuard() {
  const [status, setStatus] = useState<"loading" | "configured" | "needs-onboarding">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const has = await window.deck.hasConfig();
        if (!cancelled) setStatus(has ? "configured" : "needs-onboarding");
      } catch {
        // If the call fails (e.g. browser mock), assume configured
        if (!cancelled) setStatus("configured");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "loading") {
    return (
      <Center style={{ height: "100vh" }}>
        <Loader size="sm" color="blue" />
      </Center>
    );
  }

  if (status === "needs-onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <ConfigGuard />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/agent/:agentId", element: <AgentDetail /> },
      { path: "/history", element: <History /> },
      { path: "/notifications", element: <Notifications /> },
      { path: "/schedule", element: <Schedule /> },
      { path: "/task/:taskId", element: <TaskDetail /> },
      { path: "/debug", element: <Debug /> },
      { path: "/settings", element: <Settings /> },
    ],
  },
  { path: "/onboarding", element: <Onboarding /> },
]);

export function Routes() {
  return <RouterProvider router={router} />;
}
