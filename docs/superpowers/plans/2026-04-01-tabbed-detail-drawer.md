# Tabbed Detail Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic detail pane with a tabbed drawer (Agent, Plan, Context, Timeline), fix repo detection to skip modal, and ensure agent questions are always answerable.

**Architecture:** Extract the 900-line `DetailPane` from `notifications.tsx` into `DetailDrawer` (tab routing) + 4 tab components + `ChatBubble` + `RepoDetectionBanner`. `AgentTab` owns conversation/activity state and message routing. Mantine `Tabs` component for tab bar.

**Tech Stack:** React 19, Mantine 8.x `Tabs`, TypeScript, Vitest

---

### Task 1: ChatBubble Component

**Files:**
- Create: `src/renderer/components/ChatBubble.tsx`
- Create: `src/renderer/components/chat-bubble.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/components/chat-bubble.test.ts
import { describe, it, expect } from "vitest";
import { isQuestion } from "./ChatBubble";

describe("isQuestion", () => {
  it("should detect questions ending with ?", () => {
    expect(isQuestion("Do you have a Linear ticket?")).toBe(true);
    expect(isQuestion("What repo should I use?")).toBe(true);
  });

  it("should detect input prompts", () => {
    expect(isQuestion("share the ticket ID or doc link")).toBe(true);
    expect(isQuestion("Otherwise, describe what you want to build")).toBe(true);
  });

  it("should not flag normal statements", () => {
    expect(isQuestion("I found 3 relevant files")).toBe(false);
    expect(isQuestion("Plan complete")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/chat-bubble.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/components/ChatBubble.tsx
import { Text } from "@mantine/core";

export function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return true;
  const lower = trimmed.toLowerCase();
  const prompts = ["share the", "provide the", "describe what", "tell me", "what would you", "which approach", "do you have"];
  return prompts.some(p => lower.includes(p));
}

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatBubble({ role, content }: ChatBubbleProps) {
  const isUser = role === "user";
  const question = !isUser && isQuestion(content);

  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 12,
      maxWidth: isUser ? "80%" : "100%",
      marginLeft: isUser ? "auto" : 0,
      marginBottom: 8,
      backgroundColor: isUser
        ? "color-mix(in srgb, var(--mantine-color-blue-5) 15%, transparent)"
        : "var(--mantine-color-dark-7)",
      border: question
        ? "1px solid color-mix(in srgb, var(--mantine-color-yellow-5) 40%, transparent)"
        : isUser ? "none" : "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
    }}>
      <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {content}
      </Text>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/chat-bubble.test.ts`
Expected: PASS — 3 tests green

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ChatBubble.tsx src/renderer/components/chat-bubble.test.ts
git commit -m "feat: ChatBubble component with question detection"
```

---

### Task 2: RepoDetectionBanner Component

**Files:**
- Create: `src/renderer/components/RepoDetectionBanner.tsx`
- Create: `src/renderer/components/repo-detection-banner.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/components/repo-detection-banner.test.ts
import { describe, it, expect } from "vitest";
import { deriveBranch } from "./RepoDetectionBanner";

