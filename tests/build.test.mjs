import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEXT_APP, build, cli, design, project, read, write } from './helpers.mjs';
import { planBuild } from '../src/build.mjs';

test('build is idempotent and dry-run writes nothing', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  const dry = build(root, ['--dry-run']);
  assert.equal(dry.code, 0);
  assert.match(dry.out, /\+\+\+ b\/AGENTS\.md/);
  assert.ok(!existsSync(join(root, 'AGENTS.md')));
  assert.equal(build(root).code, 0);
  const first = read(root, 'AGENTS.md');
  const again = build(root);
  assert.match(again.out, /Already up to date/);
  assert.equal(read(root, 'AGENTS.md'), first);
});

test('existing instruction files keep their content; the managed block is added', () => {
  const root = project({ ...NEXT_APP, 'AGENTS.md': '# Team notes\n\nUse pnpm.\n', 'CLAUDE.md': 'Prefer small diffs.\n' });
  design(root, ['agents=codex,claude']);
  assert.equal(build(root).code, 0);
  const agents = read(root, 'AGENTS.md');
  assert.ok(agents.startsWith('# Team notes\n\nUse pnpm.\n\n<!-- agent-harness:begin -->'));
  assert.ok(read(root, 'CLAUDE.md').startsWith('<!-- agent-harness:begin -->\n@AGENTS.md\n<!-- agent-harness:end -->\n\nPrefer small diffs.'));
});

test('hand edits inside the block stop the build; --force overwrites them but keeps outside notes', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  build(root);
  const edited = read(root, 'AGENTS.md').replace('## Purpose', '## Purpose (edited)') + '\nOutside note.\n';
  write(root, 'AGENTS.md', edited);
  const r = build(root);
  assert.equal(r.code, 1);
  assert.match(r.err, /conflict/);
  assert.equal(read(root, 'AGENTS.md'), edited, 'nothing written on conflict');
  assert.equal(build(root, ['--force']).code, 0);
  const after = read(root, 'AGENTS.md');
  assert.ok(!after.includes('(edited)'));
  assert.ok(after.includes('Outside note.'));
});

test('a pre-existing skill file the kit did not create is never overwritten silently', () => {
  const root = project({ ...NEXT_APP, '.agents/skills/harness-maintenance/SKILL.md': '---\nname: harness-maintenance\ndescription: mine\n---\nMine.\n' });
  design(root, ['agents=codex']);
  const r = build(root);
  assert.equal(r.code, 1);
  assert.match(r.err, /not created by the kit/);
  assert.match(read(root, '.agents/skills/harness-maintenance/SKILL.md'), /Mine\./);
});

test('changing the spec moves outputs: unchanged files are removed, edited ones are kept', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex', 'memory=handoff']);
  build(root);
  write(root, '.agents/skills/session-handoff/SKILL.md', read(root, '.agents/skills/session-handoff/SKILL.md') + '\nLocal tweak.\n');
  design(root, ['agents=claude', 'memory=decisions']);
  const plan = planBuild(root);
  const action = (rel) => plan.ops.find((o) => o.rel === rel)?.action;
  assert.equal(action('.agents/skills/harness-maintenance/SKILL.md'), 'delete');
  assert.equal(action('.agents/skills/session-handoff/SKILL.md'), 'orphaned');
  assert.equal(action('.claude/skills/harness-maintenance/SKILL.md'), 'create');
  assert.equal(action('CLAUDE.md'), 'create');
  assert.equal(action('docs/agent/handoff.md'), 'delete', 'seed unchanged since creation');
  assert.equal(build(root).code, 0);
  assert.ok(existsSync(join(root, '.agents/skills/session-handoff/SKILL.md')));
  assert.ok(!existsSync(join(root, '.agents/skills/harness-maintenance/SKILL.md')));
});

test('seed files are created once and then belong to the project', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  build(root);
  write(root, 'docs/agent/decisions.md', '# Decisions\n\n## 2026-10-01: Use Postgres\nBecause.\n');
  design(root, ['agents=codex', 'rigor=strict']);
  assert.equal(build(root).code, 0);
  assert.match(read(root, 'docs/agent/decisions.md'), /Use Postgres/);
});

test('remove deletes only unchanged kit output and strips the block from user files', () => {
  const root = project({ ...NEXT_APP, 'AGENTS.md': '# Mine\n\nKeep me.\n', 'docs/agent/decisions.md': '# Ours\n' });
  design(root, ['agents=codex']);
  build(root);
  assert.equal(read(root, 'docs/agent/decisions.md'), '# Ours\n', 'existing seed is not replaced');
  const dry = cli(['remove', root, '--dry-run']);
  assert.equal(dry.code, 0);
  assert.ok(existsSync(join(root, '.harness/lock.json')));
  assert.equal(cli(['remove', root]).code, 0);
  assert.equal(read(root, 'AGENTS.md'), '# Mine\n\nKeep me.\n');
  assert.equal(read(root, 'docs/agent/decisions.md'), '# Ours\n', 'a file the kit did not create is never removed');
  assert.ok(!existsSync(join(root, '.agents/skills/harness-maintenance/SKILL.md')));
  assert.ok(!existsSync(join(root, '.harness/lock.json')));
  assert.ok(existsSync(join(root, '.harness/spec.json')));

  const fresh = project(NEXT_APP);
  design(fresh, ['agents=codex']);
  build(fresh);
  cli(['remove', fresh]);
  assert.ok(!existsSync(join(fresh, 'AGENTS.md')), 'a file the kit created and nobody edited is deleted');
  assert.ok(!existsSync(join(fresh, 'docs/agent/decisions.md')));
});

test('CRLF files keep their line endings and content', () => {
  const root = project({ ...NEXT_APP, 'AGENTS.md': '# Win\r\n\r\nCRLF notes.\r\n' });
  design(root, ['agents=codex']);
  assert.equal(build(root).code, 0);
  const raw = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(raw.startsWith('# Win\r\n\r\nCRLF notes.\r\n'));
  assert.ok(!/[^\r]\n/.test(raw), 'every line ends with CRLF');
  assert.match(build(root).out, /Already up to date/);
});

test('an untrusted lock cannot point outside the generated set', () => {
  for (const [rel, why] of [['../outside.md', /never generates/], ['src/app/page.tsx', /never generates/]]) {
    const root = project(NEXT_APP);
    design(root, ['agents=codex']);
    write(root, '.harness/lock.json', { lockVersion: 1, entries: { [rel]: { kind: 'file', sha256: 'a'.repeat(64) } } });
    const r = build(root);
    assert.equal(r.code, 1);
    assert.match(r.err, why);
  }
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  write(root, '.harness/lock.json', '{ not json');
  assert.match(build(root).err, /not valid JSON/);
});

test('symlinked output directories are refused before any write', (t) => {
  const root = project(NEXT_APP);
  const outside = project({});
  try { symlinkSync(outside, join(root, '.agents'), 'junction'); } catch { t.skip('cannot create symlinks here'); return; }
  design(root, ['agents=codex']);
  const r = build(root);
  assert.equal(r.code, 1);
  assert.match(r.err, /symbolic link or junction/);
  assert.ok(!existsSync(join(outside, 'skills')));
});

test('an invalid spec is reported, not guessed around', () => {
  const root = project(NEXT_APP);
  mkdirSync(join(root, '.harness'));
  writeFileSync(join(root, '.harness/spec.json'), JSON.stringify({ specVersion: 1 }));
  const r = build(root);
  assert.equal(r.code, 1);
  assert.match(r.err, /invalid spec/);
});
