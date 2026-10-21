import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeText } from './fs-safe.mjs';

export const KIT_VERSION = '3.0.0';
export const SPEC_PATH = '.harness/spec.json';
export const LOCK_PATH = '.harness/lock.json';
export const SPEC_SCHEMA_URL = 'https://raw.githubusercontent.com/RolePlayingTech/agent-harness-kit/main/schema/spec.schema.json';
export const DEFAULT_CLI = 'npx github:RolePlayingTech/agent-harness-kit';

export const AGENTS = {
  codex: { label: 'OpenAI Codex', reads: 'AGENTS.md and .agents/skills/' },
  claude: { label: 'Claude Code', reads: 'CLAUDE.md (which imports AGENTS.md) and .claude/skills/' },
  cursor: { label: 'Cursor', reads: 'AGENTS.md, .agents/skills/ and, for compatibility, .claude/skills/' },
  other: { label: 'Another AGENTS.md-compatible tool', reads: 'AGENTS.md; skills in .agents/skills/ if the tool supports Agent Skills' },
};

export const RIGOR = {
  light: 'Fast check before reporting done; full suite only on request or before a release.',
  standard: 'Fast check while working; full suite once before reporting done; tests for changed behavior.',
  strict: 'Standard, plus a failing test before behavior fixes and an independent review of risky diffs.',
};

export const MEMORY = {
  none: 'Nothing persists between sessions except the code and git history.',
  decisions: 'A decision log the agent reads before architectural changes and appends to.',
  handoff: 'Decision log plus a session handoff note for work that spans several sessions.',
};

export const APPROVALS = {
  push: 'Pushing, merging or force-pushing to shared branches',
  deploy: 'Deploying, releasing or publishing',
  destructive: 'Deleting files, data or branches beyond what the task requires',
  dependencies: 'Adding, removing or upgrading dependencies',
  migrations: 'Creating, editing or running database migrations',
  secrets: 'Reading, printing or editing secrets files',
  ci: 'Changing CI/CD workflows',
  infra: 'Changing infrastructure or deployment configuration',
  payments: 'Changing payments code',
  auth: 'Changing authentication or authorization code',
};

export const RISK_AREAS = ['payments', 'auth'];

export const OVERRIDABLE_MODULES = ['verify-change', 'quiet-output', 'exploration', 'workspace-scope', 'risk-areas', 'harness-maintenance'];

function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function pickCommand(list) {
  if (!list.length) return null;
  const detected = list.filter((c) => c.confidence === 'detected');
  return (detected.length ? detected : list.slice(0, 1)).map((c) => c.cmd).join(' && ');
}

/** Values the interview proposes when the user gives no answer. */
export function defaultAnswers(scan) {
  const hinted = [...new Set(scan.agentHints.map((h) => h.agent))];
  // Payments and auth code is edited routinely in apps that have it; asking every time is too heavy
  // as a default. They get a lighter "risk area" rule instead, and can be added as approvals deliberately.
  const detectedApprovals = scan.sensitive.map((s) => s.id).filter((id) => id in APPROVALS && !RISK_AREAS.includes(id));
  const approvals = ['push', 'deploy', 'destructive', ...(scan.stage === 'existing' ? ['dependencies'] : []), ...detectedApprovals];
  return {
    name: scan.project.name,
    summary: scan.project.description || '',
    stack: scan.stack,
    agents: hinted,
    rigor: scan.stage === 'new' ? 'light' : 'standard',
    fast: pickCommand(scan.commands.fast),
    full: pickCommand(scan.commands.full),
    e2e: pickCommand(scan.commands.e2e),
    memory: 'decisions',
    approvals: [...new Set(approvals)],
    rules: [],
  };
}

/** Normalizes raw answers (CLI flags, answers file or interview) into typed values. */
export function normalizeAnswers(raw = {}) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    // PowerShell turns an unquoted `agents=codex,claude` into the single argument "agents=codex claude".
    if (key === 'agents') out[key] = splitList(typeof value === 'string' ? value.replace(/\s+/g, ',') : value);
    else if (['approvals', 'stack'].includes(key)) out[key] = splitList(value);
    else if (key === 'rules') out[key] = Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean) : splitList(String(value).replaceAll('|', ','));
    else if (['fast', 'full', 'e2e'].includes(key)) out[key] = value === null || String(value).trim() === '' || String(value).trim() === 'none' ? null : String(value).trim();
    else if (key === 'overrides') out[key] = value;
    else out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

export const ANSWER_KEYS = ['name', 'summary', 'stack', 'agents', 'rigor', 'fast', 'full', 'e2e', 'memory', 'approvals', 'rules', 'overrides'];

/**
 * Builds a spec from the scan, the defaults and the user's answers.
 * An existing spec supplies previous decisions so re-running design only changes what the user changes.
 */
export function buildSpec(scan, answers = {}, previous = null) {
  const prior = previous ? answersFromSpec(previous) : {};
  const a = { ...defaultAnswers(scan), ...prior, ...normalizeAnswers(answers) };
  const sensitive = Object.fromEntries(scan.sensitive.map((s) => [s.id, s.paths.length ? s.paths : (s.deps || [])]));
  return {
    $schema: SPEC_SCHEMA_URL,
    specVersion: 1,
    project: {
      name: a.name,
      summary: a.summary,
      stage: scan.stage,
      stack: a.stack,
      layout: previous?.project?.layout ?? scan.layout,
      packageManager: scan.packageManager,
      testFrameworks: scan.testFrameworks,
      workspaces: scan.workspaces.map((w) => w.path),
      sourceFiles: scan.size.sourceFiles,
      sensitive,
    },
    agents: a.agents,
    verification: { rigor: a.rigor, fast: a.fast, full: a.full, e2e: a.e2e },
    memory: a.memory,
    approvals: a.approvals,
    rules: a.rules,
    overrides: a.overrides || previous?.overrides || {},
    tooling: { cli: previous?.tooling?.cli || DEFAULT_CLI },
    budget: { alwaysOnLines: previous?.budget?.alwaysOnLines || 200 },
  };
}

