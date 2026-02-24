import * as vscode from 'vscode';
import * as path from 'path';
import { SessionStore } from '../../state/session-store';
import { Session, Subagent, ToolCall, SubagentStatus } from '../../types';
import { formatElapsed, formatTimestamp, formatRelativeTime, formatTokenCount } from '../../utils/time';

export type TreeElement =
  | { kind: 'project'; repoName: string; sessions: Session[] }
  | { kind: 'session'; session: Session }
  | { kind: 'subagent'; subagent: Subagent; session: Session }
  | { kind: 'tool-call'; toolCall: ToolCall };

export class SubagentTreeProvider
  implements vscode.TreeDataProvider<TreeElement>
{
  private _onDidChange = new vscode.EventEmitter<
    TreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private compactingIcon: { light: vscode.Uri; dark: vscode.Uri };

  constructor(private store: SessionStore, extensionUri: vscode.Uri) {
    this.compactingIcon = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'compacting-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'compacting-dark.svg'),
    };
  }

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
      case 'project':
        return this.buildProjectItem(element.repoName, element.sessions);
      case 'session':
        return this.buildSessionItem(element.session);
      case 'subagent':
        return this.buildSubagentItem(element.subagent);
      case 'tool-call':
        return this.buildToolCallItem(element.toolCall);
    }
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      const grouped = this.store.getSessionsByProject();
      return Array.from(grouped.entries()).map(([repoName, sessions]) => ({
        kind: 'project' as const,
        repoName,
        sessions,
      }));
    }

    switch (element.kind) {
      case 'project':
        return element.sessions
          .filter((s) => s.subagents.length > 0 || s.isActive || s.awaitingInput)
          .map((session) => ({
            kind: 'session' as const,
            session,
          }));

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

      case 'subagent':
        return element.subagent.toolCalls.map((tc) => ({
          kind: 'tool-call' as const,
          toolCall: tc,
        }));

      default:
        return [];
    }
  }

  private buildProjectItem(repoName: string, sessions: Session[]): vscode.TreeItem {
    const item = new vscode.TreeItem(
      repoName,
      vscode.TreeItemCollapsibleState.Expanded,
    );

    const totalActive = sessions.reduce((sum, s) => sum + s.activeSubagentCount, 0);
    const totalAwaiting = sessions.filter((s) => s.awaitingInput).length;
    const branch = sessions[0]?.gitBranch;

    if (totalAwaiting > 0) {
      item.description = `${branch ?? ''} | ${totalAwaiting} awaiting input`;
      item.iconPath = new vscode.ThemeIcon('bell', new vscode.ThemeColor('charts.orange'));
    } else if (totalActive > 0) {
      item.description = `${branch ?? ''} | ${totalActive} active`;
      item.iconPath = new vscode.ThemeIcon('repo', new vscode.ThemeColor('charts.green'));
    } else {
      item.description = branch ?? '';
      item.iconPath = new vscode.ThemeIcon('repo');
    }

    item.contextValue = 'project';
    item.tooltip = new vscode.MarkdownString(
      `**${repoName}**\n\n` +
        `- Sessions: ${sessions.length}\n` +
        `- Awaiting input: ${totalAwaiting}\n` +
        `- Active agents: ${totalActive}\n` +
        (branch ? `- Branch: ${branch}` : ''),
    );

    return item;
  }

  private buildSessionItem(session: Session): vscode.TreeItem {
    const relTime = formatRelativeTime(session.lastActivityAt);
    const branch = session.gitBranch ?? 'no branch';
    const label = `Session \u00b7 ${branch} \u00b7 ${relTime}`;

    const item = new vscode.TreeItem(
      label,
      session.subagents.length > 0 || session.awaitingInput
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );

    const agentCount = session.subagents.length;
    const activeCount = session.activeSubagentCount;

    if (session.isCompacting) {
      item.description = 'COMPACTING...';
      item.iconPath = this.compactingIcon;
    } else if (session.awaitingInput) {
      const toolInfo = session.pendingToolNames.length > 0
        ? ` (${session.pendingToolNames.join(', ')})`
        : '';
      item.description = `AWAITING INPUT${toolInfo}`;
      item.iconPath = new vscode.ThemeIcon('bell-dot', new vscode.ThemeColor('charts.orange'));
    } else if (activeCount > 0) {
      item.description = `${activeCount} running, ${agentCount} total`;
      item.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.green'));
    } else {
      item.description = `${agentCount} agent${agentCount !== 1 ? 's' : ''}`;
      item.iconPath = new vscode.ThemeIcon('comment-discussion');
    }

    item.contextValue = 'session';
    item.tooltip = new vscode.MarkdownString(
      `**Session** \`${session.sessionId}\`\n\n` +
        `- Branch: ${branch}\n` +
        `- Started: ${formatTimestamp(session.startedAt)}\n` +
        `- Last activity: ${formatTimestamp(session.lastActivityAt)}\n` +
        (session.awaitingInput ? `- **Awaiting input**: ${session.pendingToolNames.join(', ') || 'yes'}\n` : '') +
        `- Active: ${activeCount}\n` +
        `- Total: ${agentCount}`,
    );

    return item;
  }

  private buildSubagentItem(subagent: Subagent): vscode.TreeItem {
    const label = subagent.description || subagent.slug || subagent.agentId;
    const hasToolCalls = subagent.toolCalls.length > 0;

    const item = new vscode.TreeItem(
      label,
      hasToolCalls
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    const parts: string[] = [];
    if (subagent.subagentType !== 'unknown') parts.push(subagent.subagentType);
    if (subagent.elapsedMs > 0) parts.push(formatElapsed(subagent.elapsedMs));
    if (subagent.tokenUsage.totalTokens > 0) parts.push(formatTokenCount(subagent.tokenUsage.totalTokens));
    item.description = parts.join(' | ');

    item.contextValue = 'subagent';
    item.iconPath = this.getSubagentIcon(subagent.status);

    item.tooltip = new vscode.MarkdownString(
      `**${label}**\n\n` +
        `| Field | Value |\n|---|---|\n` +
        `| Type | ${subagent.subagentType} |\n` +
        `| Status | ${subagent.status} |\n` +
        `| Model | ${subagent.model || 'unknown'} |\n` +
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

  private getSubagentIcon(status: SubagentStatus): vscode.ThemeIcon {
    switch (status) {
      case 'running':
        return new vscode.ThemeIcon(
          'sync~spin',
          new vscode.ThemeColor('charts.yellow'),
        );
      case 'completed':
        return new vscode.ThemeIcon(
          'pass',
          new vscode.ThemeColor('charts.green'),
        );
      case 'error':
        return new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('errorForeground'),
        );
      default:
        return new vscode.ThemeIcon(
          'circle-outline',
          new vscode.ThemeColor('descriptionForeground'),
        );
    }
  }
}
