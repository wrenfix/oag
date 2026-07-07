# Registry Maintenance Guide (Adding Assets)

> Scope: teams or individuals maintaining their own asset registry repository for `agent`, `subagent`, `skill`, `mcp` assets and plugins (`plugin`).

## 1) Quick Flow

1. Create type roots in your registry repo (`agents/`, `skills/`, `mcp/`).
2. Create an asset directory and `asset.json`.
3. Add asset files (for example `AGENT.md`, `SKILL.md`, `mcp.json`).
4. Add `plugins/*.json` as needed (for bundled installs).
5. Commit and push to your registry branch.
6. Validate from a consumer project using `oag list/install/update`.

## 2) Repository Boundaries

- **Registry repository (you maintain):** stores asset source files, `asset.json` manifests, and plugins (`plugins/*.json`) such as `agents/*`, `skills/*`, `mcp/*`, and `plugins/*`.
- **Consumer project:** runs `oag` commands to install assets; it does not own registry structure.
- **oag tool repository:** contains CLI source code; it is separate from your registry repository.

## 3) Fixed Directory Structure (Current `oag` Discovery Rules)

Current `oag` discovery loads three asset roots and one plugin root:

```text
agents/
  <asset-name>/
    asset.json
    AGENT.md

subagents/
  <asset-name>/
    asset.json
    agent.md

skills/
  <asset-name>/
    asset.json
    SKILL.md
    references/... (optional)
    scripts/...    (optional)

mcp/
  <asset-name>/
    asset.json
    mcp.json

plugins/
  <plugin-name>.json
```

Naming recommendations:

- Use lowercase kebab-case for folder names (for example `my-skill`).
- Keep `name` in `asset.json` consistent with the folder name.
- Asset ID is `type/name` (for example `skill/my-skill`).
- Use lowercase kebab-case for plugin filenames (for example `starter.json`).

## 4) `asset.json` Rules

| Field | Required | Description |
| --- | --- | --- |
| `name` | Recommended | Asset name; falls back to folder name if omitted. |
| `type` | Recommended | `agent`, `subagent`, `skill`, or `mcp`. |
| `description` | No | Optional description. |
| `tools` | No | `claude`, `codex`, and/or `opencode`; empty means unrestricted. |
| `files` | Yes | File list; each entry must include `source`. |

Generic template:

```json
{
  "name": "my-asset",
  "type": "skill",
  "description": "Short description",
  "tools": ["claude", "codex", "opencode"],
  "files": [
    { "source": "SKILL.md" }
  ]
}
```

Important rules:

- `files[].source` must point to real files inside the asset directory.
- `source` must not escape the asset directory (for example `../`).
- Installer logic only reads `source`; extra custom fields are ignored.

## 5) Type Examples

### 5.1 Agent

```text
agents/code-review-agent/
  asset.json
  AGENT.md
```

```json
{
  "name": "code-review-agent",
  "type": "agent",
  "description": "Code review assistant",
  "tools": ["claude", "codex", "opencode"],
  "files": [
    { "source": "AGENT.md" }
  ]
}
```

### 5.2 Subagent

```text
subagents/code-reviewer/
  asset.json
  agent.md
```

```json
{
  "name": "code-reviewer",
  "type": "subagent",
  "description": "Reviews code changes for correctness, security, and missing tests",
  "tools": ["claude", "codex", "opencode"],
  "files": [
    { "source": "agent.md" }
  ]
}
```

`agent.md` — minimal front matter (`name`, `description`) with the system prompt as the body:

```markdown
---
name: code-reviewer
description: Reviews code changes for correctness, security, and missing tests
---

You are a focused code reviewer. Prioritize correctness, security, behavior
regressions, and missing tests. Report only issues that matter.
```

Subagent notes:

- A subagent asset must contain exactly one file.
- Claude / OpenCode receive the Markdown verbatim (`.claude/agents/<name>.md`, `.opencode/agents/<name>.md`).
- Codex receives a converted `.codex/agents/<name>.toml` with `name`, `description`, and `developer_instructions` (the body).
- Do not add `model` or `tools` — those fields differ per tool, so they are left out and each tool inherits them from the parent/main session. Tool-specific keys you add are passed through for the Markdown tools and ignored by Codex.

### 5.3 Skill

```text
skills/commit-helper/
  asset.json
  SKILL.md
  references/
    conventional-commits.md
```

```json
{
  "name": "commit-helper",
  "type": "skill",
  "description": "Generate commit messages with Conventional Commits",
  "files": [
    { "source": "SKILL.md" },
    { "source": "references/conventional-commits.md" }
  ]
}
```

