import {
  TranscriptLine,
  Subagent,
  ToolCall,
  SubagentStatus,
  ToolUseContentBlock,
  ToolResultContentBlock,
  TextContentBlock,
} from '../types';
import { parseJsonlFile, parseJsonlFromOffset } from './jsonl-parser';
import { aggregateTokenUsage } from './token-aggregator';
import { MAX_RESULT_PREVIEW_LENGTH } from '../constants';

export async function parseSubagent(filePath: string): Promise<Partial<Subagent>> {
  const lines = await parseJsonlFile(filePath);
  return extractSubagentData(lines, filePath);
}

export async function parseSubagentIncremental(
  filePath: string,
  byteOffset: number,
): Promise<{ data: Partial<Subagent>; newOffset: number }> {
  const { lines, newOffset } = await parseJsonlFromOffset(filePath, byteOffset);
  if (lines.length === 0) {
    return { data: {}, newOffset };
  }
  return { data: extractSubagentData(lines, filePath), newOffset };
}

export function extractSubagentData(
  lines: TranscriptLine[],
  filePath: string,
): Partial<Subagent> {
  let agentId = '';
  let sessionId = '';
  let slug = '';
  let model = '';
  let startedAt = '';
  let lastTimestamp = '';
  let status: SubagentStatus = 'unknown';
  let finalOutput: string | undefined;
  const toolCalls: ToolCall[] = [];
  const pendingToolUses = new Map<
    string,
    { name: string; input: Record<string, unknown>; timestamp: string }
  >();

  for (const line of lines) {
    if (line.type === 'progress' as string) continue;

    if (!agentId && line.agentId) agentId = line.agentId;
    if (!sessionId && line.sessionId) sessionId = line.sessionId;
    if (!slug && line.slug) slug = line.slug;
    if (!startedAt && line.timestamp) startedAt = line.timestamp;
    if (line.timestamp) lastTimestamp = line.timestamp;

    if (line.type === 'assistant' && line.message) {
      if (line.message.model && !model) model = line.message.model;
      if (line.message.stop_reason === 'end_turn') status = 'completed';

      if (Array.isArray(line.message.content)) {
        for (const block of line.message.content) {
          if (block.type === 'tool_use') {
            const tu = block as ToolUseContentBlock;
            pendingToolUses.set(tu.id, {
              name: tu.name,
              input: tu.input,
              timestamp: line.timestamp,
            });
          }
          if (block.type === 'text' && (block as TextContentBlock).text.trim()) {
            finalOutput = (block as TextContentBlock).text;
          }
        }
      }
    }

    if (line.type === 'user' && line.message?.content && Array.isArray(line.message.content)) {
      for (const block of line.message.content) {
        if (block.type === 'tool_result') {
          const tr = block as ToolResultContentBlock;
          const pending = pendingToolUses.get(tr.tool_use_id);
          if (pending) {
            const durationMs =
              new Date(line.timestamp).getTime() -
              new Date(pending.timestamp).getTime();

            let resultText = '';
            if (typeof tr.content === 'string') {
              resultText = tr.content;
            } else if (Array.isArray(tr.content)) {
              resultText = tr.content
                .filter((c): c is { type: string; text: string } => 'text' in c)
                .map((c) => c.text)
                .join('\n');
            }

            toolCalls.push({
              id: tr.tool_use_id,
              name: pending.name,
              input: pending.input,
              timestamp: pending.timestamp,
              durationMs: Math.max(0, durationMs),
              resultPreview: resultText.slice(0, MAX_RESULT_PREVIEW_LENGTH),
              isError: tr.is_error,
            });
            pendingToolUses.delete(tr.tool_use_id);
          }
        }
      }
    }
  }

  // If there are still pending tool_uses without results, likely still running
  if (status !== 'completed' && pendingToolUses.size > 0) {
    status = 'running';
  }

  const tokenUsage = aggregateTokenUsage(lines);
  const elapsedMs =
    startedAt && lastTimestamp
      ? new Date(lastTimestamp).getTime() - new Date(startedAt).getTime()
      : 0;

  return {
    agentId,
    sessionId,
    slug,
    model,
    status,
    startedAt,
    completedAt: status === 'completed' ? lastTimestamp : undefined,
    elapsedMs,
    toolCalls,
    tokenUsage,
    finalOutput,
    lineCount: lines.length,
    filePath,
  };
}
