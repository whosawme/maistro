import {
  TranscriptLine,
  Session,
  SubagentType,
  TaskSpawnInfo,
  TodoSnapshot,
  ToolUseContentBlock,
  ToolResultContentBlock,
} from '../types';
import { parseJsonlFile } from './jsonl-parser';
import {
  USER_INPUT_TOOL_NAMES,
  TASK_LIKE_TOOL_NAMES,
  AWAITING_INPUT_TIMEOUT_MS,
} from '../constants';

export async function parseSession(filePath: string): Promise<{
  sessionMeta: Partial<Session>;
  taskSpawns: TaskSpawnInfo[];
  awaitingInput: boolean;
  pendingToolNames: string[];
  todoSnapshots: TodoSnapshot[];
}> {
  const lines = await parseJsonlFile(filePath);
  const taskSpawns: TaskSpawnInfo[] = [];
  const todoSnapshots: TodoSnapshot[] = [];
  const pendingToolUses = new Map<
    string,
    { name: string; timestamp: string }
  >();

  let sessionId = '';
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let version: string | undefined;
  let firstTimestamp = '';
  let lastTimestamp = '';

  for (const line of lines) {
    if (!sessionId && line.sessionId) sessionId = line.sessionId;
    if (!cwd && line.cwd) cwd = line.cwd;
    if (!gitBranch && line.gitBranch) gitBranch = line.gitBranch;
    if (!version && line.version) version = line.version;
    if (!firstTimestamp && line.timestamp) firstTimestamp = line.timestamp;
    if (line.timestamp) lastTimestamp = line.timestamp;

    // Find tool_use blocks in assistant messages
    if (line.type === 'assistant' && line.message?.content && Array.isArray(line.message.content)) {
      for (const block of line.message.content) {
        if (block.type === 'tool_use') {
          const tu = block as ToolUseContentBlock;
          pendingToolUses.set(tu.id, {
            name: tu.name,
            timestamp: line.timestamp,
          });
          if (tu.name === 'Task') {
            const input = tu.input;
            taskSpawns.push({
              toolUseId: tu.id,
              subagentType: parseSubagentType(input['subagent_type'] as string | undefined),
              description: (input['description'] as string) ?? '',
              prompt: (input['prompt'] as string) ?? '',
              timestamp: line.timestamp,
            });
          }
          if (tu.name === 'TodoWrite') {
            const rawTodos = tu.input['todos'] as
              | Array<{ content?: string; status?: string; activeForm?: string }>
              | undefined;
            if (Array.isArray(rawTodos)) {
              todoSnapshots.push({
                id: tu.id,
                sessionId,
                projectPath: '',
                timestamp: line.timestamp,
                todos: rawTodos.map((t) => ({
                  content: (t.content as string) ?? '',
                  status:
                    t.status === 'completed' || t.status === 'in_progress' || t.status === 'pending'
                      ? t.status
                      : 'pending',
                  activeForm: (t.activeForm as string) ?? '',
                })),
              });
            }
          }
        }
      }
    }

    // Remove resolved tool_uses when their results arrive
    if (line.type === 'user' && line.message?.content && Array.isArray(line.message.content)) {
      for (const block of line.message.content) {
        if (block.type === 'tool_result') {
          const tr = block as ToolResultContentBlock;
          pendingToolUses.delete(tr.tool_use_id);
        }
      }
    }
  }

  // Determine if the session is awaiting user input
  let awaitingInput = false;
  const pendingToolNames: string[] = [];
  const now = Date.now();

  for (const [, pending] of pendingToolUses) {
    if (TASK_LIKE_TOOL_NAMES.has(pending.name)) continue; // subagent running, not user-blocking

    if (USER_INPUT_TOOL_NAMES.has(pending.name)) {
      awaitingInput = true;
      pendingToolNames.push(pending.name);
    } else {
      const pendingSince = new Date(pending.timestamp).getTime();
      if (now - pendingSince > AWAITING_INPUT_TIMEOUT_MS) {
        awaitingInput = true;
        pendingToolNames.push(pending.name);
      }
    }
  }

  return {
    sessionMeta: {
      sessionId,
      cwd,
      gitBranch,
      version,
      startedAt: firstTimestamp,
      lastActivityAt: lastTimestamp,
      filePath,
    },
    taskSpawns,
    awaitingInput,
    pendingToolNames,
    todoSnapshots,
  };
}

function parseSubagentType(raw: string | undefined): SubagentType {
  if (!raw) return 'unknown';
  const normalized = raw.toLowerCase();
  if (normalized === 'explore') return 'Explore';
  if (normalized === 'plan') return 'Plan';
  if (normalized === 'bash') return 'Bash';
  if (normalized === 'code') return 'Code';
  if (normalized === 'general-purpose') return 'general-purpose';
  return 'unknown';
}
