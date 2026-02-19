import { EventEmitter } from 'events';
import { Session, Subagent } from '../types';
import { extractRepoName } from '../utils/paths';
import type { Disposable } from 'vscode';

export class SessionStore extends EventEmitter implements Disposable {
  private sessions = new Map<string, Session>();
  private subagentIndex = new Map<string, string>(); // agentId -> sessionId

  getSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    );
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSubagent(agentId: string): Subagent | undefined {
    const sessionId = this.subagentIndex.get(agentId);
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    return session?.subagents.find((s) => s.agentId === agentId);
  }

  getSessionForSubagent(agentId: string): Session | undefined {
    const sessionId = this.subagentIndex.get(agentId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  upsertSession(session: Session): void {
    const isNew = !this.sessions.has(session.sessionId);
    this.sessions.set(session.sessionId, session);

    for (const sub of session.subagents) {
      this.subagentIndex.set(sub.agentId, session.sessionId);
    }

    this.emit(isNew ? 'session:discovered' : 'session:updated', session);
    this.emitActiveCount();
  }

  upsertSubagent(sessionId: string, subagent: Subagent): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const idx = session.subagents.findIndex(
      (s) => s.agentId === subagent.agentId,
    );
    const isNew = idx === -1;

    if (isNew) {
      session.subagents.push(subagent);
    } else {
      session.subagents[idx] = subagent;
    }

    session.activeSubagentCount = session.subagents.filter(
      (s) => s.status === 'running',
    ).length;
    session.lastActivityAt = subagent.completedAt ?? subagent.startedAt;
    this.subagentIndex.set(subagent.agentId, sessionId);

    if (isNew) {
      this.emit('subagent:spawned', { session, subagent });
    } else {
      this.emit('subagent:updated', { session, subagent });
    }

    if (subagent.status === 'completed') {
      this.emit('subagent:completed', { session, subagent });
    }

    this.emitActiveCount();
  }

  updateSubagentFromTail(
    sessionId: string,
    agentId: string,
    partial: Partial<Subagent>,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const subagent = session.subagents.find((s) => s.agentId === agentId);
    if (!subagent) return;

    // Merge tool calls
    if (partial.toolCalls?.length) {
      subagent.toolCalls.push(...partial.toolCalls);
    }

    // Update scalar fields
    if (partial.status) subagent.status = partial.status;
    if (partial.completedAt) subagent.completedAt = partial.completedAt;
    if (partial.elapsedMs) subagent.elapsedMs = partial.elapsedMs;
    if (partial.tokenUsage) subagent.tokenUsage = partial.tokenUsage;
    if (partial.finalOutput) subagent.finalOutput = partial.finalOutput;
    if (partial.lineCount) subagent.lineCount += partial.lineCount;

    session.activeSubagentCount = session.subagents.filter(
      (s) => s.status === 'running',
    ).length;

    this.emit('subagent:updated', { session, subagent });

    if (partial.status === 'completed') {
      this.emit('subagent:completed', { session, subagent });
    }

    this.emitActiveCount();
  }

  getSessionsByProject(): Map<string, Session[]> {
    const grouped = new Map<string, Session[]>();
    for (const session of this.getSessions()) {
      const repo = extractRepoName(session);
      const list = grouped.get(repo) || [];
      list.push(session);
      grouped.set(repo, list);
    }
    return grouped;
  }

  getActiveSubagentCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      count += session.activeSubagentCount;
    }
    return count;
  }

  clearInactiveSessions(): void {
    for (const [id, session] of this.sessions) {
      if (!session.isActive && session.activeSubagentCount === 0) {
        this.sessions.delete(id);
        for (const sub of session.subagents) {
          this.subagentIndex.delete(sub.agentId);
        }
      }
    }
    this.emit('session:cleared');
  }

  private lastActiveCount = -1;
  private emitActiveCount(): void {
    const count = this.getActiveSubagentCount();
    if (count !== this.lastActiveCount) {
      this.lastActiveCount = count;
      this.emit('activeCount:changed', count);
    }
  }

  dispose(): void {
    this.removeAllListeners();
    this.sessions.clear();
    this.subagentIndex.clear();
  }
}
