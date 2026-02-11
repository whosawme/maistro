import {
  TranscriptLine,
  Session,
  SubagentType,
  TaskSpawnInfo,
  ToolUseContentBlock,
} from '../types';
import { parseJsonlFile } from './jsonl-parser';

export async function parseSession(filePath: string): Promise<{
  sessionMeta: Partial<Session>;
  taskSpawns: TaskSpawnInfo[];
}> {
  const lines = await parseJsonlFile(filePath);
  const taskSpawns: TaskSpawnInfo[] = [];

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

    // Find Task tool_use blocks in assistant messages
    if (line.type === 'assistant' && line.message?.content && Array.isArray(line.message.content)) {
      for (const block of line.message.content) {
        if (block.type === 'tool_use') {
          const tu = block as ToolUseContentBlock;
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
        }
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
