'use strict';

const fs = require('fs/promises');
const path = require('path');
const { ensureDir, pathExists } = require('./fs');
const { resolveTargetPath } = require('./paths');
const { requireToml } = require('./toml');

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Minimal front matter parser: reads a leading `---` fenced block of flat
 * `key: value` scalars and returns the remaining body. Intentionally tiny (no
 * YAML dependency) because subagent sources only carry `name` / `description`.
 * @param {string} content - Raw markdown source.
 * @returns {{ data: Object<string,string>, body: string }}
 */
function parseFrontmatter(content) {
  const text = typeof content === 'string' ? content.replace(/^\uFEFF/, '') : '';
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/);
  if (!match) {
    return { data: {}, body: text.trim() };
  }

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (!key) {
      continue;
    }
    data[key] = stripQuotes(line.slice(idx + 1).trim());
  }

  return { data, body: (match[2] || '').trim() };
}

/**
 * Convert a subagent markdown source into a Codex agent definition object.
 * Only the universal fields are mapped: `name`, `description`, and
 * `developer_instructions` (the body). Tool-specific fields such as `model` or
 * `tools` are intentionally dropped so Codex inherits them from the parent
 * session. Exported for tests.
 * @param {string} source - Raw markdown source.
 * @param {Object} asset - Registry asset (for name/description fallbacks).
 * @returns {{ name: string, description: string, developer_instructions: string }}
 */
function subagentSourceToCodex(source, asset) {
  const { data, body } = parseFrontmatter(source);
  const name = firstNonEmpty(data.name, asset && asset.name, 'agent');
  const description = firstNonEmpty(data.description, asset && asset.description, name);
  const developer_instructions = firstNonEmpty(body, description);
  return { name, description, developer_instructions };
}

/**
 * Install a subagent asset as a Codex `.codex/agents/<name>.toml` file by
 * converting its markdown source. Unlike MCP this writes a standalone file, so
 * uninstall is a plain target removal (no reversible state needed).
 */
async function installSubagentToml(asset, projectRoot, toolConfig) {
  if (!asset.files || asset.files.length !== 1) {
    throw new Error(`Subagent asset '${asset.id}' must contain exactly one file.`);
  }

  const sourcePath = path.join(asset.dir, asset.files[0].source);
  if (!(await pathExists(sourcePath))) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const source = await fs.readFile(sourcePath, 'utf8');
  const agent = subagentSourceToCodex(source, asset);

  const { targetPath } = await resolveTargetPath(
    projectRoot,
    toolConfig.paths,
    asset.type,
    asset.name,
    asset.dir,
    sourcePath,
  );

  const toml = requireToml();
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, toml.stringify(agent), 'utf8');

  return { targets: [targetPath] };
}

/**
 * Whether the resolved subagent mapping for a tool requires TOML conversion
 * (as opposed to a plain markdown copy). Driven by the mapping extension so no
 * tool name is hard-coded.
 */
function subagentNeedsTomlConversion(toolConfig) {
  const mapping = toolConfig && toolConfig.paths ? toolConfig.paths.subagent : null;
  return typeof mapping === 'string' && /\.toml$/i.test(mapping);
}

module.exports = {
  installSubagentToml,
  subagentNeedsTomlConversion,
  // Exported for tests.
  parseFrontmatter,
  subagentSourceToCodex,
};
