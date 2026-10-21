import test from 'node:test';
import assert from 'node:assert/strict';
import { scanRepository } from '../src/scan.mjs';
import { buildSpec, validateSpec } from '../src/spec.mjs';
import { deriveModules, skillDirs } from '../src/engine.mjs';
import { renderOutputs } from '../src/render.mjs';
import { NEXT_APP, project } from './helpers.mjs';

const specFor = (files, answers) => buildSpec(scanRepository(project(files)), answers);
const enabled = (spec) => deriveModules(spec).filter((m) => m.enabled).map((m) => m.id);

test('scan separates detected commands from inferred ones and finds sensitive areas', () => {
  const scan = scanRepository(project(NEXT_APP));
  assert.equal(scan.stage, 'existing');
  assert.deepEqual(scan.commands.fast.map((c) => [c.cmd, c.confidence]), [['npm run typecheck', 'detected'], ['npm run lint', 'detected']]);
  assert.equal(scan.commands.full[0].cmd, 'npm test');
  assert.equal(scan.commands.e2e[0].cmd, 'npm run test:e2e');
  assert.deepEqual(scan.sensitive.map((s) => s.id).sort(), ['migrations', 'payments']);
  assert.ok(scan.stack.includes('Next.js') && scan.stack.includes('TypeScript'));

  const inferred = scanRepository(project({ 'package.json': { name: 'x' }, 'tsconfig.json': '{}' }));
  assert.deepEqual(inferred.commands.fast, [{ cmd: 'npx tsc --noEmit', evidence: 'tsconfig.json', confidence: 'inferred' }]);
});

test('scan flags a test script that would start watch mode', () => {
  const scan = scanRepository(project({ 'package.json': { name: 'x', scripts: { test: 'jest --watch' } } }));
  assert.ok(scan.notes.some((n) => /watch mode/.test(n.message)));
});

test('the user scenario (Next.js, Codex, few regressions, light process) yields a standard harness without heavy parts', () => {
  const spec = specFor(NEXT_APP, { agents: 'codex', rigor: 'standard', memory: 'decisions' });
  assert.deepEqual(validateSpec(spec), []);
  const on = enabled(spec);
  for (const id of ['instructions', 'verification', 'quiet-output', 'decision-log', 'approvals', 'risk-areas', 'harness-maintenance']) assert.ok(on.includes(id), id);
  for (const id of ['verify-change', 'session-handoff', 'claude-import', 'exploration']) assert.ok(!on.includes(id), id);
  assert.ok(!spec.approvals.includes('payments'), 'payments gets a risk-area rule, not a permission gate, by default');
  const out = renderOutputs(spec);
  const agents = out.blocks['AGENTS.md'];
  assert.match(agents, /Fast check, after each meaningful change: `npm run typecheck && npm run lint`/);
  assert.match(agents, /Full check, once before reporting a task done: `npm test`/);
  assert.match(agents, /payments \(code using `stripe`\)/);
  assert.match(agents, /database migrations \(`prisma\/migrations`\)/);
  assert.deepEqual(Object.keys(out.files), ['.agents/skills/harness-maintenance/SKILL.md']);
  assert.ok(agents.split('\n').length < 60);
});

test('rigor changes the definition of done and the strict procedure lives in a skill', () => {
  const light = renderOutputs(specFor(NEXT_APP, { agents: 'codex', rigor: 'light' }));
  assert.match(light.blocks['AGENTS.md'], /full check only when the user asks/);
  assert.ok(!Object.keys(light.files).some((f) => f.includes('verify-change')));

  const strict = renderOutputs(specFor(NEXT_APP, { agents: 'codex', rigor: 'strict' }));
  assert.match(strict.blocks['AGENTS.md'], /follow the `verify-change` skill/);
  assert.ok(strict.files['.agents/skills/verify-change/SKILL.md'].includes('`npm test`'));
});

