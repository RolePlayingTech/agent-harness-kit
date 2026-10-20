#!/usr/bin/env node
/**
 * Safe Non-Destructive Bootstrap Installer (`scripts/install-harness-kit.mjs`)
 * Fixes Issue #7: Never silently overwrites existing user skills or AGENTS.md by default.
 * Usage: node scripts/install-harness-kit.mjs [target-dir] [--dry-run] [--force] [--blueprint] [--provider universal|claude|codex|cursor|antigravity]
 */

import { resolve } from 'node:path';
import { installHarness } from '../src/installer.mjs';

const args = process.argv.slice(2);
const flags = {};
let targetArg = '.';

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('-')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  } else {
    targetArg = a;
  }
}

const targetRoot = resolve(targetArg);
const result = installHarness(targetRoot, {
  provider: flags.provider || 'universal',
  testing: flags.testing || 'smart-tiered',
  context: flags.context || 'balanced',
  blueprint: Boolean(flags.blueprint),
  dryRun: Boolean(flags['dry-run']),
  force: Boolean(flags.force),
});

console.log(`AI Agent Harness Kit v2.0 — ${result.dryRun ? 'DRY RUN' : 'INSTALLED'} (${targetRoot})`);
console.log(`  • Mode Detected:   ${result.mode}`);
console.log(`  • Provider:        ${result.provider}`);
console.log(`  • Created Files:   ${result.created.length}`);
console.log(`  • Updated Files:   ${result.updated.length}`);
console.log(`  • Unchanged Files: ${result.skippedUnchanged.length}`);
if (result.skippedConflicts.length > 0) {
  console.log(
    `  ! Preserved ${result.skippedConflicts.length} existing customized file(s): ${result.skippedConflicts.join(', ')} (use --force to overwrite)`
  );
}
console.log('\n==========================================================');
console.log(' NEXT STEP: Open your AI agent (Claude Code, Antigravity,');
console.log(' Cursor, or Codex) and prompt:');
console.log('   "Use the harness-architect skill to guide me step by');
console.log('    step (Greenfield or Brownfield) and configure our harness."');
console.log('==========================================================');
