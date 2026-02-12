# Registry Maintenance Guide (Adding Assets)

> Scope: teams or individuals maintaining their own asset registry repository for `agent`, `skill`, and `mcp` assets.

## 1) Quick Flow

1. Create type roots in your registry repo (`agents/`, `skills/`, `mcp/`).
2. Create an asset directory and `asset.json`.
3. Add asset files (for example `AGENT.md`, `SKILL.md`, `mcp.json`).
4. Commit and push to your registry branch.
5. Validate from a consumer project using `oag list/install/update`.

## 2) Repository Boundaries

- **Registry repository (you maintain):** stores asset source files and manifests such as `agents/*`, `skills/*`, and `mcp/*`.
- **Consumer project:** runs `oag` commands to install assets; it does not own registry structure.
- **oag tool repository:** contains CLI source code; it is separate from your registry repository.

## 3) Fixed Directory Structure (Current `oag` Discovery Rules)

Current `oag` discovery only loads these three top-level directories:

```text
agents/
  <asset-name>/
    asset.json
    AGENT.md

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
```

Naming recommendations:

- Use lowercase kebab-case for folder names (for example `my-skill`).
- Keep `name` in `asset.json` consistent with the folder name.
- Asset ID is `type/name` (for example `skill/my-skill`).

## 4) `asset.json` Rules

| Field | Required | Description |
| --- | --- | --- |
| `name` | Recommended | Asset name; falls back to folder name if omitted. |
| `type` | Recommended | `agent`, `skill`, or `mcp`. |
| `description` | No | Optional description. |
| `tools` | No | `claude` and/or `codex`; empty means unrestricted. |
| `files` | Yes | File list; each entry must include `source`. |

Generic template:

```json
{
  "name": "my-asset",
  "type": "skill",
  "description": "Short description",
  "tools": ["claude", "codex"],
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
  "tools": ["claude", "codex"],
  "files": [
    { "source": "AGENT.md" }
  ]
}
```

### 5.2 Skill

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

### 5.3 MCP

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
  "tools": ["claude", "codex"],
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
- For Codex, `sse` servers are not supported; use `stdio` or `http`.

## 6) Publish and Validate (Maintainer Workflow)

### 6.1 Publish from your registry repository

```bash
git add .
git commit -m "feat: add skill/commit-helper"
git push origin <branch>
```

### 6.2 Validate from a consumer project

```bash
# Configure remote on first use
oag remote add <your-registry-git-url> <branch>

# Validate discoverability
oag list --tool claude
oag list --tool codex

# Validate install and update
oag install --tool claude --mode copy
oag update --tool claude
```

Validation checklist:

- New assets appear in `oag list`.
- `install` writes files to expected target paths.
- `update` refreshes previously installed assets after new releases.

## 7) Common Errors and Fixes

1. `Invalid JSON in asset: .../asset.json`
   - Check JSON syntax (commas, quotes, brackets).
2. `Source file not found: ...`
   - Ensure every `files[].source` points to an existing file.
3. `MCP asset '...' has no JSON config file`
   - Add `mcp.json` and include it in `files`.
4. `MCP asset '...' has multiple JSON files`
   - Keep exactly one JSON config file (recommended: `mcp.json`).
5. `Codex does not support MCP server type "sse"`
   - Replace `sse` with `stdio` or `http`.

## 8) Maintenance Recommendations

- Manage releases with semantic version tags or stable release branches.
- In PRs, include asset IDs, target tools, and validation command outputs.
- For `mcp` assets, validate in a test consumer project before broad rollout.
