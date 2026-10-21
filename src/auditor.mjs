/**
 * Strict Harness Verifier, Architecture-Drift Auditor & Token Budget Calculator
 * Fixes Issues #8, #9, #12, #14, #15, #16, #19
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateSkillMarkdown } from './yaml-validator.mjs';
import { CONTEXT_POLICIES, TESTING_PROFILES } from './profiles.mjs';
import { inspectWorkspace } from './detector.mjs';

const VALID_TASK_STATUSES = new Set([
  'pending',
  'in_progress',
  'blocked',
  'failed',
  'verified',
]);

const ALLOWED_LEDGER_TOP_KEYS = new Set([
  '$schema',
  'project',
  'harnessVersion',
  'mode',
  'testingProfile',
  'contextPolicy',
  'updatedAt',
  'features',
]);

const ALLOWED_FEATURE_ITEM_KEYS = new Set([
  'id',
  'title',
  'status',
  'dependencies',
  'verificationCommand',
  'verificationEvidence',
  'nextAction',
  'notes',
]);

/**
 * Valid PascalCase lifecycle hook events from Google Research Harness² (CODEX_SURFACE).
 */
export const VALID_HOOK_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'PreCompact',
  'PostCompact',
  'SessionStart',
  'SubagentStart',
  'SubagentStop',
  'UserPromptSubmit',
  'Stop',
]);

export const ALWAYS_ON_MAX_CHARS = 8000;

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Validates `.codex/hooks.json` or `.claude/hooks.json` schema (inspired by Google Research Harness² tree.py).
 */
export function validateHooksFile(relPath, rawJson, addFinding) {
  let doc;
  try {
    doc = JSON.parse(rawJson);
  } catch (e) {
    addFinding('error', 'HOOKS_INVALID_JSON', relPath, `${relPath} is not valid JSON: ${e.message}`);
    return;
  }
  const hooks = doc && typeof doc === 'object' ? doc.hooks : null;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks) || Object.keys(hooks).length === 0) {
    addFinding(
      'error',
      'HOOKS_SCHEMA_ERROR',
      relPath,
      `${relPath} needs a top-level {"hooks": {"<Event>": [...]}} object.`
    );
    return;
  }
  for (const [event, entries] of Object.entries(hooks)) {
    if (!VALID_HOOK_EVENTS.has(event)) {
      addFinding(
        'error',
        'HOOKS_UNKNOWN_EVENT',
        relPath,
        `${relPath}: unknown event "${event}". Expected PascalCase events: ${[...VALID_HOOK_EVENTS].join(', ')}.`
      );
      continue;
    }
    if (!Array.isArray(entries)) {
      addFinding('error', 'HOOKS_SCHEMA_ERROR', relPath, `${relPath}: "${event}" must map to a list of matcher entries.`);
      continue;
    }
    entries.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) {
        addFinding('error', 'HOOKS_SCHEMA_ERROR', relPath, `${relPath}: ${event}[${idx}] requires a "hooks" array.`);
        return;
      }
      for (const h of entry.hooks) {
        if (!h || typeof h !== 'object' || h.type !== 'command') {
          addFinding(
            'error',
            'HOOKS_UNSUPPORTED_TYPE',
            relPath,
            `${relPath}: ${event}[${idx}] hook type must be "command".`
          );
        } else if (!String(h.command || '').trim()) {
          addFinding('error', 'HOOKS_EMPTY_COMMAND', relPath, `${relPath}: ${event}[${idx}] has an empty "command".`);
        }
      }
    });
  }
}

/**
 * Audits and verifies the AI Agent Harness in `targetDir`.
 * @param {string} targetDir
 * @param {{ mode?: 'verify' | 'audit' | 'doctor', policy?: string, maxRootLines?: number }} [options]
 */
