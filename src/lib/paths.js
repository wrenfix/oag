'use strict';

const fs = require('fs/promises');
const path = require('path');
const { pathExists } = require('./fs');

async function resolveTargetPath(projectRoot, toolPaths, assetType, assetName, assetDir, sourcePath) {
  const mapping = toolPaths[assetType];
  if (!mapping) {
    throw new Error(`Missing path mapping for type '${assetType}'`);
  }

  // Template mapping (contains '{name}'): install one flat file per asset, named
  // after the asset (e.g. '.claude/agents/{name}.md' -> '.claude/agents/<name>.md').
  // Used by directory-collection types like `subagent` whose tools expect flat,
  // asset-named files rather than a `<name>/` subdirectory.
  if (mapping.includes('{name}')) {
    if (!assetName) {
      throw new Error(`Missing asset name for type '${assetType}'`);
    }
    const rendered = mapping.replace(/\{name\}/g, assetName);
    const targetPath = path.join(projectRoot, rendered);
    return { targetPath, basePath: targetPath, isDir: false };
  }

  const hasTrailingSlash = mapping.endsWith('/') || mapping.endsWith(path.sep);
  const normalizedMapping = mapping.replace(/[\\/]+$/, '');
  const targetBase = path.join(projectRoot, normalizedMapping);

  let isDir = hasTrailingSlash;
  if (!isDir) {
    if (await pathExists(targetBase)) {
      const stat = await fs.lstat(targetBase);
      isDir = stat.isDirectory();
    } else {
      isDir = path.extname(normalizedMapping) === '';
    }
  }

  if (!isDir) {
    return { targetPath: targetBase, basePath: targetBase, isDir: false };
  }

  if (!assetName) {
    throw new Error(`Missing asset name for type '${assetType}'`);
  }

  const relativePath = path.relative(assetDir, sourcePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Source path is outside asset directory: ${sourcePath}`);
  }

  const assetBase = path.join(targetBase, assetName);
  const targetPath = path.join(assetBase, relativePath);

  return { targetPath, basePath: assetBase, isDir: true };
}

module.exports = {
  resolveTargetPath,
};
