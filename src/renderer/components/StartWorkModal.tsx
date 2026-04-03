import { Badge, Button, Group, Modal, Select, Stack, Text, TextInput, Loader } from "@mantine/core";
import { IconRocket, IconFolder } from "@tabler/icons-react";
import { useEffect, useState } from "react";

interface StartWorkModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: (repoPath: string, branch: string) => void;
  notification: {
    id: string;
    title: string;
    source: string;
    taskType?: string;
    links?: Array<{ type: string; label: string; url: string }>;
  };
  detectedRepo: string | null;
  suggestedBranch: string;
  repoOptions: Array<{ value: string; label: string }>;
}

export function StartWorkModal({
  opened,
  onClose,
  onConfirm,
  notification,
  detectedRepo,
  suggestedBranch,
  repoOptions,
}: StartWorkModalProps) {
  const [repoPath, setRepoPath] = useState(detectedRepo ?? "");
  const [branch, setBranch] = useState(suggestedBranch);
  const [loading, setLoading] = useState(false);
  const [allRepos, setAllRepos] = useState<Array<{ value: string; label: string }>>(repoOptions);

  useEffect(() => {
    setRepoPath(detectedRepo ?? "");
    setBranch(suggestedBranch);
  }, [detectedRepo, suggestedBranch, opened]);

  // Discover repos from filesystem on mount
  useEffect(() => {
    if (!opened) return;
    (async () => {
      try {
        const discovered = await window.deck?.discoverRepos?.() ?? [];
        // Merge configured + discovered, dedup by value
        const seen = new Set(repoOptions.map(r => r.value));
        const merged = [...repoOptions];
        for (const r of discovered) {
          if (!seen.has(r.value)) { merged.push(r); seen.add(r.value); }
        }
        setAllRepos(merged);
        // Auto-select detected repo, or first available if none detected
        if (!detectedRepo && merged.length > 0 && !repoPath) {
          setRepoPath(merged[0].value);
        }
      } catch {}
    })();
  }, [opened]);

  const handleConfirm = async () => {
    if (!repoPath) return;
    setLoading(true);
    onConfirm(repoPath, branch);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} size="sm">
          Start Work
        </Text>
      }
      size="md"
      centered
      overlayProps={{ backgroundOpacity: 0.4, blur: 4 }}
      styles={{
        content: { background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)" },
        header: {
          background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
          borderBottom: "1px solid rgba(74, 125, 255, 0.08)",
        },
      }}
    >
      <Stack gap="sm" mt="xs">
        <div>
          <Text size="sm" fw={500} mb={4}>
            {notification.title}
          </Text>
          <Group gap={6}>
            <Badge size="xs" variant="light" color="gray">
              {notification.source}
            </Badge>
            {notification.taskType && (
              <Badge size="xs" variant="outline" color="gray">
                {notification.taskType}
              </Badge>
            )}
          </Group>
        </div>

        <Select
          label="Target Repository"
          description={
            detectedRepo
              ? `Auto-detected from ${notification.source}`
              : "Select the repo to work in"
          }
          data={allRepos}
          value={repoPath}
          onChange={(v) => setRepoPath(v ?? "")}
          placeholder="Select a repo..."
          searchable
          required
          styles={{
            input: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
            dropdown: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
          }}
        />

        <TextInput
          label="Branch Name"
          description="Will be created by /start-work if it doesn't exist"
          value={branch}
          onChange={(e) => setBranch(e.currentTarget.value)}
          placeholder="username/ticket-description"
          styles={{
            input: {
              backgroundColor: "rgba(74, 125, 255, 0.08)",
              fontFamily: "var(--mantine-font-family-monospace)",
              fontSize: "0.85rem",
            },
          }}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" size="xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="xs"
            leftSection={<IconRocket size={16} />}
            loading={loading}
            disabled={!repoPath}
            onClick={handleConfirm}
          >
            Start Work
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