export function auditHarness(targetDir, options = {}) {
  const mode = options.mode || 'verify';
  const strict = mode === 'verify';
  const policyObj = CONTEXT_POLICIES[options.policy || 'balanced'] || CONTEXT_POLICIES.balanced;
  const maxRootLines = Number(options.maxRootLines || process.env.HARNESS_MAX_LINES || policyObj.maxRootLines);
  const maxSkillLines = Number(process.env.HARNESS_MAX_SKILL_LINES || policyObj.maxSkillLines);

  const findings = [];
  const addFinding = (severity, code, file, message, proposedFix = '') => {
    findings.push({ severity, code, file, message, proposedFix });
  };

  // 1. Check Root Instruction Files
  const rootCandidates = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];
  const presentRoots = [];
  let alwaysOnTokens = 0;

  for (const name of rootCandidates) {
    const full = join(targetDir, name);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/).length;
    const tokens = estimateTokens(content);
    alwaysOnTokens += tokens;
    presentRoots.push({ name, lines, tokens, content });

    if (lines > maxRootLines) {
      addFinding(
        'error',
        'ROOT_LINE_BUDGET_EXCEEDED',
        name,
        `${name} has ${lines} lines (~${tokens} tokens), exceeding budget of ${maxRootLines} lines.`,
        'Extract detailed procedures into on-demand .agents/skills/<name>/SKILL.md files.'
      );
    }

    if (content.length > ALWAYS_ON_MAX_CHARS) {
      addFinding(
        'error',
        'ALWAYS_ON_CHAR_CAP_EXCEEDED',
        name,
        `${name} is ${content.length} chars, exceeding the ${ALWAYS_ON_MAX_CHARS}-char Always-On cap (Google Research Harness² CODEX_SURFACE standard).`,
        `Trim ${name} under ${ALWAYS_ON_MAX_CHARS} chars so it does not compete with the agent's output budget or hit Codex's 32KB truncation.`
      );
    }

    // Check referenced local paths in root file (`-> path` or `→ path`)
    const arrowRefs = [...content.matchAll(/(?:->|→)\s*`?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`?/g)];
    for (const match of arrowRefs) {
      const refPath = match[1].trim();
      if (refPath.startsWith('http')) continue;
      if (!existsSync(join(targetDir, refPath))) {
        addFinding(
          'error',
          'BROKEN_REFERENCED_PATH',
          name,
          `${name} references "${refPath}", which does not exist on disk.`,
          `Create "${refPath}" or update the Progressive Disclosure Map in ${name}.`
        );
      }
    }

    // Check referenced npm scripts (`npm run <script>`) against package.json
    const pkgPath = join(targetDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const pkgScripts = pkg.scripts || {};
        const npmRunMatches = [...content.matchAll(/npm\s+run\s+([A-Za-z0-9:_-]+)/g)];
        for (const m of npmRunMatches) {
          const scriptName = m[1];
          if (!Object.prototype.hasOwnProperty.call(pkgScripts, scriptName)) {
            addFinding(
              'error',
              'MISSING_NPM_SCRIPT',
              name,
              `${name} instructs agents to run "npm run ${scriptName}", but "${scriptName}" is missing from package.json#scripts.`,
              `Add "${scriptName}" to package.json scripts or update the verification loop in ${name}.`
            );
          }
        }
      } catch {
        // Ignore malformed package.json here; detector flags it
      }
    }

    // Check for potential hardcoded secret patterns in root instructions (Issue #13)
    if (/(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/.test(content)) {
      addFinding(
        'error',
        'SECRET_IN_INSTRUCTIONS',
        name,
        `Potential raw API key or secret token detected inside ${name}.`,
        'Replace raw credentials with environment variable placeholders in .env.example.'
      );
    }
  }

  if (presentRoots.length === 0) {
    addFinding(
      strict ? 'error' : 'warning',
      'MISSING_ROOT_HARNESS',
      'AGENTS.md',
      'No root AGENTS.md or CLAUDE.md found in workspace.',
      'Run `agent-harness init` or invoke the `harness-architect` skill to generate a root map.'
    );
  }

  // 2. Discover and validate SKILL.md files
  const skillRoots = [
    join(targetDir, '.agents', 'skills'),
    join(targetDir, '.claude', 'skills'),
    join(targetDir, 'skills'),
  ];

  function collectSkills(dir) {
    if (!existsSync(dir)) return [];
    const list = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          const skillFile = join(full, 'SKILL.md');
          if (existsSync(skillFile)) list.push(skillFile);
        }
      } catch {}
    }
    return list;
  }

  const allSkillPaths = [...new Set(skillRoots.flatMap(collectSkills))];
  const validatedSkills = [];
  let onDemandTokensTotal = 0;
  let skillHeaderTokensTotal = 0;

  // Deduplicate by skill name when counting on-demand savings across .agents and .claude mirrors
  const uniqueSkillBodies = new Map();

  for (const skillPath of allSkillPaths) {
    const rel = relative(targetDir, skillPath).replaceAll('\\', '/');
    const content = readFileSync(skillPath, 'utf8');
    const lines = content.split(/\r?\n/).length;
    const tokens = estimateTokens(content);

    const validation = validateSkillMarkdown(content, { filePath: rel, checkDirName: true });
    for (const err of validation.errors) {
      addFinding('error', 'INVALID_SKILL_FRONTMATTER', rel, `Line ${err.line} (${err.field}): ${err.message}`, 'Fix YAML frontmatter in SKILL.md.');
    }
    for (const warn of validation.warnings) {
      addFinding('warning', 'SKILL_METADATA_WARNING', rel, `Line ${warn.line} (${warn.field}): ${warn.message}`);
    }

    if (lines > maxSkillLines) {
      addFinding(
        'warning',
        'SKILL_LINE_BUDGET_HIGH',
        rel,
        `${rel} has ${lines} lines (~${tokens} tokens), exceeding recommended ${maxSkillLines} lines.`,
        'Split large reference tables into a `references/` subfolder inside the skill directory.'
      );
    }

    const skillName = validation.data?.name || rel;
    const headerTokens = estimateTokens(`${validation.data?.name || ''}: ${validation.data?.description || ''}`);
    if (!uniqueSkillBodies.has(skillName)) {
      uniqueSkillBodies.set(skillName, tokens);
      onDemandTokensTotal += tokens;
      skillHeaderTokensTotal += headerTokens;
    }

    validatedSkills.push({
      path: rel,
      name: validation.data?.name || null,
      description: validation.data?.description || '',
      lines,
      tokens,
      valid: validation.valid,
    });
  }

  // 2b. Check Untriggered Skills ("Dead Weight" check from Google Research Harness² tree.py)
  if (presentRoots.length > 0) {
    const combinedAlwaysOn = presentRoots.map((r) => r.content).join('\n\n');
    const checkedSkillNames = new Set();
    for (const sk of validatedSkills) {
      if (!sk.name || checkedSkillNames.has(sk.name)) continue;
      checkedSkillNames.add(sk.name);
      if (!combinedAlwaysOn.includes(sk.name)) {
        addFinding(
          'warning',
          'UNTRIGGERED_SKILL',
          sk.path,
          `Skill "${sk.name}" is never named in the Always-On root text (AGENTS.md / CLAUDE.md) — an untriggered skill is dead weight (Google Research Harness² standard).`,
          `Add a trigger line naming "${sk.name}" to AGENTS.md or run \`agent-harness autotrigger .\`.`
        );
      }
    }
  }

  // 2c. Validate Hooks files if present (.codex/hooks.json, .claude/hooks.json)
  for (const hookRel of ['.codex/hooks.json', '.claude/hooks.json']) {
    const hookFull = join(targetDir, hookRel);
    if (existsSync(hookFull)) {
      validateHooksFile(hookRel, readFileSync(hookFull, 'utf8'), addFinding);
    }
  }

  // 3. Validate feature_list.json against canonical schema if present (Fixes Issue #15, #12, #23)
  const ledgerPath = join(targetDir, 'feature_list.json');
  if (existsSync(ledgerPath)) {
    try {
      const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
      if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
        addFinding('error', 'INVALID_FEATURE_LEDGER', 'feature_list.json', 'feature_list.json root must be a JSON object.');
      } else {
        for (const reqKey of ['project', 'testingProfile', 'contextPolicy', 'features']) {
          if (!Object.prototype.hasOwnProperty.call(ledger, reqKey)) {
            addFinding('error', 'SCHEMA_MISSING_REQUIRED', 'feature_list.json', `Missing required top-level field "${reqKey}" in feature_list.json.`);
          }
        }
        for (const key of Object.keys(ledger)) {
          if (!ALLOWED_LEDGER_TOP_KEYS.has(key)) {
            addFinding('error', 'SCHEMA_ADDITIONAL_PROPERTY', 'feature_list.json', `Unknown top-level property "${key}" in feature_list.json.`);
          }
        }
        if (ledger.testingProfile && !Object.prototype.hasOwnProperty.call(TESTING_PROFILES, ledger.testingProfile)) {
          addFinding('error', 'SCHEMA_INVALID_ENUM', 'feature_list.json', `Invalid testingProfile "${ledger.testingProfile}". Allowed: ${Object.keys(TESTING_PROFILES).join(', ')}.`);
        }
        if (ledger.contextPolicy && !Object.prototype.hasOwnProperty.call(CONTEXT_POLICIES, ledger.contextPolicy)) {
          addFinding('error', 'SCHEMA_INVALID_ENUM', 'feature_list.json', `Invalid contextPolicy "${ledger.contextPolicy}". Allowed: ${Object.keys(CONTEXT_POLICIES).join(', ')}.`);
        }
        if (typeof ledger.$schema === 'string' && ledger.$schema.startsWith('.')) {
          const schemaPath = join(targetDir, ledger.$schema);
          if (!existsSync(schemaPath)) {
            addFinding('error', 'MISSING_REFERENCED_SCHEMA', 'feature_list.json', `Referenced local $schema "${ledger.$schema}" does not exist on disk.`);
          }
        }
        if (!Array.isArray(ledger.features) || ledger.features.length === 0) {
          addFinding('error', 'INVALID_FEATURE_LEDGER', 'feature_list.json', '`features` must be a non-empty array in feature_list.json.');
        } else {
          for (const feat of ledger.features) {
            if (!feat || typeof feat !== 'object' || Array.isArray(feat)) {
              addFinding('error', 'INVALID_FEATURE_ITEM', 'feature_list.json', 'Each feature entry must be an object.');
              continue;
            }
            for (const fKey of Object.keys(feat)) {
              if (!ALLOWED_FEATURE_ITEM_KEYS.has(fKey)) {
                addFinding('error', 'SCHEMA_ADDITIONAL_PROPERTY', 'feature_list.json', `Feature "${feat.id || '?'}" has disallowed property "${fKey}".`);
              }
            }
            if (!feat.id || !feat.title || !feat.status) {
              addFinding(
                'error',
                'INVALID_FEATURE_ITEM',
                'feature_list.json',
                `Feature entry "${feat.id || '?'}" is missing required fields (id, title, status).`
              );
              continue;
            }
            if (!feat.verificationCommand) {
              addFinding(
                'error',
                'SCHEMA_MISSING_REQUIRED',
                'feature_list.json',
                `Feature "${feat.id}" is missing required field "verificationCommand".`
              );
            }
            if (!VALID_TASK_STATUSES.has(feat.status)) {
              addFinding(
                'error',
                'INVALID_FEATURE_STATUS',
                'feature_list.json',
                `Feature "${feat.id}" has invalid status "${feat.status}". Allowed: ${[...VALID_TASK_STATUSES].join(', ')}.`,
                'Use "pending" for unstarted work and "verified" only when backed by test evidence.'
              );
            }
            if (feat.status === 'verified' && !feat.verificationEvidence) {
              addFinding(
                'error',
                'UNPROVEN_VERIFIED_TASK',
                'feature_list.json',
                `Feature "${feat.id}" is marked "verified" without "verificationEvidence" (Default-FAIL violation).`,
                'Run the verification command and record the exit code/evidence, or set status to "pending".'
              );
            }
          }
        }
      }
    } catch (e) {
      addFinding('error', 'MALFORMED_FEATURE_LEDGER', 'feature_list.json', `Invalid JSON in feature_list.json: ${e.message}`);
    }
  }

  // 4. Include architecture drift findings in `audit` mode (Issue #19)
  let reconnaissance = null;
  if (mode === 'audit') {
    reconnaissance = inspectWorkspace(targetDir);
    for (const drift of reconnaissance.risksAndDrift) {
      if (!findings.some((f) => f.code === drift.code)) {
        addFinding(
          drift.severity === 'high' ? 'error' : 'warning',
          drift.code,
          drift.evidencePath,
          drift.message,
          drift.proposedFix
        );
      }
    }
  }

  // 5. Calculate Deterministic Token Budget Metrics (Fixes Issue #14 & #16)
  const alwaysOnPerTurn = alwaysOnTokens + skillHeaderTokensTotal;
  const monolithicPerTurn = alwaysOnTokens + onDemandTokensTotal;
  const savedPerTurn = Math.max(0, monolithicPerTurn - alwaysOnPerTurn);
  const savedOver25Turns = savedPerTurn * 25;

  const errorsCount = findings.filter((f) => f.severity === 'error').length;
  const warningsCount = findings.filter((f) => f.severity === 'warning').length;

  return {
    passed: errorsCount === 0,
    mode,
    policy: policyObj.id,
    maxRootLines,
    maxSkillLines,
    errorsCount,
    warningsCount,
    rootFiles: presentRoots.map(({ name, lines, tokens }) => ({ name, lines, tokens })),
    skills: validatedSkills,
    tokenMetrics: {
      note: 'Character-based approximation (~4 chars/token). Measures static instruction overhead, excluding dynamic subagent or tool outputs.',
      alwaysOnTokensPerTurn: alwaysOnPerTurn,
      onDemandSkillsTokensOffloaded: onDemandTokensTotal,
      monolithicEquivalentPerTurn: monolithicPerTurn,
      estimatedSavingsPerTurnTokens: savedPerTurn,
      estimatedSavings25TurnSessionTokens: savedOver25Turns,
    },
    findings,
    reconnaissance,
  };
}

