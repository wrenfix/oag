# oag

`oag` 是一个命令行工具，用于管理基于 Git 的 AI 资产注册表，并把资产安装到本地项目中（例如 Claude 和 Codex）。

## 文档导航

- [英文 README](README.md)
- [资产仓库维护指南（中文）](docs/add-asset.zh.md)
- [资产仓库维护指南（英文）](docs/add-asset.en.md)

## oag 能做什么

- 将本地机器连接到远程注册表仓库。
- 在读取或应用操作前自动同步注册表。
- 按工具与类型交互式启用/禁用资产。
- 通过 `copy` 或 `symlink` 模式安装文件。
- 按项目记录已安装项，便于后续重复更新。
- 处理 Claude 与 Codex 的 MCP 资产配置格式。

## 核心特性

- 通过 Git 管理远程注册表（首次 `clone`，后续 `fetch + reset`）。
- 内置面向工具的安装路径映射，支持：
  - Claude
  - Codex
- `oag install` 提供交互式选择界面。
- `oag update` 基于状态进行更新。
- MCP 格式支持：
  - Claude：`.mcp.json`
  - Codex：`.codex/config.toml`

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

4. **交互式安装资产**：

   ```bash
   oag install --tool claude --mode copy
   ```

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

- `--type <type>`：按类型过滤（如 `agent`、`skill`、`prompt`、`mcp`）
- `--tool <name>`：按工具兼容性过滤

示例：

```bash
oag list --type skill --tool codex
```

### `oag install [--tool <name>] [--project <path>] [--mode <mode>]`

在项目中按工具交互式启用或禁用资产。

选项：

- `--tool <name>`：目标工具（如 `claude`、`codex`）
- `--project <path>`：项目根目录（默认：当前目录）
- `--mode <mode>`：`copy` 或 `symlink`（默认：`copy`）

示例：

```bash
oag install --tool codex --project . --mode symlink
```

### `oag update [--tool <name>] [--project <path>] [--mode <mode>]`

重新安装/更新项目状态中已记录的资产。

选项：

- `--tool <name>`：仅更新单个工具
- `--project <path>`：项目根目录（默认：当前目录）
- `--mode <mode>`：强制本次更新模式（`copy` 或 `symlink`）

示例：

```bash
oag update --tool claude
```

## oag 的工作方式

### 1) 注册表同步

在执行 `list`、`install`、`update` 前，`oag` 会同步已配置注册表：

- 首次运行：clone 到 `~/.oag/registry/repo`（或自定义的 `registryPath`）
- 后续运行：拉取远程、硬重置到目标分支、清理未跟踪文件

### 2) 安装目标（内置）

`oag` 内置了不同资产类型的写入路径映射。

**Claude**

- `agent` -> `CLAUDE.md`
- `skill` -> `.claude/skills/`
- `mcp` -> `.mcp.json`
- `prompt` -> `prompts`

**Codex**

- `agent` -> `AGENT.md`
- `skill` -> `.codex/skills/`
- `mcp` -> `.codex/config.toml`
- `prompt` -> `prompts`

### 3) 项目状态

安装结果会记录在：

- `.oag/state.json`（位于项目根目录）

`update` 会基于该状态判断应刷新哪些内容及其目标位置。

## MCP 说明

对于 `mcp` 资产，`oag` 会更新配置，而不是简单拷贝文件：

- 对 Claude：服务会合并到 `.mcp.json`。
- 对 Codex：服务会写入 `.codex/config.toml` 的 `mcp_servers`。
- 在重装/更新时，`oag` 会利用状态信息安全地回滚并重新应用受管 MCP 条目。

## 故障排查

- **错误：`No remote configured.`**
  - 先执行 `oag remote add <url> [branch]`。
- **错误：`Type 'hook' has been removed and is no longer supported.`**
  - `hook` 已弃用，不能再作为新类型进行列出或安装。
- **错误：`Tool '<name>' is not configured.`**
  - 使用内置工具名（`claude` 或 `codex`）。
- **错误：`Invalid mode '<mode>'. Use symlink or copy.`**
  - 请选择 `--mode copy` 或 `--mode symlink`。
