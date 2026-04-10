import { Group, Stack, Text } from "@mantine/core";
import { IconPlug, IconCheck, IconX, IconClock } from "@tabler/icons-react";
import { StatusDot } from "./StatusDot";
import { useState, useEffect } from "react";

interface McpServer {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
}

const statusConfig: Record<string, { color: string; label: string; icon: typeof IconCheck }> = {
  connected: { color: "green", label: "Active", icon: IconCheck },
  failed: { color: "red", label: "Failed", icon: IconX },
  "needs-auth": { color: "yellow", label: "Needs Auth", icon: IconClock },
  pending: { color: "blue", label: "Connecting", icon: IconClock },
  disabled: { color: "gray", label: "Disabled", icon: IconX },
};

export function IntegrationPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);

  useEffect(() => {
    window.deck?.getBridgeStatus?.().then((status: unknown) => {
      const s = status as { mcpServers?: McpServer[] } | null;
      if (s?.mcpServers) setServers(s.mcpServers);
    }).catch(() => {});

    const interval = setInterval(() => {
      window.deck?.getBridgeStatus?.().then((status: unknown) => {
        const s = status as { mcpServers?: McpServer[] } | null;
        if (s?.mcpServers) setServers(s.mcpServers);
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sort: connected first, then by name
  const sorted = [...servers].sort((a, b) => {
    if (a.status === "connected" && b.status !== "connected") return -1;
    if (b.status === "connected" && a.status !== "connected") return 1;
    return a.name.localeCompare(b.name);
  });

  const connectedCount = servers.filter(s => s.status === "connected").length;

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--aegen-glass-border)",
        background: "var(--aegen-glass-bg)", backdropFilter: "var(--aegen-glass-blur)",
        overflow: "hidden",
      }}
    >
      <Group
        p="sm"
        style={{ borderBottom: "1px solid var(--aegen-glass-border)" }}
      >
        <Text size="sm" fw={600}>MCP Connectors</Text>
        <Text size="xs" c="dimmed">{connectedCount}/{servers.length} active</Text>
      </Group>
      <Stack gap={0} style={{ maxHeight: 300, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="md">No MCP servers detected</Text>
        ) : sorted.map((server, i) => {
          const cfg = statusConfig[server.status] ?? statusConfig.pending;
          // Clean up server name: remove "claude.ai " prefix
          const name = server.name.replace(/^claude\.ai\s+/i, "").replace(/^claude_ai_/i, "");
          return (
            <div
              key={server.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderBottom: i < sorted.length - 1 ? "1px solid rgba(68, 73, 85, 0.12)" : undefined,
              }}
            >
              <IconPlug size={12} color="var(--aegen-dust-gray)" style={{ flexShrink: 0 }} />
              <Text size="xs" fw={500} truncate style={{ flex: 1 }}>{name}</Text>
              <Group gap={4}>
                <StatusDot status={server.status === "connected" ? "active" : server.status === "failed" ? "errored" : "idle"} size={5} pulse={false} />
                <Text size="xs" c={cfg.color} style={{ fontSize: "0.6rem" }}>{cfg.label}</Text>
              </Group>
            </div>
          );
        })}
      </Stack>
    </div>
  );
}
