import { EventEmitter } from 'events';
import type { Disposable, ExtensionContext, Memento } from 'vscode';
import { TodoSnapshot, SessionTodos } from '../types';
import { extractRepoName } from '../utils/paths';

const STORAGE_KEY = 'maistro.todoHistory';
const MAX_SNAPSHOTS_PER_SESSION = 100;

export class TodoStore extends EventEmitter implements Disposable {
  private bySession = new Map<string, SessionTodos>();
  private globalState: Memento;

  constructor(context: ExtensionContext) {
    super();
    this.globalState = context.globalState;
    this.restore();
  }

  ingestSnapshots(
    sessionId: string,
    projectPath: string,
    snapshots: TodoSnapshot[],
  ): void {
    if (snapshots.length === 0) return;

    let entry = this.bySession.get(sessionId);
    if (!entry) {
      entry = {
        sessionId,
        projectPath,
        current: snapshots[snapshots.length - 1]!,
        history: [],
      };
      this.bySession.set(sessionId, entry);
    }

    const existingIds = new Set(entry.history.map((s) => s.id));
    let added = false;
    for (const snap of snapshots) {
      snap.projectPath = projectPath;
      snap.sessionId = sessionId;
      if (!existingIds.has(snap.id)) {
        entry.history.push(snap);
        existingIds.add(snap.id);
        added = true;
      }
    }

    if (!added) return;

    entry.history.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    if (entry.history.length > MAX_SNAPSHOTS_PER_SESSION) {
      entry.history = entry.history.slice(-MAX_SNAPSHOTS_PER_SESSION);
    }

    entry.current = entry.history[entry.history.length - 1]!;

    this.persist();
    this.emit('todos:updated', entry);
  }

  getActiveTodoSessions(): SessionTodos[] {
    return Array.from(this.bySession.values())
      .filter((st) => st.current.todos.some((t) => t.status !== 'completed'))
      .sort(
        (a, b) =>
          new Date(b.current.timestamp).getTime() -
          new Date(a.current.timestamp).getTime(),
      );
  }

  getAllTodoSessions(): SessionTodos[] {
    return Array.from(this.bySession.values()).sort(
      (a, b) =>
        new Date(b.current.timestamp).getTime() -
        new Date(a.current.timestamp).getTime(),
    );
  }

  getTodosByProject(): Map<string, SessionTodos[]> {
    const grouped = new Map<string, SessionTodos[]>();
    for (const st of this.getActiveTodoSessions()) {
      const repo = extractRepoName({ projectPath: st.projectPath });
      const list = grouped.get(repo) || [];
      list.push(st);
      grouped.set(repo, list);
    }
    return grouped;
  }

  getSessionTodos(sessionId: string): SessionTodos | undefined {
    return this.bySession.get(sessionId);
  }

  clearCompleted(): void {
    for (const [id, entry] of this.bySession) {
      if (entry.current.todos.every((t) => t.status === 'completed')) {
        this.bySession.delete(id);
      }
    }
    this.persist();
    this.emit('todos:cleared');
  }

  private persist(): void {
    const data = Array.from(this.bySession.values());
    this.globalState.update(STORAGE_KEY, data);
  }

  private restore(): void {
    const data = this.globalState.get<SessionTodos[]>(STORAGE_KEY, []);
    for (const entry of data) {
      this.bySession.set(entry.sessionId, entry);
    }
  }

  dispose(): void {
    this.removeAllListeners();
    this.bySession.clear();
  }
}
