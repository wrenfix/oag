# 资产仓库维护指南（新增资产）

> 适用范围：维护你自己的资产 registry 仓库（`agent` / `skill` / `mcp`）的团队或个人。

## 1) 快速流程

1. 在你的资产仓库中按类型创建目录（`agents/`、`skills/`、`mcp/`）。
2. 新建资产子目录与 `asset.json`。
3. 添加资产文件（如 `AGENT.md`、`SKILL.md`、`mcp.json`）。
4. 提交并推送到你的 registry 远程分支。
5. 在使用 `oag` 的业务项目中执行 `list/install/update` 验证。

## 2) 仓库边界说明

- **资产仓库（你维护）**：只存放资产内容和 `asset.json`，例如 `agents/*`、`skills/*`、`mcp/*`。
- **使用方项目（业务项目）**：执行 `oag` 命令安装资产，不直接维护 registry 文件结构。
- **oag 工具仓库**：CLI 代码仓库，与资产仓库分离；本指南关注的是资产仓库维护。

## 3) 固定目录结构（当前 oag 识别规则）

当前 `oag` 只会发现并加载以下三类目录：

```text
agents/
  <asset-name>/
    asset.json
    AGENT.md

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
```

命名建议：

- 目录名使用小写短横线（如 `my-skill`）。
- `asset.json` 中 `name` 建议与目录名一致。
- 资产 ID 由 `type/name` 组成（如 `skill/my-skill`）。

## 4) `asset.json` 规范

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 建议填写 | 资产名；未填写时回退到目录名。 |
| `type` | 建议填写 | `agent`、`skill`、`mcp`。 |
| `description` | 否 | 资产描述。 |
| `tools` | 否 | `claude`、`codex`；留空表示不限制。 |
| `files` | 是 | 文件列表；每项必须包含 `source`。 |

通用模板：

```json
{
  "name": "my-asset",
  "type": "skill",
  "description": "简短描述",
  "tools": ["claude", "codex"],
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

MCP 注意事项：

- MCP 资产必须有且仅有一个可用 JSON 配置文件（推荐 `mcp.json`）。
- 对 Codex，`sse` 类型不受支持，请使用 `stdio` 或 `http`。

## 6) 发布与验证（维护者视角）

### 6.1 在资产仓库发布

```bash
git add .
git commit -m "feat: add skill/commit-helper"
git push origin <branch>
```

### 6.2 在使用方项目验证

```bash
# 首次接入时配置 remote
oag remote add <your-registry-git-url> <branch>

# 验证可见性
oag list --tool claude
oag list --tool codex

# 验证安装与更新
oag install --tool claude --mode copy
oag update --tool claude
```

检查点：

- 新资产可在 `oag list` 中看到。
- `install` 可成功安装到目标路径。
- `update` 可在后续版本中正确刷新资产。

## 7) 常见错误与排查

1. `Invalid JSON in asset: .../asset.json`
   - 检查 JSON 语法（逗号、引号、括号）。
2. `Source file not found: ...`
   - 检查 `files[].source` 路径与真实文件名是否一致。
3. `MCP asset '...' has no JSON config file`
   - 补充 `mcp.json` 并加入 `files`。
4. `MCP asset '...' has multiple JSON files`
   - 仅保留一个配置 JSON（推荐 `mcp.json`）。
5. `Codex does not support MCP server type "sse"`
   - 将 `sse` 改为 `stdio` 或 `http`。

## 8) 维护建议

- 资产仓库按语义版本或发布分支管理变更，避免未验证内容直接进入主分支。
- PR 描述写明资产 ID、目标工具、验证命令与结果摘要。
- 对 `mcp` 资产优先在测试项目验证后再发布给团队使用。
