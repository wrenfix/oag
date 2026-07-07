# oag

`oag` 是一个命令行工具，用于管理基于 Git 的 AI 资产注册表，并把资产安装到本地项目中（例如 Claude、Codex 和 OpenCode）。

## 文档导航

- [英文 README](README.md)
- [资产仓库维护指南（中文）](docs/add-asset.zh.md)
- [资产仓库维护指南（英文）](docs/add-asset.en.md)

## oag 能做什么

- 将本地机器连接到远程注册表仓库。
- 在读取或应用操作前自动同步注册表。
- 按类型分组交互式启用/禁用资产，并应用到所有兼容工具。
- 将资产打包成可共存启用的插件（plugin）。
- 通过 `copy` 或 `symlink` 模式安装文件。
- 按项目记录已安装项，便于后续重复更新。
- 处理 Claude、Codex 与 OpenCode 的 MCP 资产配置格式。

## 核心特性

- 通过 Git 管理远程注册表（首次 `clone`，后续 `fetch + reset`）。
- 内置面向工具的安装路径映射，支持：
  - Claude
  - Codex
  - OpenCode
- `oag install` 提供交互式选择界面：在同一个菜单里勾选资产（按类型分组)与插件，一次应用到所有兼容工具。
- 插件打包：可在 `oag install` 菜单里直接启用多个共存的插件。
- `oag update` 基于状态进行更新。
- MCP 格式支持：
  - Claude：`.mcp.json`
  - Codex：`.codex/config.toml`
  - OpenCode：`opencode.json`

## 安装

通过 npm 全局安装：

```bash
npm install -g @wrenfix/oag
```

验证：

```bash
oag --help
```

## 配置

全局配置路径：

- `~/.oag/config.json`

默认配置：

```json
{
  "registryPath": "~/.oag/registry",
  "remote": null
}
```

最小配置（推荐）：

```json
{
  "remote": {
    "url": "https://github.com/<you>/<your-registry>.git",
    "branch": "main"
  }
}
```

说明：

- 工具路径映射内置在 `oag` 中（不会从用户配置加载）。
- 若未配置 remote，执行 `list` / `install` / `update` 时会提示配置。

## 快速开始（fork 工作流）

1. **先 fork 你的注册表仓库**（例如在 GitHub 上）。
2. **将 `oag` 指向你的 fork**：

   ```bash
   oag remote add https://github.com/<you>/<your-registry>.git main
   ```

3. **列出可用资产**：

   ```bash
   oag list --tool claude
   ```

4. **交互式安装资产与插件**：

   ```bash
   oag install --mode copy
   ```

   菜单中除资产类型外还有一个 `plugins` 分类；勾选所需项后选择 `Save and exit`。

5. **后续更新已安装资产**：

   ```bash
   oag update
   ```

## 命令

### `oag remote add <url> [branch]`

保存远程注册表地址。

示例：

```bash
oag remote add https://github.com/<you>/<your-registry>.git main
```

### `oag list [--type <type>] [--tool <name>]`

列出同步后的注册表中的资产。

选项：

- `--type <type>`：按类型过滤（如 `agent`、`skill`、`mcp`）
- `--tool <name>`：按工具兼容性过滤（仅用于显示过滤）

示例：

```bash
oag list --type skill --tool codex
```

### `oag install [--project <path>] [--mode <mode>]`

交互式选择资产（按类型分组）与插件，并将其收敛到所有兼容工具。每个选中的资产都会安装到支持它的每个工具。插件在同一菜单中作为 `plugins` 分类出现：勾选某个插件即启用其打包的资产，取消勾选即禁用。选择是整份覆盖：`Save and exit` 时勾选的内容即为最终安装集合。

选项：

- `--project <path>`：项目根目录（默认：当前目录）
- `--mode <mode>`：`copy` 或 `symlink`（默认：`copy`）

示例：

```bash
oag install --project . --mode symlink
```

若某插件的资产在注册表中缺失、或对任何已配置工具都不适用，则在菜单中显示为不可用（disabled）。已启用但当前不可解析的插件会被原样保留，而不会被丢弃。

### `oag update [--project <path>] [--mode <mode>]`

按最新的 registry commit 重新安装当前受管资产。

选项：

- `--project <path>`：项目根目录（默认：当前目录）
- `--mode <mode>`：强制本次更新模式（`copy` 或 `symlink`）

示例：

```bash
oag update
```

## oag 的工作方式

### 1) 注册表同步

在执行 `list`、`install`、`update` 前，`oag` 会同步已配置注册表：

- 首次运行：clone 到 `~/.oag/registry/repo`（或自定义的 `registryPath`）
- 后续运行：拉取远程、硬重置到目标分支、清理未跟踪文件