export function answersFromSpec(spec) {
  return {
    name: spec.project?.name,
    summary: spec.project?.summary,
    stack: spec.project?.stack,
    agents: spec.agents,
    rigor: spec.verification?.rigor,
    fast: spec.verification?.fast,
    full: spec.verification?.full,
    e2e: spec.verification?.e2e,
    memory: spec.memory,
    approvals: spec.approvals,
    rules: spec.rules,
    overrides: spec.overrides,
  };
}

export function validateSpec(spec) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  const isStr = (v) => typeof v === 'string';
  const isStrArray = (v) => Array.isArray(v) && v.every(isStr);
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return [{ path: '', message: 'Spec must be a JSON object.' }];
  if (spec.specVersion !== 1) err('specVersion', 'Must be 1.');
  const p = spec.project;
  if (!p || typeof p !== 'object') err('project', 'Required object.');
  else {
    if (!isStr(p.name) || !p.name.trim()) err('project.name', 'Required non-empty string.');
    if (!isStr(p.summary)) err('project.summary', 'Required string (may be empty, but a one-sentence purpose helps every session).');
    if (!['new', 'existing'].includes(p.stage)) err('project.stage', 'Must be "new" or "existing".');
    if (!isStrArray(p.stack)) err('project.stack', 'Must be an array of strings.');
    if (!Array.isArray(p.layout) || !p.layout.every((l) => l && isStr(l.path) && isStr(l.purpose))) err('project.layout', 'Must be an array of { path, purpose } strings.');
    if (p.workspaces !== undefined && !isStrArray(p.workspaces)) err('project.workspaces', 'Must be an array of strings.');
    if (p.testFrameworks !== undefined && !isStrArray(p.testFrameworks)) err('project.testFrameworks', 'Must be an array of strings.');
    if (p.sourceFiles !== undefined && !Number.isInteger(p.sourceFiles)) err('project.sourceFiles', 'Must be an integer.');
    if (p.sensitive !== undefined && (typeof p.sensitive !== 'object' || Array.isArray(p.sensitive) || !Object.values(p.sensitive).every(isStrArray))) err('project.sensitive', 'Must map ids to arrays of strings.');
  }
  if (!isStrArray(spec.agents) || !spec.agents.length) err('agents', `Choose at least one of: ${Object.keys(AGENTS).join(', ')}.`);
  else for (const a of spec.agents) if (!(a in AGENTS)) err('agents', `Unknown agent "${a}". Allowed: ${Object.keys(AGENTS).join(', ')}.`);
  const v = spec.verification;
  if (!v || typeof v !== 'object') err('verification', 'Required object.');
  else {
    if (!(v.rigor in RIGOR)) err('verification.rigor', `Must be one of: ${Object.keys(RIGOR).join(', ')}.`);
    for (const k of ['fast', 'full', 'e2e']) if (v[k] !== null && v[k] !== undefined && (!isStr(v[k]) || !v[k].trim() || /[\r\n]/.test(v[k]))) err(`verification.${k}`, 'Must be null or a single-line command.');
  }
  if (!(spec.memory in MEMORY)) err('memory', `Must be one of: ${Object.keys(MEMORY).join(', ')}.`);
  if (!isStrArray(spec.approvals)) err('approvals', 'Must be an array of approval ids or custom sentences.');
  if (!isStrArray(spec.rules)) err('rules', 'Must be an array of strings.');
  else spec.rules.forEach((r, i) => { if (/[\r\n]/.test(r)) err(`rules[${i}]`, 'Each rule must be a single line.'); });
  if (spec.overrides !== undefined) {
    if (!spec.overrides || typeof spec.overrides !== 'object' || Array.isArray(spec.overrides)) err('overrides', 'Must be an object.');
    else for (const [k, val] of Object.entries(spec.overrides)) {
      if (!OVERRIDABLE_MODULES.includes(k)) err(`overrides.${k}`, `Not overridable. Allowed: ${OVERRIDABLE_MODULES.join(', ')}.`);
      if (typeof val !== 'boolean') err(`overrides.${k}`, 'Must be true or false.');
    }
  }
  if (spec.tooling !== undefined && (!spec.tooling || !isStr(spec.tooling.cli) || !spec.tooling.cli.trim())) err('tooling.cli', 'Must be a non-empty string.');
  if (spec.budget !== undefined && (!spec.budget || !Number.isInteger(spec.budget.alwaysOnLines) || spec.budget.alwaysOnLines < 20)) err('budget.alwaysOnLines', 'Must be an integer >= 20.');
  return errors;
}

export function loadSpec(root) {
  const path = join(root, SPEC_PATH);
  if (!existsSync(path)) return { spec: null, errors: [{ path: SPEC_PATH, message: 'Not found. Run `agent-harness design` first.' }] };
  let spec;
  try { spec = JSON.parse(normalizeText(readFileSync(path, 'utf8'))); } catch (error) {
    return { spec: null, errors: [{ path: SPEC_PATH, message: `Invalid JSON: ${error.message}` }] };
  }
  return { spec, errors: validateSpec(spec) };
}

export function serializeSpec(spec) {
  return JSON.stringify(spec, null, 2) + '\n';
}
