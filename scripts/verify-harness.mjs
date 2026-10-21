#!/usr/bin/env node
/**
 * Standalone Zero-Dependency Context Budget & Harness Verifier (`scripts/verify-harness.mjs`)
 * Can run both inside `agent-harness-kit` and standalone when copied into any target repository.
 *
 * Fixes Issues #8, #9, #12, #14, #15:
 * - Strict mode by default (`--doctor` for warn-only mode). Fails if no root AGENTS.md/CLAUDE.md exists!
 * - Real YAML frontmatter parser & Agent Skills schema validator (no fragile regex).
 * - Verifies that local paths and `npm run <script>` commands referenced in AGENTS.md exist.
 * - Verifies `feature_list.json` statuses and Default-FAIL `verificationEvidence`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { validateFeatureLedger } from './feature-ledger-schema.mjs';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const isDoctor = args.includes('--doctor');
const isJson = args.includes('--json');
const MAX_ROOT_LINES = positiveLimit(process.env.HARNESS_MAX_LINES ?? 80, 'HARNESS_MAX_LINES');
const MAX_SKILL_LINES = positiveLimit(process.env.HARNESS_MAX_SKILL_LINES ?? 260, 'HARNESS_MAX_SKILL_LINES');
const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function positiveLimit(value, name) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error(`${name} must be a positive safe integer.`);
  return limit;
}

function estimateTokens(text) {
  return text ? Math.ceil(text.length / 4) : 0;
}

function validateSkillYaml(markdown, filePath) {
  const errors = [];
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { valid: false, data: {}, errors: ['Missing opening YAML frontmatter delimiter (`---`) on line 1.'] };
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { valid: false, data: {}, errors: ['Missing closing YAML frontmatter delimiter (`---`).'] };
  }

  const yamlLines = lines.slice(1, closeIdx);
  const body = lines.slice(closeIdx + 1).join('\n');
  const data = {};
  let i = 0;

  while (i < yamlLines.length) {
    const raw = yamlLines[i];
    const lineNum = i + 2;
    if (!raw.trim() || raw.trim().startsWith('#')) {
      i++;
      continue;
    }
    if (raw.includes('\t')) {
      errors.push(`Line ${lineNum}: Tabs are not allowed in YAML frontmatter.`);
      i++;
      continue;
    }
    const m = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) {
      errors.push(`Line ${lineNum}: Invalid YAML key-value syntax "${raw.trim()}".`);
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2].trim();
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push(`Line ${lineNum}: Duplicate YAML key "${key}".`);
      i++;
      continue;
    }
    if (rest === '>-' || rest === '>' || rest === '|-' || rest === '|') {
      const chunks = [];
      i++;
      while (i < yamlLines.length) {
        const nxt = yamlLines[i];
        if (!nxt.trim()) {
          chunks.push('');
          i++;
          continue;
        }
        const ind = nxt.match(/^(\s+)(.*)$/);
        if (!ind) break;
        chunks.push(ind[2].trim());
        i++;
      }
      data[key] = chunks.join(' ').trim();
      continue;
    }
    if (rest === '') {
      const list = [];
      const textParts = [];
      i++;
      while (i < yamlLines.length) {
        const nxt = yamlLines[i];
        if (!nxt.trim() || nxt.trim().startsWith('#')) {
          i++;
          continue;
        }
        const lm = nxt.match(/^\s*-\s+(.*)$/);
        if (lm) {
          list.push(lm[1].trim());
          i++;
          continue;
        }
        const ind = nxt.match(/^(\s+)(.*)$/);
        if (ind && list.length === 0) {
          textParts.push(ind[2].trim());
          i++;
          continue;
        }
        break;
      }
      data[key] = list.length > 0 ? list : textParts.join(' ');
      continue;
    }
    if ((rest.startsWith('"') && !rest.endsWith('"')) || (rest.startsWith("'") && !rest.endsWith("'"))) {
      errors.push(`Line ${lineNum}: Unclosed quote for key "${key}".`);
    }
    const unquoted =
      (rest.startsWith('"') && rest.endsWith('"')) || (rest.startsWith("'") && rest.endsWith("'"))
        ? rest.slice(1, -1)
        : rest;
    const parts = [unquoted];
    i++;
    while (i < yamlLines.length) {
      const nxt = yamlLines[i];
      if (!nxt.trim()) break;
      const ind = nxt.match(/^(\s+)(?!-\s)(.*)$/);
      if (!ind) break;
      parts.push(ind[2].trim());
      i++;
    }
    data[key] = parts.join(' ');
  }

  if (typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('Missing or empty required string field `name`.');
  } else if (!SKILL_NAME_REGEX.test(data.name.trim())) {
    errors.push(`Skill name "${data.name}" must be kebab-case alphanumeric ([a-z0-9-]+).`);
  }

  if (typeof data.description !== 'string' || !data.description.trim()) {
    errors.push('Missing or empty required string field `description`.');
  }

  if (!body.trim()) {
    errors.push('Skill markdown body after frontmatter cannot be empty.');
  }

  return { valid: errors.length === 0, data, errors };
}

const findings = [];
let alwaysOnTokens = 0;

// 1. Validate Root Files
const rootFiles = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];
let foundAnyRoot = false;

for (const file of rootFiles) {
  const fullPath = join(rootDir, file);
  if (!existsSync(fullPath)) continue;
  foundAnyRoot = true;

  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split(/\r?\n/).length;
  const tokens = estimateTokens(content);
  alwaysOnTokens += tokens;

  if (lines > MAX_ROOT_LINES) {
    findings.push({
      severity: 'error',
      file,
      message: `${lines} lines (~${tokens} tokens) exceeds budget of ${MAX_ROOT_LINES} lines. Move details to SKILL.md.`,
    });
  } else if (!isJson) {
    console.log(`[PASS] ${file}: ${lines} lines / ${MAX_ROOT_LINES} max (~${tokens} always-on tokens)`);
  }

  // Check referenced local paths (`-> path` or `→ path`)
  const refs = [...content.matchAll(/(?:->|→)\s*`?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`?/g)];
  for (const m of refs) {
    const refPath = m[1].trim();
    if (!refPath.startsWith('http') && !existsSync(join(rootDir, refPath))) {
      findings.push({
        severity: 'error',
        file,
        message: `Referenced path "${refPath}" does not exist on disk.`,
      });
    }
  }

  // Check referenced npm scripts (`npm run <script>`)
  const pkgPath = join(rootDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const scripts = pkg.scripts || {};
      for (const m of content.matchAll(/npm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
        if (!Object.prototype.hasOwnProperty.call(scripts, m[1])) {
          findings.push({
            severity: 'error',
            file,
            message: `Referenced command "npm run ${m[1]}" does not exist in package.json#scripts.`,
          });
        }
      }
    } catch {}
  }
}

if (!foundAnyRoot) {
  findings.push({
    severity: isDoctor ? 'warning' : 'error',
    file: 'AGENTS.md',
    message: 'No root AGENTS.md or CLAUDE.md found. Run `agent-harness init` or the `harness-architect` skill.',
  });
}

// 2. Validate SKILL.md files
const skillRoots = [
  join(rootDir, '.agents', 'skills'),
  join(rootDir, '.claude', 'skills'),
  join(rootDir, 'skills'),
];

function findSkillFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        const candidate = join(full, 'SKILL.md');
        if (existsSync(candidate)) results.push(candidate);
      }
    } catch {}
  }
  return results;
}

const allSkillFiles = [...new Set(skillRoots.flatMap(findSkillFiles))];
let onDemandTokens = 0;
const seenSkills = new Set();

for (const skillPath of allSkillFiles) {
  const rel = relative(rootDir, skillPath).replaceAll('\\', '/');
  const content = readFileSync(skillPath, 'utf8');
  const lines = content.split(/\r?\n/).length;
  const tokens = estimateTokens(content);
  const res = validateSkillYaml(content, rel);

  const skillKey = res.data?.name || rel;
  if (!seenSkills.has(skillKey)) {
    seenSkills.add(skillKey);
    onDemandTokens += tokens;
  }

  if (!res.valid) {
    for (const err of res.errors) {
      findings.push({ severity: 'error', file: rel, message: err });
    }
    continue;
  }

  if (lines > MAX_SKILL_LINES) {
    findings.push({
      severity: 'warning',
      file: rel,
      message: `${lines} lines (~${tokens} tokens) exceeds recommended ${MAX_SKILL_LINES} lines.`,
    });
  } else if (!isJson) {
    console.log(`[PASS] ${rel}: ${lines} lines (~${tokens} on-demand tokens)`);
  }
}

// 3. Validate feature_list.json if present
const ledgerPath = join(rootDir, 'feature_list.json');
if (existsSync(ledgerPath)) {
  try {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    for (const error of validateFeatureLedger(ledger)) {
      findings.push({ severity: 'error', file: 'feature_list.json', message: error.message });
    }
    for (const f of Array.isArray(ledger?.features) ? ledger.features : []) {
      if (f?.status === 'verified' && !f.verificationEvidence) {
        findings.push({
          severity: 'error',
          file: 'feature_list.json',
          message: `Task "${f.id}" is marked "verified" without verificationEvidence (Default-FAIL violation).`,
        });
      }
    }
  } catch (e) {
    findings.push({ severity: 'error', file: 'feature_list.json', message: `Malformed JSON: ${e.message}` });
  }
}

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

if (isJson) {
  console.log(
    JSON.stringify(
      {
        passed: errors.length === 0,
        errorsCount: errors.length,
        warningsCount: warnings.length,
        alwaysOnTokens,
        onDemandTokens,
        findings,
      },
      null,
      2
    )
  );
  process.exit(errors.length === 0 ? 0 : 1);
}

for (const f of findings) {
  const fn = f.severity === 'error' ? console.error : console.warn;
  fn(`[${f.severity === 'error' ? 'FAIL' : 'WARN'}] ${f.file}: ${f.message}`);
}

console.log('----------------------------------------------------------');
if (errors.length > 0) {
  console.error(`RESULT: FAILED with ${errors.length} error(s) and ${warnings.length} warning(s).`);
  process.exit(1);
} else {
  console.log(
    `RESULT: PASSED (${allSkillFiles.length} skill file(s) verified, ~${alwaysOnTokens} always-on tokens, ~${onDemandTokens} offloaded tokens).`
  );
}
