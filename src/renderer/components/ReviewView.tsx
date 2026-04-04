import { Badge, Group, Stack, Text, UnstyledButton, Checkbox } from "@mantine/core";
import { IconAlertTriangle, IconInfoCircle, IconBulb, IconDots, IconTool, IconMessageCircle } from "@tabler/icons-react";
import { useState } from "react";
import type { ParsedReview, ReviewFinding, Severity } from "../../shared/review-parser";

interface ReviewViewProps {
  review: ParsedReview;
  onFixSelected?: (findingIds: string[]) => void;
  onPostToPR?: () => void;
}

const SEVERITY_CONFIG: Record<Severity, { color: string; icon: typeof IconAlertTriangle; label: string }> = {
  BLOCKER: { color: "var(--mantine-color-red-filled)", icon: IconAlertTriangle, label: "Blocker" },
  ISSUE: { color: "var(--mantine-color-orange-filled)", icon: IconInfoCircle, label: "Issue" },
  SUGGESTION: { color: "var(--mantine-color-blue-filled)", icon: IconBulb, label: "Suggestion" },
  NIT: { color: "var(--mantine-color-dimmed)", icon: IconDots, label: "Nit" },
};

export function ReviewView({ review, onFixSelected, onPostToPR }: ReviewViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(review.findings.filter(f => f.checked).map(f => f.id))
  );

  const toggleFinding = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Stack gap={12}>
      {/* Summary bar */}
      <Group gap={12}>
        {review.blockerCount > 0 && (
          <Badge size="sm" color="red" variant="filled">{review.blockerCount} Blocker{review.blockerCount > 1 ? "s" : ""}</Badge>
        )}
        {review.issueCount > 0 && (
          <Badge size="sm" color="orange" variant="filled">{review.issueCount} Issue{review.issueCount > 1 ? "s" : ""}</Badge>
        )}
        {review.suggestionCount > 0 && (
          <Badge size="sm" color="blue" variant="light">{review.suggestionCount} Suggestion{review.suggestionCount > 1 ? "s" : ""}</Badge>
        )}
        {review.nitCount > 0 && (
          <Badge size="sm" color="gray" variant="light">{review.nitCount} Nit{review.nitCount > 1 ? "s" : ""}</Badge>
        )}
        {review.findings.length === 0 && (
          <Text size="sm" c="green">Clean review — no findings</Text>
        )}
      </Group>

      {/* Findings */}
      <Stack gap={8}>
        {review.findings.map(finding => {
          const config = SEVERITY_CONFIG[finding.severity];
          const SevIcon = config.icon;
          const selected = selectedIds.has(finding.id);
          return (
            <div
              key={finding.id}
              style={{
                padding: "10px 12px", borderRadius: 8,
                border: `1px solid color-mix(in srgb, ${config.color} 30%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${config.color} 5%, transparent)`,
              }}
            >
              <Group gap={8} mb={6} justify="space-between">
                <Group gap={6}>
                  <Checkbox
                    size="xs"
                    checked={selected}
                    onChange={() => toggleFinding(finding.id)}
                    color={config.color}
                  />
                  <SevIcon size={14} color={config.color} />
                  <Badge size="xs" variant="filled" style={{ backgroundColor: config.color }}>{finding.severity}</Badge>
                  <Text size="xs" c="dimmed">{finding.id}</Text>
                </Group>
                <Group gap={6}>
                  <Badge size="xs" variant="light" color="gray">{finding.reviewer}</Badge>
                  {finding.confidence > 0 && (
                    <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>{finding.confidence}%</Text>
                  )}
                </Group>
              </Group>

              {/* File reference */}
              <UnstyledButton
                onClick={() => window.deck?.openExternal?.(`vscode://file/${finding.file.split(":")[0]}`)}
                style={{ marginBottom: 4 }}
              >
                <Text size="xs" c="blue.4" style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: "0.7rem" }}>
                  {finding.file} →
                </Text>
              </UnstyledButton>

              {/* Description */}
              <Text size="xs" mb={4}>{finding.description}</Text>

              {/* Why it matters */}
              {finding.whyItMatters && (
                <Text size="xs" c="dimmed" mb={4} style={{ fontStyle: "italic" }}>
                  {finding.whyItMatters}
                </Text>
              )}

              {/* Suggestion */}
              {finding.suggestion && (
                <div style={{
                  padding: "6px 10px", borderRadius: 4, marginTop: 4,
                  backgroundColor: "rgba(74, 125, 255, 0.08)",
                  borderLeft: `3px solid ${config.color}`,
                  fontSize: "0.7rem",
                }}>
                  <Text size="xs" fw={500} mb={2}>Suggestion:</Text>
                  <Text size="xs">{finding.suggestion}</Text>
                </div>
              )}
            </div>
          );
        })}
      </Stack>

      {/* Actions */}
      {review.findings.length > 0 && (
        <Group gap={8} mt={4}>
          {onFixSelected && (
            <UnstyledButton
              onClick={() => onFixSelected(Array.from(selectedIds))}
              style={{
                padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                backgroundColor: selectedIds.size > 0 ? "var(--mantine-color-blue-filled)" : "rgba(74, 125, 255, 0.08)",
                color: selectedIds.size > 0 ? "var(--mantine-color-white)" : "var(--mantine-color-text)", display: "flex", alignItems: "center", gap: 6,
                opacity: selectedIds.size > 0 ? 1 : 0.5,
              }}
              disabled={selectedIds.size === 0}
            >
              <IconTool size={14} /> Fix Selected ({selectedIds.size})
            </UnstyledButton>
          )}
          {onPostToPR && (
            <UnstyledButton onClick={onPostToPR} style={{
              padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500,
              border: "1px solid var(--aegen-glass-border)", color: "var(--mantine-color-text)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <IconMessageCircle size={14} /> Post to PR
            </UnstyledButton>
          )}
        </Group>
      )}
    </Stack>
  );
}
