import * as os from 'os';
import * as path from 'path';

export function resolveClaudeProjectsPath(customPath?: string): string {
  if (customPath && customPath.trim()) {
    return path.join(customPath.trim(), 'projects');
  }
  return path.join(os.homedir(), '.claude', 'projects');
}

export function pathToProjectDir(fsPath: string): string {
  return fsPath.replace(/\//g, '-');
}

export function extractRepoName(session: { cwd?: string; projectPath: string }): string {
  if (session.cwd) {
    return path.basename(session.cwd);
  }
  const dirName = path.basename(session.projectPath);
  const parts = dirName.split('-').filter(Boolean);
  return parts[parts.length - 1] || dirName;
}

export function isCompactAgent(filePath: string): boolean {
  return path.basename(filePath).includes('acompact-');
}

export function extractAgentIdFromPath(filePath: string): string | undefined {
  const match = path.basename(filePath).match(/^agent-(.+)\.jsonl$/);
  return match?.[1];
}

export function extractSessionIdFromPath(filePath: string): string | undefined {
  const parts = filePath.split(path.sep);
  const subIdx = parts.indexOf('subagents');
  if (subIdx >= 1) {
    return parts[subIdx - 1];
  }
  // It's a session file itself
  return path.basename(filePath, '.jsonl');
}
