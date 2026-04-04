/**
 * WorktreePanel — compact glass card showing worktree info for a task.
 * Shows branch, path, commit, modified file count, and "Open in Editor" button.
 */

import { Badge, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconCode, IconGitBranch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { WorktreeInfo } from "../../shared/worktree-types";

interface WorktreePanelProps {
  repoPath?: string;
  branch?: string;
}

export function WorktreePanel({ repoPath, branch }: WorktreePanelProps) {
  const [worktree, setWorktree] = useState<WorktreeInfo | null>(null);

  useEffect(() => {
    if (!repoPath || !branch) return;
    let cancelled = false;
    window.deck.getWorktreeForTask({ repoPath, branch }).then((wt: WorktreeInfo | null) => {
      if (!cancelled) setWorktree(wt);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [repoPath, branch]);

  if (!worktree) return null;

  // Truncate path for display: show last 3 segments
  const pathParts = worktree.path.split("/");
  const shortPath = pathParts.length > 3
    ? ".../" + pathParts.slice(-3).join("/")
    : worktree.path;

  const totalChanges = worktree.modifiedFiles + worktree.untrackedFiles;

  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--aegen-glass-bg)",
        backdropFilter: "var(--aegen-glass-blur)",
        border: "1px solid var(--aegen-glass-border)",
      }}
    >
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Branch name */}
          <Group gap={6} mb={2} wrap="nowrap">
            <IconGitBranch size={12} color="var(--mantine-color-teal-5)" style={{ flexShrink: 0 }} />
            <Text size="xs" fw={600} truncate style={{ color: "var(--mantine-color-teal-4)" }}>
              {worktree.branch}
            </Text>
            {totalChanges > 0 && (
              <Badge size="xs" variant="light" color="yellow" style={{ flexShrink: 0 }}>
                {totalChanges} changed
              </Badge>
            )}
          </Group>

          {/* Path (truncated, mono) */}
          <Tooltip label={worktree.path} position="bottom" withArrow>
            <Text
              size="xs"
              c="dimmed"
              truncate
              style={{
                fontFamily: "var(--mantine-font-family-monospace)",
                fontSize: "0.6rem",
                opacity: 0.7,
              }}
            >
              {shortPath}
            </Text>
          </Tooltip>

          {/* Commit info */}
          {worktree.head && (
            <Text size="xs" c="dimmed" truncate style={{ fontSize: "0.6rem", marginTop: 2 }}>
              <span style={{ fontFamily: "var(--mantine-font-family-monospace)", color: "var(--mantine-color-violet-4)" }}>
                {worktree.head}
              </span>
              {worktree.headMessage && (
                <span style={{ marginLeft: 4 }}>{worktree.headMessage}</span>
              )}
            </Text>
          )}
        </div>

        {/* Open in Editor button */}
        <Tooltip label="Open in editor" position="left" withArrow>
          <UnstyledButton
            onClick={() => window.deck.openWorktreeInEditor(worktree.path)}
            style={{
              padding: "6px",
              borderRadius: 6,
              backgroundColor: "rgba(74, 125, 255, 0.1)",
              color: "var(--mantine-color-blue-4)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconCode size={14} />
          </UnstyledButton>
        </Tooltip>
      </Group>
    </div>
  );
}
