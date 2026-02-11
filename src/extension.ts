import * as vscode from 'vscode';
import { SessionStore } from './state/session-store';
import { TranscriptWatcher } from './monitoring/transcript-watcher';
import { SessionDiscovery } from './monitoring/session-discovery';
import { SubagentTreeProvider } from './views/tree/subagent-tree-provider';
import { WebviewPanelManager } from './views/webview/webview-panel-manager';
import { StatusBarManager } from './views/statusbar/status-bar-manager';
import { resolveClaudeProjectsPath } from './utils/paths';
import { MaestroConfig } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const config = loadConfig();
  const claudeProjectsPath = resolveClaudeProjectsPath(config.claudeHomePath);

  // Core
  const store = new SessionStore();
  const discovery = new SessionDiscovery(claudeProjectsPath, store, config);
  const watcher = new TranscriptWatcher(claudeProjectsPath, store, discovery, config);

  // Views
  const treeProvider = new SubagentTreeProvider(store);
  const treeView = vscode.window.createTreeView('maestro.sessionTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  const webviewManager = new WebviewPanelManager(context, store);
  const statusBar = new StatusBarManager();

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('maestro.refresh', () => {
      discovery.rescan();
      treeProvider.refresh();
    }),
    vscode.commands.registerCommand('maestro.openDetail', (agentId: string) => {
      webviewManager.openOrReveal(agentId);
    }),
    vscode.commands.registerCommand('maestro.openTranscript', (filePath: string) => {
      vscode.workspace
        .openTextDocument(vscode.Uri.file(filePath))
        .then((doc) => vscode.window.showTextDocument(doc));
    }),
    vscode.commands.registerCommand('maestro.clearSessions', () => {
      store.clearInactiveSessions();
      treeProvider.refresh();
    }),
    vscode.commands.registerCommand('maestro.copyAgentId', (agentId: string) => {
      vscode.env.clipboard.writeText(agentId);
      vscode.window.showInformationMessage(`Copied agent ID: ${agentId}`);
    }),
  );

  // Wire state changes to UI
  store.on('session:discovered', () => treeProvider.refresh());
  store.on('session:updated', () => treeProvider.refresh());
  store.on('session:cleared', () => treeProvider.refresh());
  store.on('subagent:spawned', ({ subagent }) => {
    treeProvider.refresh();
  });
  store.on('subagent:updated', ({ subagent }) => {
    treeProvider.refreshSubagent(subagent.agentId);
    webviewManager.updateIfOpen(subagent.agentId);
  });
  store.on('subagent:completed', ({ subagent }) => {
    treeProvider.refresh();
    webviewManager.updateIfOpen(subagent.agentId);
  });
  store.on('activeCount:changed', (count: number) => {
    statusBar.update(count);
  });

  // Config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('maestro')) {
        watcher.updateConfig(loadConfig());
        treeProvider.refresh();
      }
    }),
  );

  // Disposables
  context.subscriptions.push(treeView, watcher, statusBar, webviewManager, store);

  // Initial scan
  discovery.initialScan().then(() => {
    treeProvider.refresh();
    statusBar.update(store.getActiveSubagentCount());
  });
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions
}

function loadConfig(): MaestroConfig {
  const c = vscode.workspace.getConfiguration('maestro');
  return {
    claudeHomePath: c.get<string>('claudeHomePath', ''),
    maxSessionsDisplayed: c.get<number>('maxSessionsDisplayed', 10),
    watcherPollIntervalMs: c.get<number>('watcherPollIntervalMs', 1000),
    autoExpandActiveSessions: c.get<boolean>('autoExpandActiveSessions', true),
  };
}
