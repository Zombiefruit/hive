/**
 * Repo detection — maps a task to a local repo path based on ticket prefix,
 * Slack channel name, or GitHub PR URL patterns.
 */

export interface RepoMapping {
  /** Glob-like pattern: ticket prefix ("VEC-*"), channel ("#monolith-*"), or org/repo ("monte-carlo-data/monolith-*") */
  pattern: string;
  /** Absolute path to the local repo clone */
  repoPath: string;
}

interface TaskLink {
  type: string;
  label: string;
  url: string;
}

interface DetectRepoInput {
  title: string;
  links: TaskLink[];
}

/**
 * Convert a simple glob pattern (with trailing `*`) into a prefix string.
 * "VEC-*" → "VEC-", "#monolith-*" → "#monolith-", etc.
 */
function patternToPrefix(pattern: string): string {
  return pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
}

/**
 * Detect which local repo a task belongs to by matching its title and links
 * against a list of repo mappings. Returns the first matching `repoPath`, or null.
 */
export function detectRepo(
  input: DetectRepoInput,
  mappings: RepoMapping[],
): string | null {
  for (const mapping of mappings) {
    const prefix = patternToPrefix(mapping.pattern);

    // Slack channel pattern: starts with "#" — match against link labels
    if (prefix.startsWith("#")) {
      for (const link of input.links) {
        if (link.label.startsWith(prefix)) {
          return mapping.repoPath;
        }
      }
      continue;
    }

    // GitHub org/repo pattern: contains "/" — match against link URLs
    if (prefix.includes("/")) {
      for (const link of input.links) {
        if (link.url.includes(prefix)) {
          return mapping.repoPath;
        }
      }
      continue;
    }

    // Ticket prefix pattern: match against title
    if (input.title.includes(prefix)) {
      return mapping.repoPath;
    }
  }

  return null;
}
