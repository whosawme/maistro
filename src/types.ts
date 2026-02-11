// ============================================================
// JSONL Raw Types (matching Claude Code transcript format)
// ============================================================

export type TranscriptLineType =
  | 'user'
  | 'assistant'
  | 'queue-operation'
  | 'file-history-snapshot'
  | 'progress';

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | { type: string; text: string }[];
  is_error: boolean;
}

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
  signature: string;
}

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[] | string;
  model?: string;
  id?: string;
  type?: string;
  stop_reason?: string | null;
  usage?: TokenUsage;
}

export interface TranscriptLine {
  type: TranscriptLineType;
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  isSidechain?: boolean;
  agentId?: string;
  slug?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  userType?: string;
  requestId?: string;
  message?: TranscriptMessage;
}

// ============================================================
// Parsed Domain Types
// ============================================================

export type SubagentType =
  | 'Explore'
  | 'Plan'
  | 'Bash'
  | 'general-purpose'
  | 'Code'
  | 'unknown';

export type SubagentStatus =
  | 'running'
  | 'completed'
  | 'error'
  | 'unknown';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  timestamp: string;
  durationMs?: number;
  resultPreview?: string;
  isError: boolean;
}

export interface AggregatedTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  apiCallCount: number;
}

export interface Subagent {
  agentId: string;
  sessionId: string;
  slug: string;
  subagentType: SubagentType;
  description: string;
  prompt: string;
  model: string;
  status: SubagentStatus;
  startedAt: string;
  completedAt?: string;
  elapsedMs: number;
  toolCalls: ToolCall[];
  tokenUsage: AggregatedTokenUsage;
  finalOutput?: string;
  lineCount: number;
  filePath: string;
}

export interface Session {
  sessionId: string;
  projectPath: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  startedAt: string;
  lastActivityAt: string;
  isActive: boolean;
  subagents: Subagent[];
  filePath: string;
  activeSubagentCount: number;
}

export interface TaskSpawnInfo {
  toolUseId: string;
  subagentType: SubagentType;
  description: string;
  prompt: string;
  timestamp: string;
}

// ============================================================
// Configuration
// ============================================================

export interface MaestroConfig {
  claudeHomePath: string;
  maxSessionsDisplayed: number;
  watcherPollIntervalMs: number;
  autoExpandActiveSessions: boolean;
}
