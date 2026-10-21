/**
 * Safe Non-Destructive Installer, Blueprint Generator & Lifecycle Manager
 * Fixes Issues #5, #7, #11, #13, #15, #18
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectWorkspace } from './detector.mjs';
import { CONTEXT_POLICIES, PLATFORM_ADAPTERS, TESTING_PROFILES } from './profiles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = resolve(__dirname, '..');
export const KIT_VERSION = '2.0.1';
const MANIFEST_REL_PATH = '.agents/harness-manifest.json';

export function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Validates that a relative path has no traversal segments, absolute prefixes, or null bytes (Fixes Issue #21).
 */
export function normalizeSafeRelPath(relPath) {
  if (typeof relPath !== 'string' || !relPath.trim() || relPath.includes('\0')) {
    throw new Error(`Security violation: Invalid or empty relative path (${JSON.stringify(relPath)}).`);
  }
  const normalized = relPath.replaceAll('\\', '/').trim();
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    isAbsolute(relPath)
  ) {
    throw new Error(`Security violation: Absolute paths are forbidden in managed files (${relPath}).`);
  }
  const parts = normalized.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..') {
      throw new Error(`Security violation: Path traversal or empty segment in "${relPath}".`);
    }
  }
  return parts.join('/');
}

/**
 * Enforces strict root containment and verifies that neither target nor any ancestor directory is a symlink (Fixes Issue #21).
 */
export function assertSafeTargetPath(targetRoot, fullDest, relPathHint = '') {
  if (relPathHint) {
    normalizeSafeRelPath(relPathHint);
  }
  const resolvedRoot = resolve(targetRoot);
  const resolvedDest = resolve(fullDest);
  const relFromRoot = relative(resolvedRoot, resolvedDest);

  if (
    !relFromRoot ||
    relFromRoot === '.' ||
    relFromRoot.startsWith('..') ||
    isAbsolute(relFromRoot)
  ) {
    throw new Error(`Security violation: Path escapes target root (${fullDest} outside ${resolvedRoot}).`);
  }

  // Check root itself if it exists
  if (existsSync(resolvedRoot) && lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error(`Security violation: Target root itself is a symbolic link (${resolvedRoot}).`);
  }

  // Walk every ancestor segment from resolvedRoot to resolvedDest and reject any symlink/junction
  const segments = relFromRoot.replaceAll('\\', '/').split('/');
  let current = resolvedRoot;
  for (const seg of segments) {
    current = join(current, seg);
    if (existsSync(current)) {
      const lst = lstatSync(current);
      if (lst.isSymbolicLink()) {
        throw new Error(`Security violation: Symbolic link detected along target path (${current}).`);
      }
    }
  }
}

