import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT, NEXT_APP, build, cli, design, project, read, write } from './helpers.mjs';
import { AGENTS, MEMORY, OVERRIDABLE_MODULES, RIGOR, SPEC_FIELDS, STAGES, loadSpec, validateSpec } from '../src/spec.mjs';

const schema = JSON.parse(readFileSync(join(KIT, 'schema/spec.schema.json'), 'utf8'));
const validSpec = () => JSON.parse(readFileSync(join(KIT, 'examples/nextjs-codex/expected/.harness/spec.json'), 'utf8'));
const paths = (spec) => validateSpec(spec).map((e) => e.path);

test('the JSON Schema and the validator describe the same contract', () => {
  const P = schema.properties;
  assert.deepEqual(P.agents.items.enum, Object.keys(AGENTS));
  assert.deepEqual(P.verification.properties.rigor.enum, Object.keys(RIGOR));
  assert.deepEqual(P.memory.enum, Object.keys(MEMORY));
  assert.deepEqual(P.project.properties.stage.enum, STAGES);
  assert.deepEqual(P.overrides.propertyNames.enum, OVERRIDABLE_MODULES);
  const objects = {
    '': schema, project: P.project, 'project.layout[]': P.project.properties.layout.items,
    verification: P.verification, tooling: P.tooling, budget: P.budget,
  };
  for (const [at, node] of Object.entries(objects)) {
    assert.equal(node.additionalProperties, false, `${at || 'root'} rejects unknown fields`);
    assert.deepEqual(Object.keys(node.properties).sort(), [...SPEC_FIELDS[at]].sort(), `${at || 'root'} fields`);
  }
  for (const key of schema.required) {
    const spec = validSpec();
    delete spec[key];
    assert.ok(paths(spec).some((p) => p === key || p.startsWith(`${key}`)), `missing ${key} is an error`);
  }
  for (const key of P.project.required) {
    const spec = validSpec();
    delete spec.project[key];
    assert.ok(paths(spec).includes(`project.${key}`), `missing project.${key} is an error`);
  }
});

test('generated example specs are valid', () => {
  for (const ex of ['nextjs-codex', 'new-project-claude']) {
    const spec = JSON.parse(readFileSync(join(KIT, `examples/${ex}/expected/.harness/spec.json`), 'utf8'));
    assert.deepEqual(validateSpec(spec), [], ex);
  }
});

test('inherited object properties are not accepted as enum values', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.ok(paths({ ...validSpec(), agents: [name] }).includes('agents'), `agent ${name}`);
    assert.ok(paths({ ...validSpec(), memory: name }).includes('memory'), `memory ${name}`);
    const spec = validSpec();
    spec.verification.rigor = name;
    assert.ok(paths(spec).includes('verification.rigor'), `rigor ${name}`);
  }
  const spec = validSpec();
  spec.overrides = JSON.parse('{"__proto__": true}');
  assert.ok(paths(spec).includes('overrides.__proto__'));
});

test('unknown fields, multi-line values and wrong types are reported with their path', () => {
  const cases = [
    [(s) => { s.aproval = ['push']; }, 'aproval'],
    [(s) => { s.project.layut = []; }, 'project.layut'],
    [(s) => { s.verification.e2E = 'npm run e2e'; }, 'verification.e2E'],
    [(s) => { s.project.layout = [{ path: 'src', purpose: 'code', note: 'x' }]; }, 'project.layout.note'],
    [(s) => { s.project.name = 'shop\n## Injected'; }, 'project.name'],
    [(s) => { s.project.summary = 'one\ntwo'; }, 'project.summary'],
    [(s) => { s.rules = ['ok', '']; }, 'rules[1]'],
    [(s) => { s.rules = ['line one\nline two']; }, 'rules[0]'],
    [(s) => { s.approvals = ['push', 3]; }, 'approvals[1]'],
    [(s) => { s.verification.fast = 'npm test\nrm -rf /'; }, 'verification.fast'],
    [(s) => { s.verification.full = '   '; }, 'verification.full'],
    [(s) => { s.project.sourceFiles = -1; }, 'project.sourceFiles'],
    [(s) => { s.project.sensitive = { ci: '.github' }; }, 'project.sensitive.ci'],
    [(s) => { s.overrides = { 'verify-change': 'yes' }; }, 'overrides.verify-change'],
    [(s) => { s.overrides = { instructions: false }; }, 'overrides.instructions'],
    [(s) => { s.tooling = { cli: '' }; }, 'tooling.cli'],
    [(s) => { s.budget = { alwaysOnLines: 5 }; }, 'budget.alwaysOnLines'],
    [(s) => { s.specVersion = 2; }, 'specVersion'],
  ];
  for (const [mutate, path] of cases) {
    const spec = validSpec();
    mutate(spec);
    assert.ok(paths(spec).includes(path), `${path}: got ${JSON.stringify(paths(spec))}`);
  }
  assert.deepEqual(paths([]), ['']);
  assert.deepEqual(paths(null), ['']);
});

test('optional fields get defaults when the spec is loaded', () => {
  const root = project(NEXT_APP);
  const spec = validSpec();
  delete spec.tooling;
  delete spec.budget;
  delete spec.overrides;
  write(root, '.harness/spec.json', spec);
  const loaded = loadSpec(root);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.spec.budget.alwaysOnLines, 200);
  assert.deepEqual(loaded.spec.overrides, {});
  assert.equal(build(root).code, 0);
  assert.match(read(root, 'AGENTS.md'), /npx github:RolePlayingTech\/agent-harness-kit build/);
});

test('every command refuses an invalid spec and names the field', () => {
  const root = project(NEXT_APP);
  design(root, ['agents=codex']);
  const spec = JSON.parse(read(root, '.harness/spec.json'));
  spec.agents = ['constructor'];
  write(root, '.harness/spec.json', spec);
  for (const args of [['build'], ['explain'], ['check']]) {
    const r = cli([...args, root]);
    assert.equal(r.code, 1, args[0]);
    assert.match(r.err + r.out, /agents/, args[0]);
  }
  const unknownCommand = cli(['constructor']);
  assert.equal(unknownCommand.code, 1);
  assert.match(unknownCommand.err, /Unknown command/);
});
