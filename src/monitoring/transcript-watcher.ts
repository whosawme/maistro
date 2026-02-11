import * as vscode from 'vscode';
import * as path from 'path';
import { SessionStore } from '../state/session-store';
import { SessionDiscovery } from './session-discovery';
import { FileTailer } from './file-tailer';
import { MaistroConfig } from '../types';
import { isCompactAgent, extractAgentIdFromPath, extractSessionIdFromPath } from '../utils/paths';

export class TranscriptWatcher implements vscode.Disposable {
  private watchers: vscode.Disposable[] = [];
  private tailers = new Map<string, FileTailer>();
  private pollInterval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private claudeProjectsPath: string,
    private store: SessionStore,
    private discovery: SessionDiscovery,
    private config: MaistroConfig,
  ) {
    this.setupWatchers();
    this.setupPolling();
  }

  private setupWatchers(): void {
    // Watch for new subagent files
    const subagentPattern = new vscode.RelativePattern(
      vscode.Uri.file(this.claudeProjectsPath),
      '**/subagents/agent-*.jsonl',
    );
    const subagentWatcher = vscode.workspace.createFileSystemWatcher(subagentPattern);

    subagentWatcher.onDidCreate((uri) => {
      if (isCompactAgent(uri.fsPath)) return;
      this.onNewSubagentFile(uri.fsPath);
    });

    subagentWatcher.onDidChange((uri) => {
      if (isCompactAgent(uri.fsPath)) return;
      this.onSubagentFileChanged(uri.fsPath);
    });

    // Watch for new session files
    const sessionPattern = new vscode.RelativePattern(
      vscode.Uri.file(this.claudeProjectsPath),
      '**/*.jsonl',
    );
    const sessionWatcher = vscode.workspace.createFileSystemWatcher(sessionPattern);

    sessionWatcher.onDidCreate((uri) => {
      if (uri.fsPath.includes('subagents')) return;
      this.discovery.rescan();
    });

    this.watchers.push(subagentWatcher, sessionWatcher);
  }

  private setupPolling(): void {
    this.pollInterval = setInterval(() => {
      for (const tailer of this.tailers.values()) {
        tailer.checkForUpdates();
      }
    }, this.config.watcherPollIntervalMs);
  }

  private async onNewSubagentFile(filePath: string): Promise<void> {
    await this.discovery.discoverNewSubagent(filePath);

    const agentId = extractAgentIdFromPath(filePath);
    const sessionId = extractSessionIdFromPath(filePath);

    if (agentId && sessionId) {
      const tailer = new FileTailer(filePath, (data) => {
        this.store.updateSubagentFromTail(sessionId, agentId, data);
      });
      this.tailers.set(filePath, tailer);
    }
  }

  private onSubagentFileChanged(filePath: string): void {
    const tailer = this.tailers.get(filePath);
    if (tailer) {
      tailer.checkForUpdates();
    } else {
      // File changed but we weren't tailing it - start now
      this.onNewSubagentFile(filePath);
    }
  }

  updateConfig(config: MaistroConfig): void {
    this.config = config;
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.setupPolling();
  }

  dispose(): void {
    for (const w of this.watchers) w.dispose();
    for (const t of this.tailers.values()) t.dispose();
    if (this.pollInterval) clearInterval(this.pollInterval);
  }
}
