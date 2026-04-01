/**
 * Context Picker — search Linear, Slack, Notion via the bridge
 * and attach results as context to agents or tasks.
 */
import { Badge, Group, Loader, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconBrandGithub, IconHash, IconSearch, IconX, IconCheck } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useState, useCallback, useRef } from "react";
import { getSlackBaseUrl } from "../../shared/task-utils";

type ConnectorType = "linear" | "slack" | "notion";

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  type: ConnectorType;
}

interface ContextPickerProps {
  onSelect: (items: SearchResult[]) => void;
  onClose: () => void;
}

const CONNECTORS: Array<{ key: ConnectorType; label: string; Icon: React.FC<{ size?: number; color?: string }>; color: string; placeholder: string }> = [
  { key: "linear", label: "Linear", Icon: SiLinear as React.FC<{ size?: number; color?: string }>, color: "#5E6AD2", placeholder: "Search issues by title or ID (e.g. VEC-10)..." },
  { key: "slack", label: "Slack", Icon: IconHash, color: "#E01E5A", placeholder: "Search channels or messages..." },
  { key: "notion", label: "Notion", Icon: SiNotion as React.FC<{ size?: number; color?: string }>, color: "#FFFFFF", placeholder: "Search pages and databases..." },
];

export function ContextPicker({ onSelect, onClose }: ContextPickerProps) {
  const [activeTab, setActiveTab] = useState<ConnectorType>("linear");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string, connector: ConnectorType) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);

    const prompts: Record<ConnectorType, string> = {
      linear: `Search Linear for issues matching "${q}". Return a JSON array of results: [{"id": "VEC-10", "title": "Issue title", "url": "https://linear.app/..."}]. Only return the JSON array, nothing else.`,
      slack: `Search Slack for channels or messages matching "${q}". Return a JSON array: [{"id": "C12345", "title": "#channel-name or message preview", "url": "${getSlackBaseUrl()}/..."}]. Only return the JSON array.`,
      notion: `Search Notion for pages matching "${q}". Return a JSON array: [{"id": "page-id", "title": "Page title", "url": "https://notion.so/..."}]. Only return the JSON array.`,
    };

    try {
      const response = await window.deck.sendManagerMessage(prompts[connector]);
      // Try to extract JSON array from response
      const content = (response as { content?: string })?.content ?? "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ id: string; title: string; subtitle?: string; url?: string }>;
        setResults(parsed.map(r => ({ ...r, type: connector })));
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value, activeTab), 500);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAttach = () => {
    const items = results.filter(r => selected.has(r.id));
    onSelect(items);
  };

  const connector = CONNECTORS.find(c => c.key === activeTab)!;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "color-mix(in srgb, var(--mantine-color-body) 50%, transparent)", backdropFilter: "blur(4px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxHeight: "70vh", display: "flex", flexDirection: "column",
        borderRadius: 12, overflow: "hidden",
        backgroundColor: "var(--mantine-color-default)",
        border: "1px solid var(--mantine-color-default-border)",
        boxShadow: "0 16px 48px color-mix(in srgb, var(--mantine-color-body) 60%, transparent)",
      }}>
        {/* Header with tabs */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--mantine-color-default-border)" }}>
          <Group justify="space-between" mb={10}>
            <Text size="sm" fw={600}>Add Context</Text>
            <UnstyledButton onClick={onClose}><IconX size={16} color="var(--mantine-color-dimmed)" /></UnstyledButton>
          </Group>
          <Group gap={4}>
            {CONNECTORS.map(c => (
              <UnstyledButton
                key={c.key}
                onClick={() => { setActiveTab(c.key); setResults([]); setQuery(""); }}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 6,
                  backgroundColor: activeTab === c.key ? "var(--mantine-color-default-hover)" : "transparent",
                  color: activeTab === c.key ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
                }}
              >
                <c.Icon size={14} color={activeTab === c.key ? c.color : "var(--mantine-color-dimmed)"} />
                {c.label}
              </UnstyledButton>
            ))}
          </Group>
        </div>

        {/* Search input */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--mantine-color-default-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, backgroundColor: "var(--mantine-color-default-hover)" }}>
            <IconSearch size={14} color="var(--mantine-color-dimmed)" />
            <input
              type="text"
              placeholder={connector.placeholder}
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              autoFocus
              style={{
                flex: 1, border: "none", outline: "none", fontSize: "0.8rem",
                backgroundColor: "transparent", color: "var(--mantine-color-text)",
                fontFamily: "inherit",
              }}
            />
            {searching && <Loader size={14} />}
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
          {results.length === 0 && !searching && query && (
            <Text size="xs" c="dimmed" ta="center" py="xl">No results found</Text>
          )}
          {results.length === 0 && !searching && !query && (
            <Text size="xs" c="dimmed" ta="center" py="xl">Type to search {connector.label}</Text>
          )}
          <Stack gap={4}>
            {results.map(r => (
              <UnstyledButton
                key={r.id}
                onClick={() => toggleSelect(r.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 6,
                  backgroundColor: selected.has(r.id) ? `color-mix(in srgb, ${connector.color} 15%, transparent)` : "var(--mantine-color-default-hover)",
                  border: `1px solid ${selected.has(r.id) ? connector.color : "transparent"}`,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${selected.has(r.id) ? connector.color : "var(--mantine-color-dimmed)"}`,
                  backgroundColor: selected.has(r.id) ? connector.color : "transparent",
                }}>
                  {selected.has(r.id) && <IconCheck size={12} color="var(--mantine-color-white)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="xs" fw={500} truncate>{r.title}</Text>
                  {r.subtitle && <Text size="xs" c="dimmed" truncate>{r.subtitle}</Text>}
                </div>
                <Badge size="xs" variant="light" color="gray">{r.id}</Badge>
              </UnstyledButton>
            ))}
          </Stack>
        </div>

        {/* Footer */}
        {selected.size > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--mantine-color-default-border)" }}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">{selected.size} selected</Text>
              <UnstyledButton onClick={handleAttach} style={{
                padding: "6px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                backgroundColor: "var(--mantine-color-blue-filled)", color: "var(--mantine-color-white)",
              }}>
                Attach
              </UnstyledButton>
            </Group>
          </div>
        )}
      </div>
    </div>
  );
}
