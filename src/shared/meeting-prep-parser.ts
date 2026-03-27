export interface TalkingPoint {
  point: string;
  source?: string;
  url?: string;
}

export interface Attendee {
  name: string;
  role?: string;
}

export interface RelatedDoc {
  label: string;
  url: string;
  type: string;
}

export interface MeetingPrepData {
  talkingPoints: TalkingPoint[];
  attendees: Attendee[];
  relatedDocs: RelatedDoc[];
}

export function parseMeetingPrepContext(events: Array<{ type: string; content: string; timestamp: string }>): MeetingPrepData {
  const result: MeetingPrepData = { talkingPoints: [], attendees: [], relatedDocs: [] };

  for (const evt of events) {
    if (evt.type === "text") {
      // Extract attendees
      const attendeesMatch = evt.content.match(/[Aa]ttendees?:?\s*([^\n]+)/);
      if (attendeesMatch && result.attendees.length === 0) {
        const parts = attendeesMatch[1].split(/,\s*/);
        for (const part of parts) {
          const roleMatch = part.match(/(.+?)\s*\((\w+)\)/);
          if (roleMatch) {
            result.attendees.push({ name: roleMatch[1].trim(), role: roleMatch[2].trim() });
          } else if (part.trim()) {
            result.attendees.push({ name: part.trim() });
          }
        }
      }

      // Extract talking points
      const tpMatch = evt.content.match(/[Tt]alking points?:?\n([\s\S]*?)(?:\n\n|$)/);
      if (tpMatch) {
        const lines = tpMatch[1].split("\n").filter(l => /^\s*\d+[.)]\s/.test(l) || /^\s*[-\u2022*]\s/.test(l));
        for (const line of lines) {
          const cleaned = line.replace(/^\s*\d+[.)]\s*/, "").replace(/^\s*[-\u2022*]\s*/, "").trim();
          if (cleaned) {
            // Try to extract source attribution (e.g., "VEC-24 progress — from Linear")
            const sourceMatch = cleaned.match(/(?:from|via|source):\s*(.+)/i);
            result.talkingPoints.push({
              point: sourceMatch ? cleaned.replace(sourceMatch[0], "").trim() : cleaned,
              source: sourceMatch?.[1]?.trim(),
            });
          }
        }
      }
    }

    if (evt.type === "tool_use") {
      // Extract related docs from tool calls
      const linearMatch = evt.content.match(/get_issue.*?([A-Z]+-\d+)/i) || evt.content.match(/issue["\s:]+([A-Z]+-\d+)/i);
      if (linearMatch) {
        const id = linearMatch[1];
        if (!result.relatedDocs.some(d => d.label === id)) {
          result.relatedDocs.push({ label: id, url: `https://linear.app/montecarlodata/issue/${id}`, type: "linear" });
        }
      }
      const slackMatch = evt.content.match(/channel_id["\s:]+([CDG][A-Z0-9]{8,})/i);
      if (slackMatch) {
        const ch = slackMatch[1];
        if (!result.relatedDocs.some(d => d.label === ch)) {
          result.relatedDocs.push({ label: `Slack ${ch}`, url: `https://montecarloai.slack.com/archives/${ch}`, type: "slack" });
        }
      }
    }
  }

  return result;
}
