/** Project data model with CRUD operations, auto-detection, persistence, and test reset. */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ProjectContext {
  linearTickets: string[];
  slackChannels: string[];
  prs: string[];
  notionDocs: string[];
}

export interface Project {
  id: string;
  name: string;
  source: "linear" | "slack" | "ai";
  sourceId?: string;
  reasoning?: string;
  tasks: string[];
  context: ProjectContext;
  createdAt: string;
  updatedAt: string;
}

const projects = new Map<string, Project>();

function generateId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `proj-${Date.now()}-${random}`;
}

function emptyContext(): ProjectContext {
  return {
    linearTickets: [],
    slackChannels: [],
    prs: [],
    notionDocs: [],
  };
}

export function createProject(
  name: string,
  source: Project["source"],
  sourceId?: string,
  reasoning?: string,
): Project {
  const now = new Date().toISOString();
  const project: Project = {
    id: generateId(),
    name,
    source,
    sourceId,
    reasoning,
    tasks: [],
    context: emptyContext(),
    createdAt: now,
    updatedAt: now,
  };
  projects.set(project.id, project);
  return project;
}

export function setProjectReasoning(projectId: string, reasoning: string): void {
  const project = projects.get(projectId);
  if (!project) return;
  project.reasoning = reasoning;
  project.updatedAt = new Date().toISOString();
}

export function getProjectReasoning(projectId: string): string | null {
  const project = projects.get(projectId);
  return project?.reasoning ?? null;
}

export function getProject(id: string): Project | null {
  return projects.get(id) ?? null;
}

export function getAllProjects(): Project[] {
  return Array.from(projects.values());
}

export function addTaskToProject(projectId: string, taskId: string): void {
  const project = projects.get(projectId);
  if (!project) return;
  if (project.tasks.includes(taskId)) return;
  project.tasks.push(taskId);
  project.updatedAt = new Date().toISOString();
}

export function removeTaskFromProject(
  projectId: string,
  taskId: string,
): void {
  const project = projects.get(projectId);
  if (!project) return;
  project.tasks = project.tasks.filter((t) => t !== taskId);
  project.updatedAt = new Date().toISOString();
}

export function updateProjectContext(
  projectId: string,
  ctx: Partial<ProjectContext>,
): void {
  const project = projects.get(projectId);
  if (!project) return;

  for (const key of Object.keys(ctx) as (keyof ProjectContext)[]) {
    const incoming = ctx[key];
    if (!incoming) continue;
    const existing = project.context[key];
    for (const value of incoming) {
      if (!existing.includes(value)) {
        existing.push(value);
      }
    }
  }

  project.updatedAt = new Date().toISOString();
}

export function detectProjectFromSource(
  source: Project["source"],
  sourceId: string,
): Project | null {
  // Exact match by source + sourceId
  for (const project of projects.values()) {
    if (project.source === source && project.sourceId === sourceId) {
      return project;
    }
  }
  return null;
}

/** Find a project by name (fuzzy — normalizes to lowercase, strips common noise words). */
export function findProjectByName(name: string): Project | null {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(project|launch|improvements|updates|epic|phase\s*\d+|work|follow.?up|chat|extension|v\d+|initiative)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const target = normalize(name);

  // Collect ALL matches with scores, then return the best one
  let bestProject: Project | null = null;
  let bestScore = 0;

  for (const project of projects.values()) {
    const projName = normalize(project.name);
    let score = 0;

    // Exact match after normalization — highest priority
    if (projName === target) {
      score = 1000;
    }
    // One contains the other — second priority, prefer shorter distance
    else if (projName.includes(target) || target.includes(projName)) {
      const lenDiff = Math.abs(projName.length - target.length);
      score = 500 - lenDiff;
    }
    // Significant word overlap (2+ exact words match) — third priority
    else {
      const targetWords = target.split(/\s+/).filter(w => w.length > 3);
      const projWords = projName.split(/\s+/).filter(w => w.length > 3);
      const overlap = targetWords.filter(w => projWords.includes(w));
      if (overlap.length >= 2) {
        score = 100 + overlap.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestProject = project;
    }
  }

  return bestProject;
}

/** Merge two projects — moves all tasks from source to target, deletes source. */
export function mergeProjects(targetId: string, sourceId: string): void {
  const target = projects.get(targetId);
  const source = projects.get(sourceId);
  if (!target || !source) return;
  for (const taskId of source.tasks) {
    if (!target.tasks.includes(taskId)) target.tasks.push(taskId);
  }
  for (const t of source.context.linearTickets) if (!target.context.linearTickets.includes(t)) target.context.linearTickets.push(t);
  for (const c of source.context.slackChannels) if (!target.context.slackChannels.includes(c)) target.context.slackChannels.push(c);
  for (const p of source.context.prs) if (!target.context.prs.includes(p)) target.context.prs.push(p);
  for (const d of source.context.notionDocs) if (!target.context.notionDocs.includes(d)) target.context.notionDocs.push(d);
  target.updatedAt = new Date().toISOString();
  projects.delete(sourceId);
}

// ── Persistence ──

function getCachePath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "claude-deck", "projects-cache.json");
}

export function saveProjects(): void {
  try {
    const data = Array.from(projects.values());
    fs.writeFileSync(getCachePath(), JSON.stringify(data));
  } catch {}
}

export function loadProjects(): void {
  try {
    const raw = fs.readFileSync(getCachePath(), "utf-8");
    const data = JSON.parse(raw) as Project[];
    for (const p of data) {
      projects.set(p.id, p);
    }
  } catch {}
}

export function _resetForTest(): void {
  projects.clear();
}
