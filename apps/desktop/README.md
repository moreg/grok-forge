# Grok Forge Desktop

Desktop UI for **Grok Forge** (this repository: [moreg/grok-forge](https://github.com/moreg/grok-forge)).

Browser preview mode renders the UI without starting a local agent. The native
Tauri build connects to a local Grok agent runtime over ACP (`grok agent stdio`)
and streams messages, thoughts, plans, and tool calls into the React UI.

## Run

```powershell
cd apps\desktop
npm install
npm run dev
```

Open `http://localhost:5173`.

## Native Windows app

Choose a workspace from the sidebar (or reuse the last one). With **自动连接**
enabled (default), the native shell connects as soon as the app opens — no
manual “连接 Grok” click. It starts the local agent via `grok agent stdio`,
runs the ACP initialize/session lifecycle, and forwards streamed events to the UI.

```powershell
npm run desktop
```

Create an optimized executable and publish the launch entry to the **repo root**:

```powershell
# From repo root
..\..\rebuild.bat

# Or from this directory
npm run desktop:publish
```

This produces:

| Output | Path |
|--------|------|
| Launch entry | `../../Grok Forge.exe` (repo root) |
| Alias | `../../grok-forge-desktop.exe` |
| Installer | `../../dist/Grok Forge_0.1.0_x64-setup.exe` |

Build only (without copying) with `npm run desktop:build`. Re-copy an existing
release binary with `npm run desktop:copy`.

The raw Tauri output remains under `src-tauri/target/release/`.

## Validate

```powershell
npm test
npm run test:coverage
npm run test:e2e
npm run build
```

The E2E configuration reuses the locally installed stable Google Chrome.

## Runtime compatibility

The Tauri process bridge, ACP request correlation, session creation, prompt
submission, workspace selection, and live response stream are implemented.

- **Live Diff**: prefers Grok `x.ai/git/*`. If the runtime lacks those methods,
  the desktop shell falls back to a local `git status` / `git diff` scan of the
  selected workspace (Tauri `git_workspace_status`).
- **Terminal panel**: prefers Grok `x.ai/terminal/*`, and always merges client
  ACP `terminal/*` processes created by the agent.
- **Model switch**: tries `session/setModel` when connected; if unsupported,
  stores the preference and injects `_meta.modelId` on the next `session/new`.

### Implemented workflow features

- **Approval mode**: handles `session/request_permission` (approve waits for you;
  observe auto-allows).
- **Stop**: sends `session/cancel` and clears pending permission prompts.
- **Timeline**: merges plan entries and tool call updates with paths/status.
- **Review**: confirm-reviewed runs `git add` on accepted (or non-rejected) files
  (no auto-commit); request-revert prefers local `git restore` / delete untracked,
  and only falls back to a Grok prompt for paths that still fail.
- **Multi-workspace**: recent workspaces are remembered in local storage.
- **Attachments**: native file picker injects resource blocks into the prompt.
- **Per-task sessions**: each task uses its own ACP session key when prompting.
- **Client filesystem**: responds to ACP `fs/read_text_file` and `fs/write_text_file`
  inside the selected workspace sandbox.
- **MCP servers**: configure stdio MCP servers in Settings (name / command / args /
  env KEY=value lines); they are passed on `session/new` at connect time.
- **Multi-terminal review**: switch between live terminals and refresh output.
- **Client terminals**: responds to ACP `terminal/create|output|wait_for_exit|kill|release`.
- **Per-file review actions**: accept runs `git add` (stage, no commit); reject
  restores via `git restore`/`checkout` or deletes untracked files (falls back to
  a Grok revert prompt if git fails).
- **Hunk review**: split file diffs into fragments; accept/reject individual hunks
  (reject rewrites the working-tree sequence in-place).
- **Merged terminals**: review panel shows both Grok `x.ai/terminal/*` sessions and
  local ACP `terminal/*` processes, with kill for local ones.
- **Session restore**: when the agent advertises `loadSession`, reconnect tries
  `session/load` using the task's saved ACP session id.
- **Batch hunk apply**: mark multiple fragments then click “应用全部决策” to write
  all rejected hunks in one pass.
- **Session list UI**: sidebar “会话” shows task↔ACP bindings; clear or force a new
  session key before reconnecting.
- **Live local terminal stream**: Tauri emits `grok://terminal-chunk` while local
  `terminal/*` processes run; the review panel appends output in real time.
- **Session history replay**: open 会话 → 回放 to review a task's plan steps and
  message timeline without leaving the panel.
- **Hunk decision preview**: toggle 预览决策 to see a textual summary and a
  softened diff preview before batch apply.
- **Auto-connect / reconnect**: On by default. Opens the app (or selects a
  workspace) and connects immediately; exponential backoff reconnect (up to 5
  attempts) when the native connection drops unexpectedly. Manual disconnect
  stays offline until you connect again or switch workspace.
- **Reconnect toast**: floating progress notice with attempt counter, next-retry
  hint, immediate retry, and dismiss.
- **Replay export**: 会话 panel can download a task's plan + message timeline as
  Markdown.
- **File decision checklist**: review pane shows per-file accept/reject status
  plus hunk decision counts across the whole change set.
- **Theme & font size**: Settings toggles dark/light theme and small/medium/large
  UI scale (persisted).
- **Model selection**: choose Grok Build / 4.5 / 4 / 3 Fast; injects
  `_meta.modelId` on `session/new` and calls `session/setModel` when connected.
- **Paste images**: paste screenshots/images into the composer; chips show
  thumbnails and images are sent as ACP resource blocks (`data:image/...`).
- **Desktop notifications**: optional OS notifications on task complete/fail and
  permission prompts (Web Notification API).
- **Custom shortcuts**: rebind new-task / settings / review / stop / theme /
  focus-composer from Settings (persisted).
- **Drag-and-drop attachments**: drop files/images onto the composer (native
  paths in Tauri; browser preview uses data URLs for images/text).
- **Task context menu**: right-click or ⋯ on sidebar tasks to open / rename /
  clear / delete.
- **Theme contrast**: clearer muted text and focus rings in light/dark modes.
- **Resizable panels**: drag the gutters between sidebar / chat / review; widths
  persist in local storage (reset from Settings).
- **Workspace profile card**: local display name, plan badge, and usage meter
  (cosmetic only — not real billing).
- **Export all tasks**: download every local task as JSON or one Markdown file.
- **Import tasks**: merge or replace local tasks from a previously exported JSON
  snapshot (Settings).
- **Command palette search**: filter slash commands and jump to matching tasks.
- **Split + multi-file review**: unified/split diff toggle; pin up to 3 files for
  side-by-side multi-file previews.
- **Diff syntax highlighting**: lightweight token colors for common languages in
  unified/split review views.
- **Task tags**: add labels on a task; filter sidebar by tag chips.
- **Global search**: sidebar/Search or `Ctrl+K` finds titles, tags, and messages.
- **Task pin / star**: pin tasks from the sidebar star or context menu; pinned
  tasks stay at the top (persisted with import/export).
- **Search message anchors**: message hits scroll to and briefly highlight the
  matching chat bubble.
- **Diff ignore whitespace**: review toolbar softens whitespace-only noise for
  display (accept/reject still uses the original hunks).
- **Expand all hunks**: toggle full-file diff vs per-hunk navigation.
- **Pin shortcut**: `Ctrl+Shift+P` toggles pin on the active task (rebindable).
- **Search keyboard nav**: in global search, `↑/↓` move the highlight and
  `Enter` opens the selected hit.
- **Bulk hunk actions**: “全部接受” marks every hunk; “全部拒绝” rejects and
  rewrites the working tree in one pass.
- **Fold unchanged context**: long runs of unchanged lines collapse with a
  clickable “⋯ 隐藏 N 行” expander (toggle 折叠上下文).
- **Session list filter**: filter sessions by title, tags, or ACP session id.
- **Export patch**: review file menu / toolbar exports the current file or all
  files as a unified `.patch` download.
- **Task archive**: context-menu archive hides tasks from the default sidebar;
  toggle “显示归档” to browse and unarchive them (persisted / import-export).
- **Archive shortcut**: `Ctrl+Shift+A` toggles archive on the active task
  (rebindable in Settings).
- **Copy patch**: review toolbar / file menu copies the current or all-file
  unified patch to the clipboard.
- **Task stats**: sidebar summary plus a settings card with active / archived /
  pinned / status / message / top-tag counts.
- **Export history**: Settings keeps the last 12 patch / task / replay exports
  (local only), with a clear action.
- **Export re-download**: recent exports cache payload when under size limit;
  Settings shows **重新下载** (or 无缓存 for legacy/oversized entries).
- **Stats time range**: Settings task stats filter by 全部 / 今日 / 7 天 / 30 天
  (`updatedAt`).
- **Export stats Markdown**: Settings stats card **导出 MD** downloads a report
  for the selected time window (also recorded under 最近导出).
- **Export search checklist**: global search **导出清单** writes matching hits as
  a Markdown checklist (title/tag/message) with preview and task ids.
- **Copy search checklist**: global search **复制清单** puts the same Markdown on
  the clipboard and records it under 最近导出.
- **Batch session replay export**: sessions panel **批量导出回放** downloads one
  Markdown file for the filtered session list (or all sessions when unfiltered).
- **Local git fallback**: when `x.ai/git/*` is missing, Review still loads
  branch/files/patches via local git (shown as “本地 git” in the panel).
- **Soft model switching**: unsupported `session/setModel` no longer surfaces as
  a connection error; the UI explains the preference will apply on next session.
- **Review stage/restore batch**: confirm stages a file set; bulk revert restores
  every listed path in one pass and reports partial failures.
- **Interactive local terminals**: Review → 终端 supports **新建** (PowerShell /
  shell with piped stdin), typing lines into the active local interactive
  session, and kill/refresh. Grok `x.ai/terminal/*` sessions remain output-only
  monitors (not a full TTY/PTY).
- **Chat Markdown**: assistant / system / user messages and the live stream render
  fenced code (with lightweight syntax colors), headings, lists, quotes, links,
  bold/italic, and inline code — no extra npm dependency.
