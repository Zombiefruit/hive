/**
 * WorkTab — shows worktree status, git diff, and changed files for hack/ship/review stages.
 */

import { Group, Loader, Stack, Text } from "@mantine/core";
import { IconGitBranch, IconCode, IconFileText } from "@tabler/icons-react";
import { useEffect, useState } from "react";

interface WorkTabProps {
  repoPath?: string;
  branch?: string;
  sessionId?: string;
  workSlug?: string;
}

interface DiffSummary {
  files: Array<{ path: string; additions: number; deletions: number }>;
  totalAdditions: number;
  totalDeletions: number;
  diffText: string;
}

export function WorkTab({ repoPath, branch, sessionId, workSlug }: WorkTabProps) {
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!repoPath) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const result = await window.deck.getWorkDiff?.(repoPath, branch);
        if (!cancelled && result) setDiff(result as DiffSummary);
      } catch {}
      if (!cancelled) setLoading(false);
    })();

    // Refresh every 15s while tab is open
    const interval = setInterval(async () => {
      try {
        const result = await window.deck.getWorkDiff?.(repoPath, branch);
        if (!cancelled && result) setDiff(result as DiffSummary);
      } catch {}
    }, 15000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [repoPath, branch]);

  if (!repoPath) {
    return (
      <Stack align="center" py="xl" gap="sm">
        <IconGitBranch size={32} color="var(--aegen-dust-gray)" />
        <Text size="sm" c="dimmed">No repo selected.</Text>
        <Text size="xs" c="dimmed">Select a repo when starting work to see changes here.</Text>
      </Stack>
    );
  }

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Branch info (compact — no action buttons, those are elsewhere) */}
      {branch && (
        <Group gap={6} wrap="nowrap">
          <IconGitBranch size={12} color="var(--mantine-color-teal-5)" style={{ flexShrink: 0 }} />
          <Text size="xs" fw={600} truncate style={{ color: "var(--mantine-color-teal-4)" }}>{branch}</Text>
        </Group>
      )}

      {/* Loading */}
      {loading && (
        <Group gap={6} justify="center" py="md">
          <Loader size={14} />
          <Text size="xs" c="dimmed">Loading diff...</Text>
        </Group>
      )}

      {/* Changed files */}
      {diff && diff.files.length > 0 && (
        <div style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: "var(--aegen-glass-bg)",
          border: "1px solid var(--aegen-glass-border)",
        }}>
          <Group gap={6} mb={8}>
            <IconFileText size={12} />
            <Text size="xs" fw={600} c="dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Changed Files ({diff.files.length})
            </Text>
            <Text size="xs" c="green.5" style={{ marginLeft: "auto" }}>+{diff.totalAdditions}</Text>
            <Text size="xs" c="red.5">-{diff.totalDeletions}</Text>
          </Group>
          <Stack gap={2}>
            {diff.files.map((f) => (
              <Group key={f.path} gap={6} wrap="nowrap">
                <IconCode size={10} color="var(--aegen-dust-gray)" style={{ flexShrink: 0 }} />
                <Text size="xs" truncate style={{ flex: 1, fontFamily: "var(--mantine-font-family-monospace)", fontSize: "0.65rem" }}>
                  {f.path}
                </Text>
                <Text size="xs" c="green.5" style={{ flexShrink: 0, fontSize: "0.6rem" }}>+{f.additions}</Text>
                <Text size="xs" c="red.5" style={{ flexShrink: 0, fontSize: "0.6rem" }}>-{f.deletions}</Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}

      {/* No changes yet */}
      {diff && diff.files.length === 0 && !loading && (
        <Text size="xs" c="dimmed" ta="center" py="md">No changes yet.</Text>
      )}
    </div>
  );
}
