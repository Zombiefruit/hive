import { Stack, Text, UnstyledButton } from "@mantine/core";
import { IconExternalLink, IconBrandSlack, IconBrandGithub, IconFileText } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { EmptyState } from "./shared";

interface ContextItem {
  type: string;
  content: string;
  timestamp: string;
}

interface NotificationLink {
  type: string;
  label: string;
  url: string;
}

interface ContextTabProps {
  items: ContextItem[];
  notificationLinks?: NotificationLink[];
  onOpenUrl: (url: string) => void;
}

const typeIcons: Record<string, React.FC<{ size?: number }>> = {
  slack: IconBrandSlack,
  linear: SiLinear as React.FC<{ size?: number }>,
  github: IconBrandGithub,
  notion: SiNotion as React.FC<{ size?: number }>,
};

export function ContextTab({ items, notificationLinks, onOpenUrl }: ContextTabProps) {
  const hasContent = items.length > 0 || (notificationLinks?.length ?? 0) > 0;
  if (!hasContent) {
    return <EmptyState icon={IconFileText} message="No context fetched yet." />;
  }

  // Only show tool_use items (extracted links from MCP calls) — not raw agent text
  const toolItems = items.filter(i => i.type === "tool_use");

  const links: Array<{ type: string; label: string; url: string }> = [];
  for (const item of toolItems) {
    const urlMatch = item.content.match(/https?:\/\/[^\s"]+/);
    if (urlMatch) {
      const sourceType = item.content.includes("Slack") ? "slack"
        : item.content.includes("Linear") ? "linear"
        : item.content.includes("GitHub") ? "github"
        : item.content.includes("Notion") ? "notion"
        : "other";
      links.push({ type: sourceType, label: item.content.slice(0, 60), url: urlMatch[0] });
    }
  }

  // Merge notification links with extracted tool links, dedup by ticket/PR ID
  const seenIds = new Set<string>();
  const dedup = (list: Array<{ type: string; label: string; url: string }>) =>
    list.filter(l => {
      const idMatch = l.url.match(/([A-Z]+-\d+)|\/pull\/(\d+)|\/issues\/(\d+)/);
      const key = idMatch ? (idMatch[1] || idMatch[2] || idMatch[3]).toUpperCase() : l.url;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });
  const allLinks = dedup([
    ...(notificationLinks ?? []),
    ...links.filter(l => !(notificationLinks ?? []).some(nl => nl.url === l.url)),
  ]);

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <Stack gap={8}>
        {allLinks.map((link, i) => {
          const Icon = typeIcons[link.type] ?? IconFileText;
          return (
            <UnstyledButton
              key={i}
              onClick={() => onOpenUrl(link.url)}
              style={{
                padding: "8px 12px", borderRadius: 8,
                background: "var(--aegen-glass-bg)", backdropFilter: "var(--aegen-glass-blur)",
                border: "1px solid var(--aegen-glass-border)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Icon size={14} />
              <Text size="xs" truncate style={{ flex: 1 }}>{link.label}</Text>
              <IconExternalLink size={12} color="var(--mantine-color-dimmed)" />
            </UnstyledButton>
          );
        })}
      </Stack>
    </div>
  );
}
