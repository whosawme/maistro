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

  update(activeCount: number, awaitingCount: number = 0): void {
    if (awaitingCount > 0) {
      this.statusBarItem.text = `$(bell) Maistro: ${awaitingCount} awaiting input`;
      this.statusBarItem.tooltip = `${awaitingCount} agent${awaitingCount !== 1 ? 's' : ''} awaiting input` +
        (activeCount > 0 ? `, ${activeCount} active` : '');
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.show();
    } else if (activeCount > 0) {
      this.statusBarItem.text = `$(sync~spin) Maistro: ${activeCount} active`;
      this.statusBarItem.tooltip = `${activeCount} active subagent${activeCount !== 1 ? 's' : ''}`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.show();
    } else {
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.hide();
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
