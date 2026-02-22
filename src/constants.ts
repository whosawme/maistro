export const TREE_VIEW_ID = 'maistro.sessionTree';
export const WEBVIEW_TYPE = 'maistroSubagentDetail';
export const DEFAULT_POLL_INTERVAL_MS = 1000;
export const MAX_RESULT_PREVIEW_LENGTH = 500;
export const COMPACT_AGENT_PREFIX = 'acompact-';

/** Tool names that always mean the agent is waiting for user input. */
export const USER_INPUT_TOOL_NAMES = new Set([
  'AskUserQuestion',
  'AskFollowupQuestion',
]);

/** Tool names that represent subagent execution (not user-blocking). */
export const TASK_LIKE_TOOL_NAMES = new Set(['Task']);

/**
 * If a non-Task tool_use has been pending longer than this, we treat it
 * as likely blocked on user permission approval.
 */
export const AWAITING_INPUT_TIMEOUT_MS = 30_000;
