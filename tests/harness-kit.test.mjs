/**
 * Comprehensive Automated Test Suite (`node:test`) for AI Agent Harness Kit v2.0
 * Fixes Issue #10, and regression-tests Issues #2, #3, #4, #5, #6, #7, #8, #9, #11, #12, #14, #15, #18, #19
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { validateSkillMarkdown } from '../src/yaml-validator.mjs';
import { inspectWorkspace } from '../src/detector.mjs';
import { auditHarness, autotriggerSkills } from '../src/auditor.mjs';
import { installHarness, uninstallHarness, assertSafeTargetPath, KIT_ROOT } from '../src/installer.mjs';

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

describe('5. Google Research Harness² Standards (Untriggered Skills, Autotrigger & Hooks Schema)', () => {
  test('flags untriggered skills as dead weight and repairs them via autotriggerSkills()', () => {
    const dir = makeTempDir('harness2-autotrigger-');
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n\n## 1. Identity\n- Test repo\n', 'utf8');
      const skillDir = join(dir, '.agents', 'skills', 'custom-domain');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: custom-domain\ndescription: Domain rules for custom billing workflows.\n---\n\n# Custom Domain\nFollow strict billing rules.\n',
        'utf8'
      );

      const before = auditHarness(dir, { mode: 'verify' });
      assert.ok(before.findings.some((f) => f.code === 'UNTRIGGERED_SKILL'));

      const repair = autotriggerSkills(dir);
      assert.equal(repair.updated, true);
      assert.deepEqual(repair.repairedSkills, ['custom-domain']);

      const after = auditHarness(dir, { mode: 'verify' });
      assert.ok(!after.findings.some((f) => f.code === 'UNTRIGGERED_SKILL'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('validates .codex/hooks.json PascalCase events and command hook schema', () => {
    const dir = makeTempDir('harness2-hooks-');
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n', 'utf8');
      mkdirSync(join(dir, '.codex'), { recursive: true });
      writeFileSync(
        join(dir, '.codex', 'hooks.json'),
        JSON.stringify({
          hooks: {
            invalid_snake_event: [{ hooks: [{ type: 'command', command: 'echo ok' }] }],
            PreToolUse: [{ hooks: [{ type: 'prompt', command: '' }] }],
          },
        }),
        'utf8'
      );

      const report = auditHarness(dir, { mode: 'verify' });
      assert.equal(report.passed, false);
      assert.ok(report.findings.some((f) => f.code === 'HOOKS_UNKNOWN_EVENT'));
      assert.ok(report.findings.some((f) => f.code === 'HOOKS_UNSUPPORTED_TYPE'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('6. v2.0.1 Stabilization Regressions (Issues #21, #23, #24, #25)', () => {
  test('Issue #21: prevents prefix-sibling path escapes, ancestor symlink writes, and hostile manifest traversal', () => {
    const baseDir = makeTempDir('sec-root-');
    const siblingDir = `${baseDir}-copy`;
    mkdirSync(siblingDir, { recursive: true });
    const outsideVictim = join(siblingDir, 'owned.txt');
    writeFileSync(outsideVictim, 'DO NOT DELETE OR OVERWRITE', 'utf8');

    try {
      // 1. Prefix-sibling path attack must throw
      assert.throws(() => {
        assertSafeTargetPath(baseDir, outsideVictim);
      }, /Security violation/);

      // 2. Hostile manifest with ../ traversal must throw on uninstall and preserve outside file
      mkdirSync(join(baseDir, '.agents'), { recursive: true });
      writeFileSync(
        join(baseDir, '.agents', 'harness-manifest.json'),
        JSON.stringify({
          kitName: 'agent-harness-kit',
          managedFiles: {
            '../sec-root-copy/owned.txt': {
              sha256: 'a'.repeat(64),
            },
          },
        }),
        'utf8'
      );
      assert.throws(() => {
        uninstallHarness(baseDir);
      }, /Security violation/);
      assert.equal(existsSync(outsideVictim), true);

      // 3. Corrupted manifest JSON must fail safely instead of silently returning null
      writeFileSync(join(baseDir, '.agents', 'harness-manifest.json'), '{ corrupted json', 'utf8');
      assert.throws(() => {
        installHarness(baseDir);
      }, /Integrity violation/);

      // 4. Ancestor symlink/junction attack must be rejected
      rmSync(join(baseDir, '.agents'), { recursive: true, force: true });
      let symlinkCreated = false;
      try {
        symlinkSync(siblingDir, join(baseDir, '.agents'), 'junction');
        symlinkCreated = true;
      } catch {
        // Fallback if OS permissions disallow symlink creation
      }
      if (symlinkCreated) {
        assert.throws(() => {
          installHarness(baseDir);
        }, /Security violation: Symbolic link detected/);
      }
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
      rmSync(siblingDir, { recursive: true, force: true });
    }
  });

  test('Issue #23: generated feature_list.json and copied schema pass strict validation across all policies', () => {
    for (const policy of ['minimal', 'balanced', 'deep-research', 'low-cost']) {
      const dir = makeTempDir(`schema-${policy}-`);
      try {
        installHarness(dir, { blueprint: true, context: policy, testing: 'smart-tiered' });
        assert.equal(existsSync(join(dir, 'docs', 'schemas', 'feature-list.schema.json')), true);
        const report = auditHarness(dir, { mode: 'verify', policy });
        assert.equal(report.passed, true, `Failed for policy ${policy}: ${JSON.stringify(report.findings)}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('Issue #24: CLI supports documented flag aliases (--profile, --policy, --adapters) and rejects unknown flags', () => {
    const dir = makeTempDir('cli-flags-');
    const cliPath = join(KIT_ROOT, 'bin', 'agent-harness.mjs');
    try {
      const initOut = execFileSync(
        'node',
        [cliPath, 'init', dir, '--profile', 'isolated-verifier', '--policy', 'minimal', '--adapters', 'claude', '--json'],
        { encoding: 'utf8' }
      );
      const parsed = JSON.parse(initOut);
      assert.equal(parsed.testingProfile, 'isolated-verifier');
      assert.equal(parsed.contextPolicy, 'minimal');
      assert.equal(parsed.provider, 'claude');

      // Unknown flag must exit nonzero
      assert.throws(() => {
        execFileSync('node', [cliPath, 'init', dir, '--nonexistent-flag'], { stdio: 'pipe' });
      });

      // Invalid profile enum must exit nonzero
      assert.throws(() => {
        execFileSync('node', [cliPath, 'init', dir, '--profile', 'not-a-valid-profile'], { stdio: 'pipe' });
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Issue #25: every provider adapter (universal, claude, codex, cursor, antigravity) passes init -> verify roundtrip', () => {
    for (const provider of ['universal', 'claude', 'codex', 'cursor', 'antigravity']) {
      const dir = makeTempDir(`provider-${provider}-`);
      try {
        installHarness(dir, { provider });
        const report = auditHarness(dir, { mode: 'verify' });
        assert.equal(report.passed, true, `Provider ${provider} failed verify: ${JSON.stringify(report.findings)}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});
