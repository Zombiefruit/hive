export type Severity = "BLOCKER" | "ISSUE" | "SUGGESTION" | "NIT";

export interface ReviewFinding {
  id: string;
  severity: Severity;
  file: string;
  reviewer: string;
  description: string;
  whyItMatters: string;
  suggestion: string;
  confidence: number;
  checked: boolean;
}

export interface ParsedReview {
  findings: ReviewFinding[];
  blockerCount: number;
  issueCount: number;
  suggestionCount: number;
  nitCount: number;
}

const FINDING_HEADER_RE =
  /^###\s+\[([ x])\]\s+(\S+)\s+—\s+(BLOCKER|ISSUE|SUGGESTION|NIT)\s+—\s+(.+)$/;

function extractField(block: string, label: string): string {
  const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "m");
  const match = block.match(re);
  return match ? match[1].trim() : "";
}

export function parseReviewMd(raw: string): ParsedReview {
  if (!raw.trim()) {
    return {
      findings: [],
      blockerCount: 0,
      issueCount: 0,
      suggestionCount: 0,
      nitCount: 0,
    };
  }

  const lines = raw.split("\n");
  const findings: ReviewFinding[] = [];

  let i = 0;
  while (i < lines.length) {
    const headerMatch = lines[i].match(FINDING_HEADER_RE);
    if (!headerMatch) {
      i++;
      continue;
    }

    const checked = headerMatch[1] === "x";
    const id = headerMatch[2];
    const severity = headerMatch[3] as Severity;
    const reviewer = headerMatch[4].trim();

    // Collect the body lines until the next heading or end of input
    i++;
    const bodyLines: string[] = [];
    while (i < lines.length && !lines[i].startsWith("### ")) {
      bodyLines.push(lines[i]);
      i++;
    }

    const body = bodyLines.join("\n");

    findings.push({
      id,
      severity,
      file: extractField(body, "File"),
      reviewer: extractField(body, "Reviewer") || reviewer,
      description: extractField(body, "Description"),
      whyItMatters: extractField(body, "Why it matters"),
      suggestion: extractField(body, "Suggestion"),
      confidence: parseInt(extractField(body, "Confidence").replace("%", ""), 10) || 0,
      checked,
    });
  }

  return {
    findings,
    blockerCount: findings.filter((f) => f.severity === "BLOCKER").length,
    issueCount: findings.filter((f) => f.severity === "ISSUE").length,
    suggestionCount: findings.filter((f) => f.severity === "SUGGESTION").length,
    nitCount: findings.filter((f) => f.severity === "NIT").length,
  };
}
