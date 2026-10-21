import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditHarness } from '../src/auditor.mjs';

test('invalid API line limits cannot disable harness budget checks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-budget-'));
  try {
    for (const value of [NaN, Infinity, -1, 0, 1.5, '', 'bad', Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => auditHarness(dir, { maxRootLines: value }), /positive safe integer/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI and installed-style verifier reject invalid environment budget limits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-budget-env-'));
  try {
    for (const key of ['HARNESS_MAX_LINES', 'HARNESS_MAX_SKILL_LINES']) {
      for (const value of ['NaN', 'Infinity', '-1', '0', '1.5', '', '9007199254740992']) {
        for (const script of ['../bin/agent-harness.mjs', '../scripts/verify-harness.mjs']) {
          const args = script.includes('/bin/') ? ['verify', dir] : [];
          const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
            cwd: dir, encoding: 'utf8', env: { ...process.env, [key]: value },
          });
          assert.notEqual(result.status, 0, `${key}=${value} accepted by ${script}`);
          assert.match(result.stderr + result.stdout, /positive safe integer/);
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
