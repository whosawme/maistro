import { SessionTodos, TodoItem, TodoSnapshot } from '../../types';
import { formatRelativeTime, formatTimestamp } from '../../utils/time';
import { extractRepoName } from '../../utils/paths';

export function generateTodoHistoryContent(
  sessionTodos: SessionTodos,
): string {
  const repoName = extractRepoName({ projectPath: sessionTodos.projectPath });
  const snapshots = [...sessionTodos.history].reverse();

  const snapshotsHtml = snapshots
    .map((snap, i) => generateSnapshotCard(snap, i))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --card-bg: var(--vscode-editorWidget-background);
      --muted: var(--vscode-descriptionForeground);
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      padding: 16px;
      margin: 0;
    }
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 1.3em;
      margin: 0 0 4px 0;
    }
    .header .sub {
      color: var(--muted);
      font-size: 0.9em;
    }
    .snapshot {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .snapshot-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .snapshot-time {
      font-weight: 600;
      font-size: 0.95em;
    }
    .snapshot-count {
      color: var(--muted);
      font-size: 0.85em;
    }
    .todo-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .todo-list li {
      padding: 4px 0;
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 0.9em;
    }
    .icon-completed { color: #5cb85c; }
    .icon-in_progress { color: #f0ad4e; }
    .icon-pending { color: var(--muted); }
    .active-form {
      color: var(--muted);
      font-size: 0.85em;
      margin-left: 4px;
    }
    .empty {
      text-align: center;
      color: var(--muted);
      padding: 32px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Todo History</h1>
    <div class="sub">${esc(repoName)} \u00b7 ${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''}</div>
  </div>

  ${snapshots.length === 0 ? '<div class="empty">No todo snapshots recorded yet.</div>' : snapshotsHtml}
</body>
</html>`;
}

function generateSnapshotCard(snap: TodoSnapshot, index: number): string {
  const completed = snap.todos.filter((t) => t.status === 'completed').length;
  const total = snap.todos.length;
  const time = formatTimestamp(snap.timestamp);
  const rel = formatRelativeTime(snap.timestamp);

  const todosHtml = snap.todos.map((t) => generateTodoLine(t)).join('\n');

  return `
  <div class="snapshot">
    <div class="snapshot-header">
      <span class="snapshot-time">${esc(time)} <span class="active-form">${esc(rel)}</span></span>
      <span class="snapshot-count">${completed}/${total} done</span>
    </div>
    <ul class="todo-list">
      ${todosHtml}
    </ul>
  </div>`;
}

function generateTodoLine(todo: TodoItem): string {
  const icons: Record<string, string> = {
    completed: '\u2714',
    in_progress: '\u25b6',
    pending: '\u25cb',
  };
  const icon = icons[todo.status] ?? '\u25cb';
  const cls = `icon-${todo.status}`;
  const activeForm =
    todo.status === 'in_progress' && todo.activeForm
      ? `<span class="active-form">\u2014 ${esc(todo.activeForm)}</span>`
      : '';

  return `<li><span class="${cls}">${icon}</span> ${esc(todo.content)}${activeForm}</li>`;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
