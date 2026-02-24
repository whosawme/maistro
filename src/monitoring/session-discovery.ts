import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SessionStore } from '../state/session-store';
import { TodoStore } from '../state/todo-store';
import { parseSession } from '../parsing/session-parser';
import { parseSubagent } from '../parsing/subagent-parser';
import { Session, Subagent, MaistroConfig, TaskSpawnInfo } from '../types';
import { isCompactAgent, pathToProjectDir } from '../utils/paths';

export class SessionDiscovery {
  private todoStore?: TodoStore;

  constructor(
    private claudeProjectsPath: string,
    private store: SessionStore,
    private config: MaistroConfig,
  ) {}

  setTodoStore(todoStore: TodoStore): void {
    this.todoStore = todoStore;
  }

  async initialScan(): Promise<void> {
    // Scan current workspace first (fast path)
    const workspaceDir = this.findWorkspaceProjectDir();
    if (workspaceDir) {
      const sessions = await this.discoverSessionsInProject(workspaceDir);
      sessions.sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime(),
      );
      for (const session of sessions.slice(0, this.config.maxSessionsDisplayed)) {
        this.store.upsertSession(session);
      }
    }

    // Then scan all other projects for cross-instance visibility
    await this.scanAllProjects(workspaceDir);
  }

  async rescan(): Promise<void> {
    await this.initialScan();
  }

  /** Re-parses a single session file and updates the store. */
  async rescanSession(sessionFilePath: string): Promise<void> {
    const projDir = path.dirname(sessionFilePath);

    // Only process top-level session files (direct children of a project dir)
    if (path.dirname(projDir) !== this.claudeProjectsPath) return;

    try {
      const session = await this.buildSession(sessionFilePath, projDir);
      this.store.upsertSession(session);
    } catch {
      // Skip unparseable session
    }
  }

  private async scanAllProjects(workspaceDir?: string): Promise<void> {
    let dirs: string[];
    try {
      dirs = fs.readdirSync(this.claudeProjectsPath);
    } catch {
      return;
    }

    for (const dir of dirs) {
      const fullPath = path.join(this.claudeProjectsPath, dir);
      if (workspaceDir && fullPath === workspaceDir) continue; // already scanned

      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      const sessions = await this.discoverSessionsInProject(fullPath);
      sessions.sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime(),
      );

      // Limit foreign projects to 3 most recent sessions
      const limit = Math.min(this.config.maxSessionsDisplayed, 3);
      for (const session of sessions.slice(0, limit)) {
        this.store.upsertSession(session);
      }
    }
  }

  async discoverNewSubagent(subagentFilePath: string): Promise<void> {
    const parts = subagentFilePath.split(path.sep);
    const subIdx = parts.indexOf('subagents');
    if (subIdx < 2) return;

    const sessionId = parts[subIdx - 1]!;
    const projDir = parts.slice(0, subIdx - 1).join(path.sep);

    const subagentData = await parseSubagent(subagentFilePath);

    let session = this.store.getSession(sessionId);
    if (!session) {
      const sessionFilePath = path.join(projDir, `${sessionId}.jsonl`);
      if (fs.existsSync(sessionFilePath)) {
        session = await this.buildSession(sessionFilePath, projDir);
        this.store.upsertSession(session);
      } else {
        return;
      }
    }

    // Enrich subagent with Task spawn info from parent session
    const sessionFilePath = path.join(projDir, `${sessionId}.jsonl`);
    const { taskSpawns } = await parseSession(sessionFilePath);

    const subagent = this.buildSubagent(subagentData, taskSpawns);
    this.store.upsertSubagent(sessionId, subagent);
  }

  private findWorkspaceProjectDir(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return undefined;

    const workspacePath = workspaceFolders[0]!.uri.fsPath;
    const expectedDirName = pathToProjectDir(workspacePath);

    try {
      const dirs = fs.readdirSync(this.claudeProjectsPath);
      const match = dirs.find((d) => d === expectedDirName);
      if (match) {
        return path.join(this.claudeProjectsPath, match);
      }
      // Fallback: find any dir that contains the workspace name
      const partial = dirs.find((d) => d.includes(path.basename(workspacePath)));
      if (partial) {
        return path.join(this.claudeProjectsPath, partial);
      }
    } catch {
      // projects directory may not exist yet
    }

    return undefined;
  }

  private async discoverSessionsInProject(projDir: string): Promise<Session[]> {
    const sessions: Session[] = [];

    try {
      const entries = fs.readdirSync(projDir);

      // Find session JSONL files (UUID.jsonl at top level)
      const sessionFiles = entries
        .filter((e) => e.endsWith('.jsonl'))
        .map((e) => path.join(projDir, e));

      // Sort by mtime descending, take top N
      const withMtime = sessionFiles
        .map((f) => {
          try {
            return { path: f, mtime: fs.statSync(f).mtimeMs };
          } catch {
            return null;
          }
        })
        .filter((x): x is { path: string; mtime: number } => x !== null)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, this.config.maxSessionsDisplayed);

      for (const { path: sessionFile } of withMtime) {
        try {
          const session = await this.buildSession(sessionFile, projDir);
          sessions.push(session);
        } catch {
          // Skip unparseable sessions
        }
      }
    } catch {
      // Directory may not exist
    }

    return sessions;
  }

  private async buildSession(
    sessionFilePath: string,
    projDir: string,
  ): Promise<Session> {
    const { sessionMeta, taskSpawns, awaitingInput, pendingToolNames, todoSnapshots } =
      await parseSession(sessionFilePath);
    const sessionId = sessionMeta.sessionId || path.basename(sessionFilePath, '.jsonl');

    // Feed todo snapshots into the todo store
    if (this.todoStore && todoSnapshots.length > 0) {
      this.todoStore.ingestSnapshots(sessionId, projDir, todoSnapshots);
    }

    // Discover subagents for this session
    const subagentsDir = path.join(projDir, sessionId, 'subagents');
    const subagents: Subagent[] = [];

    if (fs.existsSync(subagentsDir)) {
      try {
        const agentFiles = fs
          .readdirSync(subagentsDir)
          .filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
          .filter((f) => !isCompactAgent(f));

        for (const agentFile of agentFiles) {
          try {
            const agentPath = path.join(subagentsDir, agentFile);
            const subagentData = await parseSubagent(agentPath);
            const subagent = this.buildSubagent(subagentData, taskSpawns);
            subagents.push(subagent);
          } catch {
            // Skip unparseable subagent
          }
        }
      } catch {
        // subagents dir unreadable
      }
    }

    // Check if session file was modified recently (within last 5 minutes)
    let isActive = false;
    try {
      const stat = fs.statSync(sessionFilePath);
      isActive = Date.now() - stat.mtimeMs < 5 * 60 * 1000;
    } catch {
      // ignore
    }

    // Check for active compaction (acompact agent file modified recently)
    let isCompacting = false;
    if (fs.existsSync(subagentsDir)) {
      try {
        const compactFiles = fs
          .readdirSync(subagentsDir)
          .filter((f) => isCompactAgent(f));
        for (const cf of compactFiles) {
          try {
            const stat = fs.statSync(path.join(subagentsDir, cf));
            if (Date.now() - stat.mtimeMs < 30_000) {
              isCompacting = true;
              break;
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      sessionId,
      projectPath: projDir,
      cwd: sessionMeta.cwd,
      gitBranch: sessionMeta.gitBranch,
      version: sessionMeta.version,
      startedAt: sessionMeta.startedAt || new Date().toISOString(),
      lastActivityAt: sessionMeta.lastActivityAt || new Date().toISOString(),
      isActive,
      subagents,
      filePath: sessionFilePath,
      activeSubagentCount: subagents.filter((s) => s.status === 'running').length,
      awaitingInput,
      pendingToolNames,
      isCompacting,
    };
  }

  private buildSubagent(
    data: Partial<Subagent>,
    taskSpawns: TaskSpawnInfo[],
  ): Subagent {
    // Try to match this subagent with a Task spawn by timestamp proximity
    let bestMatch = taskSpawns[0];
    if (data.startedAt && taskSpawns.length > 1) {
      const subStart = new Date(data.startedAt).getTime();
      let bestDiff = Infinity;
      for (const spawn of taskSpawns) {
        const diff = Math.abs(new Date(spawn.timestamp).getTime() - subStart);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = spawn;
        }
      }
    }

    return {
      agentId: data.agentId || 'unknown',
      sessionId: data.sessionId || '',
      slug: data.slug || '',
      subagentType: bestMatch?.subagentType || 'unknown',
      description: bestMatch?.description || data.slug || data.agentId || '',
      prompt: bestMatch?.prompt || '',
      model: data.model || '',
      status: data.status || 'unknown',
      startedAt: data.startedAt || '',
      completedAt: data.completedAt,
      elapsedMs: data.elapsedMs || 0,
      toolCalls: data.toolCalls || [],
      tokenUsage: data.tokenUsage || {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        totalTokens: 0,
        apiCallCount: 0,
      },
      finalOutput: data.finalOutput,
      lineCount: data.lineCount || 0,
      filePath: data.filePath || '',
    };
  }
}