test('skill directories follow what each tool reads, avoiding duplicates where possible', () => {
  assert.deepEqual(skillDirs(['codex']), ['.agents/skills']);
  assert.deepEqual(skillDirs(['cursor']), ['.agents/skills']);
  assert.deepEqual(skillDirs(['claude']), ['.claude/skills']);
  assert.deepEqual(skillDirs(['claude', 'cursor']), ['.claude/skills']);
  assert.deepEqual(skillDirs(['claude', 'codex']), ['.claude/skills', '.agents/skills']);
  const out = renderOutputs(specFor(NEXT_APP, { agents: 'claude' }));
  assert.equal(out.blocks['CLAUDE.md'], '@AGENTS.md');
  assert.match(out.blocks['AGENTS.md'], /\.claude\/skills\/harness-maintenance/);
});

test('memory choices add exactly the files they need', () => {
  const none = renderOutputs(specFor(NEXT_APP, { agents: 'codex', memory: 'none' }));
  assert.deepEqual(Object.keys(none.seeds), []);
  assert.doesNotMatch(none.blocks['AGENTS.md'], /## Memory/);
  const handoff = renderOutputs(specFor(NEXT_APP, { agents: 'codex', memory: 'handoff' }));
  assert.deepEqual(Object.keys(handoff.seeds).sort(), ['docs/agent/decisions.md', 'docs/agent/handoff.md']);
  assert.ok(handoff.files['.agents/skills/session-handoff/SKILL.md']);
});

test('a new empty project gets honest gaps instead of invented commands', () => {
  const spec = specFor({}, { agents: 'claude' });
  assert.equal(spec.project.stage, 'new');
  assert.equal(spec.verification.rigor, 'light');
  assert.equal(spec.verification.fast, null);
  assert.ok(!spec.approvals.includes('dependencies'));
  const agents = renderOutputs(spec).blocks['AGENTS.md'];
  assert.match(agents, /No check commands are configured yet/);
  assert.match(agents, /Stack: not chosen yet/);
});

test('large repositories and monorepos get exploration and per-package guidance', () => {
  const files = { 'package.json': { name: 'mono', workspaces: ['packages/*'], scripts: { test: 'turbo test' } }, 'pnpm-lock.yaml': '' };
  for (const p of ['a', 'b']) files[`packages/${p}/package.json`] = { name: `@m/${p}` };
  const spec = specFor(files, { agents: 'codex' });
  const on = enabled(spec);
  assert.ok(on.includes('workspace-scope') && on.includes('exploration'));
  assert.match(renderOutputs(spec).blocks['AGENTS.md'], /pnpm --filter <package> <script>/);
});

test('overrides force modules and are labelled as such', () => {
  const spec = specFor(NEXT_APP, { agents: 'codex', overrides: { 'harness-maintenance': false, exploration: true } });
  const mods = deriveModules(spec);
  const hm = mods.find((m) => m.id === 'harness-maintenance');
  assert.equal(hm.enabled, false);
  assert.equal(hm.overridden, true);
  assert.deepEqual(Object.keys(renderOutputs(spec).files), []);
  assert.match(renderOutputs(spec).blocks['AGENTS.md'], /delegate the survey to a subagent/);
  assert.ok(validateSpec({ ...spec, overrides: { instructions: false } }).some((e) => e.path === 'overrides.instructions'));
});

test('every module explains itself, and derivation is deterministic', () => {
  const spec = specFor(NEXT_APP, { agents: 'codex,claude', rigor: 'strict', memory: 'handoff' });
  const a = deriveModules(spec);
  assert.deepEqual(a, deriveModules(structuredClone(spec)));
  for (const m of a) {
    assert.ok(m.why.length > 20, `${m.id} why`);
    assert.ok(m.tradeoff.length > 10, `${m.id} tradeoff`);
    if (m.enabled) assert.ok(m.files.length > 0, `${m.id} files`);
  }
});

test('spec validation rejects malformed decisions', () => {
  const spec = specFor(NEXT_APP, { agents: 'codex' });
  assert.ok(validateSpec({ ...spec, agents: ['copilot'] }).some((e) => e.path === 'agents'));
  assert.ok(validateSpec({ ...spec, verification: { ...spec.verification, rigor: 'max' } }).some((e) => e.path === 'verification.rigor'));
  assert.ok(validateSpec({ ...spec, verification: { ...spec.verification, fast: 'a\nb' } }).length);
  assert.ok(validateSpec({ ...spec, rules: ['ok', 'two\nlines'] }).length);
  assert.ok(validateSpec({ ...spec, specVersion: 2 }).length);
});
