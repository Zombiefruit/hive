import { Accordion, Avatar, Badge, Button, Group, Loader, Progress, SimpleGrid, Stack, Text, Tooltip, Paper } from "@mantine/core";
import { IconBuilding, IconRefresh, IconTarget, IconCode, IconUsers, IconMessageCircle, IconChevronRight } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { Markdown } from "../components/Markdown";
import type { BusinessContext } from "../../shared/business-context-types";

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <Paper p="sm" radius="md" style={{ background: "var(--aegen-glass-bg)", backdropFilter: "var(--aegen-glass-blur)", border: `1px solid var(--aegen-glass-border)` }}>
      <Text size="xl" fw={700} c={`${color}.5`}>{value}</Text>
      <Text size="xs" c="dimmed">{label}</Text>
    </Paper>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const ROLE_COLORS: Record<string, string> = {
  manager: "red", lead: "orange", pm: "violet", peer: "blue",
  "Engineering Manager": "red", "Tech Lead": "orange", "Product Manager": "violet",
};

function roleColor(role: string): string {
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (role.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "gray";
}

export default function BusinessContextPage() {
  const [context, setContext] = useState<BusinessContext | null>(null);
  const [raw, setRaw] = useState("");
  const [localRefreshing, setLocalRefreshing] = useState(false);

  useEffect(() => {
    window.deck?.getBusinessContext?.().then((c: string) => {
      if (!c) return;
      setRaw(c);
      try { setContext(JSON.parse(c)); } catch { setContext(null); }
    }).catch(() => {});

    const unsub = window.deck?.onBusinessContextDraft?.((draft: string) => {
      setRaw(draft);
      try { setContext(JSON.parse(draft)); } catch { setContext(null); }
      setLocalRefreshing(false);
    });
    return () => { unsub?.(); };
  }, []);

  const handleRefresh = useCallback(async () => {
    setLocalRefreshing(true);
    try {
      const result = await window.deck?.refreshBusinessContext?.();
      if (result) {
        setRaw(result);
        try { setContext(JSON.parse(result)); } catch { setContext(null); }
      }
    } catch {}
    setLocalRefreshing(false);
  }, []);

  const statusColor = (s: string) => s === "active" || s === "in-flight" ? "green" : s === "shipped" || s === "completed" ? "blue" : "gray";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-void)" }}>
      <AppHeader rightContent={
        <Button size="xs" variant="filled" color="blue"
          leftSection={localRefreshing ? <Loader size={12} color="white" /> : <IconRefresh size={14} />}
          onClick={handleRefresh} disabled={localRefreshing}
        >
          {localRefreshing ? "Scanning..." : (context || raw) ? "Refresh" : "Generate"}
        </Button>
      } />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {!context && !raw && !localRefreshing && (
          <Stack align="center" py="xl" gap="sm">
            <IconBuilding size={32} color="var(--aegen-dust-gray)" />
            <Text size="sm" c="dimmed">No business context yet.</Text>
            <Text size="xs" c="dimmed">Click Generate to scan your workspace.</Text>
          </Stack>
        )}

        {localRefreshing && !context && (
          <Stack align="center" py="xl" gap="sm">
            <Loader size={24} />
            <Text size="sm" c="dimmed">Scanning sources...</Text>
          </Stack>
        )}

        {context && (
          <>
            {/* Company header */}
            <Paper p="md" radius="md" mb={12} style={{ borderLeft: "4px solid var(--mantine-color-blue-5)" }}>
              <Text size="lg" fw={700}>{context.company.name}</Text>
              <Text size="sm" c="dimmed">{context.company.mission}</Text>
              <Group gap={8} mt={6}>
                <Badge size="sm" variant="light" color="blue">{context.company.stage}</Badge>
                <Text size="xs" c="dimmed">{context.company.market}</Text>
              </Group>
            </Paper>

            {/* Stats strip */}
            <SimpleGrid cols={4} mb={12} spacing="sm">
              <StatCard label="Priorities" value={context.priorities?.length ?? 0} color="red" />
              <StatCard label="Team" value={context.team?.length ?? 0} color="blue" />
              <StatCard label="Product Areas" value={context.productFocus?.length ?? 0} color="green" />
              <StatCard label="Customer Themes" value={context.customerIntel?.length ?? 0} color="orange" />
            </SimpleGrid>

            {/* Top 3 priorities */}
            {context.priorities?.length > 0 && (
              <Paper p="md" radius="md" mb={12}>
                <Group gap={8} mb={8}>
                  <IconTarget size={14} color="var(--mantine-color-red-5)" />
                  <Text size="xs" fw={600} c="dimmed" style={{ textTransform: "uppercase" }}>Top Priorities</Text>
                </Group>
                {context.priorities.slice(0, 3).map((p, i) => (
                  <Group key={i} gap={10} mb={6} wrap="nowrap" align="flex-start">
                    <Badge size="sm" variant="filled" color="red" circle style={{ flexShrink: 0, marginTop: 2 }}>{i + 1}</Badge>
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>{p.title}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>{p.description}</Text>
                    </div>
                  </Group>
                ))}
              </Paper>
            )}

            {/* Team avatars */}
            {context.team?.length > 0 && (
              <Paper p="md" radius="md" mb={12}>
                <Group gap={8} mb={8}>
                  <IconUsers size={14} color="var(--mantine-color-blue-5)" />
                  <Text size="xs" fw={600} c="dimmed" style={{ textTransform: "uppercase" }}>Key People</Text>
                </Group>
                <Group gap={8}>
                  {context.team.map((t, i) => (
                    <Tooltip key={i} label={`${t.name} — ${t.role}${t.focus ? `\n${t.focus}` : ""}`} multiline withArrow>
                      <Avatar size="md" radius="xl" color={roleColor(t.role)}>
                        {initials(t.name)}
                      </Avatar>
                    </Tooltip>
                  ))}
                </Group>
              </Paper>
            )}

            {/* Expandable detail sections */}
            <Accordion variant="separated" radius="md">
              {context.productFocus?.length > 0 && (
                <Accordion.Item value="product">
                  <Accordion.Control icon={<IconCode size={14} />}>
                    <Group gap={8}>
                      <Text size="sm" fw={500}>Product Focus</Text>
                      <Badge size="xs" variant="light" color="gray">{context.productFocus.length}</Badge>
                      <Text size="xs" c="dimmed">
                        {context.productFocus.filter(p => p.status === "active").length} active, {context.productFocus.filter(p => p.status === "shipped").length} shipped
                      </Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={6}>
                      {context.productFocus.map((p, i) => (
                        <Group key={i} gap={8} wrap="nowrap">
                          <Badge size="xs" variant="light" color={statusColor(p.status)} style={{ flexShrink: 0 }}>{p.status}</Badge>
                          <Text size="xs" fw={500}>{p.area}</Text>
                          {p.details && <Text size="xs" c="dimmed" truncate>— {p.details}</Text>}
                        </Group>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {context.customerIntel?.length > 0 && (
                <Accordion.Item value="customer">
                  <Accordion.Control icon={<IconMessageCircle size={14} />}>
                    <Group gap={8}>
                      <Text size="sm" fw={500}>Customer Intelligence</Text>
                      <Badge size="xs" variant="light" color="gray">{context.customerIntel.length}</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={6}>
                      {context.customerIntel.map((c, i) => (
                        <Group key={i} gap={8} wrap="nowrap" align="flex-start">
                          <Badge size="xs" variant="light" color={c.frequency === "high" ? "red" : c.frequency === "medium" ? "yellow" : "gray"} style={{ flexShrink: 0 }}>
                            {c.frequency}
                          </Badge>
                          <div style={{ minWidth: 0 }}>
                            <Text size="xs" fw={500}>{c.theme}</Text>
                            {c.details && <Text size="xs" c="dimmed" lineClamp={2}>{c.details}</Text>}
                          </div>
                        </Group>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {context.technicalContext?.length > 0 && (
                <Accordion.Item value="technical">
                  <Accordion.Control icon={<IconCode size={14} />}>
                    <Group gap={8}>
                      <Text size="sm" fw={500}>Technical Context</Text>
                      <Badge size="xs" variant="light" color="gray">{context.technicalContext.length}</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={6}>
                      {context.technicalContext.map((t, i) => (
                        <Group key={i} gap={8} wrap="nowrap">
                          <Badge size="xs" variant="light" color={statusColor(t.status)} style={{ flexShrink: 0 }}>{t.status}</Badge>
                          <Text size="xs" fw={500}>{t.area}</Text>
                          {t.details && <Text size="xs" c="dimmed" truncate>— {t.details}</Text>}
                        </Group>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {context.priorities?.length > 3 && (
                <Accordion.Item value="all-priorities">
                  <Accordion.Control icon={<IconTarget size={14} />}>
                    <Group gap={8}>
                      <Text size="sm" fw={500}>All Priorities</Text>
                      <Badge size="xs" variant="light" color="gray">{context.priorities.length}</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={6}>
                      {context.priorities.map((p, i) => (
                        <Group key={i} gap={8} wrap="nowrap" align="flex-start">
                          <Badge size="xs" variant="filled" color="red" circle style={{ flexShrink: 0 }}>{i + 1}</Badge>
                          <div style={{ minWidth: 0 }}>
                            <Text size="xs" fw={500}>{p.title}</Text>
                            <Text size="xs" c="dimmed" lineClamp={1}>{p.description}</Text>
                            {p.owner && <Text size="xs" c="dimmed" fs="italic">Owner: {p.owner}</Text>}
                          </div>
                        </Group>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}
            </Accordion>

            <Text size="xs" c="dimmed" ta="center" mt={12}>Last updated: {context.lastUpdated}</Text>
          </>
        )}

        {/* Markdown fallback for old format */}
        {!context && raw && (
          <Paper p="md" radius="md">
            <Markdown content={raw} />
            <Text size="xs" c="dimmed" ta="center" mt={12}>Click Refresh to convert to structured format</Text>
          </Paper>
        )}
      </div>
    </div>
  );
}
