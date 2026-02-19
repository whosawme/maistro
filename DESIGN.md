# Maistro - Design & Approach

## Problem

Claude Code spawns subagents (Explore, Plan, Bash, general-purpose, etc.) to handle complex tasks, but there's no visibility into this orchestration. You can't see which agents are running, what tools they're calling, how many tokens they're burning, or when they finish. Maistro solves this by providing a real-time visualization layer that sits alongside Claude Code in VS Code.

## Key Insight

Claude Code already writes structured JSONL transcript files to `~/.claude/projects/`. Every message, tool call, tool result, and token usage metric is persisted there. Rather than hooking into Claude Code's internals or requiring any configuration, Maistro simply watches and parses these existing files. Zero coupling, zero setup.

### Transcript Structure

```
~/.claude/projects/
  -Users-rami-Documents-projects-foo/       # project path with / replaced by -
    abc123-def4-5678-ghij.jsonl             # session transcript
    abc123-def4-5678-ghij/
      subagents/
        agent-a1b2c3.jsonl                  # subagent transcript
        agent-d4e5f6.jsonl
```

Each JSONL line is a self-contained JSON object with a `type` field (`user`, `assistant`, `queue-operation`, `file-history-snapshot`). Assistant messages contain `tool_use` content blocks; user messages contain matching `tool_result` blocks. When the assistant's tool_use has `name: "Task"`, that's a subagent being spawned -- the `input` carries `subagent_type`, `description`, and `prompt`. The subagent's own JSONL file then records its independent conversation with `isSidechain: true` and a unique `agentId`.

## Architecture

Four layers, each depending only on the one below it:

```
┌─────────────────────────────────────────────┐
│  Views                                      │
│  TreeView  |  Webview Detail  |  StatusBar  │
├─────────────────────────────────────────────┤
│  State                                      │
│  SessionStore (EventEmitter)                │
├─────────────────────────────────────────────┤
│  Monitoring                                 │
│  TranscriptWatcher | FileTailer | Discovery │
├─────────────────────────────────────────────┤
│  Parsing                                    │
│  JSONL Parser | Session/Subagent Parsers    │
└─────────────────────────────────────────────┘
         reads from
   ~/.claude/projects/**/*.jsonl
```

### Parsing Layer

The bottom layer handles raw JSONL reading and domain extraction.

- **jsonl-parser** -- reads JSONL files line-by-line via Node's `readline` over `createReadStream`. Silently skips malformed lines (critical since active files may have partially-written trailing lines). Supports reading from a byte offset so we never re-parse content we've already seen.

- **session-parser** -- scans a session JSONL for metadata (sessionId, cwd, branch, version, timestamps) and finds all `Task` tool_use blocks to know which subagents were spawned, with what type and description.

- **subagent-parser** -- scans a subagent JSONL and correlates `tool_use` blocks in assistant messages with `tool_result` blocks in user messages to build a timeline of tool calls with durations. Determines status by checking for `stop_reason: "end_turn"` (completed) or pending tool_uses without results (still running).

- **token-aggregator** -- sums token usage across all assistant messages in a transcript, deduplicating by `requestId` and skipping streaming intermediates (where `stop_reason` is null).

### Monitoring Layer

Handles filesystem watching and incremental file tailing.

- **session-discovery** -- on activation, maps the current VS Code workspace path to its Claude projects directory (by converting `/` to `-`), scans for session JSONL files sorted by modification time, and parses the top N (configurable). For each session, discovers subagent files in the `subagents/` subdirectory.

- **transcript-watcher** -- sets up two VS Code `FileSystemWatcher` instances: one for `**/subagents/agent-*.jsonl` (new subagent files) and one for `**/*.jsonl` (new sessions). When a new subagent file appears, triggers discovery and starts a FileTailer for it. Also runs a polling interval as a safety net since FSWatcher can miss rapid writes on some platforms.

- **file-tailer** -- tracks a byte offset per file. On each poll, does a cheap `statSync` to check if the file grew, then reads only the new bytes via `createReadStream({ start: offset })`. Parses the new lines and pushes incremental data to the store. This means a 200KB subagent transcript only costs a few KB of I/O per update, not a full re-read.

