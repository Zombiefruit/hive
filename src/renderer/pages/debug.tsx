import { Code, Group, ScrollArea, Stack, Text, Title, UnstyledButton, Badge } from "@mantine/core";
import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface DebugEntry {
  timestamp: string;
  direction: "in" | "out";
  content: string;
}

export function Debug() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = async () => {
    try {
      const res = await fetch("http://localhost:9876/api/debug");
      const data = await res.json();
      setEntries(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchLog();
    const interval = setInterval(fetchLog, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--mantine-color-body)" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          padding: "8px 24px",
          paddingLeft: 80,
          gap: 12,
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitAppRegion: "drag",
        }}
      >
        <UnstyledButton onClick={() => navigate("/")} style={{ WebkitAppRegion: "no-drag", padding: 4 }}>
          <IconArrowLeft size={16} />
        </UnstyledButton>
        <Title order={4}>MCP Bridge Debug</Title>
        <Text size="xs" c="dimmed">{entries.length} entries</Text>
        <div style={{ flex: 1 }} />
        <UnstyledButton onClick={fetchLog} style={{ WebkitAppRegion: "no-drag", padding: 4 }}>
          <IconRefresh size={14} />
        </UnstyledButton>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        {loading ? (
          <Text c="dimmed" ta="center" py="xl">Loading...</Text>
        ) : entries.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No bridge activity yet. The MCP bridge starts ~15s after app launch.</Text>
        ) : (
          <Stack gap={4}>
            {entries.map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  backgroundColor: entry.direction === "in" ? "color-mix(in srgb, var(--mantine-color-blue-5) 10%, transparent)" : "var(--mantine-color-dark-7)",
                  border: `1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)`,
                }}
              >
                <Group gap="xs" mb={4}>
                  <Badge
                    size="xs"
                    variant="light"
                    color={entry.direction === "in" ? "blue" : "green"}
                  >
                    {entry.direction === "in" ? "→ PROMPT" : "← RESPONSE"}
                  </Badge>
                  <Text size="xs" c="dimmed" ff="monospace">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </Text>
                </Group>
                <Code
                  block
                  style={{
                    fontSize: "0.7rem",
                    maxHeight: 200,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {entry.content}
                </Code>
              </div>
            ))}
          </Stack>
        )}
      </div>
    </div>
  );
}
