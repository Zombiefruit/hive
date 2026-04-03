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
        ? "rgba(74, 125, 255, 0.1)"
        : "rgba(16, 21, 32, 0.65)",
      border: question
        ? "1px solid rgba(255, 170, 51, 0.25)"
        : isUser ? "none" : "1px solid rgba(68, 73, 85, 0.2)",
    }}>
      <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {content}
      </Text>
    </div>
  );
}
