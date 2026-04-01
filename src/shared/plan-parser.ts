/**
 * Plan parser — parses `.work/<slug>/plan.md` files produced by MC's
 * `/start-work` skill into structured data for UI rendering.
 */

// ── Types ──

export interface PlanTask {
  id: string;
  commitMessage: string;
  description: string;
  checked: boolean;
}

export interface PlanPhase {
  number: number;
  name: string;
  tasks: PlanTask[];
}

export interface RelevantFile {
  path: string;
  purpose: string;
}

export interface ParsedPlan {
  ticket: string;
  branch: string;
  status: string;
  pr?: string;
  scope: string;
  phases: PlanPhase[];
  relevantFiles: RelevantFile[];
  totalTasks: number;
  completedTasks: number;
  context: string;
}

// ── Parser ──

/**
 * Parse a plan.md file into structured data.
 * Handles empty/null input gracefully by returning empty defaults.
 */
export function parsePlanMd(raw: string): ParsedPlan {
  const empty: ParsedPlan = {
    ticket: "",
    branch: "",
    status: "",
    scope: "",
    phases: [],
    relevantFiles: [],
    totalTasks: 0,
    completedTasks: 0,
    context: "",
  };

  if (!raw || !raw.trim()) return empty;

  const frontmatter = parseFrontmatter(raw);
  const relevantFiles = parseRelevantFiles(raw);
  const scope = parseScope(raw);
  const phases = parsePhases(raw);
  const context = parseContext(raw);

  let totalTasks = 0;
  let completedTasks = 0;
  for (const phase of phases) {
    for (const task of phase.tasks) {
      totalTasks++;
      if (task.checked) completedTasks++;
    }
  }

  return {
    ticket: frontmatter.ticket ?? "",
    branch: frontmatter.branch ?? "",
    status: frontmatter.status ?? "",
    ...(frontmatter.pr ? { pr: frontmatter.pr } : {}),
    scope,
    phases,
    relevantFiles,
    totalTasks,
    completedTasks,
    context,
  };
}

// ── Frontmatter ──

function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

// ── Relevant Files ──

function parseRelevantFiles(raw: string): RelevantFile[] {
  const files: RelevantFile[] = [];
  // Find the "### Relevant Files" section and its markdown table
  const sectionMatch = raw.match(/### Relevant Files\s*\n([\s\S]*?)(?=\n###?\s|\n## |\n$)/);
  if (!sectionMatch) return files;

  const tableLines = sectionMatch[1].split("\n").filter((l) => l.trim().startsWith("|"));
  // Skip header row and separator row (first two | lines)
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 2) {
      files.push({ path: cells[0], purpose: cells[1] });
    }
  }
  return files;
}

// ── Scope ──

function parseScope(raw: string): string {
  const match = raw.match(/### Scope:\s*(.+)/);
  return match ? match[1].trim() : "";
}

// ── Phases & Tasks ──

function parsePhases(raw: string): PlanPhase[] {
  const phases: PlanPhase[] = [];
  // Split on "## Phase N: Name" headings
  const phasePattern = /^## Phase (\d+):\s*(.+)$/gm;
  let phaseMatch: RegExpExecArray | null;
  const phaseStarts: Array<{ number: number; name: string; startIndex: number }> = [];

  while ((phaseMatch = phasePattern.exec(raw)) !== null) {
    phaseStarts.push({
      number: parseInt(phaseMatch[1], 10),
      name: phaseMatch[2].trim(),
      startIndex: phaseMatch.index,
    });
  }

  for (let i = 0; i < phaseStarts.length; i++) {
    const start = phaseStarts[i].startIndex;
    const end = i + 1 < phaseStarts.length ? phaseStarts[i + 1].startIndex : raw.length;
    const phaseBody = raw.slice(start, end);
    const tasks = parseTasks(phaseBody, phaseStarts[i].number);

    phases.push({
      number: phaseStarts[i].number,
      name: phaseStarts[i].name,
      tasks,
    });
  }

  return phases;
}

function parseTasks(phaseBody: string, phaseNumber: number): PlanTask[] {
  const tasks: PlanTask[] = [];
  // Split on "### Task N.N: Name" headings
  const taskPattern = /^### Task (\d+\.\d+):\s*(.+)$/gm;
  let taskMatch: RegExpExecArray | null;
  const taskStarts: Array<{ id: string; startIndex: number }> = [];

  while ((taskMatch = taskPattern.exec(phaseBody)) !== null) {
    taskStarts.push({
      id: taskMatch[1],
      startIndex: taskMatch.index,
    });
  }

  for (let i = 0; i < taskStarts.length; i++) {
    const start = taskStarts[i].startIndex;
    const end = i + 1 < taskStarts.length ? taskStarts[i + 1].startIndex : phaseBody.length;
    const taskBody = phaseBody.slice(start, end);

    // Extract checkbox: - [x] or - [ ]
    const checkboxMatch = taskBody.match(/- \[([ xX])\]\s*`([^`]+)`/);
    const checked = checkboxMatch ? checkboxMatch[1].toLowerCase() === "x" : false;
    const commitMessage = checkboxMatch ? checkboxMatch[2] : "";

    // Description: everything after the checkbox line
    const lines = taskBody.split("\n");
    const descriptionLines: string[] = [];
    let pastCheckbox = false;
    for (const line of lines) {
      if (line.match(/- \[[ xX]\]/)) {
        pastCheckbox = true;
        continue;
      }
      if (pastCheckbox && line.trim()) {
        descriptionLines.push(line.trim());
      }
    }

    tasks.push({
      id: taskStarts[i].id,
      commitMessage,
      description: descriptionLines.join("\n"),
      checked,
    });
  }

  return tasks;
}

// ── Context ──

function parseContext(raw: string): string {
  // Extract the "## Context" section content
  const match = raw.match(/^## Context\s*\n([\s\S]*?)(?=\n## |\n$)/m);
  return match ? match[1].trim() : "";
}
