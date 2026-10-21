#!/usr/bin/env node
/**
 * Unified CLI for AI Agent Harness Kit (`agent-harness`)
 * Fixes Issue #6: Cohesive CLI for inspect, plan, init, audit, verify, update, and uninstall.
 */

import { resolve } from 'node:path';
import { inspectWorkspace } from '../src/detector.mjs';
import { auditHarness, autotriggerSkills } from '../src/auditor.mjs';
import { installHarness, uninstallHarness, KIT_VERSION } from '../src/installer.mjs';
import {
  CONTEXT_POLICIES,
  PLATFORM_ADAPTERS,
  STACK_ADVISOR_CATALOG,
  TESTING_PROFILES,
} from '../src/profiles.mjs';

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eqIdx = a.indexOf('=');
      if (eqIdx !== -1) {
        flags[a.slice(2, eqIdx)] = a.slice(eqIdx + 1);
      } else {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (a === '-h') {
      flags.help = true;
    } else if (a === '-v') {
      flags.version = true;
    } else {
      positionals.push(a);
    }
  }
  return { command: positionals[0] || 'help', target: positionals[1] || '.', flags };
}

function printHelp() {
  console.log(`AI Agent Harness Kit CLI v${KIT_VERSION} (https://github.com/RolePlayingTech/agent-harness-kit)

Usage:
  agent-harness <command> [target-dir] [options]

Commands:
  inspect [dir]     Scan repository in read-only mode (detects Greenfield vs Brownfield, stack, tests & unknowns)
  plan [dir]        Compare candidate technology stacks & testing-vs-context trade-off profiles
  init [dir]        Install or retrofit AI Agent Harness safely (non-destructive by default)
  audit [dir]       Run architecture-drift, broken-reference & token-cost calculator audit
  verify [dir]      Strict Default-FAIL verification of AGENTS.md, SKILL.md YAML & feature_list.json
  doctor [dir]      Informational health check (warnings allowed)
  autotrigger [dir] Auto-repair untriggered skills in AGENTS.md (Google Research Harness² standard)
  update [dir]      Upgrade unmodified managed harness files while preserving user edits
  uninstall [dir]   Remove only unmodified files managed by agent-harness-kit

Options:
  --provider <id>   Platform profile: universal (default) | antigravity | claude | codex | cursor
  --testing <id>    Testing vs Context profile: fast-prototype | smart-tiered (default) | isolated-verifier | mission-critical
  --context <id>    Context budget policy: minimal | balanced (default) | deep-research | low-cost
  --archetype <id>  Stack advisor archetype for 'plan': saas-web | content-seo-marketing | api-backend-service
  --blueprint       Generate full durable project blueprint (docs/PROJECT_BRIEF.md, ARCHITECTURE.md, ADR, ROADMAP.md, feature_list.json, HANDOFF.md)
  --dry-run         Preview planned file changes without modifying disk
  --force           Overwrite existing conflicting files during init/update
  --json            Output machine-readable JSON diagnostics
  --help, -h        Show this help message
`);
}

const { command, target, flags } = parseArgs(process.argv);
const targetDir = resolve(target);

if (flags.version) {
  console.log(KIT_VERSION);
  process.exit(0);
}

if (flags.help || command === 'help') {
  printHelp();
  process.exit(0);
}

if (command === 'inspect') {
  const report = inspectWorkspace(targetDir);
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }
  console.log('==========================================================');
  console.log(` WORKSPACE RECONNAISSANCE (${report.mode.toUpperCase()})`);
  console.log('==========================================================');
  console.log(`Target: ${report.targetDir}`);
  console.log(`Detected Stack: ${report.detectedStack.join(', ') || 'None (Empty / Greenfield workspace)'}`);
  console.log(`Key Directories: ${report.keyDirectories.join(', ') || '(none)'}\n`);
  console.log('Grounded Evidence Facts:');
  for (const f of report.facts) {
    console.log(`  ✓ [${f.category}] ${f.summary} (evidence: ${f.evidencePath}, confidence: ${f.confidence})`);
  }
  if (report.risksAndDrift.length > 0) {
    console.log('\nDetected Risks & Architecture Drift:');
    for (const r of report.risksAndDrift) {
      console.log(`  ! [${r.severity.toUpperCase()}] ${r.code}: ${r.message} (${r.evidencePath})`);
    }
  }
  console.log('\nHigh-Value Discussion Questions for User:');
  for (const u of report.unknowns) {
    console.log(`  ? [${u.id}] EN: ${u.questionEn}`);
    console.log(`             PL: ${u.questionPl}`);
  }
  process.exit(0);
}

if (command === 'plan') {
  const archetypeKey = flags.archetype || 'saas-web';
  const catalog = STACK_ADVISOR_CATALOG[archetypeKey] || STACK_ADVISOR_CATALOG['saas-web'];
  const payload = {
    archetype: catalog,
    testingTradeOffProfiles: TESTING_PROFILES,
    contextPolicies: CONTEXT_POLICIES,
    platformAdapters: PLATFORM_ADAPTERS,
  };
  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }
  console.log('==========================================================');
  console.log(` TECHNOLOGY & HARNESS TRADE-OFF ADVISOR (${catalog.archetype})`);
  console.log('==========================================================');
  console.log(`EN: ${catalog.titleEn}`);
  console.log(`PL: ${catalog.titlePl}`);
  console.log(`\nSimplicity Advice: ${catalog.whenSimplestIsEnoughEn}\n`);
  console.log('Candidate Stacks:');
  for (const opt of catalog.options) {
    console.log(`  ${opt.recommended ? '★ [RECOMMENDED]' : '• [OPTION]'} ${opt.name}`);
    console.log(`      AI Repo Legibility: ${opt.aiLegibility}`);
    console.log(`      Pros: ${opt.prosEn.join('; ')}`);
    console.log(`      Cons: ${opt.consEn.join('; ')}`);
    console.log(`      Cost Drivers: ${opt.costDrivers}`);
  }
  console.log('\nTesting Depth vs. Context Token Budget Profiles:');
  for (const tp of Object.values(TESTING_PROFILES)) {
    console.log(`  • ${tp.id} (${tp.nameEn}): Context=${tp.contextImpact} | Cost=${tp.tokenCostRating} | Risk=${tp.defectRisk}`);
  }
  process.exit(0);
}