function loadManifest(targetRoot) {
  const resolvedRoot = resolve(targetRoot);
  const p = join(resolvedRoot, MANIFEST_REL_PATH);
  assertSafeTargetPath(resolvedRoot, p, MANIFEST_REL_PATH);
  if (!existsSync(p)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`Integrity violation: Corrupted JSON in ${MANIFEST_REL_PATH} (${e.message}). Refuse to proceed with unsafe manifest.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.managedFiles !== 'object' || !parsed.managedFiles || Array.isArray(parsed.managedFiles)) {
    throw new Error(`Integrity violation: ${MANIFEST_REL_PATH} is missing a valid "managedFiles" object.`);
  }
  for (const [relKey, meta] of Object.entries(parsed.managedFiles)) {
    normalizeSafeRelPath(relKey);
    assertSafeTargetPath(resolvedRoot, join(resolvedRoot, relKey), relKey);
    if (!meta || typeof meta.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(meta.sha256)) {
      throw new Error(`Integrity violation: Invalid sha256 checksum for "${relKey}" in ${MANIFEST_REL_PATH}.`);
    }
  }
  return parsed;
}

function collectKitSkillFiles() {
  const skillsRoot = join(KIT_ROOT, 'skills');
  const results = [];
  if (!existsSync(skillsRoot)) return results;

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir)) {
      const full = join(currentDir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        results.push({
          relFromSkills: relative(skillsRoot, full).replaceAll('\\', '/'),
          content: readFileSync(full, 'utf8'),
        });
      }
    }
  }
  walk(skillsRoot);
  return results;
}

export function buildAgentsMdContent(recon, options = {}) {
  const providerId = options.provider || 'universal';
  const adapter = PLATFORM_ADAPTERS[providerId] || PLATFORM_ADAPTERS.universal;
  const primarySkillDir = adapter.skillDirs[0] || '.agents/skills';
  const testingProfile = TESTING_PROFILES[options.testing || 'smart-tiered'] || TESTING_PROFILES['smart-tiered'];
  const contextPolicy = CONTEXT_POLICIES[options.context || 'balanced'] || CONTEXT_POLICIES.balanced;
  const stackSummary =
    recon.detectedStack.length > 0
      ? recon.detectedStack.join(', ')
      : options.stackName || 'TBD (Run `greenfield-advisor` skill to select stack)';

  const dirSummary =
    recon.keyDirectories.length > 0
      ? recon.keyDirectories.slice(0, 6).map((d) => `\`${d}/\``).join(', ')
      : '`src/`, `tests/`, `docs/`';

  const typeCmd = recon.verificationCommands.typecheck || 'node scripts/verify-harness.mjs';
  const testCmd = recon.verificationCommands.test || 'node --test';
  const buildCmd = recon.verificationCommands.build || typeCmd;

  return `# AGENTS.md — Workspace Harness & Operational Map

## 1. Project Identity & Stack
- **Mode:** ${recon.mode === 'greenfield' ? 'Greenfield Project' : 'Existing Repository (Brownfield)'}
- **Stack:** ${stackSummary}
- **Key Directories:** ${dirSummary}
- **Active Profiles:** Provider=\`${adapter.id}\` | Testing=\`${testingProfile.id}\` | Context=\`${contextPolicy.id}\` (Max ${contextPolicy.maxRootLines} root lines)

## 2. Deterministic Verification Loop (Default-FAIL Contract)
1. **Static / Type Sensor:** \`${typeCmd}\`
2. **Test Suite (${testingProfile.id}):** \`${testCmd}\`
3. **Build / Contract Check:** \`${buildCmd}\`
4. **Harness & Context Audit:** \`node scripts/verify-harness.mjs\`
- **3-Strike Circuit Breaker:** Stop after **${testingProfile.maxRepairAttempts}** failed repair attempts on the same error; summarize root cause and ask the user.

## 3. Context Hygiene & Subagent Policy
- **Working RAM Discipline:** Keep primary context focused; prefer \`grep\` and targeted line reads over full-file dumps.
- **Scout Subagents:** When exploring >**${contextPolicy.subagentThresholdFiles}** files or parsing noisy logs, delegate to an isolated read-only subagent (if supported by your tool) and request a <250-word synthesis with exact file:line citations.
- **Session Handoff:** Track multi-session tasks in \`feature_list.json\` and \`HANDOFF.md\`.

## 4. Progressive Disclosure Map (Load Just-In-Time)
- Dual-mode project wizard & interview → \`${primarySkillDir}/harness-architect/SKILL.md\`
- Greenfield MVP & stack trade-off advisor → \`${primarySkillDir}/greenfield-advisor/SKILL.md\`
- Brownfield repo discovery & safe adoption → \`${primarySkillDir}/brownfield-onboarder/SKILL.md\`
- Testing depth vs. context token trade-offs → \`${primarySkillDir}/testing-tradeoffs/SKILL.md\`
- Context crisis playbooks & subagents → \`${primarySkillDir}/context-hygiene/SKILL.md\`
- Default-FAIL gates & circuit breaker → \`${primarySkillDir}/verification-loop/SKILL.md\`
- Recursive harness evolution (Harness² c1..c8) → \`${primarySkillDir}/recursive-refiner/SKILL.md\`

## 5. Hard Guardrails (Red Lines — Require Human Confirmation)
- NEVER push directly to \`main\`, deploy to production, or run destructive DB migrations without explicit \`Prepare -> Confirm\` human sign-off.
- NEVER delete failing test assertions, weaken types (\`any\` / \`@ts-ignore\`), or mark unverified tasks as \`verified\`.
`;
}

function buildClaudePointerMd() {
  return `# CLAUDE.md — Thin Pointer to Workspace Harness

Read and follow **\`AGENTS.md\`** at the repository root as the single source of truth for project stack, verification commands, progressive disclosure skills (\`.agents/skills/\` and \`.claude/skills/\`), context hygiene, and safety red lines.

## Quick Verification Commands
- Audit harness & context budget: \`node scripts/verify-harness.mjs\`
- See full operational map: \`AGENTS.md\`
`;
}