/**
 * Automatically repairs untriggered skills by appending trigger pointers to AGENTS.md,
 * respecting the 8,000-character Always-On cap (ported from Google Research Harness² `autotrigger()`).
 */
export function autotriggerSkills(targetDir) {
  const agentsPath = join(targetDir, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    return { updated: false, repairedSkills: [], reason: 'No AGENTS.md found in workspace.' };
  }
  let body = readFileSync(agentsPath, 'utf8');
  const audit = auditHarness(targetDir, { mode: 'audit' });
  const repairedSkills = [];
  const seen = new Set();

  for (const sk of audit.skills) {
    if (!sk.name || seen.has(sk.name)) continue;
    seen.add(sk.name);
    if (body.includes(sk.name)) continue;

    const shortDesc = (sk.description || `the ${sk.name} workflow applies`).split('.')[0].trim();
    const line = `- ${shortDesc} → \`${sk.path}\`\n`;
    if (body.length + line.length + 2 > ALWAYS_ON_MAX_CHARS) {
      continue;
    }
    body = `${body.trimEnd()}\n${line}`;
    repairedSkills.push(sk.name);
  }

  if (repairedSkills.length > 0) {
    writeFileSync(agentsPath, `${body.trimEnd()}\n`, 'utf8');
  }
  return { updated: repairedSkills.length > 0, repairedSkills };
}