if (command === 'init' || command === 'update') {
  const result = installHarness(targetDir, {
    provider: flags.provider || 'universal',
    testing: flags.testing || 'smart-tiered',
    context: flags.context || 'balanced',
    blueprint: Boolean(flags.blueprint),
    dryRun: Boolean(flags['dry-run']),
    force: Boolean(flags.force),
    isUpdate: command === 'update',
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.log('==========================================================');
  console.log(` AI AGENT HARNESS ${command.toUpperCase()} ${result.dryRun ? '(DRY RUN - NO FILES WRITTEN)' : ''}`);
  console.log('==========================================================');
  console.log(`Mode: ${result.mode} | Provider: ${result.provider} | Testing: ${result.testingProfile} | Context: ${result.contextPolicy}`);
  console.log(`Created (${result.created.length}): ${result.created.join(', ') || 'none'}`);
  console.log(`Updated (${result.updated.length}): ${result.updated.join(', ') || 'none'}`);
  console.log(`Unchanged (${result.skippedUnchanged.length}): ${result.skippedUnchanged.length} file(s)`);
  if (result.skippedConflicts.length > 0) {
    console.log(
      `Preserved Existing User Files (${result.skippedConflicts.length}): ${result.skippedConflicts.join(', ')} (pass --force to overwrite)`
    );
  }
  process.exit(0);
}

if (command === 'uninstall') {
  const result = uninstallHarness(targetDir, { dryRun: Boolean(flags['dry-run']) });
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  console.log('==========================================================');
  console.log(` AI AGENT HARNESS UNINSTALL ${result.dryRun ? '(DRY RUN)' : ''}`);
  console.log('==========================================================');
  console.log(`Removed unmodified managed files (${result.removed.length}): ${result.removed.join(', ') || 'none'}`);
  if (result.preservedModified.length > 0) {
    console.log(`Preserved user-customized files (${result.preservedModified.length}): ${result.preservedModified.join(', ')}`);
  }
  process.exit(0);
}

if (command === 'autotrigger') {
  const res = autotriggerSkills(targetDir);
  if (flags.json) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  }
  console.log('==========================================================');
  console.log(' AI AGENT HARNESS — AUTOTRIGGER REPAIR (Harness² Standard)');
  console.log('==========================================================');
  if (res.updated) {
    console.log(`Added trigger lines to AGENTS.md for (${res.repairedSkills.length}): ${res.repairedSkills.join(', ')}`);
  } else {
    console.log(res.reason || 'All skills are already referenced in AGENTS.md (0 untriggered skills).');
  }
  process.exit(0);
}

if (command === 'verify' || command === 'audit' || command === 'doctor') {
  const mode = command === 'doctor' ? 'doctor' : command === 'audit' ? 'audit' : 'verify';
  const report = auditHarness(targetDir, {
    mode,
    policy: flags.context || 'balanced',
    maxRootLines: flags['max-lines'],
  });

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.passed ? 0 : 1);
  }

  console.log('==========================================================');
  console.log(` AI AGENT HARNESS — ${mode.toUpperCase()} REPORT (Policy: ${report.policy})`);
  console.log('==========================================================\n');

  for (const r of report.rootFiles) {
    console.log(`[ROOT] ${r.name}: ${r.lines} lines / ${report.maxRootLines} max (~${r.tokens} always-on tokens)`);
  }
  for (const s of report.skills) {
    console.log(`[SKILL] ${s.path}: ${s.lines} lines (~${s.tokens} on-demand tokens) ${s.valid ? '✓' : '✗'}`);
  }

  console.log('\nToken & Context Budget Metrics:');
  console.log(`  • Always-On Tokens / Turn:          ~${report.tokenMetrics.alwaysOnTokensPerTurn} tokens`);
  console.log(`  • Offloaded On-Demand Skill Tokens: ~${report.tokenMetrics.onDemandSkillsTokensOffloaded} tokens`);
  console.log(`  • Monolithic Equivalent / Turn:     ~${report.tokenMetrics.monolithicEquivalentPerTurn} tokens`);
  console.log(`  • Est. Savings Over 25-Turn Chat:   ~${report.tokenMetrics.estimatedSavings25TurnSessionTokens} tokens`);

  if (report.findings.length > 0) {
    console.log('\nFindings:');
    for (const f of report.findings) {
      const tag = f.severity === 'error' ? '[FAIL]' : '[WARN]';
      console.log(`  ${tag} ${f.code} (${f.file}): ${f.message}`);
      if (f.proposedFix) {
        console.log(`         -> Fix: ${f.proposedFix}`);
      }
    }
  }

  console.log('\n----------------------------------------------------------');
  if (!report.passed) {
    console.error(`RESULT: FAILED (${report.errorsCount} error(s), ${report.warningsCount} warning(s)).`);
    process.exit(1);
  } else {
    console.log(`RESULT: PASSED (${report.skills.length} skill(s) verified, ${report.warningsCount} warning(s)).`);
    process.exit(0);
  }
}

console.error(`Unknown command: "${command}". Run "agent-harness --help" for usage.`);
process.exit(1);
