import { Group, Text, UnstyledButton } from "@mantine/core";
import { IconFolder, IconPencil } from "@tabler/icons-react";

export function deriveBranch(title: string, username: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const full = `${username}/${slug}`;
  if (full.length <= 50) return full;
  const words = slug.split("-");
  let truncated = "";
  for (const word of words) {
    const candidate = truncated ? `${truncated}-${word}` : word;
    if (`${username}/${candidate}`.length > 47) break;
    truncated = candidate;
  }
  return `${username}/${truncated}`;
}

interface RepoDetectionBannerProps {
  repoPath: string;
  branch: string;
  source: string;
  onChangeRepo: () => void;
}

export function RepoDetectionBanner({ repoPath, branch, source, onChangeRepo }: RepoDetectionBannerProps) {
  const repoName = repoPath.split("/").pop() ?? repoPath;

  return (
    <div style={{
      padding: "8px 14px",
      borderRadius: 8,
      backgroundColor: "rgba(38, 191, 126, 0.06)",
      border: "1px solid rgba(38, 191, 126, 0.15)",
      marginBottom: 8,
    }}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconFolder size={14} color="var(--mantine-color-green-5)" />
          <div style={{ minWidth: 0 }}>
            <Text size="xs" fw={500} truncate>
              {repoName} <Text span c="dimmed" size="xs">({source})</Text>
            </Text>
            <Text size="xs" c="dimmed" truncate style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: "0.65rem" }}>
              {branch}
            </Text>
          </div>
        </Group>
        <UnstyledButton onClick={onChangeRepo} aria-label="Change repo" style={{
          padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem",
          color: "var(--mantine-color-blue-4)",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <IconPencil size={10} />
          Change
        </UnstyledButton>
      </Group>
    </div>
  );
}
