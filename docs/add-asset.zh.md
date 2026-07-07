# 资产仓库维护指南（新增资产）

> 适用范围：维护你自己的资产 registry 仓库（`agent` / `subagent` / `skill` / `mcp`）及插件（`plugin`）的团队或个人。

## 1) 快速流程

1. 在你的资产仓库中按类型创建目录（`agents/`、`skills/`、`mcp/`）。
2. 新建资产子目录与 `asset.json`。
3. 添加资产文件（如 `AGENT.md`、`SKILL.md`、`mcp.json`）。
4. 按需新增 `plugins/*.json`（用于批量安装）。
5. 提交并推送到你的 registry 远程分支。
6. 在使用 `oag` 的业务项目中执行 `list/plugin/install/update` 验证。

## 2) 仓库边界说明

- **资产仓库（你维护）**：存放资产内容、`asset.json` 与插件（`plugins/*.json`），例如 `agents/*`、`skills/*`、`mcp/*`、`plugins/*`。
- **使用方项目（业务项目）**：执行 `oag` 命令安装资产，不直接维护 registry 文件结构。
- **oag 工具仓库**：CLI 代码仓库，与资产仓库分离；本指南关注的是资产仓库维护。

## 3) 固定目录结构（当前 oag 识别规则）

当前 `oag` 会发现并加载三类资产目录与一类插件目录：

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
    references/... (可选)
    scripts/...    (可选)

mcp/
  <asset-name>/
    asset.json
    mcp.json

plugins/
  <plugin-name>.json
```

命名建议：

- 目录名使用小写短横线（如 `my-skill`）。
- `asset.json` 中 `name` 建议与目录名一致。
- 资产 ID 由 `type/name` 组成（如 `skill/my-skill`）。
- 插件文件名建议使用小写短横线（如 `starter.json`）。

## 4) `asset.json` 规范

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 建议填写 | 资产名；未填写时回退到目录名。 |
| `type` | 建议填写 | `agent`、`subagent`、`skill`、`mcp`。 |
| `description` | 否 | 资产描述。 |
| `tools` | 否 | `claude`、`codex`、`opencode`；留空表示不限制。 |
| `files` | 是 | 文件列表；每项必须包含 `source`。 |

通用模板：

```json
{
  "name": "my-asset",
  "type": "skill",
  "description": "简短描述",
  "tools": ["claude", "codex", "opencode"],
  "files": [
    { "source": "SKILL.md" }
  ]
}
```

关键规则：

- `files[].source` 必须指向资产目录内真实文件。
- `source` 不能越过资产目录（如 `../` 指向外部路径）。
- 安装逻辑只读取 `source` 字段，其他自定义字段不会参与安装。

## 5) 类型示例

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

### 5.2 Subagent（子智能体）

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

`agent.md` —— 最小 frontmatter（`name`、`description`），正文即系统提示：

```markdown
---
name: code-reviewer
description: Reviews code changes for correctness, security, and missing tests
---

