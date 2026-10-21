import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEXT_APP, build, cli, design, jsonCli, project, read, write } from './helpers.mjs';
import { parseFrontmatter } from '../src/check.mjs';

const codes = (report, level) => report.findings.filter((f) => !level || f.level === level).map((f) => f.code);

function editSpec(root, fn) {
  const path = join(root, '.harness/spec.json');
  const spec = JSON.parse(readFileSync(path, 'utf8'));
  fn(spec);
  writeFileSync(path, JSON.stringify(spec, null, 2) + '\n');
}

test('a freshly built harness passes', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex,claude']);
  build(root);
  const { code, data } = jsonCli(['check', root]);
  assert.equal(code, 0, JSON.stringify(data.findings));
  assert.equal(data.errors, 0);
  assert.ok(data.metrics.alwaysOnLines > 20);
});

test('drift between spec and files is an error until rebuilt', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  build(root);
  editSpec(root, (s) => s.rules.push('New rule.'));
  const { code, data } = jsonCli(['check', root]);
  assert.equal(code, 1);
  assert.ok(data.findings.some((f) => f.code === 'drift' && f.file === 'AGENTS.md'));
  build(root);
  assert.equal(jsonCli(['check', root]).code, 0);
});

test('commands that do not exist in the project are caught statically', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex', 'fast=npm run typecheck && npm run tyepcheck', 'e2e=npx cypress run']);
  build(root);
  const { data } = jsonCli(['check', root]);
  assert.ok(data.findings.some((f) => f.level === 'error' && /no "tyepcheck" script/.test(f.message)));
  assert.ok(data.findings.some((f) => f.level === 'warn' && /cypress/.test(f.message)));
});

test('no commands at all is a warning, not a silent pass', () => {
  const root = project({});
  design(root, ['agents=codex']);
  build(root);
  const { data } = jsonCli(['check', root]);
  assert.ok(codes(data, 'warn').includes('no-checks'));
  assert.equal(jsonCli(['check', root, '--strict']).code, 1);
});

test('skill frontmatter problems are reported per file', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  build(root);
  write(root, '.agents/skills/no-desc/SKILL.md', '---\nname: no-desc\n---\nBody\n');
  write(root, '.agents/skills/Bad_Name/SKILL.md', '---\nname: Bad_Name\ndescription: x\n---\n');
  write(root, '.agents/skills/late/SKILL.md', '\n---\nname: late\n---\n');
  const { data } = jsonCli(['check', root]);
  const skillErrors = data.findings.filter((f) => f.code === 'skill' && f.level === 'error').map((f) => f.file);
  assert.ok(skillErrors.includes('.agents/skills/no-desc/SKILL.md'));
  assert.ok(skillErrors.includes('.agents/skills/Bad_Name/SKILL.md'));
  assert.ok(skillErrors.includes('.agents/skills/late/SKILL.md'));
});

test('frontmatter parser handles folded scalars and refuses to guess at lists', () => {
  const r = parseFrontmatter('---\nname: x\ndescription: >-\n  first line\n  second line\nallowed-tools:\n  - Read\n---\nbody');
  assert.equal(r.data.description, 'first line second line');
  assert.equal(r.unsupported.length, 1);
  assert.equal(parseFrontmatter('---\nname: "q"\n---\n').data.name, 'q');
});

test('broken CLAUDE.md imports and dead path references are found', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=claude']);
  build(root);
  write(root, 'CLAUDE.md', read(root, 'CLAUDE.md') + '\n@docs/missing.md\n');
  write(root, 'AGENTS.md', read(root, 'AGENTS.md') + '\nSee `docs/old-guide.md`. Services: `oauth.py`, sibling repo `../admin`, spec `../ADR.md`.\n');
  const { data } = jsonCli(['check', root]);
  assert.ok(data.findings.some((f) => f.code === 'import' && f.level === 'error'));
  const refs = data.findings.filter((f) => f.code === 'reference').map((f) => f.message);
  assert.equal(refs.length, 1, 'bare file names and paths outside the repository are not reported');
  assert.match(refs[0], /old-guide/);
});

test('the always-loaded size budget warns when exceeded', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  build(root);
  write(root, 'AGENTS.md', read(root, 'AGENTS.md') + '\n' + Array.from({ length: 200 }, (_, i) => `- rule ${i}`).join('\n') + '\n');
  const { data } = jsonCli(['check', root]);
  assert.ok(codes(data, 'warn').includes('size'));
});

test('--run executes the configured checks and reports failures with output', () => {
  const root = project({ 'package.json': { name: 'r', scripts: { test: 'node -e "process.exit(0)"', lint: 'node -e "console.log(\'boom\'); process.exit(3)"' } } });
  design(root, ['agents=codex']);
  build(root);
  const { code, data } = jsonCli(['check', root, '--run']);
  assert.equal(code, 1);
  const lint = data.runs.find((r) => r.check === 'fast');
  assert.equal(lint.exitCode, 3);
  assert.match(lint.outputTail, /boom/);
  assert.equal(data.runs.find((r) => r.check === 'full').exitCode, 0);
});

test('check runs nothing without --run, and says what it runs with it', () => {
  const root = project({ 'package.json': { name: 'r', scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'ran.txt\', \'1\')"' } } });
  design(root, ['agents=codex']);
  build(root);
  const quiet = cli(['check', root]);
  assert.match(quiet.out, /Commands were not executed/);
  assert.ok(!existsSync(join(root, 'ran.txt')));
  const r = cli(['check', root, '--run']);
  assert.match(r.err, /--run executes the verification commands from \.harness\/spec\.json/);
  assert.match(r.err, /Running full check: npm test/);
  assert.ok(existsSync(join(root, 'ran.txt')));
});
