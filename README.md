# Relay

An autonomous engineering manager built on Electron. Monitors your work channels (Slack, Linear, Gmail, GitHub, Calendar, Notion), triages incoming items with AI priority classification, groups tasks into projects, designs your daily schedule, and spawns Claude Code agents to execute the actionable ones.

## Prerequisites

- **macOS** (Apple Silicon or Intel)
- **Node.js 20+** and **pnpm**
- **Claude Code CLI** installed and authenticated (`claude` command working in terminal)
- **MCP connectors** configured on your Claude account (Slack, Linear, etc.)

## Quick Start

```bash
# Clone and install
git clone https://github.com/kieranwilliams/relay.git
cd relay
pnpm install

# Run in development
pnpm start
```

On first launch, you'll see the onboarding flow. Fill in:
1. Your name, email, Slack user ID
2. Your role
3. Team info (manager name, coworkers)
4. Slack channels to monitor
5. Integration toggles (Slack, Linear, GitHub, etc.)
6. Fetch cadence and working hours

The app will start polling your configured sources via MCP.

## Building for Distribution

```bash
# Package the app (no installer)
pnpm run package

# Build a distributable .zip
pnpm run make
```

The `.zip` will be in `out/make/zip/`. Share it directly -- the recipient unzips, moves Relay.app to Applications, and runs it.

**Note:** The app is unsigned, so macOS will show a Gatekeeper warning on first launch. The recipient needs to right-click > Open (or System Settings > Privacy > Open Anyway).

## Architecture

```
src/
  main/           # Electron main process
    notifications/ # Poll service, triage, work dispatcher
    agents/        # Session discovery, enricher, tailer
    db/            # SQLite database
  renderer/        # React UI
    pages/         # Inbox, Schedule, Projects, Standup, Settings
    components/    # DetailDrawer, AgentTab, NextStepsCard, etc.
  shared/          # Types, parsers, utils shared across processes
  preload/         # IPC bridge
.claude/skills/    # Skill templates loaded by agents
```

### Key Concepts

- **Notifications**: Items from Slack, Linear, GitHub, etc. Triaged by AI into priorities and task types.
- **Kanban stages**: Inbox > Planning > Hacking > Shipping > Reviewing > Done. Drag to advance.
- **Structured actions**: Agents return typed action menus (`run_skill`, `send_slack`, `update_linear`, etc.) that the UI renders as smart CTAs.
- **Skill runner**: Spawns Claude Code processes with `--allowedTools '*'` and `stream-json` I/O. Manages sessions, worktrees, and multi-turn conversation.
- **MCP bridge**: Persistent Claude Code process for read-only data fetching (Slack, Linear, etc.).

## Development

```bash
# Run tests
pnpm test

# Type check
npx tsc --noEmit

# Clean restart (kills stale processes)
pnpm run dev:clean
```

## Configuration

Config is stored at `~/Library/Application Support/relay/config.json`. Edit via Settings page or manually.

Notification cache: `~/Library/Application Support/relay/notifications-cache.json`
Database: `~/Library/Application Support/relay/relay.db`
Logs: `~/Library/Application Support/relay/*.log`

## License

Private -- not for redistribution.
