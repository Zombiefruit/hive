export interface ResponseData {
  keyPoints: string[];
  suggestedReplies: string[];
  threadChannel: string | null;
  threadTs: string | null;
}

export function parseResponseContext(events: Array<{ type: string; content: string; timestamp: string }>): ResponseData {
  const result: ResponseData = { keyPoints: [], suggestedReplies: [], threadChannel: null, threadTs: null };

  for (const evt of events) {
    if (evt.type === "text") {
      // Strip markdown bold for matching
      const plain = evt.content.replace(/\*\*/g, "");

      // Extract key points — matches "Key points:", "**Key points:**", etc.
      const keyPointsMatch = plain.match(/[Kk]ey points?:?\s*\n([\s\S]*?)(?:\n\n|\n[Ss]uggested|$)/);
      if (keyPointsMatch) {
        const lines = keyPointsMatch[1].split("\n")
          .map(l => l.replace(/^[-\u2022*\d.)\s]+/, "").trim())
          .filter(l => l.length > 3);
        result.keyPoints.push(...lines);
      }

      // Extract suggested replies
      const repliesMatch = plain.match(/[Ss]uggested repl(?:ies|y):?\s*\n([\s\S]*?)(?:\n\n|$)/);
      if (repliesMatch) {
        const replies = repliesMatch[1].match(/["\u201c]([^"\u201d]+)["\u201d]/g) ||
                        repliesMatch[1].split("\n").map(l => l.replace(/^\d+\.\s*/, "").replace(/^["\u201c]|["\u201d]$/g, "").trim()).filter(l => l.length > 10);
        if (replies) {
          result.suggestedReplies.push(...replies.map(r => r.replace(/^["\u201c]|["\u201d]$/g, "").trim()));
        }
      }
    }

    if (evt.type === "tool_use") {
      // Extract thread channel and ts from Slack tool calls
      const channelMatch = evt.content.match(/channel_id["\s:]+([CDG][A-Z0-9]{8,})/i);
      const tsMatch = evt.content.match(/thread_ts["\s:]+(\d+\.\d+)/) || evt.content.match(/message_ts["\s:]+(\d+\.\d+)/);
      if (channelMatch && !result.threadChannel) result.threadChannel = channelMatch[1];
      if (tsMatch && !result.threadTs) result.threadTs = tsMatch[1];
    }
  }

  // If no structured key points found but we have text events, extract bullet points from any text
  if (result.keyPoints.length === 0) {
    for (const evt of events) {
      if (evt.type === "text" && evt.content.length > 50) {
        const plain = evt.content.replace(/\*\*/g, "");
        const bullets = plain.split("\n")
          .filter(l => /^[-\u2022*]\s/.test(l.trim()))
          .map(l => l.replace(/^[-\u2022*]\s+/, "").trim())
          .filter(l => l.length > 10);
        if (bullets.length > 0) {
          result.keyPoints.push(...bullets);
          break;
        }
      }
    }
  }

  return result;
}