function buildCursorRuleMdc() {
  return `---
description: Core AI Agent Harness routing map and verification rules
globs: "**/*"
alwaysApply: true
---

Follow \`AGENTS.md\` at the repository root as the canonical source of truth for build/test verification loops, progressive disclosure skills (\`.agents/skills/\`), context budget limits, and safety red lines.
`;
}

function buildBlueprintFiles(recon, options = {}) {
  const testingProfile = TESTING_PROFILES[options.testing || 'smart-tiered'] || TESTING_PROFILES['smart-tiered'];
  const contextPolicy = CONTEXT_POLICIES[options.context || 'balanced'] || CONTEXT_POLICIES.balanced;
  const verifyCmd = recon.verificationCommands.test || 'node scripts/verify-harness.mjs';

  return {
    'docs/PROJECT_BRIEF.md': `# Project Brief & MVP Scope

## 1. Problem & Target Audience
- **Problem Statement:** [Describe the core problem this project solves]
- **Target Users:** [Primary user personas]
- **Core Value Proposition:** [Why this solution wins]

## 2. Measurable MVP Scope (In-Scope)
- [ ] Core Workflow 1: [End-to-end user journey]
- [ ] Deterministic verification loop wired into CI and \`AGENTS.md\`

## 3. Explicit Non-Goals (Out-of-Scope for v1)
- Premature microservices or unrequested third-party integrations
- Unverified features without acceptance criteria

## 4. Open Assumptions & Risks
- [List assumptions to validate with users]
`,
    'docs/ARCHITECTURE.md': `# Architecture & Boundaries

## 1. System Overview
- **Workspace Mode:** \`${recon.mode}\`
- **Detected / Selected Stack:** ${recon.detectedStack.join(', ') || 'Pending stack selection via `greenfield-advisor`'}
- **Key Directories:** ${recon.keyDirectories.join(', ') || 'src/, tests/, docs/, scripts/'}

## 2. Testing vs. Context Strategy
- **Selected Testing Profile:** \`${testingProfile.id}\` (${testingProfile.nameEn})
- **Context Policy:** \`${contextPolicy.id}\` (Max ${contextPolicy.maxRootLines} lines in \`AGENTS.md\`)
- **Repair Circuit Breaker:** Max ${testingProfile.maxRepairAttempts} automated retries before human escalation.

## 3. Security & Mutation Boundaries
- **Read-Only Operations:** Repo search, static analysis, \`agent-harness audit\`.
- **Confirmation-Gated Operations (\`Prepare -> Confirm\`):** Database schema migrations, production deployments, external API mutations, deleting test suites.
`,
    'docs/adr/0001-harness-and-testing-tradeoffs.md': `# ADR 0001: AI Agent Harness & Testing-vs-Context Trade-Off Decision

- **Status:** Accepted
- **Date:** ${new Date().toISOString().slice(0, 10)}

## Context
Unconstrained AI coding sessions suffer from context window pollution, silent regressions, and runaway token costs when running verbose test suites on every turn.

## Decision
1. Adopt **Progressive Disclosure** via a <${contextPolicy.maxRootLines}-line \`AGENTS.md\` routing map and modular \`.agents/skills/*/SKILL.md\` runbooks.
2. Use the **\`${testingProfile.id}\`** testing profile (${testingProfile.summaryEn}).
3. Enforce a **${testingProfile.maxRepairAttempts}-Strike Circuit Breaker** on failing tests and track multi-session progress in \`feature_list.json\`.

## Consequences
- **Positive:** Predictable per-turn token overhead and zero silent overwrites.
- **Trade-off:** ${testingProfile.contextImpact}; defect risk is ${testingProfile.defectRisk}.
`,
    'docs/ROADMAP.md': `# Delivery Roadmap & Milestones

## Milestone 1: Foundation & Harness Readiness
- **Goal:** Establish repository structure, deterministic verification command, and clean \`AGENTS.md\`.
- **Acceptance Criteria:** \`node scripts/verify-harness.mjs\` exits with code \`0\`.

## Milestone 2: Core MVP Vertical Slice
- **Goal:** Deliver the primary end-to-end user workflow with automated test coverage.
- **Acceptance Criteria:** All tasks in \`feature_list.json\` transition from \`pending\` to \`verified\` with recorded execution evidence.
`,
    'feature_list.json': JSON.stringify(
      {
        $schema: './docs/schemas/feature-list.schema.json',
        project: 'workspace-project',
        harnessVersion: KIT_VERSION,
        testingProfile: testingProfile.id,
        contextPolicy: contextPolicy.id,
        features: [
          {
            id: 'FEAT-001',
            title: 'Configure and verify workspace AI harness and context budget',
            status: 'pending',
            dependencies: [],
            verificationCommand: 'node scripts/verify-harness.mjs',
            verificationEvidence: null,
            nextAction: 'Run `node scripts/verify-harness.mjs` and record the passing output.',
          },
          {
            id: 'FEAT-002',
            title: 'Implement and verify primary MVP slice',
            status: 'pending',
            dependencies: ['FEAT-001'],
            verificationCommand: verifyCmd,
            verificationEvidence: null,
            nextAction: 'Scope acceptance criteria in docs/PROJECT_BRIEF.md and implement with tests.',
          },
        ],
      },
      null,
      2
    ) + '\n',
    'HANDOFF.md': `# Session Handoff Snapshot

- **Last Updated:** ${new Date().toISOString()}
- **Active Feature:** \`FEAT-001\` (Pending verification)
- **Testing Profile:** \`${testingProfile.id}\`
- **Context Policy:** \`${contextPolicy.id}\`

## Completed & Verified
- Initialized non-destructive AI Agent Harness files.

## Exact Next Step for Next Session
1. Read \`AGENTS.md\` and \`feature_list.json\`.
2. Run \`node scripts/verify-harness.mjs\` to verify harness integrity.
3. Begin \`FEAT-001\` / \`FEAT-002\` using the \`harness-architect\` skill.
`,
  };
}

