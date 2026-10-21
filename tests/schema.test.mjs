import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditHarness } from '../src/auditor.mjs';
import { installHarness } from '../src/installer.mjs';
import { compileLedgerSchema, validateFeatureLedger } from '../scripts/feature-ledger-schema.mjs';

const validLedger = () => ({
  project: 'Example', testingProfile: 'smart-tiered', contextPolicy: 'balanced',
  features: [{ id: 'FEAT-001', title: 'Implement feature', status: 'pending', verificationCommand: 'npm test' }],
});

function ledgerFindings(ledger) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-schema-'));
  try {
    writeFileSync(join(dir, 'feature_list.json'), JSON.stringify(ledger));
    return auditHarness(dir).findings.filter(f => f.file === 'feature_list.json' && f.severity === 'error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('canonical ledger accepts minimal and complete valid documents', () => {
  assert.deepEqual(ledgerFindings(validLedger()), []);
  const doc = validLedger();
  Object.assign(doc, { $schema: 'https://example.test/schema', harnessVersion: '2.0.1', mode: 'greenfield', updatedAt: '2026-10-21' });
  Object.assign(doc.features[0], { dependencies: ['FEAT-002'], verificationEvidence: { exitCode: 0 }, nextAction: '', notes: '' });
  assert.deepEqual(ledgerFindings(doc), []);
});

test('all canonical enum choices and evidence types are accepted', () => {
  const schema = JSON.parse(readFileSync(new URL('../docs/schemas/feature-list.schema.json', import.meta.url), 'utf8'));
  for (const key of ['testingProfile', 'contextPolicy', 'mode']) {
    for (const value of schema.properties[key].enum) {
      const doc = validLedger();
      doc[key] = value;
      assert.deepEqual(validateFeatureLedger(doc), []);
    }
  }
  for (const status of schema.properties.features.items.properties.status.enum) {
    for (const evidence of [null, '', { arbitrary: { nested: true } }]) {
      const doc = validLedger();
      Object.assign(doc.features[0], { status, verificationEvidence: evidence });
      assert.deepEqual(validateFeatureLedger(doc), []);
    }
  }
});

test('schema compiler rejects unsupported extensions even in nested branches', () => {
  assert.throws(() => compileLedgerSchema({ type: 'string', maxLength: 3 }), /Unsupported.*maxLength/);
  assert.throws(() => compileLedgerSchema({ type: 'object', properties: { field: { format: 'uri' } } }), /Unsupported.*format/);
  assert.throws(() => compileLedgerSchema({ type: 'array', items: { anyOf: [] } }), /Unsupported.*anyOf/);
  assert.throws(() => compileLedgerSchema({ additionalProperties: { type: 'string' } }), /Unsupported.*additionalProperties/);
});

const invalidCases = [
  ['null root', () => null],
  ['array root', () => []],
  ...['project', 'testingProfile', 'contextPolicy', 'features'].map(key => [`missing root ${key}`, doc => { delete doc[key]; return doc; }]),
  ...['id', 'title', 'status', 'verificationCommand'].map(key => [`missing feature ${key}`, doc => { delete doc.features[0][key]; return doc; }]),
  ...Object.entries({ project: 123, harnessVersion: 123, mode: 123, testingProfile: 123, contextPolicy: 123, updatedAt: 123, $schema: 123, features: {} })
    .map(([key, value]) => [`root type ${key}`, doc => { doc[key] = value; return doc; }]),
  ...Object.entries({ id: 123, title: 123, status: 123, verificationCommand: 123, dependencies: {}, verificationEvidence: [], nextAction: 123, notes: 123 })
    .map(([key, value]) => [`feature type ${key}`, doc => { doc.features[0][key] = value; return doc; }]),
  ...Object.entries({ project: '', harnessVersion: '', mode: 'unknown', testingProfile: '', contextPolicy: '', features: [] })
    .map(([key, value]) => [`root constraint ${key}`, doc => { doc[key] = value; return doc; }]),
  ...Object.entries({ id: 'lower_case', title: 'ab', status: 'complete', verificationCommand: 'x', dependencies: ['bad_id'] })
    .map(([key, value]) => [`feature constraint ${key}`, doc => { doc.features[0][key] = value; return doc; }]),
  ['unicode title counts code points', doc => { doc.features[0].title = '😀😀'; return doc; }],
  ['empty ID', doc => { doc.features[0].id = ''; return doc; }],
  ['nested dependency type', doc => { doc.features[0].dependencies = [3]; return doc; }],
  ['null feature', doc => { doc.features = [null]; return doc; }],
  ['array feature', doc => { doc.features = [[]]; return doc; }],
  ['unknown root property', doc => { doc.extra = true; return doc; }],
  ['unknown nested property', doc => { doc.features[0].extra = true; return doc; }],
  ['prototype-like unknown property', doc => { doc.features[0].constructor = 'invalid'; return doc; }],
  ['boolean evidence', doc => { doc.features[0].verificationEvidence = true; return doc; }],
];

for (const [name, mutate] of invalidCases) {
  test(`canonical ledger rejects ${name}`, () => {
    assert.ok(ledgerFindings(mutate(validLedger())).length > 0, `Invalid document accepted: ${name}`);
  });
}

test('blueprint generator and distributed schema match the canonical ledger contract', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-schema-blueprint-'));
  try {
    installHarness(dir, { blueprint: true });
    const report = auditHarness(dir);
    assert.deepEqual(report.findings.filter(f => f.file === 'feature_list.json' && f.severity === 'error'), []);
    assert.equal(readFileSync(join(dir, 'docs/schemas/feature-list.schema.json'), 'utf8'),
      readFileSync(new URL('../docs/schemas/feature-list.schema.json', import.meta.url), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installed verifier enforces the same canonical schema without a blueprint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-schema-installed-'));
  try {
    installHarness(dir, { provider: 'codex' });
    writeFileSync(join(dir, 'feature_list.json'), JSON.stringify(validLedger()));
    const run = () => spawnSync(process.execPath, ['scripts/verify-harness.mjs', '--json'], { cwd: dir, encoding: 'utf8' });
    const good = run();
    assert.equal(good.status, 0, good.stderr || good.stdout);
    const doc = validLedger();
    doc.features[0].dependencies = [false];
    writeFileSync(join(dir, 'feature_list.json'), JSON.stringify(doc));
    const bad = run();
    assert.equal(bad.status, 1, bad.stderr || bad.stdout);
    assert.ok(JSON.parse(bad.stdout).findings.some(f => f.file === 'feature_list.json' && f.message.includes('#/features/0/dependencies/0')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