You are a focused code reviewer. Prioritize correctness, security, behavior
regressions, and missing tests. Report only issues that matter.
```

子智能体注意事项：

- 一个 subagent 资产必须只包含一个文件。
- Claude / OpenCode 原样接收 Markdown（`.claude/agents/<name>.md`、`.opencode/agents/<name>.md`）。
- Codex 接收转换后的 `.codex/agents/<name>.toml`，含 `name`、`description` 与 `developer_instructions`（正文）。
- 不要添加 `model` 或 `tools`——这些字段各工具互不通用，因此省略，各工具会从父/主会话继承。你添加的工具专属键对 Markdown 工具透传、Codex 转换时忽略。

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

MCP 注意事项：

- MCP 资产必须有且仅有一个可用 JSON 配置文件（推荐 `mcp.json`）。
- 对 Codex 与 OpenCode，`sse` 类型不受支持，请使用 `stdio` 或 `http`。

## 6) 新增插件（plugins）

插件用于把一组资产打包成可复用的集合。多个插件可以共存：启用多个插件时，安装的是它们资产的并集；停用某个插件时，只会移除不再被其它已启用插件或手动 install 需要的资产。

### 6.1 目录与文件位置

- 在 registry 根目录新增 `plugins/` 目录（若不存在）。
- 每个 `plugins/*.json` 文件表示一个插件。
- 插件文件属于资产仓库，不属于业务项目目录。

### 6.2 `plugin` JSON 规范

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 插件名，需在同一 registry 内唯一。 |
| `description` | 否 | 插件描述。 |
| `assets` | 是 | 资产 ID 数组，格式为 `type/name`，至少一个。 |

关键规则：

- 资产 ID 必须是 `type/name` 格式（如 `skill/commit`）。
- `assets` 至少包含一个条目；重复 ID 会自动去重。
- 每个资产都会安装到所有兼容的工具，不再有按工具分组的结构（`tools: { claude: [], codex: [], opencode: [] }`）。

最小模板：

```json
{
  "name": "my-starter",
  "description": "Starter bundle",
  "assets": ["agent/my-agent"]
}
```

### 6.3 示例（使用真实资产）

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

### 6.4 共存与校验行为

- 多个插件可以共存：安装集合是所有已启用插件与手动安装资产的并集。
- 停用某个插件时，只会移除不再被其它已启用插件或手动 install 需要的资产。
- `oag plugin add` 会校验插件中的每个资产，只要有一项不满足就直接失败、不做部分安装：
  - 资产在 registry 中不存在；
  - 资产对所有已配置工具都不适用。
- 建议先通过 `oag list` 确认资产可见，再维护 `plugins/*.json`。

### 6.5 维护者验证步骤

```bash
# 列出插件（显示哪些已启用）
oag plugin list

# 启用插件（安装到所有兼容工具）
oag plugin add oag-starter --mode copy

# 停用插件
oag plugin remove oag-starter
```

## 7) 发布与验证（维护者视角）

### 7.1 在资产仓库发布

```bash
git add .
git commit -m "feat: add skill/commit-helper"
git push origin <branch>
```

### 7.2 在使用方项目验证

```bash
# 首次接入时配置 remote
oag remote add <your-registry-git-url> <branch>

# 验证可见性
oag list --tool claude
oag list --tool codex
oag list --tool opencode
oag plugin list

# 验证安装与更新
oag install --mode copy
oag plugin add oag-starter --mode copy
oag update
```

检查点：

- 新资产可在 `oag list` 中看到。
- `install` 可成功安装到目标路径。
- `update` 可在后续版本中正确刷新资产。

## 8) 常见错误与排查

1. `Invalid JSON in asset: .../asset.json`
   - 检查 JSON 语法（逗号、引号、括号）。
2. `Source file not found: ...`
   - 检查 `files[].source` 路径与真实文件名是否一致。
3. `MCP asset '...' has no JSON config file`
   - 补充 `mcp.json` 并加入 `files`。
4. `MCP asset '...' has multiple JSON files`
   - 仅保留一个配置 JSON（推荐 `mcp.json`）。
5. `Codex does not support MCP server type "sse"` / `OpenCode does not support MCP server type "sse"`
   - 将 `sse` 改为 `stdio` 或 `http`。
6. `Plugin '<name>' not found`
   - 检查插件文件是否存在于 `plugins/*.json`，以及 `name` 是否拼写一致。
7. `Invalid plugin: ... (invalid asset ID '...', expected type/name)`
   - 将资产 ID 改为 `type/name` 格式（例如 `skill/commit`）。
8. `Plugin '<name>' has invalid assets`
   - 按报错逐项修复：资产在 registry 中不存在，或对所有已配置工具都不适用。

## 9) 维护建议

- 资产仓库按语义版本或发布分支管理变更，避免未验证内容直接进入主分支。
- PR 描述写明资产 ID、目标工具、验证命令与结果摘要。
- 对 `mcp` 资产优先在测试项目验证后再发布给团队使用。