### 5.4 MCP

```text
mcp/my-mcp-server/
  asset.json
  mcp.json
```

```json
{
  "name": "my-mcp-server",
  "type": "mcp",
  "description": "Example MCP server",
  "tools": ["claude", "codex", "opencode"],
  "files": [
    { "source": "mcp.json" }
  ]
}
```

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@example/mcp-server"]
    }
  }
}
```

MCP notes:

- MCP assets must provide exactly one usable JSON config file (recommended: `mcp.json`).
- For Codex and OpenCode, `sse` servers are not supported; use `stdio` or `http`.

## 6) Add Plugins (`plugins`)

Plugins let you bundle multiple assets into a reusable set. Multiple plugins can coexist: enabling several plugins installs the union of their assets, and disabling one plugin only removes assets that are no longer required by any other enabled plugin or manual install.

### 6.1 Directory and File Location

- Create a `plugins/` directory at the registry root (if missing).
- Each `plugins/*.json` file represents one plugin.
- Plugin files belong to the registry repository, not the consumer project.

### 6.2 `plugin` JSON Rules

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Plugin name; must be unique within the registry. |
| `description` | No | Optional plugin description. |
| `assets` | Yes | Array of asset IDs in `type/name` form; at least one entry. |

Important rules:

- Asset IDs must use `type/name` format (for example `skill/commit`).
- `assets` must contain at least one entry; duplicate IDs are de-duplicated.
- Each asset is installed to every compatible tool. There is no per-tool grouping (`tools: { claude: [], codex: [], opencode: [] }`) anymore.

Minimal template:

```json
{
  "name": "my-starter",
  "description": "Starter bundle",
  "assets": ["agent/my-agent"]
}
```

### 6.3 Example (Using Real Assets)

```json
{
  "name": "oag-starter",
  "description": "Project starter plugin for oag",
  "assets": [
    "agent/develop-agent",
    "subagent/code-reviewer",
    "mcp/context7",
    "skill/commit"
  ]
}
```

### 6.4 Coexistence and Validation Behavior

- Multiple plugins coexist: the installed set is the union of all enabled plugins plus any manually installed assets.
- Disabling a plugin only removes assets that are no longer required by any other enabled plugin or manual install.
- In the `oag install` menu, a plugin is shown as unavailable (disabled) and cannot be checked if any of its assets:
  - is not found in the registry;
  - is not applicable to any configured tool.
- Validate asset visibility first with `oag list`, then maintain `plugins/*.json`.

### 6.5 Maintainer Validation Steps

```bash
# Plugins are enabled/disabled in the interactive menu (a `plugins` category).
# Check the plugin, then choose "Save and exit".
oag install --mode copy
```

## 7) Publish and Validate (Maintainer Workflow)

### 7.1 Publish from your registry repository

```bash
git add .
git commit -m "feat: add skill/commit-helper"
git push origin <branch>
```

### 7.2 Validate from a consumer project

```bash
# Configure remote on first use
oag remote add <your-registry-git-url> <branch>

# Validate discoverability
oag list --tool claude
oag list --tool codex
oag list --tool opencode

# Validate install (assets + plugins in one menu) and update
oag install --mode copy
oag update
```

Validation checklist:

- New assets appear in `oag list`.
- `install` writes files to expected target paths.
- `update` refreshes previously installed assets after new releases.

## 8) Common Errors and Fixes

1. `Invalid JSON in asset: .../asset.json`
   - Check JSON syntax (commas, quotes, brackets).
2. `Source file not found: ...`
   - Ensure every `files[].source` points to an existing file.
3. `MCP asset '...' has no JSON config file`
   - Add `mcp.json` and include it in `files`.
4. `MCP asset '...' has multiple JSON files`
   - Keep exactly one JSON config file (recommended: `mcp.json`).
5. `Codex does not support MCP server type "sse"` / `OpenCode does not support MCP server type "sse"`
   - Replace `sse` with `stdio` or `http`.
6. `Invalid plugin: ... (invalid asset ID '...', expected type/name)`
   - Fix asset IDs to `type/name` format (for example `skill/commit`).
7. A plugin shows as `(unavailable: ...)` in the `oag install` menu.
   - One of its assets does not exist in the registry, or is not applicable to any configured tool. Fix the reported asset IDs in its `plugins/*.json`.

## 9) Maintenance Recommendations

- Manage releases with semantic version tags or stable release branches.
- In PRs, include asset IDs, target tools, and validation command outputs.
- For `mcp` assets, validate in a test consumer project before broad rollout.
