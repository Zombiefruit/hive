import { Code, Group, Stack, Table, Text, Title, UnstyledButton, Badge, Progress } from "@mantine/core";
import { IconArrowLeft, IconRefresh, IconCpu } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface DebugEntry {
  timestamp: string;
  direction: "in" | "out";
  content: string;
}

interface ProcessInfo {
  pid: number;
  type: string;
  label: string;
  uptimeMs: number;
  rssKb: number | null;
}

interface ProcessStats {
  processes: ProcessInfo[];
  totalRssKb: number;
  count: number;
  selfRssKb: number;
}

function formatRss(kb: number | null): string {
  if (kb == null) return "—";
  if (kb >= 1048576) return `${(kb / 1048576).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb} KB`;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const TYPE_COLORS: Record<string, string> = {
  "poll-bridge": "blue",
  planning: "violet",
  ephemeral: "orange",
  work: "green",
  gh: "gray",
};

export function Debug() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [stats, setStats] = useState<ProcessStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLog = async () => {
    try {
      const res = await fetch("http://localhost:9876/api/debug");
      const data = await res.json();
      setEntries(data);
    } catch {}
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("http://localhost:9876/api/processes");
      const data = await res.json();
      setStats(data);
    } catch {}
  };

  useEffect(() => {
    fetchLog();
    fetchStats();
    const logInterval = setInterval(fetchLog, 3000);
    const statsInterval = setInterval(fetchStats, 5000);
    return () => { clearInterval(logInterval); clearInterval(statsInterval); };
  }, []);

  return (
    <div style={{ minHeight: "100%", background: "var(--aegen-void)" }}>
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
          borderBottom: "1px solid var(--aegen-glass-border)",
          background: "var(--aegen-glass-bg)",
          backdropFilter: "var(--aegen-glass-blur)",
          WebkitAppRegion: "drag",
        }}
      >
        <UnstyledButton onClick={() => navigate("/")} aria-label="Back to inbox" style={{ WebkitAppRegion: "no-drag", padding: 4 }}>
          <IconArrowLeft size={16} />
        </UnstyledButton>
        <Title order={4}>Debug</Title>
        <div style={{ flex: 1 }} />
        <UnstyledButton onClick={() => { fetchLog(); fetchStats(); }} aria-label="Refresh debug data" style={{ WebkitAppRegion: "no-drag", padding: 4 }}>
          <IconRefresh size={14} />
        </UnstyledButton>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        {/* ── Process Stats ── */}
        <div style={{ marginBottom: 24 }}>
          <Group gap="xs" mb="sm">
            <IconCpu size={16} />
            <Title order={5}>Process Monitor</Title>
            {stats && (
              <Text size="xs" c="dimmed">
                {stats.count} process{stats.count !== 1 ? "es" : ""} · {formatRss(stats.totalRssKb + stats.selfRssKb)} total
              </Text>
            )}
          </Group>

          {stats && (
            <Stack gap="sm">
              <Group gap="xl">
                <div>
                  <Text size="xs" c="dimmed">Main process</Text>
                  <Text size="sm" fw={600}>{formatRss(stats.selfRssKb)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Child processes</Text>
                  <Text size="sm" fw={600}>{formatRss(stats.totalRssKb)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Combined</Text>
                  <Text size="sm" fw={600}>{formatRss(stats.totalRssKb + stats.selfRssKb)}</Text>
                </div>
              </Group>

              {stats.processes.length > 0 ? (
                <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: "0.8rem" }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>PID</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Label</Table.Th>
                      <Table.Th>Uptime</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>RSS</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {stats.processes.map(p => (
                      <Table.Tr key={p.pid}>
                        <Table.Td ff="monospace">{p.pid}</Table.Td>
                        <Table.Td>
                          <Badge size="xs" variant="light" color={TYPE_COLORS[p.type] ?? "gray"}>
                            {p.type}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{p.label}</Table.Td>
                        <Table.Td>{formatUptime(p.uptimeMs)}</Table.Td>
                        <Table.Td style={{ textAlign: "right" }} ff="monospace">{formatRss(p.rssKb)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text size="xs" c="dimmed">No child processes currently tracked.</Text>
              )}
            </Stack>
          )}
        </div>

        {/* ── Bridge Log ── */}
        <Group gap="xs" mb="sm">
          <Title order={5}>Bridge Log</Title>
          <Text size="xs" c="dimmed">{entries.length} entries</Text>
        </Group>

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
                  background: entry.direction === "in" ? "rgba(74, 125, 255, 0.08)" : "var(--aegen-glass-bg)",
                  border: "1px solid var(--aegen-glass-border)",
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
