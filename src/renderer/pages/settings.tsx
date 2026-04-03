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
  IconCircleFilled,
  IconGitBranch,
  IconPlug,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTerminal,
  IconTrash,
  IconUser,
  IconUsers,
  IconSparkles,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { AppHeader } from "../components/AppHeader";
import type {
  Coworker,
  CoworkerRole,
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

const COWORKER_ROLES: { value: CoworkerRole; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "lead", label: "Lead" },
  { value: "pm", label: "PM" },
  { value: "peer", label: "Peer" },
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
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [slackUserId, setSlackUserId] = useState("");
  const [linearUsername, setLinearUsername] = useState("");

  // Role
  const [role, setRole] = useState<UserRole>("fullstack_dev");

  // Team
  const [managerName, setManagerName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [newCoworkerName, setNewCoworkerName] = useState("");
  const [newCoworkerRole, setNewCoworkerRole] = useState<CoworkerRole>("peer");
  const [newCoworkerSlackId, setNewCoworkerSlackId] = useState("");
  const [coworkerSearchResults, setCoworkerSearchResults] = useState<Array<{ label: string; slackId: string }>>([]);
  const coworkerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    gong: false,
  });

  // Preferences
  const [fetchCadence, setFetchCadence] = useState<FetchCadence>("30min");
  const [timezone, setTimezone] = useState(detectTimezone);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [slackHookEnabled, setSlackHookEnabled] = useState(false);

  // Repo Mappings
  const [repoMappings, setRepoMappings] = useState<Array<{ pattern: string; repoPath: string }>>([]);
  const [newPattern, setNewPattern] = useState("");
  const [newRepoPath, setNewRepoPath] = useState("");

  // Auto-discovery
  const [discovering, setDiscovering] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState("");

  const handleAutoDiscover = async () => {
    if (!name.trim() || !email.trim()) return;
    setDiscovering(true);
    setDiscoveryStatus("Starting discovery...");

    const unsub = window.deck?.onSetupProgress?.((msg: string) => setDiscoveryStatus(msg));

    try {
      const result = await window.deck?.runSetupAgent?.(name.trim(), email.trim());
      if (result) {
        if (result.slackUserId) setSlackUserId(result.slackUserId);
        if (result.linearUsername) setLinearUsername(result.linearUsername);
        if (result.managerName) setManagerName(result.managerName);
        if (result.teamName) setTeamName(result.teamName);
        if (result.role) setRole(result.role as UserRole);
        if (result.coworkers?.length) {
          setCoworkers(result.coworkers.map((c: { name: string; role: string; slackUserId?: string }) => ({
            name: c.name,
            role: c.role as CoworkerRole,
            slackUserId: c.slackUserId,
          })));
        }
        if (result.slackChannels?.length) {
          setChannels(result.slackChannels);
        }
        if (result.integrations) {
          setIntegrations(prev => ({ ...prev, ...result.integrations }));
        }
        if (result.discoveredContext?.workingHours) {
          setWorkStart(result.discoveredContext.workingHours.start);
          setWorkEnd(result.discoveredContext.workingHours.end);
        }
        setDiscoveryStatus("Discovery complete! Review and save.");
      }
    } catch {
      setDiscoveryStatus("Discovery failed — fill in manually.");
    } finally {
      setDiscovering(false);
      unsub?.();
    }
  };

  // Bridge connector status
  const [bridgeStatus, setBridgeStatus] = useState<{
    ready: boolean;
    mcpToolCount: number;
    connectors: { slack: boolean; linear: boolean; gmail: boolean; calendar: boolean; notion: boolean };
  } | null>(null);
  const [restarting, setRestarting] = useState(false);

  // Skill status
  const [skillStatus, setSkillStatus] = useState<{ installed: boolean; missing: string[] } | null>(null);

  // Track original createdAt so we don't overwrite it
  const createdAtRef = useRef<string>("");

  // Poll bridge status
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const status = await window.deck.getBridgeStatus();
        if (!cancelled) setBridgeStatus(status);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Check skill status on mount
  useEffect(() => {
    window.deck.checkSkills?.().then(setSkillStatus).catch(() => {});
  }, []);

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
          setSlackUserId(config.slackUserId ?? "");
          setLinearUsername(config.linearUsername ?? "");
          setRole(config.role ?? "fullstack_dev");
          setManagerName(config.managerName ?? "");
          setTeamName(config.teamName ?? "");
          setCoworkers(config.coworkers ?? []);
          setChannels(config.slackChannels ?? []);
          setIntegrations(config.integrations ?? {
            slack: true, linear: true, gmail: false,
            calendar: false, notion: false, github: true, gong: false,
          });
          setFetchCadence(config.fetchCadence ?? "30min");
          setTimezone(config.timezone ?? detectTimezone());
          setWorkStart(config.workingHoursStart ?? "09:00");
          setWorkEnd(config.workingHoursEnd ?? "18:00");
          setSlackHookEnabled(config.slackHookEnabled ?? false);
          setRepoMappings(config.repoMappings ?? []);
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
        slackUserId: slackUserId.trim() || undefined,
        linearUsername: linearUsername.trim() || undefined,
        role,
        managerName: managerName.trim(),
        teamName: teamName.trim(),
        coworkers: coworkers.length > 0 ? coworkers : undefined,
        slackChannels: channels,
        integrations,
        fetchCadence,
        timezone,
        workingHoursStart: workStart,
        workingHoursEnd: workEnd,
        slackHookEnabled,
        repoMappings: repoMappings.length > 0 ? repoMappings : undefined,
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
  }, [name, email, slackUserId, linearUsername, role, managerName, teamName, coworkers, channels, integrations, fetchCadence, timezone, workStart, workEnd, slackHookEnabled, repoMappings]);

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
            {/* Auto-discover button */}
            <Button
              variant={discovering ? "light" : "filled"}
              color="blue"
              leftSection={discovering ? <Loader size={14} color="white" /> : <IconSparkles size={14} />}
              onClick={handleAutoDiscover}
              disabled={discovering || !name.trim() || !email.trim()}
              size="sm"
            >
              {discovering ? discoveryStatus : "Auto-discover from workspace"}
            </Button>
            {discoveryStatus && !discovering && (
              <Text size="xs" c={discoveryStatus.includes("failed") ? "red" : "green"}>{discoveryStatus}</Text>
            )}

            <Group grow>
              <TextInput
                label="Slack User ID"
                placeholder="e.g. U02PKBZSB9Q"
                description="Auto-discovered or find in Slack profile > More > Copy member ID"
                value={slackUserId}
                onChange={(e) => setSlackUserId(e.currentTarget.value)}
                size="sm"
              />
              <TextInput
                label="Linear username"
                placeholder="e.g. kwilliams"
                value={linearUsername}
                onChange={(e) => setLinearUsername(e.currentTarget.value)}
                size="sm"
              />
            </Group>

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
                placeholder="e.g. Jane Smith"
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

            {/* ── Coworkers ── */}
            {sectionHeader(
              <IconUsers size={16} color="var(--mantine-color-grape-5)" />,
              "Coworkers",
              "People you work with. Their role determines notification priority (manager asks = critical).",
            )}
            <Stack gap={6}>
              {coworkers.length === 0 && (
                <Text size="xs" c="dimmed" fs="italic">No coworkers configured. Your manager is auto-included from above.</Text>
              )}
              {coworkers.map((cw, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 50%, transparent)",
                    backgroundColor: "color-mix(in srgb, var(--mantine-color-default) 50%, transparent)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={8}>
                      <Text size="sm" fw={500}>{cw.name}</Text>
                      <Badge size="xs" variant="light" color={
                        cw.role === "manager" ? "red" : cw.role === "lead" ? "orange" : cw.role === "pm" ? "violet" : "blue"
                      }>{cw.role}</Badge>
                    </Group>
                    {cw.slackUserId && (
                      <Text size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: "0.65rem" }}>
                        Slack: {cw.slackUserId}
                      </Text>
                    )}
                  </div>
                  <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remove coworker" onClick={() => setCoworkers(prev => prev.filter((_, j) => j !== i))}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </div>
              ))}
            </Stack>
            <div>
              <Text size="xs" fw={600} mb={6}>Add coworker</Text>
              <Group gap={8}>
                <TextInput
                  placeholder={bridgeStatus?.ready ? "Name (or search Slack)..." : "Name"}
                  value={newCoworkerName}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setNewCoworkerName(val);
                    if (val.length < 2) { setCoworkerSearchResults([]); return; }
                    if (!bridgeStatus?.ready) return;
                    if (coworkerSearchTimer.current) clearTimeout(coworkerSearchTimer.current);
                    coworkerSearchTimer.current = setTimeout(async () => {
                      try {
                        const result = await window.deck.searchUsers("slack", val);
                        if (result.ok && result.data) {
                          const users = JSON.parse(result.data) as Array<{ id: string; title: string }>;
                          setCoworkerSearchResults(users.map(u => ({ label: u.title, slackId: u.id })));
                        }
                      } catch { setCoworkerSearchResults([]); }
                    }, 300);
                  }}
                  size="xs"
                  style={{ flex: 2 }}
                />
                {coworkerSearchResults.length > 0 && (
                  <Select
                    placeholder="Pick from Slack..."
                    data={coworkerSearchResults.map(r => ({ value: r.label, label: r.label }))}
                    value={null}
                    onChange={(val) => {
                      if (!val) return;
                      setNewCoworkerName(val);
                      const match = coworkerSearchResults.find(r => r.label === val);
                      if (match?.slackId) setNewCoworkerSlackId(match.slackId);
                    }}
                    size="xs"
                    style={{ flex: 1 }}
                  />
                )}
                <Select
                  data={COWORKER_ROLES}
                  value={newCoworkerRole}
                  onChange={(val) => val && setNewCoworkerRole(val as CoworkerRole)}
                  size="xs"
                  style={{ flex: 1 }}
                  allowDeselect={false}
                  styles={{
                    input: { backgroundColor: "var(--mantine-color-default-hover)" },
                    dropdown: { backgroundColor: "var(--mantine-color-default-hover)" },
                  }}
                />
                <TextInput
                  placeholder="Slack ID (auto-filled)"
                  value={newCoworkerSlackId}
                  onChange={(e) => setNewCoworkerSlackId(e.currentTarget.value)}
                  size="xs"
                  style={{ flex: 1, opacity: newCoworkerSlackId ? 0.7 : 1 }}
                />
                <ActionIcon
                  size="md"
                  variant="light"
                  color="blue"
                  aria-label="Add coworker"
                  disabled={!newCoworkerName.trim()}
                  onClick={() => {
                    if (!newCoworkerName.trim()) return;
                    setCoworkers(prev => [...prev, {
                      name: newCoworkerName.trim(),
                      role: newCoworkerRole,
                      slackUserId: newCoworkerSlackId.trim() || undefined,
                    }]);
                    setNewCoworkerName("");
                    setNewCoworkerSlackId("");
                  }}
                >
                  <IconPlus size={14} />
                </ActionIcon>
              </Group>
            </div>

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
                    backgroundColor: "color-mix(in srgb, var(--mantine-color-default) 50%, transparent)",
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
                    aria-label="Remove channel"
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
                  aria-label="Add channel"
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
              "Enable the sources you want Hive to monitor.",
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
                      ? "var(--mantine-color-blue-light)"
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

            {/* ── MCP Connections ── */}
            {sectionHeader(
              <IconPlugConnected size={16} color="var(--mantine-color-cyan-5)" />,
              "MCP Connections",
              "Status of data connectors. If auth is broken, open a terminal to re-authenticate.",
            )}

            {bridgeStatus ? (
              <Stack gap={8}>
                {/* Bridge overall status */}
                <Group gap={8}>
                  <IconCircleFilled
                    size={10}
                    color={bridgeStatus.ready ? "var(--mantine-color-green-5)" : "var(--mantine-color-red-5)"}
                  />
                  <Text size="sm" fw={500}>
                    Bridge {bridgeStatus.ready ? "connected" : "disconnected"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {bridgeStatus.mcpToolCount} MCP tools loaded
                  </Text>
                </Group>

                {/* Per-connector status */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 8,
                  }}
                >
                  {(
                    [
                      { key: "slack", label: "Slack" },
                      { key: "linear", label: "Linear" },
                      { key: "gmail", label: "Gmail" },
                      { key: "calendar", label: "Calendar" },
                      { key: "notion", label: "Notion" },
                    ] as const
                  ).map(({ key, label }) => {
                    const connected = bridgeStatus.connectors[key];
                    return (
                      <div
                        key={key}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: `1px solid ${
                            connected
                              ? "color-mix(in srgb, var(--mantine-color-green-7) 40%, transparent)"
                              : "color-mix(in srgb, var(--mantine-color-red-7) 40%, transparent)"
                          }`,
                          backgroundColor: connected
                            ? "color-mix(in srgb, var(--mantine-color-green-9) 10%, transparent)"
                            : "color-mix(in srgb, var(--mantine-color-red-9) 10%, transparent)",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <IconCircleFilled
                          size={8}
                          color={connected ? "var(--mantine-color-green-5)" : "var(--mantine-color-red-5)"}
                        />
                        <Text size="sm">{label}</Text>
                      </div>
                    );
                  })}
                </div>

                {/* Skill status */}
                {skillStatus && !skillStatus.installed && (
                  <div style={{
                    padding: 12, borderRadius: 8, marginTop: 8,
                    backgroundColor: "color-mix(in srgb, var(--mantine-color-yellow-9) 15%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--mantine-color-yellow-7) 40%, transparent)",
                  }}>
                    <Text size="sm" fw={500} c="yellow.4">MC Engineering Skills Missing</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Required skills not found: <strong>{skillStatus.missing.join(", ")}</strong>.
                      Run <code style={{ backgroundColor: "var(--mantine-color-default-hover)", padding: "1px 4px", borderRadius: 3 }}>configure-claude</code> to install them.
                    </Text>
                  </div>
                )}
                {skillStatus?.installed && (
                  <Group gap={6} mt={8}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--mantine-color-green-filled)" }} />
                    <Text size="xs" c="dimmed">MC skills installed (start-work, hack, ship, code-review)</Text>
                  </Group>
                )}

                {/* Action buttons */}
                <Group gap={8} mt={4}>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconRefresh size={14} />}
                    loading={restarting}
                    onClick={async () => {
                      setRestarting(true);
                      try {
                        await window.deck.restartBridge();
                        // Wait for bridge to reinitialize then refresh status
                        setTimeout(async () => {
                          try {
                            const status = await window.deck.getBridgeStatus();
                            setBridgeStatus(status);
                          } catch {}
                          setRestarting(false);
                        }, 5000);
                      } catch {
                        setRestarting(false);
                      }
                    }}
                  >
                    Restart bridge
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    leftSection={<IconTerminal size={14} />}
                    onClick={() => window.deck.openAuthTerminal()}
                  >
                    Open terminal to fix auth
                  </Button>
                </Group>

                {/* Help text */}
                {Object.values(bridgeStatus.connectors).some((v) => !v) && (
                  <Text size="xs" c="dimmed" mt={2}>
                    Red connectors need re-authentication. Click "Open terminal to fix auth", then type <code>/mcp</code> to manage your MCP servers. After fixing, click "Restart bridge".
                  </Text>
                )}
              </Stack>
            ) : (
              <Group gap={8}>
                <Loader size="xs" />
                <Text size="sm" c="dimmed">Checking connection status...</Text>
              </Group>
            )}

            {sectionDivider}

            {/* ── Repo Mappings ── */}
            {sectionHeader(
              <IconGitBranch size={16} color="var(--mantine-color-teal-5)" />,
              "Repo Mappings",
              "Map ticket prefixes and channel names to local repo paths for /start-work.",
            )}

            <Stack gap={6}>
              {(repoMappings ?? []).map((m, i) => (
                <Group key={i} gap={8} style={{ padding: "6px 10px", borderRadius: 6, backgroundColor: "var(--mantine-color-default)" }}>
                  <Badge size="xs" variant="light" color="teal">{m.pattern}</Badge>
                  <Text size="xs" style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: "0.7rem", flex: 1 }}>{m.repoPath}</Text>
                  <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remove repo mapping" onClick={() => setRepoMappings(prev => (prev ?? []).filter((_, j) => j !== i))}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              {(!repoMappings || repoMappings.length === 0) && (
                <Text size="xs" c="dimmed" fs="italic">No repo mappings configured. Add patterns like "VEC-*" to /path/to/repo.</Text>
              )}
            </Stack>
            <div>
              <Text size="xs" fw={600} mb={6}>Add mapping</Text>
              <Group gap={8}>
                <TextInput placeholder="Pattern (e.g., VEC-*)" value={newPattern} onChange={e => setNewPattern(e.currentTarget.value)} size="xs" style={{ flex: 1 }} />
                <TextInput placeholder="Repo path (e.g., /Users/kieran/repos/monolith)" value={newRepoPath} onChange={e => setNewRepoPath(e.currentTarget.value)} size="xs" style={{ flex: 2 }} />
                <ActionIcon size="md" variant="light" color="teal" aria-label="Add repo mapping" disabled={!newPattern.trim() || !newRepoPath.trim()} onClick={() => {
                  setRepoMappings(prev => [...(prev ?? []), { pattern: newPattern.trim(), repoPath: newRepoPath.trim() }]);
                  setNewPattern(""); setNewRepoPath("");
                }}>
                  <IconPlus size={14} />
                </ActionIcon>
              </Group>
            </div>

            {sectionDivider}

            {/* ── Preferences ── */}
            {sectionHeader(
              <IconSettings size={16} color="var(--mantine-color-orange-5)" />,
              "Preferences",
              "Configure how and when Hive works for you.",
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
            <Switch
              label="Slack real-time hook"
              description="Check for @mentions and DMs every 60 seconds (requires Slack integration)"
              checked={slackHookEnabled}
              onChange={(e) => setSlackHookEnabled(e.currentTarget.checked)}
              size="sm"
              disabled={!integrations.slack}
            />

            {sectionDivider}

            {/* ── Danger Zone ── */}
            <div style={{ padding: "16px 20px", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--mantine-color-red-5) 30%, transparent)" }}>
              <Text size="sm" fw={600} c="red.4" mb={12}>Danger Zone</Text>
              <Group gap={8}>
                <Button
                  variant="outline"
                  color="red"
                  size="xs"
                  onClick={async () => {
                    if (!confirm("Reset database? This clears all agent history and events. Notifications and config are kept.")) return;
                    await window.deck.resetDatabase?.();
                    window.location.reload();
                  }}
                >
                  Reset Database
                </Button>
                <Button
                  variant="filled"
                  color="red"
                  size="xs"
                  onClick={async () => {
                    if (!confirm("Reset everything? This deletes your config, database, and all cached data. You'll need to redo onboarding.")) return;
                    await window.deck.resetAll?.();
                    window.location.reload();
                  }}
                >
                  Reset Everything
                </Button>
              </Group>
              <Text size="xs" c="dimmed" mt={8}>
                "Reset Database" clears agent history. "Reset Everything" also deletes your config and notification cache — you'll see the onboarding flow again.
              </Text>
            </div>
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
          backgroundColor: "color-mix(in srgb, var(--mantine-color-body) 90%, transparent)",
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