describe("deriveBranch", () => {
  it("should derive branch from ticket ID in title", () => {
    expect(deriveBranch("VEC-44: Add Mixpanel tracking", "kwilliams")).toBe("kwilliams/vec-44-add-mixpanel-tracking");
  });

  it("should truncate long branch names to 50 chars", () => {
    const long = "VEC-100: Implement a very long feature name that goes on and on and on";
    const branch = deriveBranch(long, "kwilliams");
    expect(branch.length).toBeLessThanOrEqual(50);
    expect(branch).toContain("kwilliams/vec-100");
  });

  it("should handle titles without ticket IDs", () => {
    expect(deriveBranch("Fix the login bug", "kwilliams")).toBe("kwilliams/fix-the-login-bug");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/repo-detection-banner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/components/RepoDetectionBanner.tsx
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
  // Keep ticket prefix + truncate semantically
  const words = slug.split("-");
  let truncated = "";
  for (const word of words) {
    const candidate = truncated ? `${truncated}-${word}` : word;
    if (`${username}/${candidate}`.length > 47) break; // leave room for potential ...
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
      backgroundColor: "color-mix(in srgb, var(--mantine-color-green-5) 8%, transparent)",
      border: "1px solid color-mix(in srgb, var(--mantine-color-green-5) 25%, transparent)",
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/repo-detection-banner.test.ts`
Expected: PASS — 3 tests green

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/RepoDetectionBanner.tsx src/renderer/components/repo-detection-banner.test.ts
git commit -m "feat: RepoDetectionBanner with branch derivation"
```

---

### Task 3: Tab Components (PlanTab, ContextTab, TimelineTab)

**Files:**
- Create: `src/renderer/components/PlanTab.tsx`
- Create: `src/renderer/components/ContextTab.tsx`
- Create: `src/renderer/components/TimelineTab.tsx`

- [ ] **Step 1: Write PlanTab**

```typescript
// src/renderer/components/PlanTab.tsx
import { Stack, Text } from "@mantine/core";
import { IconFileText } from "@tabler/icons-react";
import { useMemo } from "react";
import { PlanView } from "./PlanView";
import { parsePlanMd } from "../../shared/plan-parser";
import { EmptyState } from "./shared";

interface PlanTabProps {
  planText: string | null;
}

export function PlanTab({ planText }: PlanTabProps) {
  const parsedPlan = useMemo(() => (planText ? parsePlanMd(planText) : null), [planText]);

  if (!parsedPlan) {
    return <EmptyState icon={IconFileText} message="No plan yet." detail="Start work from the Agent tab to generate a plan." />;
  }

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <PlanView plan={parsedPlan} />
    </div>
  );
}
```

- [ ] **Step 2: Write ContextTab**

```typescript
// src/renderer/components/ContextTab.tsx
import { Badge, Group, Stack, Text, UnstyledButton } from "@mantine/core";
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

  // Extract URLs from tool_use events
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
```

- [ ] **Step 3: Write TimelineTab**

```typescript
// src/renderer/components/TimelineTab.tsx
import { Stack, Text } from "@mantine/core";
import { IconTimeline } from "@tabler/icons-react";
import { EmptyState, formatTimeSince } from "./shared";

interface TimelineEntry {
  timestamp: string;
  event: string;
}

interface TimelineTabProps {
  entries: TimelineEntry[];
}

export function TimelineTab({ entries }: TimelineTabProps) {
  if (entries.length === 0) {
    return <EmptyState icon={IconTimeline} message="No timeline events." />;
  }

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <div style={{ borderLeft: "2px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)", paddingLeft: 12 }}>
        {[...entries].reverse().map((entry, i) => {
          const isCreation = entry.event.toLowerCase().includes("created") || entry.event.toLowerCase().includes("new");
          const isStage = entry.event.toLowerCase().includes("moved") || entry.event.toLowerCase().includes("stage");
          const dotColor = isCreation ? "var(--mantine-color-green-5)" : isStage ? "var(--mantine-color-blue-5)" : "var(--mantine-color-dimmed)";

          return (
            <div key={i} style={{ position: "relative", paddingBottom: 12, paddingLeft: 8 }}>
              <div style={{
                position: "absolute", left: -17, top: 4,
                width: 8, height: 8, borderRadius: "50%",
                backgroundColor: dotColor,
              }} />
              <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                {formatTimeSince(entry.timestamp)}
              </Text>
              <Text size="xs">{entry.event}</Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PlanTab.tsx src/renderer/components/ContextTab.tsx src/renderer/components/TimelineTab.tsx
git commit -m "feat: PlanTab, ContextTab, TimelineTab components"
```

---

### Task 4: AgentTab Component

**Files:**
- Create: `src/renderer/components/AgentTab.tsx`
- Create: `src/renderer/components/agent-tab.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/components/agent-tab.test.ts
import { describe, it, expect } from "vitest";
import { shouldAutoExpand, getInputPlaceholder } from "./AgentTab";

describe("shouldAutoExpand", () => {
  it("should expand activity log when loading", () => {
    expect(shouldAutoExpand(true, 5)).toBe(true);
  });

  it("should not expand when not loading and has events", () => {
    expect(shouldAutoExpand(false, 5)).toBe(false);
  });

  it("should not expand when no events", () => {
    expect(shouldAutoExpand(false, 0)).toBe(false);
  });
});

describe("getInputPlaceholder", () => {
  it("should show disabled message when no agent and no conversation", () => {
    expect(getInputPlaceholder(false, false)).toBe("Start work to begin a conversation...");
  });

  it("should show active prompt when skill running", () => {
    expect(getInputPlaceholder(true, true)).toBe("Reply to agent...");
  });

  it("should show feedback prompt when conversation exists", () => {
    expect(getInputPlaceholder(false, true)).toBe("Push back, ask questions, or refine the plan...");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/agent-tab.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/components/AgentTab.tsx
import { Group, Loader, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronRight, IconSend } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "./ChatBubble";
import { NextStepsCard, type NextStepsCardProps } from "./NextStepsCard";
import { parseActions } from "../../shared/action-parser";
import { Markdown } from "./Markdown";

// ── Exported helpers (tested) ──

export function shouldAutoExpand(loading: boolean, eventCount: number): boolean {
  return loading && eventCount > 0;
}

export function getInputPlaceholder(skillRunning: boolean, hasConversation: boolean): string {
  if (skillRunning) return "Reply to agent...";
  if (hasConversation) return "Push back, ask questions, or refine the plan...";
  return "Start work to begin a conversation...";
}

// ── Types ──

interface AgentTabProps {
  notificationId: string;
  conversation: Array<{ role: string; content: string }>;
  activity: Array<{ type: string; content: string; timestamp: string }>;
  loading: boolean;
  skillRunning: boolean;
  onSendMessage: (message: string) => void;
  actionHandlers: Omit<NextStepsCardProps, "actions">;
}

// ── Component ──

export function AgentTab({
  notificationId,
  conversation,
  activity,
  loading,
  skillRunning,
  onSendMessage,
  actionHandlers,
}: AgentTabProps) {
  const [feedback, setFeedback] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-expand activity while loading
  useEffect(() => {
    if (shouldAutoExpand(loading, activity.length)) setShowActivity(true);
    if (!loading && showActivity) setShowActivity(false);
  }, [loading, activity.length]);

  // Auto-scroll conversation
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.length, loading]);

  const handleSend = () => {
    if (!feedback.trim()) return;
    onSendMessage(feedback.trim());
    setFeedback("");
  };

  // Parse actions from last assistant message
  const lastAssistant = [...conversation].reverse().find(m => m.role === "assistant");
  const actions = lastAssistant ? parseActions(lastAssistant.content) : [];

  const hasConversation = conversation.length > 0;
  const inputDisabled = !skillRunning && !hasConversation;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Zone 1: Chat bubbles (scrollable) */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {conversation.length === 0 && !loading && (
          <Stack align="center" py="xl" gap="sm">
            <Text size="sm" c="dimmed">Click "Start Work" to begin planning.</Text>
          </Stack>
        )}

        {conversation.map((msg, i) => {
          if (msg.role === "assistant" && msg.content.includes("\n---\n")) {
            const parts = msg.content.split("\n---\n");
            const tldr = parts[0].trim();
            const details = parts.slice(1).join("\n---\n").trim();
            return (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: 12, marginBottom: 8,
                backgroundColor: "var(--mantine-color-dark-7)",
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
              }}>
                <Markdown content={tldr} />
                {details && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--mantine-color-dimmed)" }}>
                      Show details
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      <Markdown content={details} />
                    </div>
                  </details>
                )}
              </div>
            );
          }
          return <ChatBubble key={i} role={msg.role as "user" | "assistant"} content={msg.content} />;
        })}

        {/* Loading indicator */}
        {loading && hasConversation && (
          <Group gap={8} py="sm">
            <Loader size={14} />
            <Text size="xs" c="dimmed">Thinking...</Text>
          </Group>
        )}

        {/* Zone 2: NextStepsCard */}
        {actions.length > 0 && (
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <NextStepsCard actions={actions} {...actionHandlers} />
          </div>
        )}
      </div>

      {/* Zone 3: Activity log (collapsible) */}
      {activity.length > 0 && (
        <div style={{ borderTop: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)" }}>
          <UnstyledButton
            onClick={() => setShowActivity(!showActivity)}
            style={{
              width: "100%", padding: "6px 20px",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <IconChevronRight
              size={10}
              style={{ transform: showActivity ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            />
            <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
              Activity ({activity.length})
            </Text>
            {loading && <Loader size={10} />}
          </UnstyledButton>
          {showActivity && (
            <div style={{
              padding: "0 20px 8px", maxHeight: 200, overflowY: "auto",
              fontSize: "0.7rem", fontFamily: "var(--mantine-font-family-monospace)", lineHeight: 1.5,
            }}>
              {activity.slice(-20).map((evt, i) => {
                const color = evt.type === "error" ? "var(--mantine-color-red-5)"
                  : evt.type === "tool_use" ? "var(--mantine-color-blue-5)"
                  : evt.type === "init" ? "var(--mantine-color-green-5)"
                  : "var(--mantine-color-dimmed)";
                return (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "1px 8px" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: color, marginTop: 6, flexShrink: 0 }} />
                    <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }} truncate>{evt.content}</Text>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Zone 4: Sticky input */}
      <div style={{
        padding: "10px 20px",
        borderTop: "1px solid var(--mantine-color-default-border)",
        flexShrink: 0,
      }}>
        <Group gap="xs">
          <input
            type="text"
            placeholder={getInputPlaceholder(skillRunning, hasConversation)}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !inputDisabled) handleSend(); }}
            disabled={inputDisabled || loading}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: "0.8rem",
              backgroundColor: "var(--mantine-color-dark-6)",
              border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
              color: "var(--mantine-color-text)", outline: "none",
              fontFamily: "inherit",
              opacity: inputDisabled ? 0.5 : 1,
            }}
          />
          <UnstyledButton
            onClick={handleSend}
            disabled={!feedback.trim() || inputDisabled || loading}
            aria-label="Send message"
            style={{
              padding: "8px", borderRadius: 6,
              backgroundColor: feedback.trim() && !inputDisabled ? "var(--mantine-color-blue-5)" : "var(--mantine-color-dark-5)",
              color: feedback.trim() && !inputDisabled ? "white" : "var(--mantine-color-dimmed)",
            }}
          >
            <IconSend size={14} />
          </UnstyledButton>
        </Group>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/agent-tab.test.ts`
Expected: PASS — 6 tests green

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/AgentTab.tsx src/renderer/components/agent-tab.test.ts
git commit -m "feat: AgentTab with hybrid chat/log and sticky input"
```

---

### Task 5: DetailDrawer Component

**Files:**
- Create: `src/renderer/components/DetailDrawer.tsx`
- Create: `src/renderer/components/detail-drawer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/components/detail-drawer.test.ts
import { describe, it, expect } from "vitest";
import { getDefaultTab } from "./DetailDrawer";

describe("getDefaultTab", () => {
  it("should return 'agent' when conversation exists", () => {
    expect(getDefaultTab({ hasConversation: true, hasPlan: false, isLoading: false })).toBe("agent");
  });

  it("should return 'agent' when loading", () => {
    expect(getDefaultTab({ hasConversation: false, hasPlan: false, isLoading: true })).toBe("agent");
  });

  it("should return 'plan' when plan exists but no conversation", () => {
    expect(getDefaultTab({ hasConversation: false, hasPlan: true, isLoading: false })).toBe("plan");
  });

  it("should default to 'agent'", () => {
    expect(getDefaultTab({ hasConversation: false, hasPlan: false, isLoading: false })).toBe("agent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/detail-drawer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/components/DetailDrawer.tsx
import { Badge, Group, Loader, Tabs, Text, UnstyledButton } from "@mantine/core";
import { IconMessageCircle, IconFileText, IconDatabase, IconTimeline } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTab } from "./AgentTab";
import { PlanTab } from "./PlanTab";
import { ContextTab } from "./ContextTab";
import { TimelineTab } from "./TimelineTab";
import { RepoDetectionBanner, deriveBranch } from "./RepoDetectionBanner";
import { StartWorkModal } from "./StartWorkModal";
import { STAGE_META, SOURCE_COLORS } from "../../shared/ui-constants";
import { detectRepo } from "../../shared/repo-detection";
import { parseActions } from "../../shared/action-parser";
import type { NextStepsCardProps } from "./NextStepsCard";

// ── Exported helpers (tested) ──

export type TabId = "agent" | "plan" | "context" | "timeline";

export function getDefaultTab(state: { hasConversation: boolean; hasPlan: boolean; isLoading: boolean }): TabId {
  if (state.hasConversation || state.isLoading) return "agent";
  if (state.hasPlan) return "plan";
  return "agent";
}

// ── Types ──

interface NotificationItem {
  id: string;
  source: string;
  priority: string;
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  taskType?: string;
  author?: string;
  stage?: string;
  timeline?: Array<{ timestamp: string; event: string }>;
  repoPath?: string;
  sessionId?: string;
  workSlug?: string;
  branch?: string;
}

interface DetailDrawerProps {
  notification: NotificationItem;
  onClose: () => void;
  onDismiss: () => void;
  onPlanReady?: () => void;
  onPlanCleared?: () => void;
  config: { repoMappings?: Array<{ pattern: string; repoPath: string }> } | null;
  username: string;
}

// ── Component ──

export function DetailDrawer({
  notification: n,
  onClose,
  onDismiss,
  onPlanReady,
  onPlanCleared,
  config,
  username,
}: DetailDrawerProps) {
  // ── State ──
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [activity, setActivity] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);
  const [fetchedContext, setFetchedContext] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);
  const [planText, setPlanText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [skillRunning, setSkillRunning] = useState(false);
  const [startWorkOpen, setStartWorkOpen] = useState(false);
  const sendingRef = useRef(false);

  // ── Repo detection ──
  const detectedRepo = detectRepo({ title: n.title, links: n.links ?? [] }, config?.repoMappings ?? []);
  const suggestedBranch = deriveBranch(n.title, username);

  // ── Load existing plan + events on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plan = await window.deck.getPlan?.(n.id);
        if (cancelled) return;
        if (plan) {
          const p = plan as { conversationHistory?: Array<{ role: string; content: string }>; plan?: string; fetchedContext?: typeof fetchedContext };
          if (p.conversationHistory) setConversation(p.conversationHistory);
          if (p.plan) setPlanText(p.plan);
          if (p.fetchedContext) setFetchedContext(p.fetchedContext);
          onPlanReady?.();
        }
      } catch {}
      // Load persisted activity events
      try {
        const events = await window.deck.getPlanningEvents?.(n.id);
        if (!cancelled && Array.isArray(events)) setActivity(events);
      } catch {}
      // Check if skill is running
      try {
        const running = await window.deck.isSkillRunning?.(n.id);
        if (!cancelled) setSkillRunning(!!running);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [n.id]);

  // ── Listen to live planning events ──
  useEffect(() => {
    const unsub = window.deck.onPlanningEvent?.((data: { notificationId: string; event: { type: string; content: string; timestamp: string } }) => {
      if (data.notificationId !== n.id) return;
      const evt = data.event;
      setActivity(prev => [...prev, evt]);

      // Agent text → add to conversation
      if (evt.type === "text") {
        setConversation(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [...prev.slice(0, -1), { role: "assistant", content: last.content + "\n" + evt.content }];
          }
          return [...prev, { role: "assistant", content: evt.content }];
        });
      }

      // Result → mark complete
      if (evt.type === "result") {
        setLoading(false);
        setSkillRunning(false);
      }

      // Error → mark failed
      if (evt.type === "error") {
        setLoading(false);
      }

      // Auto-switch to agent tab on activity
      if (activeTab !== "agent") setActiveTab("agent");
    });
    return () => { unsub?.(); };
  }, [n.id, activeTab]);

  // ── Set default tab ──
  useEffect(() => {
    setActiveTab(getDefaultTab({
      hasConversation: conversation.length > 0,
      hasPlan: !!planText,
      isLoading: loading,
    }));
  }, []);

  // ── Handlers ──

  const handleSendMessage = useCallback(async (message: string) => {
    setConversation(prev => [...prev, { role: "user", content: message }]);
    setLoading(true);
    sendingRef.current = true;
    try {
      const isRunning = await window.deck.isSkillRunning?.(n.id);
      if (isRunning) {
        await window.deck.sendToSkill?.(n.id, message);
        setSkillRunning(true);
      } else {
        const result = await window.deck.iteratePlan(n.id, message);
        const plan = result as { conversationHistory?: typeof conversation };
        if (plan?.conversationHistory) setConversation(plan.conversationHistory);
      }
    } catch {}
    sendingRef.current = false;
    setLoading(false);
  }, [n.id]);

  const handleStartWork = useCallback(async (repoPath: string, branch: string) => {
    if (!repoPath?.trim()) return;
    setStartWorkOpen(false);
    setLoading(true);
    setSkillRunning(true);
    window.deck?.updateNotificationById?.(n.id, { stage: "start_work", repoPath, branch });

    const ticketMatch = n.title.match(/^([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : n.title;

    try {
      const result = await window.deck.runSkill({
        skill: "/start-work",
        args: ticketId,
        repoPath,
        sessionId: null,
        notificationId: n.id,
      });
      if (result && typeof result === "object") {
        const skillResult = result as { success: boolean; sessionId: string | null; resultText: string };
        if (skillResult.sessionId) {
          window.deck?.updateNotificationById?.(n.id, { sessionId: skillResult.sessionId });
        }
        const slug = branch.replace(/^[^/]+\//, "");
        const readPlan = await window.deck.readPlan?.(repoPath, slug);
        if (readPlan) {
          setPlanText(readPlan as string);
          window.deck?.updateNotificationById?.(n.id, { workSlug: slug });
          onPlanReady?.();
        }
        if (skillResult.resultText && !readPlan) {
          setConversation(prev => [...prev, { role: "assistant", content: skillResult.resultText }]);
        }
      }
    } catch (err) {
      console.error("Start work failed:", err);
    }
    setSkillRunning(false);
    setLoading(false);
  }, [n.id, n.title]);

  const handlePrepare = useCallback(() => {
    const isHuman = n.taskType === "response" || n.taskType === "meeting_prep";
    if (!isHuman) {
      // Auto-detected repo → start directly
      if (detectedRepo) {
        handleStartWork(detectedRepo, suggestedBranch);
        return;
      }
      // No repo detected → open modal
      setStartWorkOpen(true);
      return;
    }
    // Human tasks: run via MCP bridge
    setLoading(true);
    window.deck?.updateNotificationById?.(n.id, { stage: "preparing" });
    (async () => {
      try {
        const result = await window.deck.prepareWorkPlan({
          id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
          taskType: n.taskType, links: n.links,
        });
        const plan = result as { conversationHistory?: typeof conversation; fetchedContext?: typeof fetchedContext };
        if (plan?.conversationHistory) setConversation(plan.conversationHistory);
        if (plan?.fetchedContext) setFetchedContext(plan.fetchedContext);
        window.deck?.updateNotificationById?.(n.id, { stage: "ready" });
      } catch {}
      setLoading(false);
    })();
  }, [n.id, n.taskType, detectedRepo, suggestedBranch]);

  // ── Action handlers for NextStepsCard ──
  const actionHandlers: Omit<NextStepsCardProps, "actions"> = {
    onRunSkill: async (skill, params) => {
      const nextStage = skill === "/hack" ? "hack" : skill === "/ship" ? "ship" : skill === "/code-review" ? "code_review" : undefined;
      if (nextStage) window.deck?.updateNotificationById?.(n.id, { stage: nextStage });
      setLoading(true);
      setSkillRunning(true);
      try {
        await window.deck.runSkill({
          skill, args: params?.phase ? `phase ${params.phase}` : "",
          repoPath: n.repoPath ?? "", sessionId: n.sessionId ?? null, notificationId: n.id,
        });
      } catch (err) { console.error(`Skill ${skill} failed:`, err); }
      setSkillRunning(false);
      setLoading(false);
    },
    onUpdateLinear: async (ticket, field, value) => { await window.deck.updateLinear?.(ticket, field, value); },
    onSendSlack: async (ch, msg, ts) => { await window.deck.sendSlackMessage?.(ch, ts ?? "", msg); },
    onSendEmail: () => {},
    onOpenUrl: (url) => window.deck.openExternal(url),
    onDismiss: () => { window.deck?.updateNotificationById?.(n.id, { stage: "done" }); onDismiss(); },
    onSnooze: () => { window.deck?.updateNotificationById?.(n.id, { stage: "backlog" }); },
  };

  // ── Render ──

  const sourceColors: Record<string, string> = { linear: "#5E6AD2", slack: "#E01E5A", github: "#FFFFFF", notion: "#FFFFFF", email: "#EA4335" };
  const stageConfig = STAGE_META[n.stage as keyof typeof STAGE_META] ?? { label: n.stage ?? "new", color: "#6b7280" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--mantine-color-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
        <Group justify="space-between" mb={4}>
          <Group gap="xs">
            <Badge color={stageConfig.color} size="xs" style={{ backgroundColor: stageConfig.color }}>{stageConfig.label}</Badge>
            {n.priority && <Badge size="xs" variant="dot" color={n.priority === "critical" ? "red" : n.priority === "high" ? "yellow" : n.priority === "medium" ? "blue" : "gray"}>{n.priority}</Badge>}
          </Group>
          <UnstyledButton onClick={onClose} aria-label="Close detail pane">
            <Text size="xs" c="dimmed">Close</Text>
          </UnstyledButton>
        </Group>
        <Text size="sm" fw={600} mb={4}>{n.title}</Text>
        {n.summary && <Text size="xs" c="dimmed" mb={4} lineClamp={2}>{n.summary}</Text>}

        {/* Repo detection banner */}
        {detectedRepo && n.stage === "new" && (
          <RepoDetectionBanner
            repoPath={detectedRepo}
            branch={suggestedBranch}
            source={n.source}
            onChangeRepo={() => setStartWorkOpen(true)}
          />
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(v) => setActiveTab(v as TabId)} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <Tabs.List style={{ flexShrink: 0, borderBottom: "1px solid var(--mantine-color-default-border)" }}>
          <Tabs.Tab value="agent" leftSection={<IconMessageCircle size={14} />} rightSection={loading ? <Loader size={8} /> : undefined}>
            Agent
          </Tabs.Tab>
          <Tabs.Tab value="plan" leftSection={<IconFileText size={14} />} rightSection={planText ? <Badge size="xs" color="green" variant="filled" circle>✓</Badge> : undefined}>
            Plan
          </Tabs.Tab>
          <Tabs.Tab value="context" leftSection={<IconDatabase size={14} />} rightSection={fetchedContext.length > 0 ? <Badge size="xs" variant="light" color="gray">{fetchedContext.length}</Badge> : undefined}>
            Context
          </Tabs.Tab>
          <Tabs.Tab value="timeline" leftSection={<IconTimeline size={14} />}>
            Timeline
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="agent" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <AgentTab
            notificationId={n.id}
            conversation={conversation}
            activity={activity}
            loading={loading}
            skillRunning={skillRunning}
            onSendMessage={handleSendMessage}
            actionHandlers={actionHandlers}
          />
        </Tabs.Panel>

        <Tabs.Panel value="plan" style={{ flex: 1, overflow: "auto" }}>
          <PlanTab planText={planText} />
        </Tabs.Panel>

        <Tabs.Panel value="context" style={{ flex: 1, overflow: "auto" }}>
          <ContextTab items={fetchedContext} onOpenUrl={(url) => window.deck.openExternal(url)} />
        </Tabs.Panel>

        <Tabs.Panel value="timeline" style={{ flex: 1, overflow: "auto" }}>
          <TimelineTab entries={n.timeline ?? []} />
        </Tabs.Panel>
      </Tabs>

      {/* Action bar — Start Work / Rerun / Dismiss */}
      {!loading && n.stage === "new" && (
        <div style={{
          padding: "8px 20px",
          borderTop: "1px solid var(--mantine-color-default-border)",
          flexShrink: 0,
          display: "flex", gap: 8,
        }}>
          <UnstyledButton
            onClick={handlePrepare}
            style={{
              padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
              backgroundColor: "var(--mantine-color-blue-5)", color: "white",
            }}
          >
            Start Work
          </UnstyledButton>
          <UnstyledButton onClick={onDismiss} style={{ padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", color: "var(--mantine-color-dimmed)" }}>
            Dismiss
          </UnstyledButton>
        </div>
      )}

      {/* StartWorkModal fallback */}
      <StartWorkModal
        opened={startWorkOpen}
        onClose={() => setStartWorkOpen(false)}
        onConfirm={handleStartWork}
        notification={{ id: n.id, title: n.title, source: n.source, taskType: n.taskType, links: n.links }}
        detectedRepo={detectedRepo}
        suggestedBranch={suggestedBranch}
        repoOptions={(config?.repoMappings ?? []).map(m => ({ value: m.repoPath, label: m.repoPath.split("/").pop() ?? m.repoPath }))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/detail-drawer.test.ts`
Expected: PASS — 4 tests green

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DetailDrawer.tsx src/renderer/components/detail-drawer.test.ts
git commit -m "feat: DetailDrawer with tabbed interface and repo detection"
```

---

### Task 6: Wire DetailDrawer into notifications.tsx

**Files:**
- Modify: `src/renderer/pages/notifications.tsx`

- [ ] **Step 1: Replace DetailPane with DetailDrawer**

In `notifications.tsx`:

1. Remove the entire `DetailPane` function (lines ~933-1850) and the `PlanDetails` helper above it

2. Add import at top:
```typescript
import { DetailDrawer } from "../components/DetailDrawer";
```

3. Replace the `<DetailPane .../>` JSX (lines ~830-849) with:
```typescript
<DetailDrawer
  notification={selected}
  onClose={() => setSelectedId(null)}
  onDismiss={() => dismiss(selected.id)}
  onPlanReady={() => setPlansReady(prev => new Set([...prev, selected.id]))}
  onPlanCleared={() => setPlansReady(prev => { const next = new Set(prev); next.delete(selected.id); return next; })}
  config={config}
  username={config?.name?.split(" ")[0]?.toLowerCase() ?? "user"}
/>
```

4. Keep the `config` state loading that's already in the parent `Notifications` component. If it's only in DetailPane, move it to Notifications.

- [ ] **Step 2: Clean up unused imports**

Remove imports that were only used by DetailPane:
- `ImplementationDetailView`, `ResponseDetailView`, `MeetingPrepDetailView` (now used inside DetailDrawer or AgentTab)
- `StartWorkModal` (now inside DetailDrawer)
- `detectRepo` (now inside DetailDrawer)
- `parseActions` (now inside AgentTab)
- `NextStepsCard` (now inside AgentTab)
- `Markdown` (now inside AgentTab)

- [ ] **Step 3: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean compile, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/notifications.tsx
git commit -m "refactor: replace DetailPane with DetailDrawer in notifications"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Manual smoke test**

1. Start the app (`pnpm start`)
2. Click a notification → Detail drawer opens with tabs
3. Agent tab: empty state "Click Start Work to begin planning"
4. Click "Start Work" → if repo detected, starts immediately with banner; if not, modal opens
5. Agent asks a question → chat bubble with yellow border appears → type reply in input → agent receives it
6. Plan completes → Plan tab shows checkmark badge → click to see structured plan
7. Context tab shows fetched data
8. Timeline tab shows chronological events
9. NextStepsCard appears in Agent tab with smart CTAs

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: final adjustments from smoke test"
```
