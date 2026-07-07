# oag

`oag` is a CLI for managing a Git-based AI registry and installing assets into local projects for tools like Claude, Codex, and OpenCode.

## Documentation

- [Chinese README](README.zh.md)
- [Registry Maintenance Guide (English)](docs/add-asset.en.md)
- [Registry Maintenance Guide (Chinese)](docs/add-asset.zh.md)

## What oag does

- Connects your local machine to a remote registry repository.
- Syncs the registry automatically before read/apply operations.
- Lets you enable/disable assets interactively (grouped by type), applied to all compatible tools.
- Bundles assets into plugins you can enable side by side.
- Installs files using `copy` or `symlink` mode.
- Tracks installed items per project so updates are repeatable.
- Handles MCP assets for Claude, Codex, and OpenCode config formats.

## Key features

- **Remote registry management** via Git (`clone` on first use, then `fetch + reset`).
- **Tool-aware installs** with built-in path mappings for:
  - Claude
  - Codex
  - OpenCode
- **Interactive selection UI** in `oag install`, now applied to all compatible tools at once.
- **Plugin-based install**: enable multiple coexisting plugins (`oag plugin add` / `remove` / `list`).
- **State-based updates** with `oag update`.
- **MCP support** with format handling:
  - Claude: `.mcp.json`
  - Codex: `.codex/config.toml`
  - OpenCode: `opencode.json`

## Installation

Install from npm:

```bash
npm install -g @wrenfix/oag
```

Verify:

```bash
oag --help
```

## Configuration

Global config path:

- `~/.oag/config.json`

Defaults:

```json
{
  "registryPath": "~/.oag/registry",
  "remote": null
}
```

Minimal config (recommended):

```json
{
  "remote": {
    "url": "https://github.com/<you>/<your-registry>.git",
    "branch": "main"
  }
}
```

Notes:

- Tool path mappings are built into `oag` (not loaded from user config).
- If no remote is configured, `list` / `install` / `plugin` / `update` will prompt for it.

## Quick start (with fork workflow)

1. **Fork your registry repository** (for example on GitHub).
2. **Point `oag` to your fork**:

   ```bash
   oag remote add https://github.com/<you>/<your-registry>.git main
   ```

3. **List available assets**:

   ```bash
   oag list --tool claude
   ```

4. **List available plugins**:

   ```bash
   oag plugin list
   ```

5. **Install assets interactively**:

   ```bash
   oag install --mode copy
   ```

6. **Enable a plugin**:

   ```bash
   oag plugin add oag-starter
   ```

7. **Update installed assets later**:

   ```bash
   oag update
   ```

## Commands

### `oag remote add <url> [branch]`

Save the remote registry location.

Example:

```bash
oag remote add https://github.com/<you>/<your-registry>.git main
```

### `oag list [--type <type>] [--tool <name>]`

List assets from the synced registry.

Options:

- `--type <type>`: filter by type (for example `agent`, `skill`, `mcp`)
- `--tool <name>`: filter by tool compatibility hint (display filter only)

Example:

```bash
oag list --type skill --tool codex
```

### `oag install [--project <path>] [--mode <mode>]`

Interactively select assets (grouped by type) and reconcile them across all compatible tools. Each selected asset is installed to every tool that supports it.

Options:

- `--project <path>`: project root (default: current directory)
- `--mode <mode>`: `copy` or `symlink` (default: `copy`)

Example:

```bash
oag install --project . --mode symlink
```

### `oag plugin list [--project <path>]`

List available plugins and mark which ones are enabled in the project.

Options:

- `--project <path>`: project root (default: current directory)

Example:

```bash
oag plugin list
```

### `oag plugin add [name] [--project <path>] [--mode <mode>]`

Enable a plugin. Enabled plugins coexist: the installed set is the union of every enabled plugin plus any manually installed assets.

Options:

- `[name]`: plugin name (if omitted, choose interactively)
- `--project <path>`: project root (default: current directory)
- `--mode <mode>`: `copy` or `symlink` (default: `copy`)

Example:

```bash
oag plugin add oag-starter --mode copy
```

### `oag plugin remove <name> [--project <path>] [--mode <mode>]`

Disable a plugin. Assets still required by another enabled plugin or by `oag install` are kept.

Options:

- `--project <path>`: project root (default: current directory)
- `--mode <mode>`: `copy` or `symlink` (default: `copy`)

Example:

```bash
oag plugin remove oag-starter
```

### `oag update [--project <path>] [--mode <mode>]`

Reinstall the currently managed assets at the latest registry commit.

Options:

- `--project <path>`: project root (default: current directory)
- `--mode <mode>`: force mode for this run (`copy` or `symlink`)

Example:

```bash
oag update
```

## How oag works

### 1) Registry sync

Before `list`, `install`, `plugin` (add/remove/list), and `update`, `oag` syncs your configured registry:

