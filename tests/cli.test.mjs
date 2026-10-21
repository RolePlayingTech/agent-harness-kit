import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/agent-harness.mjs', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(dir, args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
}

test('boolean flags never consume the target positional', (t) => {
  const dir = fixture(t);
  const target = join(dir, 'target');
  mkdirSync(target);
  writeFileSync(join(target, 'AGENTS.md'), '# User instructions\n');
  const result = run(dir, ['init', '--dry-run', target, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).skippedConflicts.includes('AGENTS.md'));
  assert.deepEqual(readdirSync(dir), ['target']);
  assert.deepEqual(readdirSync(target), ['AGENTS.md']);
});

test('invalid CLI inputs fail before any writes, including help/version bypasses', (t) => {
  const dir = fixture(t);
  const cases = [
    ['init', '.', '--force=false'], ['init', '.', '--dry-run=false'],
    ['init', '.', '--blueprint=anything'], ['init', '.', '--json=false'],
    ['init', '.', '--testing'], ['init', '.', '--testing='],
    ['init', '.', '--context', '--json'], ['init', '.', '--provider'],
    ['init', '.', '--profile', 'fast-prototype', '--testing', 'mission-critical'],
    ['init', '.', '--provider', 'claude', '--adapters', 'codex'],
    ['init', '.', '--context', 'minimal', '--policy', 'balanced'],
    ['init', '.', '--testing', 'fast-prototype', '--testing', 'mission-critical'],
    ['init', '.', '--adapters', 'claude,cursor'], ['init', '.', '--adapters', 'nonsense,codex'],
    ['init', '.', '--provider', 'missing'], ['init', '.', '--policy', '__proto__'],
    ['init', '.', '--archetype', 'saas-web'], ['inspect', '.', '--force'],
    ['uninstall', '.', '--force'], ['autotrigger', '.', '--dry-run'],
    ['plan', '.', '--testing', 'fast-prototype'], ['audit', '.', '--strict'],
    ['verify', '.', '--max-lines', 'NaN'], ['verify', '.', '--max-lines', '0'],
    ['verify', '.', '--max-lines', '-1'], ['verify', '.', '--max-lines', '1.5'],
    ['verify', '.', '--max-lines', '9007199254740992'], ['verify', '.', '--max-lines', 'Infinity'],
    ['init', '.', 'extra'], ['init', '.', '--typo'], ['--typo'],
    ['--help', '--typo'], ['--version', '--typo'], ['missing', '--help'],
    ['--provider', 'claude'], ['init', '.', '-x'],
    ['init', ''],
  ];
  for (const args of cases) {
    const result = run(dir, args);
    assert.equal(result.status, 1, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    if (args.includes('--json')) assert.equal(JSON.parse(result.stdout).passed, false);
    else assert.match(result.stderr, /Error:/);
    assert.deepEqual(readdirSync(dir), [], args.join(' '));
  }
});

test('false force spelling cannot overwrite an existing user file', (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'AGENTS.md'), '# User instructions\n');
  const result = run(dir, ['init', '.', '--force=false']);
  assert.equal(result.status, 1);
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), '# User instructions\n');
  assert.deepEqual(readdirSync(dir), ['AGENTS.md']);
});

test('aliases and equal repeated selections preserve the explicit provider', (t) => {
  const dir = fixture(t);
  const result = run(dir, ['init', '.', '--profile=fast-prototype', '--testing', 'fast-prototype',
    '--policy=strict', '--context=minimal', '--adapters=claude', '--provider', 'claude', '--dry-run', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.provider, 'claude');
  assert.equal(report.testingProfile, 'fast-prototype');
  assert.equal(report.contextPolicy, 'minimal');
  assert.deepEqual(readdirSync(dir), []);
});

test('help/version work and JSON parser errors remain machine readable', (t) => {
  const dir = fixture(t);
  for (const args of [[], ['--help'], ['-h'], ['help'], ['--version'], ['-v']]) {
    const result = run(dir, args);
    assert.equal(result.status, 0, result.stderr);
  }
  const result = run(dir, ['init', '.', '--json', '--typo']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /Unrecognized/);
});

test('positive max-lines and strict verification flags remain supported', (t) => {
  const dir = fixture(t);
  assert.equal(run(dir, ['init', '.']).status, 0);
  const result = run(dir, ['verify', '.', '--strict', '--max-lines=100', '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).maxRootLines, 100);
});

test('update keeps the installed provider and profiles when omitted', (t) => {
  const dir = fixture(t);
  const installed = run(dir, ['init', '.', '--provider=claude', '--policy=minimal', '--profile=fast-prototype']);
  assert.equal(installed.status, 0, installed.stderr);
  const result = run(dir, ['update', '.', '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.provider, 'claude');
  assert.equal(report.contextPolicy, 'minimal');
  assert.equal(report.testingProfile, 'fast-prototype');
  assert.ok(!readdirSync(join(dir, '.agents')).includes('skills'));
});

test('lifecycle failures report JSON and preserve corrupt manifest bytes', (t) => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.agents'));
  const manifest = join(dir, '.agents', 'harness-manifest.json');
  writeFileSync(manifest, '{broken');
  for (const command of ['init', 'update', 'uninstall']) {
    const result = run(dir, [command, '.', '--json']);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).passed, false);
    assert.equal(result.stderr, '');
    assert.equal(readFileSync(manifest, 'utf8'), '{broken');
    assert.deepEqual(readdirSync(dir), ['.agents']);
  }
});
