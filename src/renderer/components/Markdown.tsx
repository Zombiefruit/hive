import { marked } from "marked";
import { useMemo, useCallback } from "react";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

const MARKDOWN_STYLES = `
.md-content {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--mantine-color-text);
}
.md-content p {
  margin: 0 0 8px 0;
}
.md-content p:last-child {
  margin-bottom: 0;
}
.md-content code {
  background: var(--mantine-color-default-hover);
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.8em;
  font-family: var(--mantine-font-family-monospace);
}
.md-content pre {
  background: var(--mantine-color-default-hover);
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
  font-size: 0.75rem;
}
.md-content pre code {
  background: none;
  padding: 0;
  font-size: inherit;
}
.md-content h1, .md-content h2, .md-content h3 {
  margin: 12px 0 6px 0;
  font-weight: 600;
}
.md-content h1 { font-size: 1.1rem; }
.md-content h2 { font-size: 1rem; }
.md-content h3 { font-size: 0.9rem; }
.md-content ul, .md-content ol {
  margin: 4px 0;
  padding-left: 20px;
}
.md-content li {
  margin-bottom: 2px;
}
.md-content blockquote {
  border-left: 3px solid var(--mantine-color-blue-5);
  margin: 8px 0;
  padding: 4px 12px;
  opacity: 0.85;
}
.md-content a {
  color: var(--mantine-color-blue-4);
  text-decoration: none;
}
.md-content a:hover {
  text-decoration: underline;
}
.md-content table {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.8rem;
  width: 100%;
}
.md-content th, .md-content td {
  border: 1px solid rgba(68, 73, 85, 0.2);
  padding: 4px 8px;
  text-align: left;
}
.md-content th {
  background: var(--mantine-color-default-hover);
  font-weight: 600;
}
.md-content strong {
  font-weight: 600;
}
.md-content hr {
  border: none;
  border-top: 1px solid rgba(68, 73, 85, 0.2);
  margin: 12px 0;
}
`;

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      return marked.parse(content, { async: false }) as string;
    } catch {
      return content;
    }
  }, [content]);

  // Intercept link clicks → open in external browser, not Electron
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor?.href) {
      e.preventDefault();
      window.deck?.openExternal(anchor.href);
    }
  }, []);

  return (
    <>
      <style>{MARKDOWN_STYLES}</style>
      <div
        className="md-content"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
    </>
  );
}
