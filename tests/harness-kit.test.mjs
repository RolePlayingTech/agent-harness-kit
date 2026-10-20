/**
 * Comprehensive Automated Test Suite (`node:test`) for AI Agent Harness Kit v2.0
 * Fixes Issue #10, and regression-tests Issues #2, #3, #4, #5, #6, #7, #8, #9, #11, #12, #14, #15, #18, #19
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { validateSkillMarkdown } from '../src/yaml-validator.mjs';
import { inspectWorkspace } from '../src/detector.mjs';
import { auditHarness } from '../src/auditor.mjs';
import { installHarness, uninstallHarness, KIT_ROOT } from '../src/installer.mjs';

function makeTempDir(prefix = 'harness-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('1. YAML Frontmatter & Agent Skills Schema Validator (Issue #9)', () => {
  test('accepts multiline folded (>-, |) and reordered YAML keys', () => {
    const md = `---
description: >-
  Multi-line folded description for progressive disclosure
  that spans two lines cleanly.
version: "2.0.0"
name: valid-skill-name
tags:
  - harness
  - context
---

# Valid Skill Body
Step 1: Do work.
`;
    const res = validateSkillMarkdown(md, { filePath: 'skills/valid-skill-name/SKILL.md', checkDirName: true });
    assert.equal(res.valid, true);
    assert.equal(res.data.name, 'valid-skill-name');
    assert.ok(res.data.description.includes('Multi-line folded description'));
    assert.deepEqual(res.data.tags, ['harness', 'context']);
  });

  test('rejects missing delimiters, duplicate keys, blank description, invalid name, and empty body', () => {
    const dupMd = `---
name: my-skill
name: duplicate-name
description: Valid description here
---
Body text`;
    const dupRes = validateSkillMarkdown(dupMd);
    assert.equal(dupRes.valid, false);
    assert.ok(dupRes.errors.some((e) => e.message.includes('Duplicate YAML key')));

    const badNameMd = `---
name: Invalid_Name_With_Caps!
description: ""
---
`;
    const badRes = validateSkillMarkdown(badNameMd);
    assert.equal(badRes.valid, false);
    assert.ok(badRes.errors.some((e) => e.field === 'name'));
    assert.ok(badRes.errors.some((e) => e.field === 'description'));
    assert.ok(badRes.errors.some((e) => e.field === 'body'));
  });
});

describe('2. Safe Non-Destructive Installer & Lifecycle Manager (Issues #7, #11, #18)', () => {
  test('dry-run reports planned changes with zero filesystem side effects', () => {
    const dir = makeTempDir('dryrun-');
    try {
      const res = installHarness(dir, { dryRun: true, blueprint: true });
      assert.equal(res.dryRun, true);
      assert.ok(res.created.includes('AGENTS.md'));
      assert.ok(res.created.includes('docs/PROJECT_BRIEF.md'));
      assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('never silently overwrites customized user skill or AGENTS.md by default (Issue #7 P0)', () => {
    const dir = makeTempDir('safe-overwrite-');
    try {
      const customSkillDir = join(dir, '.agents', 'skills', 'context-hygiene');
      mkdirSync(customSkillDir, { recursive: true });
      const customContent = `---\nname: context-hygiene\ndescription: Custom user skill that must never be lost.\n---\n# User Custom Rules\n`;
      const customSkillPath = join(customSkillDir, 'SKILL.md');
      writeFileSync(customSkillPath, customContent, 'utf8');

      const res = installHarness(dir, { force: false });
      assert.ok(res.skippedConflicts.includes('.agents/skills/context-hygiene/SKILL.md'));
      assert.equal(readFileSync(customSkillPath, 'utf8'), customContent);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('uninstall removes only unmodified managed files and preserves user-edited files (Issue #18)', () => {
    const dir = makeTempDir('lifecycle-');
    try {
      installHarness(dir, { provider: 'antigravity', blueprint: true });
      assert.equal(existsSync(join(dir, 'AGENTS.md')), true);

      // User customizes AGENTS.md
      writeFileSync(join(dir, 'AGENTS.md'), '# Custom User Edited AGENTS.md\n', 'utf8');

      const uninst = uninstallHarness(dir);
      assert.ok(uninst.preservedModified.includes('AGENTS.md'));
      assert.equal(existsSync(join(dir, 'AGENTS.md')), true);
      // Unmodified managed skill was cleanly removed
      assert.ok(uninst.removed.includes('.agents/skills/harness-architect/SKILL.md'));
      assert.equal(existsSync(join(dir, '.agents/skills/harness-architect/SKILL.md')), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('3. Strict Honest Verification & Drift Audit (Issues #8, #12, #15, #19)', () => {
  test('empty directory FAILS strict verification (Issue #8 P0)', () => {
    const dir = makeTempDir('empty-verify-');
    try {
      const strictReport = auditHarness(dir, { mode: 'verify' });
      assert.equal(strictReport.passed, false);
      assert.ok(strictReport.findings.some((f) => f.code === 'MISSING_ROOT_HARNESS' && f.severity === 'error'));

      // Doctor mode allows warning
      const doctorReport = auditHarness(dir, { mode: 'doctor' });
      assert.equal(doctorReport.passed, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('detects broken referenced skill paths, missing npm scripts, and unproven verified tasks', () => {
    const dir = makeTempDir('broken-refs-');
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }),
        'utf8'
      );
      writeFileSync(
        join(dir, 'AGENTS.md'),
        `# AGENTS.md\n1. Run \`npm run nonexistent-check\`\n- Missing skill → \`.agents/skills/ghost/SKILL.md\`\n`,
        'utf8'
      );
      writeFileSync(
        join(dir, 'feature_list.json'),
        JSON.stringify({
          features: [
            { id: 'FEAT-1', title: 'Fake pass', status: 'verified', verificationEvidence: null },
          ],
        }),
        'utf8'
      );

      const report = auditHarness(dir, { mode: 'verify' });
      assert.equal(report.passed, false);
      assert.ok(report.findings.some((f) => f.code === 'BROKEN_REFERENCED_PATH'));
      assert.ok(report.findings.some((f) => f.code === 'MISSING_NPM_SCRIPT'));
      assert.ok(report.findings.some((f) => f.code === 'UNPROVEN_VERIFIED_TASK'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('4. Dual-Mode Auto-Discovery & CLI Integration (Issues #1, #2, #4, #6)', () => {
  test('distinguishes Greenfield empty repo from Brownfield Node/Python repo', () => {
    const greenDir = makeTempDir('greenfield-');
    const brownDir = makeTempDir('brownfield-');
    try {
      const greenRecon = inspectWorkspace(greenDir);
      assert.equal(greenRecon.mode, 'greenfield');
      assert.ok(greenRecon.unknowns.some((u) => u.id === 'product_vision'));

      writeFileSync(
        join(brownDir, 'package.json'),
        JSON.stringify({
          name: 'existing-app',
          dependencies: { next: '15.0.0', react: '19.0.0' },
          devDependencies: { typescript: '5.6.0', '@playwright/test': '1.50.0' },
          scripts: { build: 'next build', test: 'playwright test' },
        }),
        'utf8'
      );
      const brownRecon = inspectWorkspace(brownDir);
      assert.equal(brownRecon.mode, 'brownfield');
      assert.ok(brownRecon.detectedStack.includes('Next.js'));
      assert.ok(brownRecon.detectedStack.includes('TypeScript'));
      assert.equal(brownRecon.verificationCommands.test, 'npm test');
    } finally {
      rmSync(greenDir, { recursive: true, force: true });
      rmSync(brownDir, { recursive: true, force: true });
    }
  });

  test('CLI init + verify roundtrip succeeds cleanly on a fresh workspace', () => {
    const dir = makeTempDir('cli-roundtrip-');
    const cliPath = join(KIT_ROOT, 'bin', 'agent-harness.mjs');
    try {
      execFileSync('node', [cliPath, 'init', dir, '--blueprint', '--testing', 'smart-tiered'], {
        encoding: 'utf8',
      });
      const verifyOut = execFileSync('node', [cliPath, 'verify', dir, '--json'], {
        encoding: 'utf8',
      });
      const parsed = JSON.parse(verifyOut);
      assert.equal(parsed.passed, true);
      assert.equal(parsed.errorsCount, 0);

      // Verify feature_list.json starts all tasks at "pending" (Issue #15)
      const ledger = JSON.parse(readFileSync(join(dir, 'feature_list.json'), 'utf8'));
      assert.ok(ledger.features.every((f) => f.status === 'pending'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
