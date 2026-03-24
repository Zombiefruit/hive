import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconBrandSlack,
  IconBriefcase,
  IconCheck,
  IconPlug,
  IconPlus,
  IconSettings,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import type {
  DeckConfig,
  UserRole,
  FetchCadence,
  IntegrationToggles,
  SlackChannel,
} from "../../shared/config-types";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "frontend_dev", label: "Frontend Dev" },
  { value: "backend_dev", label: "Backend Dev" },
  { value: "fullstack_dev", label: "Fullstack Dev" },
  { value: "pm", label: "PM" },
  { value: "designer", label: "Designer" },
  { value: "other", label: "Other" },
];

const CADENCE_OPTIONS: { value: FetchCadence; label: string }[] = [
  { value: "manual", label: "Manual only" },
  { value: "15min", label: "Every 15 minutes" },
  { value: "30min", label: "Every 30 minutes" },
  { value: "1hr", label: "Every hour" },
];

const INTEGRATION_LIST: { key: keyof IntegrationToggles; label: string; description: string }[] = [
  { key: "slack", label: "Slack", description: "Monitor channels and DMs for mentions and tasks" },
  { key: "linear", label: "Linear", description: "Track assigned tickets and status changes" },
  { key: "gmail", label: "Gmail", description: "Surface action-required emails" },
  { key: "calendar", label: "Calendar", description: "Meeting prep and scheduling awareness" },
  { key: "notion", label: "Notion", description: "Watch docs and databases for updates" },
  { key: "github", label: "GitHub", description: "PR reviews, CI failures, and mentions" },
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

type LoadStatus = "loading" | "loaded" | "error";

export function Settings() {
  const navigate = useNavigate();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Role
  const [role, setRole] = useState<UserRole>("fullstack_dev");

  // Team
  const [managerName, setManagerName] = useState("");
  const [teamName, setTeamName] = useState("");

  // Slack channels
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelId, setNewChannelId] = useState("");

  // Integrations
  const [integrations, setIntegrations] = useState<IntegrationToggles>({
    slack: true,
    linear: true,
    gmail: false,
    calendar: false,
    notion: false,
    github: true,
  });

  // Preferences
  const [fetchCadence, setFetchCadence] = useState<FetchCadence>("30min");
  const [timezone, setTimezone] = useState(detectTimezone);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");

  // Track original createdAt so we don't overwrite it
  const createdAtRef = useRef<string>("");

  // Load config on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = (await window.deck.getConfig()) as DeckConfig | null;
        if (cancelled) return;
        if (config) {
          setName(config.name ?? "");
          setEmail(config.email ?? "");
          setRole(config.role ?? "fullstack_dev");
          setManagerName(config.managerName ?? "");
          setTeamName(config.teamName ?? "");
          setChannels(config.slackChannels ?? []);
          setIntegrations(config.integrations ?? {
            slack: true, linear: true, gmail: false,
            calendar: false, notion: false, github: true,
          });
          setFetchCadence(config.fetchCadence ?? "30min");
          setTimezone(config.timezone ?? detectTimezone());
          setWorkStart(config.workingHoursStart ?? "09:00");
          setWorkEnd(config.workingHoursEnd ?? "18:00");
          createdAtRef.current = config.createdAt ?? new Date().toISOString();
        }
        setLoadStatus("loaded");
      } catch (err) {
        console.error("Failed to load config:", err);
        if (!cancelled) setLoadStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const config: DeckConfig = {
        name: name.trim(),
        email: email.trim(),
        role,
        managerName: managerName.trim(),
        teamName: teamName.trim(),
        slackChannels: channels,
        integrations,
        fetchCadence,
        timezone,
        workingHoursStart: workStart,
        workingHoursEnd: workEnd,
        createdAt: createdAtRef.current || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await window.deck.saveConfig(config);
      setSaveMessage("Settings saved");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save config:", err);
      setSaveMessage("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [name, email, role, managerName, teamName, channels, integrations, fetchCadence, timezone, workStart, workEnd]);

  const addCustomChannel = () => {
    const trimmedName = newChannelName.trim();
    const trimmedId = newChannelId.trim();
    if (!trimmedName || !trimmedId) return;
    if (channels.some((c) => c.id === trimmedId)) return;
    const ch: SlackChannel = {
      id: trimmedId,
      name: trimmedName.startsWith("#") ? trimmedName : `#${trimmedName}`,
    };
    setChannels((prev) => [...prev, ch]);
    setNewChannelName("");
    setNewChannelId("");
  };

  const removeChannel = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleIntegration = (key: keyof IntegrationToggles) => {
    setIntegrations((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Section header style helper
  const sectionHeader = (icon: React.ReactNode, title: string, description?: string) => (
    <div style={{ marginBottom: 4 }}>
      <Group gap={8} mb={4}>
        {icon}
        <Text size="md" fw={700}>{title}</Text>
      </Group>
      {description && (
        <Text size="xs" c="dimmed">{description}</Text>
      )}
    </div>
  );

  const sectionDivider = (
    <div
      style={{
        height: 1,
        backgroundColor: "color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
        margin: "8px 0",
      }}
    />
  );

  if (loadStatus === "loading") {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--mantine-color-body)" }}>
        <Loader size="sm" color="blue" />
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
      }}
    >
      {/* Header */}
      <AppHeader />

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          padding: "32px 24px 80px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 580 }}>
          <Stack gap={28}>

            {/* ── Identity ── */}
            {sectionHeader(
              <IconUser size={16} color="var(--mantine-color-blue-5)" />,
              "Identity",
              "Your name and email for triage context.",
            )}
            <TextInput
              label="Name"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              size="sm"
            />
            <TextInput
              label="Email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              size="sm"
            />

            {sectionDivider}

            {/* ── Role & Team ── */}
            {sectionHeader(
              <IconBriefcase size={16} color="var(--mantine-color-violet-5)" />,
              "Role & Team",
              "Helps prioritize and triage incoming work.",
            )}
            <Radio.Group value={role} onChange={(val) => setRole(val as UserRole)}>
              <Group gap={8} mt={4}>
                {ROLE_OPTIONS.map((opt) => (
                  <Radio
                    key={opt.value}
                    value={opt.value}
                    label={opt.label}
                    size="sm"
                    styles={{
                      radio: { cursor: "pointer" },
                      label: { cursor: "pointer" },
                    }}
                  />
                ))}
              </Group>
            </Radio.Group>
            <Group grow>
              <TextInput
                label="Manager name"
                placeholder="e.g. Yael Chemla"
                value={managerName}
                onChange={(e) => setManagerName(e.currentTarget.value)}
                size="sm"
              />
              <TextInput
                label="Team name"
                placeholder="e.g. Vector"
                value={teamName}
                onChange={(e) => setTeamName(e.currentTarget.value)}
                size="sm"
              />
            </Group>

            {sectionDivider}

            {/* ── Slack Channels ── */}
            {sectionHeader(
              <IconBrandSlack size={16} color="#E01E5A" />,
              "Slack Channels",
              "Channels to monitor for mentions and tasks.",
            )}
            <Stack gap={6}>
              {channels.length === 0 && (
                <Text size="xs" c="dimmed" fs="italic">No channels configured.</Text>
              )}
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 50%, transparent)",
                    backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-7) 50%, transparent)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>{ch.name}</Text>
                    <Text
                      size="xs"
                      c="dimmed"
                      style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: "0.65rem" }}
                    >
                      {ch.id}
                    </Text>
                  </div>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => removeChannel(ch.id)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </div>
              ))}
            </Stack>

            <div>
              <Text size="xs" fw={600} mb={6}>Add channel</Text>
              <Group gap={8}>
                <TextInput
                  placeholder="#channel-name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.currentTarget.value)}
                  size="xs"
                  style={{ flex: 1 }}
                />
                <TextInput
                  placeholder="Channel ID"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.currentTarget.value)}
                  size="xs"
                  style={{ flex: 1 }}
                />
                <ActionIcon
                  size="md"
                  variant="light"
                  color="blue"
                  onClick={addCustomChannel}
                  disabled={!newChannelName.trim() || !newChannelId.trim()}
                >
                  <IconPlus size={14} />
                </ActionIcon>
              </Group>
            </div>

            {sectionDivider}

            {/* ── Integrations ── */}
            {sectionHeader(
              <IconPlug size={16} color="var(--mantine-color-teal-5)" />,
              "Integrations",
              "Enable the sources you want Claude Deck to monitor.",
            )}
            <Stack gap={8}>
              {INTEGRATION_LIST.map(({ key, label, description }) => (
                <UnstyledButton
                  key={key}
                  onClick={() => toggleIntegration(key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: `1px solid ${
                      integrations[key]
                        ? "var(--mantine-color-blue-7)"
                        : "color-mix(in srgb, var(--mantine-color-default-border) 50%, transparent)"
                    }`,
                    backgroundColor: integrations[key]
                      ? "color-mix(in srgb, var(--mantine-color-blue-9) 15%, transparent)"
                      : "transparent",
                    transition: "all 0.1s ease",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500}>{label}</Text>
                    <Text size="xs" c="dimmed">{description}</Text>
                  </div>
                  <Switch
                    checked={integrations[key]}
                    onChange={() => toggleIntegration(key)}
                    size="sm"
                    styles={{ track: { cursor: "pointer" } }}
                  />
                </UnstyledButton>
              ))}
            </Stack>

            {sectionDivider}

            {/* ── Preferences ── */}
            {sectionHeader(
              <IconSettings size={16} color="var(--mantine-color-orange-5)" />,
              "Preferences",
              "Configure how and when Claude Deck works for you.",
            )}
            <Select
              label="Fetch cadence"
              description="How often to poll for new notifications"
              data={CADENCE_OPTIONS}
              value={fetchCadence}
              onChange={(val) => val && setFetchCadence(val as FetchCadence)}
              size="sm"
            />
            <TextInput
              label="Timezone"
              description="Auto-detected. Override if needed."
              value={timezone}
              onChange={(e) => setTimezone(e.currentTarget.value)}
              size="sm"
            />
            <Group grow>
              <TextInput
                label="Working hours start"
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.currentTarget.value)}
                size="sm"
              />
              <TextInput
                label="Working hours end"
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.currentTarget.value)}
                size="sm"
              />
            </Group>
          </Stack>
        </div>
      </div>

      {/* Sticky save bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: "12px 24px",
          borderTop: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 90%, transparent)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 12,
        }}
      >
        {saveMessage && (
          <Badge
            color={saveMessage === "Settings saved" ? "green" : "red"}
            variant="light"
            size="sm"
            leftSection={saveMessage === "Settings saved" ? <IconCheck size={12} /> : null}
          >
            {saveMessage}
          </Badge>
        )}
        <Button
          onClick={handleSave}
          loading={saving}
          size="sm"
          disabled={!name.trim() || !email.trim()}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
}
