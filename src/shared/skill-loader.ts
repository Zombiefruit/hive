/**
 * Load skill files from .claude/skills/ and extract their body content.
 * Skills are markdown files with YAML frontmatter — we strip the frontmatter
 * and return the body text for injection into agent prompts.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Load a skill's body content by name.
 * Looks in .claude/skills/<name>/SKILL.md relative to the app root.
 * Returns the body (everything after the `---` frontmatter block), or "" if not found.
 */
export function loadSkill(skillName: string, appRoot?: string): string {
  const roots = appRoot
    ? [appRoot]
    : [
        // In dev: process.cwd() is the repo root
        process.cwd(),
        // In packaged app: look relative to __dirname
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "../../.."),
      ];

  for (const root of roots) {
    const skillPath = path.join(root, ".claude", "skills", skillName, "SKILL.md");
    try {
      if (fs.existsSync(skillPath)) {
        const raw = fs.readFileSync(skillPath, "utf-8");
        // Strip YAML frontmatter (between --- markers)
        const bodyMatch = raw.match(/---[\s\S]*?---\s*([\s\S]*)/);
        return bodyMatch ? bodyMatch[1].trim() : raw.trim();
      }
    } catch {}
  }
  return "";
}

/**
 * Load multiple skills and join them with double newlines.
 */
export function loadSkills(skillNames: string[], appRoot?: string): string {
  return skillNames
    .map(name => loadSkill(name, appRoot))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Load a skill and perform template variable substitution.
 * Replaces {{KEY}} markers with provided values.
 */
export function loadSkillTemplate(
  skillName: string,
  vars: Record<string, string>,
  appRoot?: string,
): string {
  let body = loadSkill(skillName, appRoot);
  for (const [key, value] of Object.entries(vars)) {
    body = body.replaceAll(`{{${key}}}`, value ?? "");
  }
  return body;
}