### 2) 安装目标（内置）

`oag` 内置了不同资产类型的写入路径映射。资产会应用到所有兼容工具。

**Claude**

- `agent` -> `CLAUDE.md`
- `subagent` -> `.claude/agents/<name>.md`
- `skill` -> `.claude/skills/`
- `mcp` -> `.mcp.json`

**Codex**

- `agent` -> `AGENTS.md`
- `subagent` -> `.codex/agents/<name>.toml`（由 Markdown 转换）
- `skill` -> `.codex/skills/`
- `mcp` -> `.codex/config.toml`

**OpenCode**

- `agent` -> `AGENTS.md`
- `subagent` -> `.opencode/agents/<name>.md`
- `skill` -> `.opencode/skills/`
- `mcp` -> `opencode.json`

### 3) 项目状态

安装结果会记录在：

- `.oag/state.json`（位于项目根目录）

状态文件的结构为 `{ manual: [...], plugins: {...}, tools: {...} }`：

- `manual`：单独勾选的资产 ID（`oag install` 中非插件的勾选项）。
- `plugins`：已启用的插件及各自贡献的资产（`oag install` 中的 `plugins` 分类）。
- `tools`：每个工具的真实安装记录。

期望的资产集合是 `manual` 与所有已启用插件的并集。`update` 会基于该状态判断应刷新哪些内容及其目标位置。

## 插件文件格式

插件文件放在 registry 仓库的 `plugins/*.json`，采用扁平 schema。

示例：

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

说明：

- 资产 ID 使用 `type/name` 格式。
- `name` 必填且唯一；`description` 可选。
- `assets` 至少要包含一个资产 ID；每个资产都会安装到所有兼容工具。
- 插件可共存：启用多个插件时安装它们资产的并集；取消勾选某个插件只会移除那些不再被任何已启用插件或某个单独 `oag install` 勾选项需要的资产。

## MCP 说明

对于 `mcp` 资产，`oag` 会更新配置，而不是简单拷贝文件：

- 对 Claude：服务会合并到 `.mcp.json`。
- 对 Codex：服务会写入 `.codex/config.toml` 的 `mcp_servers`。
- 对 OpenCode：服务会写入 `opencode.json` 的 `mcp` 对象（例如 `{ "mcp": { "context7": { ... } } }`）。
- OpenCode 旧版 `mcp` 数组格式会在安装/更新时自动迁移为对象格式。
- 在重装/更新时，`oag` 会利用状态信息安全地回滚并重新应用受管 MCP 条目。

## 子智能体（subagent）说明

`subagent` 资产是一个 Markdown 文件，含最小 frontmatter（`name` 与 `description`），正文即系统提示：

- 对 Claude 与 OpenCode，Markdown 会原样拷贝到 `.claude/agents/<name>.md` / `.opencode/agents/<name>.md`。
- 对 Codex（其子智能体是 TOML），`oag` 会把源转换为 `.codex/agents/<name>.toml`，仅映射 `name`、`description` 与 `developer_instructions`（正文）。
- **刻意不定义 `model` 与 `tools`/权限**，因为这些字段各工具互不通用；省略后各工具会回退为继承父/主会话的模型与工具。确有需要时可在源里写工具专属字段（对 Markdown 工具透传生效，Codex 转换时忽略）。
- 一个 subagent 资产必须只包含一个文件。

## 故障排查

- **错误：`No remote configured.`**
  - 先执行 `oag remote add <url> [branch]`。
- **错误：`Type 'hook' has been removed and is no longer supported.`**
  - `hook` 已弃用，不能再作为新类型进行列出或安装。
- **错误：`Type 'prompt' has been removed and is no longer supported.`**
  - `prompt` 已弃用，不能再作为新类型进行列出或安装。
- **错误：`Invalid mode '<mode>'. Use symlink or copy.`**
  - 请选择 `--mode copy` 或 `--mode symlink`。
- **某插件在 `oag install` 中显示为 `(unavailable: ...)` 且无法勾选。**
  - 插件中有一个或多个资产在注册表中不存在，或对任何已配置工具都不适用。请在其 `plugins/*.json` 中按报错修复对应的资产 ID。
- **错误：`Invalid plugin: ... (invalid asset ID '...', expected type/name)`**
  - 将资产 ID 改为 `type/name` 格式（例如 `skill/commit`）。
- **`oag plugin` / `oag preset` / `oag list-presets` 已被移除。**
  - 插件现在在 `oag install` 内选择（菜单中的 `plugins` 分类），不再有独立的 `plugin` 命令。
