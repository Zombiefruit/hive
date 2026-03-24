import { Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconClock, IconFileText, IconTerminal2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";

interface HistoricalSession {
  sessionId: string;
  firstPrompt: string;
  fileSize: number;
  lastModified: number;
  cwd: string;
  messageCount: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatAge(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<HistoricalSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.deck.listAllSessions();
        setSessions(result ?? []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--mantine-color-body)" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <AppHeader
          rightContent={
            <Text size="xs" c="dimmed">{sessions.length} sessions</Text>
          }
        />
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        {loading ? (
          <Text c="dimmed" ta="center" py="xl">Loading sessions...</Text>
        ) : sessions.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No sessions found</Text>
        ) : (
          <Stack gap={2}>
            {sessions.map((session) => (
              <UnstyledButton
                key={session.sessionId}
                onClick={() => {
                  // TODO: load this session into the agent view
                  // For now, just show it — we need to create an agent record and enrich it
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
                  backgroundColor: "var(--mantine-color-dark-7)",
                  transition: "border-color 0.1s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--mantine-color-default-border)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)"; }}
              >
                <IconFileText size={16} color="var(--mantine-color-dimmed)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={500} lineClamp={1}>
                    {session.firstPrompt}
                  </Text>
                  <Group gap="md" mt={4}>
                    <Group gap={4}>
                      <IconTerminal2 size={11} color="var(--mantine-color-dimmed)" />
                      <Text size="xs" c="dimmed" ff="monospace">
                        {session.cwd.replace(/^\/Users\/\w+\//, "~/")}
                      </Text>
                    </Group>
                    <Group gap={4}>
                      <IconClock size={11} color="var(--mantine-color-dimmed)" />
                      <Text size="xs" c="dimmed">{formatAge(session.lastModified)}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">{session.messageCount}+ messages</Text>
                    <Text size="xs" c="dimmed">{formatSize(session.fileSize)}</Text>
                  </Group>
                </div>
                <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>
                  {session.sessionId.slice(0, 8)}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </div>
    </div>
  );
}
