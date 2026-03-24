import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Radio,
  Select,
  Stack,
  Stepper,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconPlus,
  IconTrash,
  IconUser,
  IconBriefcase,
  IconUsers,
  IconBrandSlack,
  IconPlugConnected,
  IconSettings,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type {
  DeckConfig,
  UserRole,
  FetchCadence,
  IntegrationToggles,
  SlackChannel,
} from "../../shared/config-types";

const TOTAL_STEPS = 6;

// Only suggest truly universal channels — users add their own team channels
const DEFAULT_CHANNELS: SlackChannel[] = [
  { id: "", name: "#general" },
];

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

const STEP_ICONS = [
  IconUser,
  IconBriefcase,
  IconUsers,
  IconBrandSlack,
  IconPlugConnected,
  IconSettings,
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

export function Onboarding() {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — Identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Step 2 — Role
  const [role, setRole] = useState<UserRole>("fullstack_dev");

  // Step 3 — Team
  const [managerName, setManagerName] = useState("");
  const [teamName, setTeamName] = useState("");

  // Step 4 — Slack Channels
  const [channels, setChannels] = useState<SlackChannel[]>(DEFAULT_CHANNELS);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
    new Set(DEFAULT_CHANNELS.slice(0, 2).map((c) => c.id))
  );
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelId, setNewChannelId] = useState("");

  // Step 5 — Integrations
  const [integrations, setIntegrations] = useState<IntegrationToggles>({
    slack: true,
    linear: true,
    gmail: false,
    calendar: false,
    notion: false,
    github: true,
  });

  // Step 6 — Preferences
  const [fetchCadence, setFetchCadence] = useState<FetchCadence>("30min");
  const [timezone, setTimezone] = useState(detectTimezone);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");

  // Pre-fill from git config (Electron only)
  useEffect(() => {
    // No git prefill available via IPC — user fills manually.
    // In a future iteration, main process could expose git config values.
  }, []);

  const canAdvance = (): boolean => {
    switch (active) {
      case 0:
        return name.trim().length > 0 && email.trim().length > 0;
      case 1:
        return !!role;
      case 2:
        return true; // manager/team are optional
      case 3:
        return true; // channels are pre-selected
      case 4:
        return true; // integrations have defaults
      case 5:
        return true; // preferences have defaults
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (active < TOTAL_STEPS - 1) {
      setActive((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (active > 0) {
      setActive((prev) => prev - 1);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const config: DeckConfig = {
        name: name.trim(),
        email: email.trim(),
        role,
        managerName: managerName.trim(),
        teamName: teamName.trim(),
        slackChannels: channels.filter((c) => selectedChannelIds.has(c.id)),
        integrations,
        fetchCadence,
        timezone,
        workingHoursStart: workStart,
        workingHoursEnd: workEnd,
        createdAt: now,
        updatedAt: now,
      };
      await window.deck.saveConfig(config);
      navigate("/");
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (id: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addCustomChannel = () => {
    const trimmedName = newChannelName.trim();
    if (!trimmedName) return;
    const name = trimmedName.startsWith("#") ? trimmedName : `#${trimmedName}`;
    if (channels.some((c) => c.name === name)) return;
    // Generate a placeholder ID — will be resolved via Slack search at runtime
    const placeholderId = `pending-${name.replace(/[^a-z0-9]/gi, "")}`;
    const newChannel: SlackChannel = { id: placeholderId, name };
    setChannels((prev) => [...prev, newChannel]);
    setSelectedChannelIds((prev) => new Set([...prev, placeholderId]));
    setNewChannelName("");
  };

  const removeChannel = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleIntegration = (key: keyof IntegrationToggles) => {
    setIntegrations((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const integrationList: { key: keyof IntegrationToggles; label: string; description: string }[] = [
    { key: "slack", label: "Slack", description: "Monitor channels and DMs for mentions and tasks" },
    { key: "linear", label: "Linear", description: "Track assigned tickets and status changes" },
    { key: "gmail", label: "Gmail", description: "Surface action-required emails" },
    { key: "calendar", label: "Calendar", description: "Meeting prep and scheduling awareness" },
    { key: "notion", label: "Notion", description: "Watch docs and databases for updates" },
    { key: "github", label: "GitHub", description: "PR reviews, CI failures, and mentions" },
  ];

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
      }}
    >
      {/* Header with drag region */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 24px",
          paddingLeft: 90,
          borderBottom:
            "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
          backgroundColor:
            "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitAppRegion: "drag",
          flexShrink: 0,
        }}
      >
        <Text
          size="md"
          fw={700}
          style={{ WebkitAppRegion: "no-drag", minWidth: 120 }}
        >
          Claude Deck
        </Text>
        <Text
          size="sm"
          c="dimmed"
          style={{ WebkitAppRegion: "no-drag", position: "absolute", left: "50%", transform: "translateX(-50%)" }}
        >
          Setup
        </Text>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          overflow: "auto",
          padding: "40px 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 640 }}>
          {/* Stepper */}
          <Stepper
            active={active}
            onStepClick={setActive}
            size="sm"
            color="blue"
            mb={40}
            allowNextStepsSelect={false}
            styles={{
              separator: { marginLeft: 4, marginRight: 4 },
            }}
          >
            {STEP_ICONS.map((Icon, i) => (
              <Stepper.Step
                key={i}
                icon={<Icon size={16} />}
                completedIcon={<IconCheck size={16} />}
              />
            ))}
          </Stepper>

          {/* Step content */}
          <div style={{ minHeight: 320 }}>
            {active === 0 && (
              <Stack gap="lg">
                <div>
                  <Text size="lg" fw={700}>
                    Welcome to Claude Deck
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Let's get you set up. We'll start with the basics.
                  </Text>
                </div>
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
              </Stack>
            )}

            {active === 1 && (
              <Stack gap="lg">
                <div>
                  <Text size="lg" fw={700}>
                    What's your role?
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    This helps prioritize and triage incoming work.
                  </Text>
                </div>
                <Radio.Group value={role} onChange={(val) => setRole(val as UserRole)}>
                  <Stack gap="sm" mt={8}>
                    {ROLE_OPTIONS.map((opt) => (
                      <Radio
                        key={opt.value}
                        value={opt.value}
                        label={opt.label}
                        size="sm"
                        styles={{
                          radio: {
                            cursor: "pointer",
                          },
                          label: {
                            cursor: "pointer",
                          },
                        }}
                      />
                    ))}
                  </Stack>
                </Radio.Group>
              </Stack>
            )}

            {active === 2 && (
              <Stack gap="lg">
                <div>
                  <Text size="lg" fw={700}>
                    Your team
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Used for triage context. Both fields are optional.
                  </Text>
                </div>
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
              </Stack>
            )}

            {active === 3 && (
              <Stack gap="lg">
                <div>
                  <Text size="lg" fw={700}>
                    Slack channels
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Select channels to monitor. You can add custom channels
                    below.
                  </Text>
                </div>

                <Stack gap={6}>
                  {channels.map((ch) => {
                    const selected = selectedChannelIds.has(ch.id);
                    return (
                      <UnstyledButton
                        key={ch.id}
                        onClick={() => toggleChannel(ch.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: `1px solid ${
                            selected
                              ? "var(--mantine-color-blue-7)"
                              : "color-mix(in srgb, var(--mantine-color-default-border) 50%, transparent)"
                          }`,
                          backgroundColor: selected
                            ? "color-mix(in srgb, var(--mantine-color-blue-9) 20%, transparent)"
                            : "transparent",
                          transition: "all 0.1s ease",
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: `2px solid ${
                              selected
                                ? "var(--mantine-color-blue-5)"
                                : "var(--mantine-color-dark-4)"
                            }`,
                            backgroundColor: selected
                              ? "var(--mantine-color-blue-5)"
                              : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {selected && (
                            <IconCheck size={10} color="white" stroke={3} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={500} truncate>
                            {ch.name}
                          </Text>
                          {ch.id && (
                            <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                              Slack channel
                            </Text>
                          )}
                        </div>
                        {!DEFAULT_CHANNELS.some((d) => d.id === ch.id) && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeChannel(ch.id);
                            }}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        )}
                      </UnstyledButton>
                    );
                  })}
                </Stack>

                {/* Add custom channel */}
                <div>
                  <Text size="xs" fw={600} mb={6}>
                    Add custom channel
                  </Text>
                  <Group gap={8}>
                    <TextInput
                      placeholder="#channel-name"
                      value={newChannelName}
                      onChange={(e) =>
                        setNewChannelName(e.currentTarget.value)
                      }
                      onKeyDown={(e) => { if (e.key === "Enter") addCustomChannel(); }}
                      size="xs"
                      style={{ flex: 1 }}
                    />
                    <ActionIcon
                      size="md"
                      variant="light"
                      color="blue"
                      onClick={addCustomChannel}
                      disabled={!newChannelName.trim()}
                    >
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Group>
                </div>
              </Stack>
            )}

            {active === 4 && (
              <Stack gap="lg">
                <div>
                  <Text size="lg" fw={700}>
                    Integrations
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Enable the sources you want Claude Deck to monitor.
                  </Text>
                </div>

                <Stack gap={8}>
                  {integrationList.map(({ key, label, description }) => (
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
                        <Text size="sm" fw={500}>
                          {label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {description}
                        </Text>
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
              </Stack>
            )}

            {active === 5 && (
              <Stack gap="lg">
                <div>
                  <Text size="lg" fw={700}>
                    Preferences
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Configure how and when Claude Deck works for you.
                  </Text>
                </div>

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

                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 16px",
                    borderRadius: 8,
                    backgroundColor:
                      "color-mix(in srgb, var(--mantine-color-dark-6) 60%, transparent)",
                    border:
                      "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
                  }}
                >
                  <Text size="xs" c="dimmed">
                    You can change any of these settings later from the app.
                  </Text>
                </div>
              </Stack>
            )}
          </div>

          {/* Navigation buttons */}
          <Group justify="space-between" mt={32}>
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconArrowLeft size={16} />}
              onClick={handleBack}
              disabled={active === 0}
              size="sm"
            >
              Back
            </Button>

            {active < TOTAL_STEPS - 1 ? (
              <Button
                rightSection={<IconArrowRight size={16} />}
                onClick={handleNext}
                disabled={!canAdvance()}
                size="sm"
              >
                Next
              </Button>
            ) : (
              <Button
                rightSection={<IconCheck size={16} />}
                onClick={handleSave}
                loading={saving}
                disabled={!canAdvance()}
                size="sm"
                color="green"
              >
                Finish setup
              </Button>
            )}
          </Group>
        </div>
      </div>
    </div>
  );
}
