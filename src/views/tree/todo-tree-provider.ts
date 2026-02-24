import * as vscode from 'vscode';
import { TodoStore } from '../../state/todo-store';
import { SessionTodos, TodoItem, TodoStatus } from '../../types';
import { extractRepoName } from '../../utils/paths';
import { formatRelativeTime } from '../../utils/time';

export type TodoTreeElement =
  | { kind: 'project'; repoName: string; sessionTodos: SessionTodos[] }
  | { kind: 'session'; sessionTodos: SessionTodos }
  | { kind: 'todo-item'; item: TodoItem; sessionId: string };

export class TodoTreeProvider
  implements vscode.TreeDataProvider<TodoTreeElement>
{
  private _onDidChange = new vscode.EventEmitter<
    TodoTreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private todoStore: TodoStore) {}

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: TodoTreeElement): vscode.TreeItem {
    switch (element.kind) {
      case 'project':
        return this.buildProjectItem(element);
      case 'session':
        return this.buildSessionItem(element.sessionTodos);
      case 'todo-item':
        return this.buildTodoItem(element.item);
    }
  }

  getChildren(element?: TodoTreeElement): TodoTreeElement[] {
    if (!element) {
      const grouped = this.todoStore.getTodosByProject();
      if (grouped.size === 0) return [];

      if (grouped.size === 1) {
        const [, sessionTodosList] = Array.from(grouped.entries())[0]!;
        if (sessionTodosList.length === 1) {
          return sessionTodosList[0]!.current.todos.map((item) => ({
            kind: 'todo-item' as const,
            item,
            sessionId: sessionTodosList[0]!.sessionId,
          }));
        }
        return sessionTodosList.map((st) => ({
          kind: 'session' as const,
          sessionTodos: st,
        }));
      }

      return Array.from(grouped.entries()).map(
        ([repoName, sessionTodosList]) => ({
          kind: 'project' as const,
          repoName,
          sessionTodos: sessionTodosList,
        }),
      );
    }

    switch (element.kind) {
      case 'project':
        return element.sessionTodos.map((st) => ({
          kind: 'session' as const,
          sessionTodos: st,
        }));
      case 'session':
        return element.sessionTodos.current.todos.map((item) => ({
          kind: 'todo-item' as const,
          item,
          sessionId: element.sessionTodos.sessionId,
        }));
      default:
        return [];
    }
  }

  private buildProjectItem(element: {
    repoName: string;
    sessionTodos: SessionTodos[];
  }): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.repoName,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    const totalTodos = element.sessionTodos.reduce(
      (sum, st) => sum + st.current.todos.length,
      0,
    );
    item.description = `${totalTodos} todo${totalTodos !== 1 ? 's' : ''}`;
    item.iconPath = new vscode.ThemeIcon('checklist');
    item.contextValue = 'todoProject';
    return item;
  }

  private buildSessionItem(st: SessionTodos): vscode.TreeItem {
    const completed = st.current.todos.filter(
      (t) => t.status === 'completed',
    ).length;
    const total = st.current.todos.length;
    const relTime = formatRelativeTime(st.current.timestamp);

    const item = new vscode.TreeItem(
      `Session \u00b7 ${relTime}`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.description = `${completed}/${total} done`;
    item.iconPath = new vscode.ThemeIcon('tasklist');
    item.contextValue = 'todoSession';
    return item;
  }

  private buildTodoItem(todo: TodoItem): vscode.TreeItem {
    const item = new vscode.TreeItem(
      todo.content,
      vscode.TreeItemCollapsibleState.None,
    );

    item.iconPath = this.getTodoIcon(todo.status);
    item.description =
      todo.status === 'in_progress' ? todo.activeForm : '';
    item.contextValue = 'todoItem';

    item.tooltip = new vscode.MarkdownString(
      `**${todo.content}**\n\nStatus: ${todo.status}` +
        (todo.activeForm ? `\n\nActive: ${todo.activeForm}` : ''),
    );

    return item;
  }

  private getTodoIcon(status: TodoStatus): vscode.ThemeIcon {
    switch (status) {
      case 'completed':
        return new vscode.ThemeIcon(
          'pass-filled',
          new vscode.ThemeColor('charts.green'),
        );
      case 'in_progress':
        return new vscode.ThemeIcon(
          'sync~spin',
          new vscode.ThemeColor('charts.yellow'),
        );
      case 'pending':
        return new vscode.ThemeIcon(
          'circle-large-outline',
          new vscode.ThemeColor('descriptionForeground'),
        );
    }
  }
}
