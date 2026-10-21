import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installHarness, uninstallHarness, sha256, KIT_ROOT } from '../src/installer.mjs';
import { applyFilePlan } from '../src/file-transaction.mjs';

function workspace(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'harness-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function manifest(root, files) {
  fs.mkdirSync(join(root, '.agents'), { recursive: true });
  fs.writeFileSync(join(root, '.agents/harness-manifest.json'), JSON.stringify({
    kitName: 'agent-harness-kit', kitVersion: '2.0.1', provider: 'codex',
    testingProfile: 'smart-tiered', contextPolicy: 'balanced', managedFiles: files,
  }));
}

for (const action of ['install', 'update', 'uninstall']) {
  test(`${action}: forged checksum cannot authorize an arbitrary user file`, t => {
    const root = workspace(t);
    const content = 'private application code';
    fs.writeFileSync(join(root, 'app.js'), content);
    manifest(root, { 'app.js': { sha256: sha256(content) } });
    const before = fs.readFileSync(join(root, '.agents/harness-manifest.json'));
    assert.throws(() => action === 'uninstall' ? uninstallHarness(root)
      : installHarness(root, { isUpdate: action === 'update' }), /Security violation/);
    assert.equal(fs.readFileSync(join(root, 'app.js'), 'utf8'), content);
    assert.deepEqual(fs.readFileSync(join(root, '.agents/harness-manifest.json')), before);
    assert.equal(fs.existsSync(join(root, 'AGENTS.md')), false);
  });
}

for (const rel of ['AGENTS.md', 'docs/PROJECT_BRIEF.md', '.agents/skills/context-hygiene/SKILL.md']) {
  test(`forged allowed path preserves user content: ${rel}`, t => {
    const root = workspace(t);
    const content = 'user-owned content with a matching forged checksum';
    fs.mkdirSync(join(root, rel, '..'), { recursive: true });
    fs.writeFileSync(join(root, rel), content);
    manifest(root, { [rel]: { sha256: sha256(content) } });
    installHarness(root, { provider: 'codex', blueprint: true, isUpdate: true });
    assert.equal(fs.readFileSync(join(root, rel), 'utf8'), content);
    uninstallHarness(root);
    assert.equal(fs.readFileSync(join(root, rel), 'utf8'), content);
  });
}

test('identical pre-existing package file is not adopted or deleted', t => {
  const root = workspace(t);
  const rel = '.agents/skills/context-hygiene/SKILL.md';
  fs.mkdirSync(join(root, rel, '..'), { recursive: true });
  fs.copyFileSync(join(KIT_ROOT, 'skills/context-hygiene/SKILL.md'), join(root, rel));
  installHarness(root, { provider: 'codex' });
  const saved = JSON.parse(fs.readFileSync(join(root, '.agents/harness-manifest.json')));
  assert.equal(Object.hasOwn(saved.managedFiles, rel), false);
  uninstallHarness(root);
  assert.equal(fs.existsSync(join(root, rel)), true);
});

test('late path failure is detected before any installation writes', t => {
  const root = workspace(t);
  fs.mkdirSync(join(root, 'scripts/verify-harness.mjs'), { recursive: true });
  assert.throws(() => installHarness(root, { provider: 'codex' }));
  assert.equal(fs.existsSync(join(root, '.agents')), false);
  assert.equal(fs.existsSync(join(root, 'AGENTS.md')), false);
});

test('uninstall preflights all files before any deletion', t => {
  const root = workspace(t);
  installHarness(root, { provider: 'codex' });
  fs.rmSync(join(root, 'scripts/verify-harness.mjs'));
  fs.mkdirSync(join(root, 'scripts/verify-harness.mjs'));
  assert.throws(() => uninstallHarness(root));
  assert.equal(fs.existsSync(join(root, '.agents/skills/context-hygiene/SKILL.md')), true);
});

