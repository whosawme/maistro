import * as vscode from 'vscode';
import { SessionStore } from '../../state/session-store';
import { Session, Subagent, ToolCall, SubagentStatus } from '../../types';
import { formatElapsed, formatTimestamp } from '../../utils/time';

export type TreeElement =
  | { kind: 'session'; session: Session }
  | { kind: 'subagent'; subagent: Subagent; session: Session }
  | { kind: 'tool-call'; toolCall: ToolCall }
  | { kind: 'info'; label: string; detail: string };

export class SubagentTreeProvider
  implements vscode.TreeDataProvider<TreeElement>
{
  private _onDidChange = new vscode.EventEmitter<
    TreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private store: SessionStore) {}

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  refreshSubagent(agentId: string): void {
    const subagent = this.store.getSubagent(agentId);
    const session = this.store.getSessionForSubagent(agentId);
    if (subagent && session) {
      this._onDidChange.fire({ kind: 'subagent', subagent, session });
    }
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    switch (element.kind) {
      case 'session':
        return this.buildSessionItem(element.session);
      case 'subagent':
        return this.buildSubagentItem(element.subagent);
      case 'tool-call':
        return this.buildToolCallItem(element.toolCall);
      case 'info':
        return this.buildInfoItem(element.label, element.detail);
    }
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      return this.store.getSessions().map((session) => ({
        kind: 'session' as const,
        session,
      }));
    }

    switch (element.kind) {
      case 'session':
        return element.session.subagents
          .sort(
            (a, b) =>
              new Date(b.startedAt).getTime() -
              new Date(a.startedAt).getTime(),
          )
          .map((subagent) => ({
            kind: 'subagent' as const,
            subagent,
            session: element.session,
          }));

      case 'subagent': {
        const items: TreeElement[] = [];

        items.push({
          kind: 'info',
          label: 'Model',
          detail: element.subagent.model || 'unknown',
        });
        items.push({
          kind: 'info',
          label: 'Tokens',
          detail: `${element.subagent.tokenUsage.totalTokens.toLocaleString()} total`,
        });
        items.push({
          kind: 'info',
          label: 'Duration',
          detail: formatElapsed(element.subagent.elapsedMs),
        });

        for (const tc of element.subagent.toolCalls) {
          items.push({ kind: 'tool-call', toolCall: tc });
        }
        return items;
      }

      default:
        return [];
    }
  }

  private buildSessionItem(session: Session): vscode.TreeItem {
    const label = session.sessionId.slice(0, 8) + '...';
    const item = new vscode.TreeItem(
      label,
      session.subagents.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );

    item.description = `${session.subagents.length} agent${session.subagents.length !== 1 ? 's' : ''} | ${session.gitBranch ?? ''}`;

    item.tooltip = new vscode.MarkdownString(
      `**Session** \`${session.sessionId}\`\n\n` +
        `- Branch: ${session.gitBranch ?? 'unknown'}\n` +
        `- Started: ${formatTimestamp(session.startedAt)}\n` +
        `- Active: ${session.activeSubagentCount}\n` +
        `- Total: ${session.subagents.length}`,
    );

    item.contextValue = 'session';
    item.iconPath =
      session.activeSubagentCount > 0
        ? new vscode.ThemeIcon(
            'pulse',
            new vscode.ThemeColor('charts.green'),
          )
        : new vscode.ThemeIcon('history');

    return item;
  }

  private buildSubagentItem(subagent: Subagent): vscode.TreeItem {
    const label = subagent.description || subagent.slug || subagent.agentId;
    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
    );

    item.description = `${subagent.subagentType} | ${formatElapsed(subagent.elapsedMs)} | ${subagent.toolCalls.length} tools`;
    item.contextValue = 'subagent';
    item.iconPath = this.getSubagentIcon(subagent.status);

    item.tooltip = new vscode.MarkdownString(
      `**${label}**\n\n` +
        `| Field | Value |\n|---|---|\n` +
        `| Type | ${subagent.subagentType} |\n` +
        `| Status | ${subagent.status} |\n` +
        `| Model | ${subagent.model} |\n` +
        `| ID | \`${subagent.agentId}\` |\n` +
        `| Duration | ${formatElapsed(subagent.elapsedMs)} |\n` +
        `| Tools | ${subagent.toolCalls.length} |\n` +
        `| Tokens | ${subagent.tokenUsage.totalTokens.toLocaleString()} |`,
    );

    item.command = {
      command: 'maistro.openDetail',
      title: 'Open Detail',
      arguments: [subagent.agentId],
    };

    return item;
  }

  private buildToolCallItem(tc: ToolCall): vscode.TreeItem {
    const item = new vscode.TreeItem(
      tc.name,
      vscode.TreeItemCollapsibleState.None,
    );

    item.description =
      tc.durationMs !== undefined ? formatElapsed(tc.durationMs) : '';

    item.iconPath = tc.isError
      ? new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('errorForeground'),
        )
      : new vscode.ThemeIcon('wrench');

    const inputPreview = JSON.stringify(tc.input, null, 2).slice(0, 500);
    item.tooltip = new vscode.MarkdownString(
      `**${tc.name}**\n\n` +
        `\`\`\`json\n${inputPreview}\n\`\`\`\n` +
        (tc.resultPreview
          ? `\n**Result:**\n\`\`\`\n${tc.resultPreview.slice(0, 300)}\n\`\`\``
          : '') +
        (tc.isError ? '\n\n**ERROR**' : ''),
    );

    return item;
  }

  private buildInfoItem(label: string, detail: string): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${label}: ${detail}`,
      vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }

  private getSubagentIcon(status: SubagentStatus): vscode.ThemeIcon {
    switch (status) {
      case 'running':
        return new vscode.ThemeIcon(
          'sync~spin',
          new vscode.ThemeColor('charts.yellow'),
        );
      case 'completed':
        return new vscode.ThemeIcon(
          'check',
          new vscode.ThemeColor('charts.green'),
        );
      case 'error':
        return new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('errorForeground'),
        );
      default:
        return new vscode.ThemeIcon('question');
    }
  }
}
