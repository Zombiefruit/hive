export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  headMessage: string;
  isMainWorktree: boolean;
  modifiedFiles: number;
  untrackedFiles: number;
  repoPath: string;
  notificationId?: string;
}

export type EditorCommand = "code" | "cursor" | "zed" | "custom";
