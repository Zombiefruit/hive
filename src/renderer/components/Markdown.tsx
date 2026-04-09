import { marked } from "marked";
import { useMemo, useCallback } from "react";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// --- HTML sanitization (XSS prevention) ---
// Allowlisted tags that marked legitimately produces.
const SAFE_TAG_SET = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "code", "pre", "em", "strong", "a",
  "blockquote", "hr", "table", "thead", "tbody", "tr", "th", "td",
  "span", "div", "img", "del", "input", "sup", "sub",
]);

// Attributes that are always safe regardless of tag.
const SAFE_ATTR_SET = new Set([
  "class", "id", "align", "colspan", "rowspan", "scope",
  "type", "checked", "disabled", // for GFM task-list checkboxes
]);

// Per-tag extra allowed attributes.
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
};

// Dangerous URI scheme prefixes (case-insensitive check).
const DANGEROUS_URI_RE = /^\s*(javascript|vbscript|data)\s*:/i;

/**
 * Strip disallowed tags entirely; for allowed tags, strip disallowed or
 * dangerous attributes (e.g. event handlers like onerror, onclick, etc.).
 */
function sanitizeHtml(html: string): string {
  return html.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)?\/?>/gi, (full, tag: string, attrs: string) => {
    const lower = tag.toLowerCase();
    if (!SAFE_TAG_SET.has(lower)) return "";

    // Closing tags have no attributes to worry about.
    if (full.startsWith("</")) return `</${lower}>`;

    // Parse and filter attributes.
    const cleanAttrs: string[] = [];
    const attrRe = /([a-z][a-z0-9-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/gi;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrs || "")) !== null) {
      const name = m[1].toLowerCase();
      const value = m[2] ?? m[3] ?? m[4] ?? "";

      // Block all event handlers (on*).
      if (name.startsWith("on")) continue;
      // Block style (can contain expressions in old IE, and is an injection vector).
      if (name === "style") continue;

      // Must be in global safe set or tag-specific set.
      if (!SAFE_ATTR_SET.has(name) && !TAG_ATTRS[lower]?.has(name)) continue;

      // For URI-bearing attributes, block dangerous schemes.
      if ((name === "href" || name === "src") && DANGEROUS_URI_RE.test(value)) continue;

      cleanAttrs.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
    }

    const selfClose = full.endsWith("/>") ? " /" : "";
    const attrStr = cleanAttrs.length > 0 ? " " + cleanAttrs.join(" ") : "";
    return `<${lower}${attrStr}${selfClose}>`;
  });
}

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
  border: 1px solid var(--aegen-glass-border);
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
  border-top: 1px solid var(--aegen-glass-border);
  margin: 12px 0;
}
`;

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(content, { async: false }) as string;
      return sanitizeHtml(raw);
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
