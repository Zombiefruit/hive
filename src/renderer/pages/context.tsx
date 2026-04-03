import { Badge, Button, Group, Loader, Stack, Text } from "@mantine/core";
import { IconBuilding, IconRefresh, IconTarget, IconCode, IconUsers, IconMessageCircle } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { GlobalLoadingBanner } from "../components/GlobalLoadingBanner";
import { Markdown } from "../components/Markdown";
import type { BusinessContext } from "../../shared/business-context-types";

function Section({ title, icon: Icon, children }: { title: string; icon: React.FC<{ size?: number }>; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10, marginBottom: 10,
      backgroundColor: "var(--mantine-color-default)",
      border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
    }}>
      <Group gap={8} mb={8}>
        <Icon size={14} />
        <Text size="xs" fw={600} c="dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</Text>
      </Group>
      {children}
    </div>
  );
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader rightContent={
        <Button
          size="xs" variant="filled" color="blue"
          leftSection={localRefreshing ? <Loader size={12} color="white" /> : <IconRefresh size={14} />}
          onClick={handleRefresh} disabled={localRefreshing}
        >
          {localRefreshing ? "Scanning..." : (context || raw) ? "Refresh" : "Generate"}
        </Button>
      } />
      <GlobalLoadingBanner />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {!context && !raw && !localRefreshing && (
          <Stack align="center" py="xl" gap="sm">
            <IconBuilding size={32} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed">No business context yet.</Text>
            <Text size="xs" c="dimmed">Click Generate to scan Slack, Notion, Linear, and Gong for company context.</Text>
          </Stack>
        )}

        {localRefreshing && !context && (
          <Stack align="center" py="xl" gap="sm">
            <Loader size={24} />
            <Text size="sm" c="dimmed">Scanning sources for business context...</Text>
          </Stack>
        )}

        {context && (
          <>
            {/* Company */}
            <Section title="Company" icon={IconBuilding}>
              <Text size="sm" fw={600} mb={4}>{context.company.name}</Text>
              <Text size="xs" c="dimmed" mb={2}>{context.company.mission}</Text>
              <Text size="xs" c="dimmed" mb={2}>{context.company.market}</Text>
              <Badge size="xs" variant="light" color="blue">{context.company.stage}</Badge>
            </Section>

            {/* Priorities */}
            {context.priorities?.length > 0 && (
              <Section title="Current Priorities" icon={IconTarget}>
                {context.priorities.map((p, i) => (
                  <Group key={i} gap={8} mb={6} wrap="nowrap" align="flex-start">
                    <Badge size="xs" variant="filled" color="blue" circle style={{ flexShrink: 0, marginTop: 3 }}>{i + 1}</Badge>
                    <div>
                      <Text size="xs" fw={600}>{p.title}</Text>
                      <Text size="xs" c="dimmed">{p.description}</Text>
                      {p.owner && <Text size="xs" c="dimmed" fs="italic">Owner: {p.owner}</Text>}
                    </div>
                  </Group>
                ))}
              </Section>
            )}

            {/* Product Focus */}
            {context.productFocus?.length > 0 && (
              <Section title="Product Focus" icon={IconCode}>
                {context.productFocus.map((p, i) => (
                  <Group key={i} gap={8} mb={4} wrap="nowrap">
                    <Badge size="xs" variant="light" color={p.status === "active" ? "green" : p.status === "shipped" ? "blue" : "gray"}>
                      {p.status}
                    </Badge>
                    <Text size="xs">{p.area}</Text>
                    {p.details && <Text size="xs" c="dimmed">— {p.details}</Text>}
                  </Group>
                ))}
              </Section>
            )}

            {/* Team */}
            {context.team?.length > 0 && (
              <Section title="Key People" icon={IconUsers}>
                {context.team.map((t, i) => (
                  <Group key={i} gap={8} mb={4}>
                    <Text size="xs" fw={500}>{t.name}</Text>
                    <Badge size="xs" variant="outline" color="gray">{t.role}</Badge>
                    {t.focus && <Text size="xs" c="dimmed">— {t.focus}</Text>}
                  </Group>
                ))}
              </Section>
            )}

            {/* Customer Intel */}
            {context.customerIntel?.length > 0 && (
              <Section title="Customer Intelligence" icon={IconMessageCircle}>
                {context.customerIntel.map((c, i) => (
                  <Group key={i} gap={8} mb={4} wrap="nowrap" align="flex-start">
                    <Badge size="xs" variant="light" color={c.frequency === "high" ? "red" : c.frequency === "medium" ? "yellow" : "gray"} style={{ flexShrink: 0 }}>
                      {c.frequency}
                    </Badge>
                    <div>
                      <Text size="xs" fw={500}>{c.theme}</Text>
                      {c.details && <Text size="xs" c="dimmed">{c.details}</Text>}
                    </div>
                  </Group>
                ))}
              </Section>
            )}

            {/* Technical Context */}
            {context.technicalContext?.length > 0 && (
              <Section title="Technical Context" icon={IconCode}>
                {context.technicalContext.map((t, i) => (
                  <Group key={i} gap={8} mb={4} wrap="nowrap">
                    <Badge size="xs" variant="light" color={t.status === "in-flight" ? "orange" : t.status === "completed" ? "green" : "gray"}>
                      {t.status}
                    </Badge>
                    <Text size="xs">{t.area}</Text>
                    {t.details && <Text size="xs" c="dimmed">— {t.details}</Text>}
                  </Group>
                ))}
              </Section>
            )}

            <Text size="xs" c="dimmed" ta="center" mt={12}>Last updated: {context.lastUpdated}</Text>
          </>
        )}

        {/* Markdown fallback for old format */}
        {!context && raw && (
          <div style={{
            padding: "16px 20px", borderRadius: 10,
            backgroundColor: "var(--mantine-color-default)",
            border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
          }}>
            <Markdown content={raw} />
            <Text size="xs" c="dimmed" ta="center" mt={12}>Click Refresh to convert to structured format</Text>
          </div>
        )}
      </div>
    </div>
  );
}
