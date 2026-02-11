import * as vscode from 'vscode';
import { SessionStore } from '../../state/session-store';
import { generateWebviewContent } from './webview-content';

export class WebviewPanelManager implements vscode.Disposable {
  private panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private context: vscode.ExtensionContext,
    private store: SessionStore,
  ) {}

  openOrReveal(agentId: string): void {
    const existing = this.panels.get(agentId);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside);
      this.updatePanel(existing, agentId);
      return;
    }

    const subagent = this.store.getSubagent(agentId);
    if (!subagent) return;

    const panel = vscode.window.createWebviewPanel(
      'maestroSubagentDetail',
      `Maestro: ${subagent.description || subagent.slug || subagent.agentId}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.updatePanel(panel, agentId);

    panel.onDidDispose(() => {
      this.panels.delete(agentId);
    });

    this.panels.set(agentId, panel);
  }

  updateIfOpen(agentId: string): void {
    const panel = this.panels.get(agentId);
    if (panel) {
      this.updatePanel(panel, agentId);
    }
  }

  private updatePanel(panel: vscode.WebviewPanel, agentId: string): void {
    const subagent = this.store.getSubagent(agentId);
    if (!subagent) return;
    panel.webview.html = generateWebviewContent(subagent);
  }

  dispose(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }
}
