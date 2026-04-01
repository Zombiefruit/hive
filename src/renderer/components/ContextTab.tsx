import { Stack, Text, UnstyledButton } from "@mantine/core";
import { IconExternalLink, IconHash, IconBrandGithub, IconFileText } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { EmptyState } from "./shared";

interface ContextItem {
  type: string;
  content: string;
  timestamp: string;
}

interface ContextTabProps {
  items: ContextItem[];
  onOpenUrl: (url: string) => void;
}

const typeIcons: Record<string, React.FC<{ size?: number }>> = {
  slack: IconHash,
  linear: SiLinear as React.FC<{ size?: number }>,
  github: IconBrandGithub,
  notion: SiNotion as React.FC<{ size?: number }>,
};

export function ContextTab({ items, onOpenUrl }: ContextTabProps) {
  if (items.length === 0) {
    return <EmptyState icon={IconFileText} message="No context fetched yet." />;
  }

  const textItems = items.filter(i => i.type === "text");
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

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <Stack gap={8}>
        {links.map((link, i) => {
          const Icon = typeIcons[link.type] ?? IconFileText;
          return (
            <UnstyledButton
              key={i}
              onClick={() => onOpenUrl(link.url)}
              style={{
                padding: "8px 12px", borderRadius: 8,
                backgroundColor: "var(--mantine-color-dark-7)",
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Icon size={14} />
              <Text size="xs" truncate style={{ flex: 1 }}>{link.label}</Text>
              <IconExternalLink size={12} color="var(--mantine-color-dimmed)" />
            </UnstyledButton>
          );
        })}
        {textItems.map((item, i) => (
          <div key={`t-${i}`} style={{
            padding: "8px 12px", borderRadius: 8,
            backgroundColor: "var(--mantine-color-dark-8)",
            border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)",
          }}>
            <Text size="xs" c="dimmed" mb={2} style={{ fontSize: "0.6rem" }}>{item.timestamp}</Text>
            <Text size="xs" style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto" }}>{item.content.slice(0, 500)}</Text>
          </div>
        ))}
      </Stack>
    </div>
  );
}
