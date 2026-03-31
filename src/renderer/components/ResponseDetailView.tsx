import { Badge, Group, Stack, Text, Textarea, UnstyledButton } from "@mantine/core";
import { IconSend, IconCopy, IconCheck, IconCircleCheck } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { ActionButton } from "./ActionButton";
import { parseResponseContext } from "../../shared/response-parser";
import { parseActions } from "../../shared/action-parser";
import { NextStepsCard } from "./NextStepsCard";

interface ResponseDetailViewProps {
  notification: {
    id: string;
    title: string;
    stage?: string;
  };
  fetchedContext: Array<{ type: string; content: string; timestamp: string }>;
  conversation?: Array<{ role: string; content: string }>;
  onSendSlack?: (message: string, channel: string, threadTs: string) => void;
  onMarkDone?: () => void;
  onRunSkill?: (skill: string, params?: Record<string, unknown>) => void;
  onUpdateLinear?: (ticket: string, field: string, value: string) => void;
  onOpenUrl?: (url: string) => void;
  onDismiss?: (reason?: string) => void;
  onSnooze?: (reason?: string) => void;
}

export function ResponseDetailView({ notification, fetchedContext, conversation, onSendSlack, onMarkDone, onRunSkill, onUpdateLinear, onOpenUrl, onDismiss, onSnooze }: ResponseDetailViewProps) {
  // Parse from BOTH fetchedContext AND conversation text
  const data = parseResponseContext(fetchedContext);

  // Parse structured actions from agent output
  const agentText = [...(conversation ?? [])].filter(m => m.role === "assistant").map(m => m.content).join("\n");
  const contextText = fetchedContext.map(c => c.content).join("\n");
  const actions = useMemo(() => parseActions(agentText || contextText), [agentText, contextText]);

  // Also try to parse from the assistant's conversation response (plan text often has the structured output)
  if (conversation && (data.keyPoints.length === 0 || data.suggestedReplies.length === 0)) {
    const assistantMsgs = conversation.filter(m => m.role === "assistant").map(m => m.content);
    for (const msg of assistantMsgs) {
      const asEvent = { type: "text" as const, content: msg, timestamp: "" };
      const parsed = parseResponseContext([asEvent]);
      if (parsed.keyPoints.length > data.keyPoints.length) data.keyPoints = parsed.keyPoints;
      if (parsed.suggestedReplies.length > data.suggestedReplies.length) data.suggestedReplies = parsed.suggestedReplies;
      if (parsed.threadChannel && !data.threadChannel) data.threadChannel = parsed.threadChannel;
      if (parsed.threadTs && !data.threadTs) data.threadTs = parsed.threadTs;
    }
  }

  const [selectedReply, setSelectedReply] = useState<string>("");
  const [customReply, setCustomReply] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const activeReply = customReply || selectedReply;

  // Detect "no action needed" — agent found user already replied
  const noActionNeeded = fetchedContext.some(e =>
    e.type === "text" && (
      e.content.toLowerCase().includes("already replied") ||
      e.content.toLowerCase().includes("already responded") ||
      e.content.toLowerCase().includes("no action needed") ||
      e.content.toLowerCase().includes("no response needed") ||
      e.content.toLowerCase().includes("no further action")
    )
  ) || (conversation ?? []).some(m =>
    m.role === "assistant" && (
      m.content.toLowerCase().includes("already replied") ||
      m.content.toLowerCase().includes("already responded") ||
      m.content.toLowerCase().includes("no action needed") ||
      m.content.toLowerCase().includes("no response needed") ||
      m.content.toLowerCase().includes("no further action")
    )
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!activeReply || !data.threadChannel || !data.threadTs) return;
    setSending(true);
    onSendSlack?.(activeReply, data.threadChannel, data.threadTs);
    setSending(false);
  };

  const isReady = notification.stage === "ready";
  const isPreparing = notification.stage === "preparing";

  if (isPreparing && fetchedContext.length === 0) {
    return (
      <Stack gap={8} py="md">
        <Text size="sm" c="dimmed">Gathering context from Slack and related tickets...</Text>
      </Stack>
    );
  }

  if (!isReady && !isPreparing && fetchedContext.length === 0 && (!conversation || conversation.length === 0)) {
    return (
      <Stack gap={8} py="md">
        <Text size="xs" c="dimmed">Click "Analyze" above to gather context and generate suggested replies.</Text>
      </Stack>
    );
  }

  // No action needed state
  if (noActionNeeded) {
    return (
      <Stack gap={12} py="md">
        <Group gap={8}>
          <IconCircleCheck size={20} color="#22c55e" />
          <Text size="sm" fw={500} c="green.4">No action needed</Text>
        </Group>
        <Text size="xs" c="dimmed">
          The agent determined you've already responded to this or no response is required.
        </Text>
        {data.keyPoints.length > 0 && (
          <div>
            <Text size="xs" fw={600} c="dimmed" mb={4}>Context</Text>
            <Stack gap={2}>
              {data.keyPoints.map((point, i) => (
                <Group key={i} gap={6} wrap="nowrap" align="flex-start">
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>•</Text>
                  <Text size="xs" c="dimmed">{point}</Text>
                </Group>
              ))}
            </Stack>
          </div>
        )}
        {actions.length > 0 && (
          <NextStepsCard
            actions={actions}
            onRunSkill={onRunSkill ?? (() => {})}
            onUpdateLinear={onUpdateLinear ?? (() => {})}
            onSendSlack={onSendSlack ? (ch, msg, ts) => onSendSlack(msg, ch, ts ?? "") : () => {}}
            onSendEmail={() => {}}
            onOpenUrl={onOpenUrl ?? (() => {})}
            onDismiss={onDismiss ?? (() => {})}
            onSnooze={onSnooze ?? (() => {})}
          />
        )}
        {onMarkDone && actions.length === 0 && (
          <ActionButton
            label="Mark Done"
            description="Dismiss this task."
            onClick={onMarkDone}
            variant="outline"
          />
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={12}>
      {/* Key points */}
      {data.keyPoints.length > 0 && (
        <div>
          <Text size="xs" fw={600} c="yellow.4" mb={4}>Key points to address</Text>
          <Stack gap={2}>
            {data.keyPoints.map((point, i) => (
              <Group key={i} gap={6} wrap="nowrap" align="flex-start">
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>•</Text>
                <Text size="xs">{point}</Text>
              </Group>
            ))}
          </Stack>
        </div>
      )}

      {/* Suggested replies */}
      {data.suggestedReplies.length > 0 && (
        <div>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Suggested replies</Text>
          <Stack gap={4}>
            {data.suggestedReplies.map((reply, i) => (
              <UnstyledButton
                key={i}
                onClick={() => { setSelectedReply(reply); setCustomReply(""); }}
                style={{
                  padding: "8px 12px", borderRadius: 6, fontSize: "0.75rem",
                  border: `1px solid ${selectedReply === reply ? "var(--mantine-color-blue-5)" : "var(--mantine-color-default-border)"}`,
                  backgroundColor: selectedReply === reply ? "color-mix(in srgb, var(--mantine-color-blue-9) 15%, transparent)" : "var(--mantine-color-dark-7)",
                  lineHeight: 1.4, textAlign: "left",
                }}
              >
                {reply}
              </UnstyledButton>
            ))}
          </Stack>
        </div>
      )}

      {/* Custom compose */}
      <div>
        <Text size="xs" fw={600} c="dimmed" mb={4}>
          {selectedReply ? "Edit reply" : "Write a reply"}
        </Text>
        <Textarea
          value={customReply || selectedReply}
          onChange={(e) => setCustomReply(e.currentTarget.value)}
          placeholder="Type your reply..."
          minRows={3}
          autosize
          styles={{ input: { fontSize: "0.8rem" } }}
        />
      </div>

      {/* Actions */}
      <Group gap={8}>
        {data.threadChannel && data.threadTs && (
          <ActionButton
            label="Send via Slack"
            description={`Posts to Slack thread. You can edit above before sending.`}
            onClick={handleSend}
            icon={<IconSend size={14} />}
            disabled={!activeReply}
            loading={sending}
          />
        )}
        <ActionButton
          label={copied ? "Copied!" : "Copy to Clipboard"}
          description="Copy the reply text to paste manually."
          onClick={handleCopy}
          icon={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          disabled={!activeReply}
          variant="outline"
          color={copied ? "#22c55e" : undefined}
        />
      </Group>
    </Stack>
  );
}