- first run: clone into `~/.oag/registry/repo` (or your custom `registryPath`)
- later runs: fetch remote, hard reset to configured branch, clean untracked files

### 2) Install targets (built-in)

`oag` has built-in mappings for where each asset type is written. Assets are applied to all compatible tools.

**Claude**

- `agent` -> `CLAUDE.md`
- `subagent` -> `.claude/agents/<name>.md`
- `skill` -> `.claude/skills/`
- `mcp` -> `.mcp.json`

**Codex**

- `agent` -> `AGENTS.md`
- `subagent` -> `.codex/agents/<name>.toml` (converted from Markdown)
- `skill` -> `.codex/skills/`
- `mcp` -> `.codex/config.toml`

**OpenCode**

- `agent` -> `AGENTS.md`
- `subagent` -> `.opencode/agents/<name>.md`
- `skill` -> `.opencode/skills/`
- `mcp` -> `opencode.json`

### 3) Project state

Installed results are tracked in:

- `.oag/state.json` (inside your project root)

The state file has the shape `{ manual: [...], plugins: {...}, tools: {...} }`:

- `manual`: asset IDs selected through `oag install`.
- `plugins`: enabled plugins and the assets each one contributes.
- `tools`: the real per-tool installation records.

The desired asset set is the union of `manual` and every enabled plugin. `update` uses this state to know what should be refreshed and where.

## Plugin file format

Plugin files live under `plugins/*.json` in your registry repo and use a flat schema.

Example:

```json
{
  "name": "oag-starter",
  "description": "Project starter plugin for oag",
  "assets": [
    "agent/develop-agent",
    "subagent/code-reviewer",
    "mcp/context7",
    "mcp/chrome-devtools",
    "skill/commit",
    "skill/frontend-design",
    "skill/skill-creator"
  ]
}
```

Notes:

- Asset IDs use `type/name` format.
- `name` is required and must be unique; `description` is optional.
- `assets` must list at least one asset ID; each asset is installed to every compatible tool.
- Plugins coexist: enabling multiple plugins installs the union of their assets. Removing one plugin only removes the assets that are no longer required by any enabled plugin or by `oag install`.

## MCP notes

For `mcp` assets, `oag` applies config updates instead of simple file copies:

- For Claude, servers are merged into `.mcp.json`.
- For Codex, servers are written under `mcp_servers` in `.codex/config.toml`.
- For OpenCode, servers are written into the `mcp` object in `opencode.json` (for example, `{ "mcp": { "context7": { ... } } }`).
- Legacy OpenCode `mcp` array format is migrated to object format during install/update.
- During reinstall/update, `oag` uses stored state to rollback/reapply managed MCP entries safely.

## Subagent notes

`subagent` assets ship a single Markdown file with minimal front matter (`name`
and `description`) and the system prompt as the body:

- For Claude and OpenCode, the Markdown file is copied verbatim to
  `.claude/agents/<name>.md` / `.opencode/agents/<name>.md`.
- For Codex, whose subagents are TOML, `oag` converts the source to
  `.codex/agents/<name>.toml`, mapping only `name`, `description`, and
  `developer_instructions` (the body).
- `model` and `tools`/permissions are intentionally not defined, because those
  fields differ per tool. Each tool falls back to inheriting the parent/main
  session's model and tools. Set tool-specific fields in the source only if you
  need them (they pass through for the Markdown tools and are ignored by Codex).
- A subagent asset must contain exactly one file.

## Troubleshooting

- **Error: `No remote configured.`**
  - Run `oag remote add <url> [branch]` first.
- **Error: `Type 'hook' has been removed and is no longer supported.`**
  - `hook` is deprecated and cannot be listed/installed as a new type.
- **Error: `Type 'prompt' has been removed and is no longer supported.`**
  - `prompt` is deprecated and cannot be listed/installed as a new type.
- **Error: `Invalid mode '<mode>'. Use symlink or copy.`**
  - Choose `--mode copy` or `--mode symlink`.
- **Error: `Plugin '<name>' not found`**
  - Check whether the plugin exists under `plugins/*.json` and its `name` matches your argument.
- **Error: `Plugin '<name>' has invalid assets`**
  - One or more of the plugin's assets do not exist in the registry, or are not applicable to any configured tool. Fix the reported asset IDs.
- **Error: `Invalid plugin: ... (invalid asset ID '...', expected type/name)`**
  - Use `type/name` format for each asset ID (for example `skill/commit`).
- **Message: `Plugin '<name>' is not enabled.`**
  - You tried to `oag plugin remove` a plugin that is not enabled in this project.
- **`oag preset` / `oag list-presets` no longer exist.**
  - Presets have been replaced by plugins. Use `oag plugin list` / `oag plugin add` / `oag plugin remove` instead.
