/**
 * ReviewTab — displays code review findings from the /code-review skill.
 * Renders markdown properly. Includes "Post to PR" button.
 */

import { Badge, Group, Loader, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconCheck, IconFileText, IconBrandGithub } from "@tabler/icons-react";
import { useEffect, useState, useMemo } from "react";
import { marked } from "marked";

interface ReviewTabProps {
  repoPath?: string;
  workSlug?: string;
  branch?: string;
  prUrl?: string;
}

export function ReviewTab({ repoPath, workSlug, branch, prUrl }: ReviewTabProps) {
  const [reviews, setReviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (!repoPath || !workSlug) { setLoading(false); return; }
    let cancelled = false;

    window.deck.readReviews?.(repoPath, workSlug).then((data: unknown) => {
      if (!cancelled && Array.isArray(data)) {
        setReviews(data.map((d: unknown) => typeof d === "string" ? d : (d as { content?: string }).content ?? ""));
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });

    const interval = setInterval(() => {
      window.deck.readReviews?.(repoPath, workSlug).then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) {
          setReviews(data.map((d: unknown) => typeof d === "string" ? d : (d as { content?: string }).content ?? ""));
        }
      }).catch(() => {});
    }, 10000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [repoPath, workSlug]);

  // Render markdown
  const renderedHtml = useMemo(() => {
    if (reviews.length === 0) return "";
    return reviews.map(r => {
      try { return marked.parse(r) as string; } catch { return r; }
    }).join("<hr/>");
  }, [reviews]);

  const handlePostToPr = async () => {
    if (!branch || posting) return;
    setPosting(true);
    try {
      const combinedReview = reviews.join("\n\n---\n\n");
      await window.deck.postReviewToPr?.(branch, combinedReview);
      setPosted(true);
    } catch {}
    setPosting(false);
  };

  if (loading) {
    return (
      <Group gap={6} justify="center" py="xl">
        <Loader size={14} />
        <Text size="xs" c="dimmed">Loading review...</Text>
      </Group>
    );
  }

  if (reviews.length === 0) {
    return (
      <Stack align="center" py="xl" gap="sm">
        <IconFileText size={32} color="var(--aegen-dust-gray)" />
        <Text size="sm" c="dimmed">No review findings yet.</Text>
        <Text size="xs" c="dimmed">Click "Run Agent Review" to analyze the code.</Text>
      </Stack>
    );
  }

  // Count findings by severity
  const text = reviews.join("\n");
  const criticals = (text.match(/\*\*critical\*\*/gi) || []).length;
  const warnings = (text.match(/\*\*warning\*\*/gi) || []).length;

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Summary + Post to PR */}
      <Group gap={8} justify="space-between">
        <Group gap={8}>
          {criticals > 0 && <Badge color="red" size="sm">{criticals} critical</Badge>}
          {warnings > 0 && <Badge color="yellow" size="sm">{warnings} warning</Badge>}
          {criticals === 0 && warnings === 0 && <Badge color="green" size="sm"><IconCheck size={10} /> Clean</Badge>}
        </Group>
        {(prUrl || branch) && (
          <UnstyledButton
            onClick={handlePostToPr}
            disabled={posting || posted}
            style={{
              padding: "4px 10px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 500,
              display: "flex", alignItems: "center", gap: 4,
              backgroundColor: posted ? "rgba(34, 197, 94, 0.1)" : "rgba(74, 125, 255, 0.08)",
              color: posted ? "var(--mantine-color-green-5)" : "var(--mantine-color-blue-4)",
              opacity: posting ? 0.6 : 1,
            }}
          >
            {posting ? <Loader size={10} /> : <IconBrandGithub size={12} />}
            {posted ? "Posted" : "Post to PR"}
          </UnstyledButton>
        )}
      </Group>

      {/* Rendered markdown */}
      <div
        className="review-markdown"
        style={{
          padding: "10px 12px", borderRadius: 8,
          background: "var(--aegen-glass-bg)", border: "1px solid var(--aegen-glass-border)",
          fontSize: "0.8rem", lineHeight: 1.6,
          overflow: "auto",
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}
