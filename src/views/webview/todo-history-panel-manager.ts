import * as vscode from 'vscode';
import { TodoStore } from '../../state/todo-store';
import { generateTodoHistoryContent } from './todo-history-content';
import { TODO_HISTORY_WEBVIEW_TYPE } from '../../constants';

export class TodoHistoryPanelManager implements vscode.Disposable {
  private panels = new Map<string, vscode.WebviewPanel>();

  constructor(private todoStore: TodoStore) {}

  openOrReveal(sessionId: string): void {
    const existing = this.panels.get(sessionId);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside);
      this.updatePanel(existing, sessionId);
      return;
    }

    const sessionTodos = this.todoStore.getSessionTodos(sessionId);
    if (!sessionTodos) return;

    const panel = vscode.window.createWebviewPanel(
      TODO_HISTORY_WEBVIEW_TYPE,
      `Todos: ${sessionId.slice(0, 8)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true },
    );

    this.updatePanel(panel, sessionId);

    panel.onDidDispose(() => {
      this.panels.delete(sessionId);
    });

    this.panels.set(sessionId, panel);
  }

  updateIfOpen(sessionId: string): void {
    const panel = this.panels.get(sessionId);
    if (panel) {
      this.updatePanel(panel, sessionId);
    }
  }

  updateAll(): void {
    for (const [sessionId, panel] of this.panels) {
      this.updatePanel(panel, sessionId);
    }
  }

  private updatePanel(panel: vscode.WebviewPanel, sessionId: string): void {
    const sessionTodos = this.todoStore.getSessionTodos(sessionId);
    if (!sessionTodos) return;
    panel.webview.html = generateTodoHistoryContent(sessionTodos);
  }

  dispose(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }
}