/**
 * Installs or updates the AI Agent Harness in `targetDir` safely and non-destructively.
 * @param {string} targetDir
 * @param {{
 *   provider?: 'universal' | 'antigravity' | 'claude' | 'codex' | 'cursor',
 *   testing?: string,
 *   context?: string,
 *   blueprint?: boolean,
 *   dryRun?: boolean,
 *   force?: boolean,
 *   isUpdate?: boolean
 * }} [options]
 */
export function installHarness(targetDir, options = {}) {
  const resolvedRoot = resolve(targetDir);
  const providerId = options.provider || 'universal';
  const adapter = PLATFORM_ADAPTERS[providerId] || PLATFORM_ADAPTERS.universal;
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const includeBlueprint = Boolean(options.blueprint);

  const recon = inspectWorkspace(resolvedRoot);
  const previousManifest = loadManifest(resolvedRoot);
  const previousFiles = previousManifest?.managedFiles || {};

  // Build planned file map: relPath -> content
  const plannedFiles = new Map();

  // 1. Copy skills into adapter-designated skill directories
  const kitSkills = collectKitSkillFiles();
  for (const skillDir of adapter.skillDirs) {
    for (const item of kitSkills) {
      plannedFiles.set(`${skillDir}/${item.relFromSkills}`, item.content);
    }
  }

  // 2. Standalone verifier wrapper script in scripts/verify-harness.mjs
  const verifierScriptPath = join(KIT_ROOT, 'scripts', 'verify-harness.mjs');
  if (existsSync(verifierScriptPath)) {
    plannedFiles.set('scripts/verify-harness.mjs', readFileSync(verifierScriptPath, 'utf8'));
  }

  // 3. Root instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/00-harness-core.mdc`)
  if (adapter.rootFiles.includes('AGENTS.md')) {
    plannedFiles.set('AGENTS.md', buildAgentsMdContent(recon, options));
  }
  if (adapter.rootFiles.includes('CLAUDE.md')) {
    plannedFiles.set('CLAUDE.md', buildClaudePointerMd());
  }
  if (adapter.cursorRule) {
    plannedFiles.set(adapter.cursorRule, buildCursorRuleMdc());
  }

  // 4. Optional durable blueprint bundle (`docs/`, `feature_list.json`, `HANDOFF.md`)
  if (includeBlueprint) {
    const bp = buildBlueprintFiles(recon, options);
    for (const [relPath, content] of Object.entries(bp)) {
      plannedFiles.set(relPath, content);
    }
    const schemaSrcPath = join(KIT_ROOT, 'docs', 'schemas', 'feature-list.schema.json');
    if (existsSync(schemaSrcPath)) {
      plannedFiles.set('docs/schemas/feature-list.schema.json', readFileSync(schemaSrcPath, 'utf8'));
    }
  }

  const created = [];
  const updated = [];
  const skippedUnchanged = [];
  const skippedConflicts = [];
  const newManagedFiles = { ...previousFiles };

  for (const [relPath, content] of plannedFiles.entries()) {
    const fullDest = join(resolvedRoot, relPath);
    assertSafeTargetPath(resolvedRoot, fullDest, relPath);
    const nextHash = sha256(content);

    if (!existsSync(fullDest)) {
      created.push(relPath);
      newManagedFiles[relPath] = { sha256: nextHash, updatedAt: new Date().toISOString() };
      if (!dryRun) {
        mkdirSync(dirname(fullDest), { recursive: true });
        writeFileSync(fullDest, content, 'utf8');
      }
      continue;
    }

    const currentContent = readFileSync(fullDest, 'utf8');
    const currentHash = sha256(currentContent);

    if (currentHash === nextHash) {
      skippedUnchanged.push(relPath);
      newManagedFiles[relPath] = { sha256: nextHash, updatedAt: new Date().toISOString() };
      continue;
    }

    // Check if file was previously managed and unmodified by the user
    const prevEntry = previousFiles[relPath];
    const isUnmodifiedManagedFile = prevEntry && prevEntry.sha256 === currentHash;

    if (force || (options.isUpdate && isUnmodifiedManagedFile)) {
      updated.push(relPath);
      newManagedFiles[relPath] = { sha256: nextHash, updatedAt: new Date().toISOString() };
      if (!dryRun) {
        mkdirSync(dirname(fullDest), { recursive: true });
        writeFileSync(fullDest, content, 'utf8');
      }
    } else {
      // Non-destructive default: never overwrite user's customized file!
      skippedConflicts.push(relPath);
    }
  }

  // Write installation manifest (`.agents/harness-manifest.json`)
  const manifestData = {
    kitName: 'agent-harness-kit',
    kitVersion: KIT_VERSION,
    provider: adapter.id,
    testingProfile: options.testing || 'smart-tiered',
    contextPolicy: options.context || 'balanced',
    installedAt: previousManifest?.installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    managedFiles: newManagedFiles,
  };

  if (!dryRun) {
    const manifestFull = join(resolvedRoot, MANIFEST_REL_PATH);
    assertSafeTargetPath(resolvedRoot, manifestFull);
    mkdirSync(dirname(manifestFull), { recursive: true });
    writeFileSync(manifestFull, JSON.stringify(manifestData, null, 2) + '\n', 'utf8');
  }

  return {
    dryRun,
    force,
    provider: adapter.id,
    mode: recon.mode,
    testingProfile: manifestData.testingProfile,
    contextPolicy: manifestData.contextPolicy,
    created,
    updated,
    skippedUnchanged,
    skippedConflicts,
    manifestPath: MANIFEST_REL_PATH,
  };
}

