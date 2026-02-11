# Maistro

**The AI conductor for your Claude Code sessions.**

Maistro (m-AI-stro) is a VS Code extension that visualizes Claude Code subagent spawning, progress, and task execution in real-time. See what your AI orchestra is doing -- every agent, every tool call, every token -- without leaving your editor.

## Features

### Session and Subagent Tree View

A dedicated activity bar panel displays a live hierarchy of Sessions, Subagents, and Tool Calls for the current workspace. Each session shows its git branch and agent count. Each subagent displays its type (Explore, Plan, Bash, Code, general-purpose), current status, duration, and tool call count. Expanding a subagent reveals model info, token totals, and individual tool calls with durations.

### Rich Detail Panel

Click any subagent to open a webview panel showing:

- Status with animated progress indicator
- Type, model, duration, and tool call count at a glance
- Token usage bar chart breaking down input, output, cache write, and cache read tokens
- The prompt that spawned the subagent
- A visual timeline of every tool call, with expandable input and result sections
- Final text output when the subagent completes

### Status Bar

When subagents are actively running, a status bar item appears with a spinning icon and the current active agent count. It hides automatically when all agents finish.

### Live Updates

Transcript files are tailed incrementally using byte-offset-based JSONL parsing. New data is read from where the last read left off, merged into the in-memory session store, and pushed to all open views. VS Code file system watchers detect new session and subagent files as they appear.

### Commands

| Command | Description |
|---|---|
| `Maistro: Refresh` | Re-scan the projects directory and refresh all views |
| `Maistro: Open Subagent Detail` | Open the detail webview for a subagent |
| `Maistro: Open Raw Transcript` | Open the underlying JSONL file in the editor |
| `Maistro: Clear Inactive Sessions` | Remove completed sessions from the tree |
| `Maistro: Copy Agent ID` | Copy a subagent's ID to the clipboard |

## Installation

Maistro is not yet published to the VS Code Marketplace. Install from a local `.vsix` file:

```
# Build the .vsix package
npm install
npm run build
npm run package

# Install in VS Code
code --install-extension maistro-0.1.0.vsix
```

Or use the **Extensions: Install from VSIX** command in VS Code and select the generated file.

## Configuration

All settings are under the `maistro.*` namespace in VS Code settings.

| Setting | Type | Default | Description |
|---|---|---|---|
| `maistro.claudeHomePath` | `string` | `""` | Path to Claude home directory. Leave empty to use the default (`~/.claude`). |
| `maistro.maxSessionsDisplayed` | `number` | `10` | Maximum number of sessions shown in the tree view (1--50). |
| `maistro.watcherPollIntervalMs` | `number` | `1000` | Polling interval in milliseconds for tailing transcript files (500--10000). |
| `maistro.autoExpandActiveSessions` | `boolean` | `true` | Automatically expand sessions that have active subagents. |

## How It Works

Maistro reads the JSONL transcript files that Claude Code writes to `~/.claude/projects/`. The directory structure maps workspace paths to project folders, each containing session transcripts and a `subagents/` subdirectory with per-agent JSONL files.

On activation, the extension:

1. **Discovers sessions** by mapping the current VS Code workspace to its corresponding Claude projects directory and scanning for JSONL session files.
2. **Parses transcripts** to extract session metadata, subagent types and prompts (from `Task` tool-use blocks in the parent session), tool call timelines (by correlating `tool_use` and `tool_result` content blocks), and token usage (aggregated from API response usage fields, deduplicated by request ID).
3. **Watches for changes** using VS Code file system watchers on `**/subagents/agent-*.jsonl` and `**/*.jsonl` patterns. When a file is created or modified, incremental parsing reads only the new bytes appended since the last read.
4. **Maintains state** in a `SessionStore` that emits granular events (`session:discovered`, `subagent:spawned`, `subagent:updated`, `subagent:completed`, `activeCount:changed`), which drive tree view refreshes, webview updates, and status bar changes.

The extension has no runtime dependencies beyond the VS Code API and Node.js built-ins.

## Requirements

- VS Code 1.95.0 or later
- Node.js 20 or later (for development)
- Claude Code writing transcripts to `~/.claude/projects/`

## License

MIT
