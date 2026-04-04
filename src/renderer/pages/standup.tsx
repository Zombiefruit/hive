import { Badge, Button, Group, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconCopy, IconRefresh, IconCheck } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { buildStandupReport, formatStandupText } from "../../shared/standup";
import type { StandupReport, SummaryNotification } from "../../shared/standup";
import { PRIORITY_MANTINE } from "../../shared/ui-constants";

const priorityColors = PRIORITY_MANTINE as Record<string, string>;

export default function StandupPage() {
  const [report, setReport] = useState<StandupReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [blockerInput, setBlockerInput] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.deck.getNotifications();
      const items: SummaryNotification[] = Array.isArray(result)
        ? result
        : (result as { items?: SummaryNotification[] }).items ?? [];
      const built = buildStandupReport(items, new Date());
      setReport(built);
    } catch {
      setReport({ yesterday: [], today: [], blockers: [], date: new Date().toISOString().slice(0, 10) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleCopy = useCallback(async () => {
    if (!report) return;
    const text = formatStandupText(report);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  const handleAddBlocker = useCallback(() => {
    const trimmed = blockerInput.trim();
    if (!trimmed || !report) return;
    setReport({ ...report, blockers: [...report.blockers, trimmed] });
    setBlockerInput("");
  }, [blockerInput, report]);

  const handleRemoveBlocker = useCallback(
    (index: number) => {
      if (!report) return;
      setReport({ ...report, blockers: report.blockers.filter((_, i) => i !== index) });
    },
    [report],
  );

  const formattedDate = report
    ? new Date(report.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <AppHeader />

      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        {/* Title row */}
        <Group justify="space-between" mb={24}>
          <Text size="xl" fw={700}>
            {report ? `Standup for ${formattedDate}` : "Daily Standup"}
          </Text>
          <Group gap={8}>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={fetchReport}
              loading={loading}
            >
              Regenerate
            </Button>
            <Button
              size="xs"
              leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              color={copied ? "green" : "blue"}
              onClick={handleCopy}
              disabled={!report}
            >
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
          </Group>
        </Group>

        {report && (
          <Stack gap={28}>
            {/* Yesterday section */}
            <section>
              <Text size="sm" fw={600} mb={8} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                Yesterday
              </Text>
              {report.yesterday.length === 0 ? (
                <Text size="sm" c="dimmed" fs="italic">
                  No tracked activity yesterday.
                </Text>
              ) : (
                <Stack gap={6}>
                  {report.yesterday.map((item, i) => (
                    <Group key={i} gap={8} wrap="nowrap">
                      <Text c="dimmed" size="sm">
                        &bull;
                      </Text>
                      <Badge size="xs" variant="light" color="violet">
                        {item.source}
                      </Badge>
                      <Text size="sm">{item.title}</Text>
                      <Text size="xs" c="dimmed">
                        &mdash; {item.event}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </section>

            {/* Today section */}
            <section>
              <Text size="sm" fw={600} mb={8} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                Today
              </Text>
              {report.today.length === 0 ? (
                <Text size="sm" c="dimmed" fs="italic">
                  No active tasks for today.
                </Text>
              ) : (
                <Stack gap={6}>
                  {report.today.map((item, i) => (
                    <Group key={i} gap={8} wrap="nowrap">
                      <Text c="dimmed" size="sm">
                        &bull;
                      </Text>
                      <Badge size="xs" variant="light" color={priorityColors[item.priority] ?? "gray"}>
                        {item.priority}
                      </Badge>
                      <Text size="sm">{item.title}</Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </section>

            {/* Blockers section */}
            <section>
              <Text size="sm" fw={600} mb={8} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
                Blockers
              </Text>
              {report.blockers.length === 0 ? (
                <Text size="sm" c="dimmed" fs="italic" mb={8}>
                  None
                </Text>
              ) : (
                <Stack gap={6} mb={8}>
                  {report.blockers.map((blocker, i) => (
                    <Group key={i} gap={8} wrap="nowrap">
                      <Text c="dimmed" size="sm">
                        &bull;
                      </Text>
                      <Text size="sm" style={{ flex: 1 }}>
                        {blocker}
                      </Text>
                      <UnstyledButton
                        onClick={() => handleRemoveBlocker(i)}
                        style={{ fontSize: "0.7rem", color: "var(--mantine-color-dimmed)" }}
                      >
                        remove
                      </UnstyledButton>
                    </Group>
                  ))}
                </Stack>
              )}
              <Group gap={8}>
                <TextInput
                  placeholder="Add blocker..."
                  size="xs"
                  value={blockerInput}
                  onChange={(e) => setBlockerInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddBlocker();
                  }}
                  style={{ flex: 1, maxWidth: 400 }}
                />
                <Button size="xs" variant="light" onClick={handleAddBlocker} disabled={!blockerInput.trim()}>
                  Add
                </Button>
              </Group>
            </section>
          </Stack>
        )}
      </div>
    </div>
  );
}
