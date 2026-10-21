import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NEXT_APP, cli, jsonCli, project, read } from './helpers.mjs';
import { KIT_VERSION } from '../src/spec.mjs';
import { unifiedDiff } from '../src/diff.mjs';

test('unknown commands, unknown options and misplaced options fail', () => {
  assert.equal(cli(['deploy']).code, 1);
  assert.match(cli(['scan', '.', '--verbose']).err, /Unknown option --verbose/);
  assert.match(cli(['scan', '.', '--force']).err, /does not apply to scan/);
  assert.match(cli(['check', '.', '--timeout', 'abc']).err, /positive whole number/);
  assert.match(cli(['design', '.', '--set', 'colour=blue', '--dry-run']).err, /Unknown --set key/);
  assert.equal(cli(['--version']).out.trim(), KIT_VERSION);
  assert.equal(cli(['help']).code, 0);
});

test('design without an agent choice fails with a hint instead of guessing', () => {
  const root = project({});
  const r = cli(['design', root, '--yes']);
  assert.equal(r.code, 1);
  assert.match(r.err, /--set agents=codex/);
  assert.ok(!existsSync(join(root, '.harness/spec.json')));
});

test('an agent list split by PowerShell into spaces is accepted like a comma list', () => {
  const root = project(NEXT_APP);
  assert.equal(cli(['design', root, '--yes', '--set', 'agents=cursor claude']).code, 0);
  assert.deepEqual(JSON.parse(read(root, '.harness/spec.json')).agents, ['cursor', 'claude']);
  assert.equal(cli(['design', root, '--yes', '--set', 'approvals=push deploy']).code, 0);
  assert.deepEqual(JSON.parse(read(root, '.harness/spec.json')).approvals, ['push', 'deploy']);
  assert.equal(cli(['design', root, '--yes', '--set', 'approvals=Ask before emailing customers']).code, 0);
  assert.deepEqual(JSON.parse(read(root, '.harness/spec.json')).approvals, ['Ask before emailing customers']);
});

test('scan names the main language of a folder of scripts without a manifest', () => {
  const { data } = jsonCli(['scan', project({ 'build.py': 'print(1)\n', 'render.py': 'print(2)\n', 'page.js': '' })]);
  assert.deepEqual(data.stack, ['Python']);
  assert.equal(data.stage, 'existing');
});

test('design without --yes in a non-interactive shell previews and writes nothing', () => {
  const root = project(NEXT_APP);
  const r = cli(['design', root, '--set', 'agents=codex']);
  assert.equal(r.code, 0);
  assert.match(r.out, /pass --yes to write/);
  assert.ok(!existsSync(join(root, '.harness/spec.json')));
});

test('design --questions exposes evidence and defaults for an AI agent', () => {
  const root = project(NEXT_APP);
  const { data } = jsonCli(['design', root, '--questions']);
  const fast = data.questions.find((q) => q.id === 'fast');
  assert.equal(fast.default, 'npm run typecheck && npm run lint');
  assert.ok(fast.evidence.some((e) => e.includes('package.json#scripts.typecheck')));
  assert.ok(data.questions.find((q) => q.id === 'approvals').evidence.some((e) => e.startsWith('migrations')));
});

test('design --agent prints the conversation protocol with the real CLI name', () => {
  const r = cli(['design', '--agent']);
  assert.equal(r.code, 0);
  assert.match(r.out, /npx github:RolePlayingTech\/agent-harness-kit scan --json/);
  assert.doesNotMatch(r.out, /\{\{cli\}\}/);
});

test('--set, --rule and re-running design keep earlier decisions', () => {
  const root = project(NEXT_APP);
  cli(['design', root, '--yes', '--set', 'agents=codex', '--set', 'rigor=strict', '--rule', 'Use cents.', '--rule', 'No ORMs in components.']);
  let spec = JSON.parse(read(root, '.harness/spec.json'));
  assert.deepEqual(spec.rules, ['Use cents.', 'No ORMs in components.']);
  assert.equal(spec.verification.rigor, 'strict');
  cli(['design', root, '--yes', '--set', 'memory=none', '--set', 'e2e=none']);
  spec = JSON.parse(read(root, '.harness/spec.json'));
  assert.equal(spec.verification.rigor, 'strict', 'unchanged answers persist');
  assert.equal(spec.memory, 'none');
  assert.equal(spec.verification.e2e, null);
});

test('explain separates included and left-out parts and names enforcement options', () => {
  const root = project(NEXT_APP);
  cli(['design', root, '--yes', '--set', 'agents=codex']);
  const r = cli(['explain', root]);
  assert.match(r.out, /Included/);
  assert.match(r.out, /Left out/);
  assert.match(r.out, /Instructions are not enforcement/);
  assert.match(r.out, /Codex: sandbox mode and approval policy/);
});

test('unified diff output marks additions and removals', () => {
  const d = unifiedDiff('a\nb\nc', 'a\nB\nc', 'f.md');
  assert.match(d, /^--- a\/f\.md\n\+\+\+ b\/f\.md\n@@ -1,3 \+1,3 @@/);
  assert.match(d, /\n-b\n\+B\n/);
  assert.equal(unifiedDiff('same', 'same', 'f'), '');
});
