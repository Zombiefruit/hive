import { Badge, Group, Stack, Text, TextInput, UnstyledButton, Progress } from "@mantine/core";
import { IconBrain, IconSearch, IconTrash, IconRefresh } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { GlobalLoadingBanner } from "../components/GlobalLoadingBanner";
import type { Memory } from "../../shared/memory-types";

const SCOPE_COLORS: Record<string, string> = {
  shared: "blue", triage: "orange", planning: "violet", work: "green",
};

const CATEGORY_COLORS: Record<string, string> = {
  people: "pink", priorities: "red", business: "blue", workflow: "cyan",
  coding: "gray", communication: "teal", impact: "yellow",
};

function MemoryCard({ memory, onDelete }: { memory: Memory; onDelete: () => void }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8, marginBottom: 8,
      background: "rgba(16, 21, 32, 0.65)",
      backdropFilter: "blur(16px) saturate(1.2)",
      border: "1px solid rgba(68, 73, 85, 0.2)",
    }}>
      <Group gap={6} mb={6} wrap="nowrap">
        <Badge size="xs" variant="light" color={SCOPE_COLORS[memory.scope] ?? "gray"}>{memory.scope}</Badge>
        <Badge size="xs" variant="outline" color={CATEGORY_COLORS[memory.category] ?? "gray"}>{memory.category}</Badge>
        <Badge size="xs" variant="light" color="gray">{memory.type}</Badge>
        <div style={{ flex: 1 }} />
        <Text size="xs" c="dimmed">{(memory.confidence * 100).toFixed(0)}%</Text>
        <UnstyledButton onClick={onDelete} style={{ padding: 2, color: "var(--mantine-color-dimmed)" }}>
          <IconTrash size={12} />
        </UnstyledButton>
      </Group>
      <Text size="sm" mb={4}>{memory.content}</Text>
      <Group gap={8}>
        <Progress value={memory.confidence * 100} size={3} color={memory.confidence > 0.7 ? "green" : memory.confidence > 0.4 ? "yellow" : "red"} style={{ flex: 1, maxWidth: 80 }} />
        {memory.source && <Text size="xs" c="dimmed">{memory.source}</Text>}
        <Text size="xs" c="dimmed">accessed {memory.accessCount}x</Text>
      </Group>
    </div>
  );
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<{ total: number; byScope: Record<string, number>; byCategory: Record<string, number> } | null>(null);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  const loadMemories = useCallback(async () => {
    setLocalLoading(true);
    try {
      const [mems, st] = await Promise.all([
        window.deck?.getMemories?.(scopeFilter ?? undefined),
        window.deck?.getMemoryStats?.(),
      ]);
      if (Array.isArray(mems)) setMemories(mems);
      if (st) setStats(st);
    } catch {}
    setLocalLoading(false);
  }, [scopeFilter]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) { loadMemories(); return; }
    setLocalLoading(true);
    try {
      const results = await window.deck?.searchMemories?.(search.trim(), scopeFilter ?? undefined);
      if (Array.isArray(results)) {
        setMemories(results.map((r: { memory: Memory }) => r.memory));
      }
    } catch {}
    setLocalLoading(false);
  }, [search, scopeFilter, loadMemories]);

  const handleDelete = useCallback(async (id: string) => {
    await window.deck?.deleteMemory?.(id);
    setMemories(prev => prev.filter(m => m.id !== id));
  }, []);

  const handleClearAll = useCallback(async () => {
    await window.deck?.clearMemories?.();
    setMemories([]);
    setStats({ total: 0, byScope: {}, byCategory: {} });
  }, []);

  const scopes = ["shared", "triage", "planning", "work"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--aegen-void)" }}>
      <AppHeader />
      <GlobalLoadingBanner />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {/* Stats header */}
        {stats && (
          <Group gap={16} mb={12}>
            <Group gap={6}>
              <IconBrain size={16} color="var(--mantine-color-violet-5)" />
              <Text size="sm" fw={600}>{stats.total} memories</Text>
            </Group>
            {Object.entries(stats.byScope).map(([scope, count]) => (
              <Badge key={scope} size="xs" variant="light" color={SCOPE_COLORS[scope] ?? "gray"}>
                {scope}: {count}
              </Badge>
            ))}
          </Group>
        )}

        {/* Search + filters */}
        <Group gap={8} mb={12}>
          <TextInput
            placeholder="Search memories..."
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            size="xs"
            style={{ flex: 1 }}
          />
          <UnstyledButton onClick={handleSearch} style={{ padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", backgroundColor: "var(--mantine-color-blue-filled)", color: "white" }}>
            Search
          </UnstyledButton>
          <UnstyledButton onClick={loadMemories} style={{ padding: 6, color: "var(--mantine-color-dimmed)" }}>
            <IconRefresh size={14} />
          </UnstyledButton>
        </Group>

        {/* Scope filter chips */}
        <Group gap={6} mb={12}>
          <UnstyledButton
            onClick={() => setScopeFilter(null)}
            style={{
              padding: "3px 10px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 500,
              backgroundColor: !scopeFilter ? "rgba(74, 125, 255, 0.08)" : "transparent",
              color: !scopeFilter ? "var(--aegen-star-white)" : "var(--aegen-dust-gray)",
            }}
          >
            All
          </UnstyledButton>
          {scopes.map(s => (
            <UnstyledButton
              key={s}
              onClick={() => setScopeFilter(scopeFilter === s ? null : s)}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 500,
                backgroundColor: scopeFilter === s ? "rgba(74, 125, 255, 0.08)" : "transparent",
                color: scopeFilter === s ? "var(--aegen-star-white)" : "var(--aegen-dust-gray)",
              }}
            >
              {s}
            </UnstyledButton>
          ))}
          <div style={{ flex: 1 }} />
          {memories.length > 0 && (
            <UnstyledButton
              onClick={handleClearAll}
              style={{ padding: "3px 10px", borderRadius: 6, fontSize: "0.7rem", color: "var(--mantine-color-red-5)" }}
            >
              Clear all
            </UnstyledButton>
          )}
        </Group>

        {/* Empty state */}
        {!localLoading && memories.length === 0 && (
          <Stack align="center" py="xl" gap="sm">
            <IconBrain size={32} color="var(--aegen-dust-gray)" />
            <Text size="sm" c="dimmed">No memories yet.</Text>
            <Text size="xs" c="dimmed">Memories are created automatically as agents learn from your interactions.</Text>
          </Stack>
        )}

        {/* Memory list */}
        {memories.map(m => (
          <MemoryCard key={m.id} memory={m} onDelete={() => handleDelete(m.id)} />
        ))}
      </div>
    </div>
  );
}
