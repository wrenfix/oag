'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const toml = require('@iarna/toml');
const { parseFrontmatter, subagentSourceToCodex } = require('./subagent');

test('parseFrontmatter reads flat scalars and returns the body', () => {
  const source = [
    '---',
    'name: code-reviewer',
    'description: Reviews code changes',
    '---',
    '',
    'You are a reviewer.',
    'Be concise.',
  ].join('\n');

  const { data, body } = parseFrontmatter(source);
  assert.equal(data.name, 'code-reviewer');
  assert.equal(data.description, 'Reviews code changes');
  assert.equal(body, 'You are a reviewer.\nBe concise.');
});

test('parseFrontmatter strips surrounding quotes from values', () => {
  const source = '---\nname: "quoted"\ndescription: \'single\'\n---\nbody';
  const { data } = parseFrontmatter(source);
  assert.equal(data.name, 'quoted');
  assert.equal(data.description, 'single');
});

test('parseFrontmatter treats content without front matter as pure body', () => {
  const source = '\nYou are a reviewer.\n';
  const { data, body } = parseFrontmatter(source);
  assert.deepEqual(data, {});
  assert.equal(body, 'You are a reviewer.');
});

test('parseFrontmatter handles CRLF line endings', () => {
  const source = '---\r\nname: r\r\ndescription: d\r\n---\r\n\r\nBody line.';
  const { data, body } = parseFrontmatter(source);
  assert.equal(data.name, 'r');
  assert.equal(data.description, 'd');
  assert.equal(body, 'Body line.');
});

test('subagentSourceToCodex maps only name, description, developer_instructions', () => {
  const source = '---\nname: code-reviewer\ndescription: Reviews code\nmodel: sonnet\ntools: Read, Grep\n---\n\nReview like an owner.';
  const agent = subagentSourceToCodex(source, { name: 'fallback', description: 'fallback desc' });

  assert.deepEqual(Object.keys(agent), ['name', 'description', 'developer_instructions']);
  assert.equal(agent.name, 'code-reviewer');
  assert.equal(agent.description, 'Reviews code');
  assert.equal(agent.developer_instructions, 'Review like an owner.');
  // model/tools are intentionally dropped so Codex inherits from the parent session.
  assert.equal('model' in agent, false);
  assert.equal('tools' in agent, false);
});

test('subagentSourceToCodex falls back to asset metadata when front matter is absent', () => {
  const agent = subagentSourceToCodex('Just the instructions.', {
    name: 'code-reviewer',
    description: 'Reviews code changes',
  });

  assert.equal(agent.name, 'code-reviewer');
  assert.equal(agent.description, 'Reviews code changes');
  assert.equal(agent.developer_instructions, 'Just the instructions.');
});

test('subagentSourceToCodex falls back for a missing description', () => {
  const agent = subagentSourceToCodex('---\nname: only-name\n---\nInstructions.', { name: 'x' });
  // description falls back to asset.description (absent) then to the name.
  assert.equal(agent.description, 'only-name');
});

test('subagentSourceToCodex keeps required fields non-empty even with an empty body', () => {
  const agent = subagentSourceToCodex('---\nname: n\ndescription: d\n---\n', {});
  // Codex requires developer_instructions; it falls back to the description.
  assert.equal(agent.developer_instructions, 'd');
});

test('subagentSourceToCodex output serializes to valid, round-trippable TOML', () => {
  const source = '---\nname: code-reviewer\ndescription: Reviews code\n---\n\nLine one.\nLine two.';
  const agent = subagentSourceToCodex(source, {});

  const serialized = toml.stringify(agent);
  const parsed = toml.parse(serialized);
  assert.deepEqual(parsed, agent);
});
