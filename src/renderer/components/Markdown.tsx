import { Code, Text } from "@mantine/core";

/**
 * Simple markdown-ish renderer that doesn't depend on react-markdown.
 * Handles: code blocks, inline code, bold, headers, lists, links.
 */
export function Markdown({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/);

  return (
    <div>
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} text={block} />
      ))}
    </div>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Code block: ```...```
  const codeBlockMatch = trimmed.match(/^```(\w*)\n?([\s\S]*?)```$/);
  if (codeBlockMatch) {
    return (
      <Code block style={{ fontSize: "0.75rem", marginBlock: 6 }}>
        {codeBlockMatch[2].trim()}
      </Code>
    );
  }

  // Heading
  if (trimmed.startsWith("### ")) {
    return <Text size="sm" fw={600} mt="xs">{renderInline(trimmed.slice(4))}</Text>;
  }
  if (trimmed.startsWith("## ")) {
    return <Text size="md" fw={600} mt="xs">{renderInline(trimmed.slice(3))}</Text>;
  }
  if (trimmed.startsWith("# ")) {
    return <Text size="lg" fw={700} mt="xs">{renderInline(trimmed.slice(2))}</Text>;
  }

  // List (bullet or numbered)
  if (/^[-*] /.test(trimmed) || /^\d+\. /.test(trimmed)) {
    const items = trimmed.split("\n").filter(Boolean);
    return (
      <ul style={{ margin: "4px 0", paddingLeft: 20, fontSize: "0.875rem" }}>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            {renderInline(item.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))}
          </li>
        ))}
      </ul>
    );
  }

  // Blockquote
  if (trimmed.startsWith("> ")) {
    return (
      <div style={{ borderLeft: "3px solid var(--mantine-color-blue-5)", paddingLeft: 12, margin: "4px 0", opacity: 0.85 }}>
        <Text size="sm">{renderInline(trimmed.replace(/^>\s?/gm, ""))}</Text>
      </div>
    );
  }

  // Regular paragraph — handle multi-line within a block
  const lines = trimmed.split("\n");
  return (
    <Text size="sm" style={{ marginBottom: 4 }}>
      {lines.map((line, i) => (
        <span key={i}>
          {renderInline(line)}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </Text>
  );
}

/** Render inline markdown: **bold**, `code`, [links](url) */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code: `...`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(<Code key={key++} style={{ fontSize: "0.8em" }}>{codeMatch[2]}</Code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold: **...**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      if (linkMatch[1]) parts.push(<span key={key++}>{linkMatch[1]}</span>);
      parts.push(<a key={key++} href={linkMatch[3]} target="_blank" rel="noopener" style={{ color: "var(--mantine-color-blue-4)" }}>{linkMatch[2]}</a>);
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // No match — emit rest as text
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
