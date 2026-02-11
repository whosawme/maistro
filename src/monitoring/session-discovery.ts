import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SessionStore } from '../state/session-store';
import { parseSession } from '../parsing/session-parser';
import { parseSubagent } from '../parsing/subagent-parser';
import { Session, Subagent, MaistroConfig, TaskSpawnInfo } from '../types';
import { isCompactAgent, pathToProjectDir } from '../utils/paths';

export class SessionDiscovery {
  constructor(
    private claudeProjectsPath: string,
    private store: SessionStore,
    private config: MaistroConfig,
  ) {}

  async initialScan(): Promise<void> {
    const projectDir = this.findWorkspaceProjectDir();
    if (!projectDir) return;

    const sessions = await this.discoverSessionsInProject(projectDir);
    sessions.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    );

    for (const session of sessions.slice(0, this.config.maxSessionsDisplayed)) {
      this.store.upsertSession(session);
    }
  }

  async rescan(): Promise<void> {
    await this.initialScan();
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
    const { sessionMeta, taskSpawns } = await parseSession(sessionFilePath);
    const sessionId = sessionMeta.sessionId || path.basename(sessionFilePath, '.jsonl');

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
