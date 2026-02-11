import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = 'maistro.refresh';
    this.statusBarItem.name = 'Maistro';
    this.update(0);
  }

  update(activeCount: number): void {
    if (activeCount > 0) {
      this.statusBarItem.text = `$(sync~spin) Maistro: ${activeCount} active`;
      this.statusBarItem.tooltip = `${activeCount} active subagent${activeCount !== 1 ? 's' : ''}`;
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
