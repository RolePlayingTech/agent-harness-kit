#!/usr/bin/env node
/**
 * One-liner Bootstrap Installer for AI Agent Harness Kit
 * Usage: node scripts/install-harness-kit.mjs [target-project-dir]
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(__dirname, '..');
const targetRoot = resolve(process.argv[2] || process.cwd());

console.log(`Installing AI Agent Harness Kit into: ${targetRoot}`);

// 1. Copy skills to .agents/skills/ (Antigravity / Codex / Universal) & .claude/skills/ (Claude Code)
const targets = [
  join(targetRoot, '.agents', 'skills'),
  join(targetRoot, '.claude', 'skills'),
];

for (const dest of targets) {
  mkdirSync(dest, { recursive: true });
  cpSync(join(kitRoot, 'skills'), dest, { recursive: true });
  console.log(`  ✓ Installed skills into ${dest}`);
}

// 2. Copy Context Budget Linter into scripts/verify-harness.mjs
const scriptsDest = join(targetRoot, 'scripts');
mkdirSync(scriptsDest, { recursive: true });
const linterDest = join(scriptsDest, 'verify-harness.mjs');
if (!existsSync(linterDest)) {
  cpSync(join(kitRoot, 'scripts', 'verify-harness.mjs'), linterDest);
  console.log(`  ✓ Installed Context Budget Linter at ${linterDest}`);
}

console.log('\n==========================================================');
console.log(' NEXT STEP: Open your AI agent (Claude Code, Antigravity,');
console.log(' Cursor, or Codex) and prompt:');
console.log('   "Use the harness-architect skill to interview me and');
console.log('    build our project harness."');
console.log('==========================================================');
