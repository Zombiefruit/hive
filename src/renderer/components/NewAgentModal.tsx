import {
  ActionIcon,
  Badge,
  Button,
  CloseButton,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconTicket,
  IconBrandSlack,
  IconBrandNotion,
  IconSearch,
} from "@tabler/icons-react";
import { useCallback, useState } from "react";

type ImportSource = "linear" | "slack" | "notion" | null;

interface ImportResult {
  title: string;
  url: string;
  snippet?: string;
}

interface NewAgentModalProps {
  opened: boolean;
  onClose: () => void;
}

const IMPORT_SOURCES = [
  { key: "linear" as const, label: "Linear ticket", icon: IconTicket, color: "violet" },
  { key: "slack" as const, label: "Slack thread", icon: IconBrandSlack, color: "green" },
  { key: "notion" as const, label: "Notion page", icon: IconBrandNotion, color: "gray" },
] as const;

function ImportContextPanel({
  onSelect,
  onClose,
}: {
  onSelect: (result: ImportResult) => void;
  onClose: () => void;
}) {
  const [activeSource, setActiveSource] = useState<ImportSource>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !activeSource) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      const sourceLabel =
        activeSource === "linear"
          ? "Linear"
          : activeSource === "slack"
            ? "Slack"
            : "Notion";

      const response = await window.deck.sendManagerMessage(
        `Search ${sourceLabel} for: ${query.trim()}. Return results as a JSON array of objects with "title" and "url" fields (and optionally "snippet"). Only return the JSON array, no other text.`
      );

      // The manager returns a message object; extract the content
      const content =
        typeof response === "string"
          ? response
          : (response as { content?: string })?.content ?? "";

      // Try to extract a JSON array from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ImportResult[];
        setResults(
          parsed
            .filter((r) => r.title)
            .map((r) => ({
              title: r.title,
              url: r.url ?? "",
              snippet: r.snippet,
            }))
        );
      } else {
        // If the response isn't JSON, show it as a single result fallback
        setResults([{ title: content.slice(0, 200), url: "" }]);
      }
    } catch {
      setSearchError("Search failed. Make sure the Manager AI is connected.");
    } finally {
      setSearching(false);
    }
  }, [query, activeSource]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
    if (e.key === "Escape") {
      if (activeSource) {
        setActiveSource(null);
        setQuery("");
        setResults([]);
      } else {
        onClose();
      }
    }
  };

  // Source selection buttons
  if (!activeSource) {
    return (
      <Stack gap={6}>
        <Group gap="xs" justify="space-between">
          <Text size="xs" fw={500} c="dimmed">
            Import context from...
          </Text>
          <CloseButton size="xs" onClick={onClose} />
        </Group>
        <Group gap="xs">
          {IMPORT_SOURCES.map((src) => (
            <Button
              key={src.key}
              variant="light"
              color={src.color}
              size="xs"
              leftSection={<src.icon size={14} />}
              onClick={() => setActiveSource(src.key)}
            >
              {src.label}
            </Button>
          ))}
        </Group>
      </Stack>
    );
  }

  const activeConfig = IMPORT_SOURCES.find((s) => s.key === activeSource)!;

  return (
    <Stack gap={6}>
      <Group gap="xs" justify="space-between">
        <Group gap={6}>
          <Badge
            variant="light"
            color={activeConfig.color}
            size="sm"
            leftSection={<activeConfig.icon size={10} />}
          >
            {activeConfig.label}
          </Badge>
          <Text size="xs" c="dimmed">Search and select to import</Text>
        </Group>
        <CloseButton
          size="xs"
          onClick={() => {
            setActiveSource(null);
            setQuery("");
            setResults([]);
            setSearchError(null);
          }}
        />
      </Group>

      <Group gap="xs" align="flex-end">
        <TextInput
          placeholder={`Search ${activeConfig.label}...`}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          size="xs"
          style={{ flex: 1 }}
          autoFocus
          rightSection={searching ? <Loader size={12} /> : undefined}
        />
        <ActionIcon
          variant="light"
          color={activeConfig.color}
          size="md"
          onClick={handleSearch}
          disabled={!query.trim() || searching}
          aria-label="Search"
        >
          <IconSearch size={14} />
        </ActionIcon>
      </Group>

      {searchError && (
        <Text size="xs" c="red">
          {searchError}
        </Text>
      )}

      {results.length > 0 && (
        <Paper
          withBorder
          p={0}
          style={{
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          {results.map((result, i) => (
            <UnstyledButton
              key={i}
              onClick={() => {
                onSelect(result);
                setActiveSource(null);
                setQuery("");
                setResults([]);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 10px",
                borderBottom:
                  i < results.length - 1
                    ? "1px solid var(--aegen-glass-border)"
                    : undefined,
              }}
              className="hover-highlight"
            >
              <Text size="xs" fw={500} truncate>
                {result.title}
              </Text>
              {result.snippet && (
                <Text size="xs" c="dimmed" truncate>
                  {result.snippet}
                </Text>
              )}
              {result.url && (
                <Text size="xs" c="blue" truncate style={{ fontSize: "0.65rem" }}>
                  {result.url}
                </Text>
              )}
            </UnstyledButton>
          ))}
        </Paper>
      )}
    </Stack>
  );
}

export function NewAgentModal({ opened, onClose }: NewAgentModalProps) {
  const [task, setTask] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [cwd, setCwd] = useState("");
  const [branch, setBranch] = useState("");
  const [permissionMode, setPermissionMode] = useState("default");
  const [maxBudgetUsd, setMaxBudgetUsd] = useState<number | string>(1);
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const handleSpawn = async () => {
    if (!task.trim() || !cwd.trim()) return;
    setSubmitting(true);
    try {
      await window.deck.spawnAgent({
        task: task.trim(),
        model,
        cwd: cwd.trim(),
        branch: branch.trim() || undefined,
        permissionMode,
        maxBudgetUsd: Number(maxBudgetUsd) || undefined,
      });
      // Reset form and close
      setTask("");
      setCwd("");
      setBranch("");
      setShowImport(false);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportSelect = (result: ImportResult) => {
    const importLine = result.url
      ? `\n\nContext: ${result.title}\n${result.url}`
      : `\n\nContext: ${result.title}`;
    setTask((prev) => prev + importLine);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New Agent" size="lg">
      <Stack gap="md">
        <Textarea
          label="Task"
          placeholder="Describe what this agent should do..."
          minRows={3}
          value={task}
          onChange={(e) => setTask(e.currentTarget.value)}
          autoFocus
        />

        {showImport ? (
          <ImportContextPanel
            onSelect={handleImportSelect}
            onClose={() => setShowImport(false)}
          />
        ) : (
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            onClick={() => setShowImport(true)}
            style={{ alignSelf: "flex-start" }}
          >
            + Import context from Linear, Slack, or Notion
          </Button>
        )}

        <TextInput
          label="Working directory"
          placeholder="/path/to/your/repo"
          value={cwd}
          onChange={(e) => setCwd(e.currentTarget.value)}
        />

        <Group grow>
          <Select
            label="Model"
            data={[
              { value: "claude-opus-4-6", label: "Opus 4" },
              { value: "claude-sonnet-4-6", label: "Sonnet 4" },
              { value: "claude-haiku-4-5-20251001", label: "Haiku" },
            ]}
            value={model}
            onChange={(v) => v && setModel(v)}
          />
          <TextInput
            label="Branch (optional)"
            placeholder="feature/my-branch"
            value={branch}
            onChange={(e) => setBranch(e.currentTarget.value)}
          />
        </Group>

        <Stack gap="xs">
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            Permission mode
          </label>
          <SegmentedControl
            data={[
              { value: "default", label: "Require approval" },
              { value: "acceptEdits", label: "Auto-approve edits" },
              { value: "bypassPermissions", label: "Auto-approve all" },
            ]}
            value={permissionMode}
            onChange={setPermissionMode}
          />
        </Stack>

        <NumberInput
          label="Budget limit (USD)"
          placeholder="1.00"
          min={0.01}
          max={100}
          step={0.5}
          decimalScale={2}
          value={maxBudgetUsd}
          onChange={setMaxBudgetUsd}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSpawn}
            loading={submitting}
            disabled={!task.trim() || !cwd.trim()}
          >
            Spawn Agent
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
