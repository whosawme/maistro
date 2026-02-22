import { Subagent, ToolCall } from '../../types';
import { formatElapsed } from '../../utils/time';

export function generateWebviewContent(subagent: Subagent): string {
  const statusColor: Record<string, string> = {
    running: '#f0ad4e',
    awaiting_input: '#e06c3a',
    completed: '#5cb85c',
    error: '#d9534f',
    unknown: '#999',
  };
  const color = statusColor[subagent.status] ?? '#999';

  const toolCallsHtml = subagent.toolCalls
    .map((tc, i) => generateToolCallCard(tc, i))
    .join('\n');

  const u = subagent.tokenUsage;
  const total = u.totalTokens || 1;
  const inputPct = ((u.totalInputTokens / total) * 100).toFixed(1);
  const outputPct = ((u.totalOutputTokens / total) * 100).toFixed(1);
  const cachePct =
    (((u.totalCacheCreationTokens + u.totalCacheReadTokens) / total) * 100).toFixed(1);

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
    .header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 16px; }
    .header h1 { font-size: 1.4em; margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .meta-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 12px; }
    .meta-card .label { color: var(--muted); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-card .value { font-size: 1.2em; font-weight: 600; margin-top: 4px; }
    .section-title { font-size: 1.1em; font-weight: 600; margin: 24px 0 12px 0; }
    .token-bar { display: flex; height: 20px; border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .token-bar div { display: flex; align-items: center; justify-content: center; font-size: 0.7em; color: white; min-width: 30px; }
    .token-legend { display: flex; gap: 16px; margin-top: 4px; font-size: 0.8em; color: var(--muted); flex-wrap: wrap; }
    .prompt-section { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 0.9em; max-height: 300px; overflow-y: auto; margin-bottom: 16px; }
    .timeline { position: relative; padding-left: 24px; }
    .timeline::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: var(--border); }
    .timeline-item { position: relative; margin-bottom: 16px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 12px; }
    .timeline-item::before { content: ''; position: absolute; left: -20px; top: 16px; width: 10px; height: 10px; border-radius: 50%; background: var(--vscode-textLink-foreground); border: 2px solid var(--bg); }
    .timeline-item.error::before { background: #d9534f; }
    .tool-header { display: flex; justify-content: space-between; align-items: center; }
    .tool-name { font-weight: 600; }
    .tool-duration { color: var(--muted); font-size: 0.85em; }
    .tool-detail { margin-top: 8px; padding: 8px; background: var(--bg); border-radius: 4px; font-family: var(--vscode-editor-font-family); font-size: 0.85em; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; display: none; }
    .toggle-btn { background: none; border: 1px solid var(--border); color: var(--fg); cursor: pointer; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; margin-top: 4px; margin-right: 4px; }
    .toggle-btn:hover { background: var(--card-bg); }
    .progress-bar { height: 4px; background: var(--border); border-radius: 2px; margin-top: 8px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
    .running .progress-fill { background: #f0ad4e; animation: pulse 1.5s ease-in-out infinite; }
    .awaiting_input .progress-fill { background: #e06c3a; animation: pulse 0.8s ease-in-out infinite; }
    .completed .progress-fill { background: #5cb85c; width: 100%; }
    @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
    .final-output { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px; white-space: pre-wrap; font-size: 0.9em; max-height: 400px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      <span class="status-dot" style="background: ${color}"></span>
      ${esc(subagent.description || subagent.slug || subagent.agentId)}
    </h1>
    <div class="${subagent.status}">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${subagent.status === 'completed' ? '100%' : '60%'}"></div>
      </div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-card">
      <div class="label">Status</div>
      <div class="value" style="color: ${color}">${subagent.status.toUpperCase()}</div>
    </div>
    <div class="meta-card">
      <div class="label">Type</div>
      <div class="value">${esc(subagent.subagentType)}</div>
    </div>
    <div class="meta-card">
      <div class="label">Model</div>
      <div class="value">${esc(subagent.model || 'unknown')}</div>
    </div>
    <div class="meta-card">
      <div class="label">Duration</div>
      <div class="value">${formatElapsed(subagent.elapsedMs)}</div>
    </div>
    <div class="meta-card">
      <div class="label">Tool Calls</div>
      <div class="value">${subagent.toolCalls.length}</div>
    </div>
    <div class="meta-card">
      <div class="label">Total Tokens</div>
      <div class="value">${u.totalTokens.toLocaleString()}</div>
    </div>
  </div>

  <div class="section-title">Token Usage</div>
  <div class="token-bar">
    <div style="width: ${inputPct}%; background: #4a9eda" title="Input: ${u.totalInputTokens.toLocaleString()}">In</div>
    <div style="width: ${outputPct}%; background: #e07d3a" title="Output: ${u.totalOutputTokens.toLocaleString()}">Out</div>
    <div style="width: ${cachePct}%; background: #7b61ff" title="Cache: ${(u.totalCacheCreationTokens + u.totalCacheReadTokens).toLocaleString()}">Cache</div>
  </div>
  <div class="token-legend">
    <span>Input: ${u.totalInputTokens.toLocaleString()}</span>
    <span>Output: ${u.totalOutputTokens.toLocaleString()}</span>
    <span>Cache Write: ${u.totalCacheCreationTokens.toLocaleString()}</span>
    <span>Cache Read: ${u.totalCacheReadTokens.toLocaleString()}</span>
    <span>API Calls: ${u.apiCallCount}</span>
  </div>

  <div class="section-title">Prompt</div>
  <div class="prompt-section">${esc(subagent.prompt || '(no prompt captured)')}</div>

  <div class="section-title">Tool Calls (${subagent.toolCalls.length})</div>
  <div class="timeline">
    ${toolCallsHtml}
  </div>

  ${
    subagent.finalOutput
      ? `<div class="section-title">Final Output</div>
    <div class="final-output">${esc(subagent.finalOutput.slice(0, 5000))}</div>`
      : ''
  }

  <script>
    function toggle(id) {
      const el = document.getElementById(id);
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
  </script>
</body>
</html>`;
}

function generateToolCallCard(tc: ToolCall, index: number): string {
  const inputJson = JSON.stringify(tc.input, null, 2);
  return `
    <div class="timeline-item ${tc.isError ? 'error' : ''}">
      <div class="tool-header">
        <span class="tool-name">${esc(tc.name)}</span>
        <span class="tool-duration">${tc.durationMs !== undefined ? formatElapsed(tc.durationMs) : ''}</span>
      </div>
      <button class="toggle-btn" onclick="toggle('input-${index}')">Input</button>
      ${tc.resultPreview ? `<button class="toggle-btn" onclick="toggle('result-${index}')">Result</button>` : ''}
      <div id="input-${index}" class="tool-detail">${esc(inputJson)}</div>
      ${tc.resultPreview ? `<div id="result-${index}" class="tool-detail">${esc(tc.resultPreview)}</div>` : ''}
    </div>`;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