test('dry-run reports hashes without changing files or manifest', t => {
  const root = workspace(t);
  installHarness(root, { provider: 'claude', testing: 'fast-prototype', context: 'minimal' });
  const before = fs.readFileSync(join(root, '.agents/harness-manifest.json'));
  fs.writeFileSync(join(root, 'AGENTS.md'), 'custom instructions');
  const preview = installHarness(root, { isUpdate: true, force: true, dryRun: true });
  assert.equal(preview.provider, 'claude');
  assert.equal(preview.testingProfile, 'fast-prototype');
  assert.equal(preview.contextPolicy, 'minimal');
  assert.ok(preview.changes.some(op => op.path === 'AGENTS.md' && op.beforeSha256 === sha256('custom instructions') && op.afterSha256));
  assert.equal(fs.readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'custom instructions');
  assert.deepEqual(fs.readFileSync(join(root, '.agents/harness-manifest.json')), before);
});

for (const badPath of ['src/app.js', '.agents/skills/custom/SKILL.md', '.agents/harness-manifest.json',
  '../escape', 'C:/outside', 'AGENTS.md:stream', 'AGENTS.md.', 'AGENTS.md ', '.agents\\skills\\context-hygiene\\SKILL.md']) {
  test(`rejects out-of-scope or noncanonical manifest path: ${badPath}`, t => {
    const root = workspace(t);
    manifest(root, { [badPath]: { sha256: 'a'.repeat(64) } });
    assert.throws(() => uninstallHarness(root), /Security violation/);
    assert.throws(() => installHarness(root, { force: true }), /Security violation/);
    assert.equal(fs.existsSync(join(root, 'AGENTS.md')), false);
  });
}

test('rejects dangling directory symlinks before writing outside root', t => {
  const root = workspace(t);
  const missing = join(root, 'missing');
  try { fs.symlinkSync(missing, join(root, '.agents'), 'junction'); } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlink privilege unavailable');
    throw error;
  }
  assert.throws(() => installHarness(root), /Security violation/);
  assert.equal(fs.existsSync(missing), false);
});

test('hardlinked instruction files cannot overwrite another user file even with force', t => {
  const root = workspace(t);
  fs.writeFileSync(join(root, 'user.md'), 'precious bytes');
  fs.linkSync(join(root, 'user.md'), join(root, 'AGENTS.md'));
  assert.throws(() => installHarness(root, { force: true }), /Security violation/);
  assert.equal(fs.readFileSync(join(root, 'user.md'), 'utf8'), 'precious bytes');
});

for (const deleting of [false, true]) {
  test(`transaction rolls back ${deleting ? 'deletes' : 'writes'} after an injected late I/O failure`, t => {
    const root = workspace(t);
    const original = Buffer.from([0, 1, 255, 42]);
    const first = join(root, 'first');
    const last = join(root, 'manifest');
    fs.writeFileSync(first, original);
    fs.writeFileSync(last, 'old manifest');
    const operations = [
      { path: first, before: original, after: deleting ? null : Buffer.from('replacement') },
      { path: join(root, 'created/nested/new'), before: null, after: Buffer.from('new') },
      { path: last, before: Buffer.from('old manifest'), after: Buffer.from('new manifest') },
    ];
    let failed = false;
    const io = { ...fs, writeFileSync(path, content, options) {
      if (path === last && !failed) {
        failed = true;
        fs.writeFileSync(path, 'partial');
        throw new Error('injected disk failure');
      }
      return fs.writeFileSync(path, content, options);
    } };
    assert.throws(() => applyFilePlan(operations, () => {}, io), /prior file contents restored/);
    assert.deepEqual(fs.readFileSync(first), original);
    assert.equal(fs.readFileSync(last, 'utf8'), 'old manifest');
    assert.equal(fs.existsSync(join(root, 'created')), false);
  });
}

test('reports exact paths when rollback itself fails', t => {
  const root = workspace(t);
  const path = join(root, 'file');
  fs.writeFileSync(path, 'old');
  const io = { ...fs, writeFileSync() { throw new Error('read-only filesystem'); } };
  assert.throws(() => applyFilePlan([{ path, before: Buffer.from('old'), after: Buffer.from('new') }], () => {}, io),
    error => error.message.includes('rollback incomplete') && error.message.includes(path));
});

test('refuses a stale plan without changing externally modified file', t => {
  const root = workspace(t);
  const path = join(root, 'file');
  fs.writeFileSync(path, 'new external contents');
  assert.throws(() => applyFilePlan([{ path, before: Buffer.from('old'), after: null }], () => {}), /changed after planning/);
  assert.equal(fs.readFileSync(path, 'utf8'), 'new external contents');
});