/**
 * Safely uninstalls only unmodified files managed by `agent-harness-kit` (Fixes Issue #18).
 * @param {string} targetDir
 * @param {{ dryRun?: boolean }} [options]
 */
export function uninstallHarness(targetDir, options = {}) {
  const resolvedRoot = resolve(targetDir);
  const dryRun = Boolean(options.dryRun);
  const manifest = loadManifest(resolvedRoot);

  if (!manifest || !manifest.managedFiles) {
    return {
      dryRun,
      removed: [],
      preservedModified: [],
      missing: [],
      note: 'No .agents/harness-manifest.json found; nothing removed.',
    };
  }

  const removed = [];
  const preservedModified = [];
  const missing = [];

  for (const [relPath, meta] of Object.entries(manifest.managedFiles)) {
    const full = join(resolvedRoot, relPath);
    assertSafeTargetPath(resolvedRoot, full, relPath);
    if (!existsSync(full)) {
      missing.push(relPath);
      continue;
    }
    const lst = lstatSync(full);
    if (lst.isSymbolicLink()) {
      preservedModified.push(relPath);
      continue;
    }
    const currentHash = sha256(readFileSync(full, 'utf8'));
    if (currentHash === meta.sha256) {
      removed.push(relPath);
      if (!dryRun) {
        rmSync(full, { force: true });
      }
    } else {
      // User customized this file -> preserve it!
      preservedModified.push(relPath);
    }
  }

  if (!dryRun && preservedModified.length === 0) {
    const manifestFull = join(resolvedRoot, MANIFEST_REL_PATH);
    if (existsSync(manifestFull)) rmSync(manifestFull, { force: true });
  }

  return {
    dryRun,
    removed,
    preservedModified,
    missing,
  };
}