### State Layer

A single `SessionStore` class holds all sessions and subagents in memory, indexed by ID. It extends Node's `EventEmitter` with typed events:

- `session:discovered` / `session:updated` -- tree refreshes
- `subagent:spawned` -- new agent appears in tree
- `subagent:updated` -- incremental data merged (new tool calls, status change)
- `subagent:completed` -- agent finished, refresh tree + webview
- `activeCount:changed` -- status bar update

This decouples the monitoring layer from the views entirely. Views subscribe to events and react.

### View Layer

Three independent UI surfaces, all driven by store events:

- **SubagentTreeProvider** -- implements VS Code's `TreeDataProvider` with a 3-level hierarchy: sessions at root, subagents as children, and tool calls + info labels as leaves. Uses ThemeIcons (`sync~spin` for running, `check` for done, `error` for failed) and MarkdownString tooltips for rich hover info.

- **WebviewPanelManager** -- manages a map of open webview panels keyed by agentId. The webview HTML is generated server-side (no framework) with inline CSS that uses VS Code's CSS custom properties (`--vscode-editor-background`, etc.) for native theme integration. Includes a token usage bar chart, tool call timeline with expandable sections, and an animated progress indicator.

- **StatusBarManager** -- a single `StatusBarItem` that shows `$(sync~spin) Maistro: N active` when subagents are running and hides when idle.

## Design Decisions

**Zero runtime dependencies.** The extension uses only Node.js built-ins (`fs`, `path`, `os`, `readline`, `events`) and the `vscode` API. Everything is bundled into a single 26KB file by esbuild. No Express, no React, no D3 -- the webview HTML is template-literal-generated with inline styles.

**Read-only, no hooks.** Maistro never writes to Claude Code's files or configures hooks. It's a pure observer. This means it works with any Claude Code version that writes JSONL transcripts, and can't interfere with Claude Code's operation.

**Byte-offset tailing over full re-parse.** Subagent transcripts can reach 200KB+. Re-parsing on every change would be wasteful. The FileTailer tracks how far it's read and only processes new bytes, making updates nearly free regardless of file size.

**Workspace-scoped discovery.** Rather than scanning all projects (which could mean hundreds of sessions across many repos), Maistro converts the current workspace path to Claude's directory naming convention and only looks there. This keeps startup fast and the tree focused.

**FSWatcher + polling hybrid.** VS Code's `FileSystemWatcher` is event-driven and efficient but can miss rapid consecutive writes on some platforms (particularly macOS). A configurable polling interval (default 1s) on active tailers ensures no updates are lost.

**Match subagents to Task spawns by timestamp proximity.** The parent session's `Task` tool_use doesn't embed the resulting agentId. To enrich subagents with their type and description, the session parser extracts all Task spawns and the discovery layer matches each subagent to the temporally closest spawn. This is a heuristic but works reliably in practice since subagent files are created within milliseconds of the Task call.

## File Map

```
src/
  extension.ts                          # activate/deactivate, wiring, commands
  types.ts                              # all interfaces and type aliases
  constants.ts                          # magic strings and defaults
  parsing/
    jsonl-parser.ts                     # low-level JSONL line reading
    session-parser.ts                   # session metadata + Task extraction
    subagent-parser.ts                  # tool call correlation + status detection
    token-aggregator.ts                 # token usage summation
  monitoring/
    transcript-watcher.ts               # FSWatcher + poll orchestration
    file-tailer.ts                      # byte-offset incremental reader
    session-discovery.ts                # filesystem scan + subagent enrichment
  state/
    session-store.ts                    # in-memory store + typed events
  views/
    tree/
      subagent-tree-provider.ts         # TreeDataProvider (3-level hierarchy)
    webview/
      webview-panel-manager.ts          # panel lifecycle
      webview-content.ts                # HTML/CSS/JS generation
    statusbar/
      status-bar-manager.ts             # active count indicator
  utils/
    paths.ts                            # Claude home resolution, path conversion
    time.ts                             # duration and timestamp formatting
```
