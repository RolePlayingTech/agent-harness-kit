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
  const detectedApprovals = scan.sensitive.map((s) => s.id).filter((id) => Object.hasOwn(APPROVALS, id) && !RISK_AREAS.includes(id));
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
    else if (key === 'approvals' && typeof value === 'string' && !value.includes(',') && value.trim().split(/\s+/).every((w) => Object.hasOwn(APPROVALS, w))) {
      out[key] = value.trim().split(/\s+/);
    } else if (['approvals', 'stack'].includes(key)) out[key] = splitList(value);
    else if (key === 'rules') out[key] = Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean) : splitList(String(value).replaceAll('|', ','));
    else if (['fast', 'full', 'e2e'].includes(key)) out[key] = value === null || String(value).trim() === '' || String(value).trim() === 'none' ? null : String(value).trim();
    else if (key === 'overrides') out[key] = value;
    else out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

export const ANSWER_KEYS = ['name', 'summary', 'stack', 'agents', 'rigor', 'fast', 'full', 'e2e', 'memory', 'approvals', 'rules', 'overrides'];

/**
 * The layout is a fact refreshed by every scan. Entries from the previous spec stay (with their
 * possibly hand-written purpose) while the directory exists; directories found since are added.
 */
function mergeLayout(scan, previousLayout) {
  if (!Array.isArray(previousLayout)) return scan.layout;
  const stillThere = (path) => scan.layout.some((l) => l.path === path) || !scan.root || existsSync(join(scan.root, path));
  const kept = previousLayout.filter((l) => stillThere(l.path));
  const keptPaths = new Set(kept.map((l) => l.path));
  return [...kept, ...scan.layout.filter((l) => !keptPaths.has(l.path))];
}

/**
 * Builds a spec from the scan, the defaults and the user's answers.
 * An existing spec supplies previous decisions so re-running design only changes what the user changes.
 */
export function buildSpec(scan, answers = {}, previous = null) {
  const prior = previous ? answersFromSpec(previous) : {};
  const given = normalizeAnswers(answers);
  const a = { ...defaultAnswers(scan), ...prior, ...given };
  const sensitive = Object.fromEntries(scan.sensitive.map((s) => [s.id, s.paths.length ? s.paths : (s.deps || [])]));
  if (previous && given.approvals === undefined) {
    // Areas that appeared since the last design get the default treatment; earlier choices stay.
    const known = previous.project?.sensitive || {};
    const appeared = Object.keys(sensitive).filter((id) => !Object.hasOwn(known, id) && Object.hasOwn(APPROVALS, id) && !RISK_AREAS.includes(id));
    a.approvals = [...new Set([...a.approvals, ...appeared])];
  }
  return {
    $schema: SPEC_SCHEMA_URL,
    specVersion: 1,
    project: {
      name: a.name,
      summary: a.summary,
      stage: scan.stage,
      stack: a.stack,
      layout: mergeLayout(scan, previous?.project?.layout),
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

/**
 * Field names each object in the spec may contain. Unknown fields are errors, so a typo such as
 * "aproval" is reported instead of silently ignored. schema/spec.schema.json mirrors these rules;
 * tests/spec.test.mjs keeps the two in step.
 */
export const SPEC_FIELDS = {
  '': ['$schema', 'specVersion', 'project', 'agents', 'verification', 'memory', 'approvals', 'rules', 'overrides', 'tooling', 'budget'],
  project: ['name', 'summary', 'stage', 'stack', 'layout', 'packageManager', 'testFrameworks', 'workspaces', 'sourceFiles', 'sensitive'],
  'project.layout[]': ['path', 'purpose'],
  verification: ['rigor', 'fast', 'full', 'e2e'],
  tooling: ['cli'],
  budget: ['alwaysOnLines'],
};
export const STAGES = ['new', 'existing'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const oneLine = (v) => isStr(v) && !/[\r\n]/.test(v);
const filledLine = (v) => oneLine(v) && v.trim() !== '';
const isKey = (table, v) => isStr(v) && Object.hasOwn(table, v);

export function validateSpec(spec) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  const fields = (obj, at) => {
    for (const k of Object.keys(obj)) {
      if (!SPEC_FIELDS[at].includes(k)) err(at ? `${at.replace('[]', '')}.${k}` : k, `Unknown field. Allowed: ${SPEC_FIELDS[at].join(', ')}.`);
    }
  };
  const lines = (v, path, { filled = true } = {}) => {
    if (!Array.isArray(v)) return err(path, 'Must be an array of strings.');
    v.forEach((item, i) => { if (!(filled ? filledLine(item) : oneLine(item))) err(`${path}[${i}]`, `Must be a ${filled ? 'non-empty ' : ''}single-line string.`); });
  };

  if (!isObj(spec)) return [{ path: '', message: 'Spec must be a JSON object.' }];
  fields(spec, '');
  if (spec.$schema !== undefined && !isStr(spec.$schema)) err('$schema', 'Must be a string.');
  if (spec.specVersion !== 1) err('specVersion', 'Must be 1.');

  const p = spec.project;
  if (!isObj(p)) err('project', 'Required object.');
  else {
    fields(p, 'project');
    if (!filledLine(p.name)) err('project.name', 'Required non-empty single-line string.');
    if (!oneLine(p.summary)) err('project.summary', 'Required single-line string (may be empty, but a one-sentence purpose helps every session).');
    if (!STAGES.includes(p.stage)) err('project.stage', `Must be one of: ${STAGES.join(', ')}.`);
    lines(p.stack, 'project.stack');
    if (!Array.isArray(p.layout)) err('project.layout', 'Must be an array of { path, purpose }.');
    else p.layout.forEach((l, i) => {
      if (!isObj(l)) return err(`project.layout[${i}]`, 'Must be an object { path, purpose }.');
      fields(l, 'project.layout[]');
      if (!filledLine(l.path)) err(`project.layout[${i}].path`, 'Required non-empty single-line string.');
      if (!oneLine(l.purpose)) err(`project.layout[${i}].purpose`, 'Required single-line string.');
    });
    if (p.packageManager !== undefined && p.packageManager !== null && !filledLine(p.packageManager)) err('project.packageManager', 'Must be null or a non-empty string.');
    for (const k of ['workspaces', 'testFrameworks']) if (p[k] !== undefined) lines(p[k], `project.${k}`);
    if (p.sourceFiles !== undefined && !(Number.isInteger(p.sourceFiles) && p.sourceFiles >= 0)) err('project.sourceFiles', 'Must be a whole number.');
    if (p.sensitive !== undefined) {
      if (!isObj(p.sensitive)) err('project.sensitive', 'Must map area ids to arrays of strings.');
      else for (const [k, val] of Object.entries(p.sensitive)) lines(val, `project.sensitive.${k}`);
    }
  }

  if (!Array.isArray(spec.agents) || !spec.agents.length) err('agents', `Choose at least one of: ${Object.keys(AGENTS).join(', ')}.`);
  else for (const a of spec.agents) if (!isKey(AGENTS, a)) err('agents', `Unknown agent ${JSON.stringify(a)}. Allowed: ${Object.keys(AGENTS).join(', ')}.`);

  const v = spec.verification;
  if (!isObj(v)) err('verification', 'Required object.');
  else {
    fields(v, 'verification');
    if (!isKey(RIGOR, v.rigor)) err('verification.rigor', `Must be one of: ${Object.keys(RIGOR).join(', ')}.`);
    for (const k of ['fast', 'full', 'e2e']) if (v[k] !== null && v[k] !== undefined && !filledLine(v[k])) err(`verification.${k}`, 'Must be null or a single-line command.');
  }
  if (!isKey(MEMORY, spec.memory)) err('memory', `Must be one of: ${Object.keys(MEMORY).join(', ')}.`);
  lines(spec.approvals, 'approvals');
  lines(spec.rules, 'rules');

  if (spec.overrides !== undefined) {
    if (!isObj(spec.overrides)) err('overrides', 'Must be an object.');
    else for (const [k, val] of Object.entries(spec.overrides)) {
      if (!OVERRIDABLE_MODULES.includes(k)) err(`overrides.${k}`, `Not overridable. Allowed: ${OVERRIDABLE_MODULES.join(', ')}.`);
      else if (typeof val !== 'boolean') err(`overrides.${k}`, 'Must be true or false.');
    }
  }
  if (spec.tooling !== undefined) {
    if (!isObj(spec.tooling)) err('tooling', 'Must be an object.');
    else {
      fields(spec.tooling, 'tooling');
      if (!filledLine(spec.tooling.cli)) err('tooling.cli', 'Must be a non-empty single-line string.');
    }
  }
  if (spec.budget !== undefined) {
    if (!isObj(spec.budget)) err('budget', 'Must be an object.');
    else {
      fields(spec.budget, 'budget');
      if (!Number.isInteger(spec.budget.alwaysOnLines) || spec.budget.alwaysOnLines < 20) err('budget.alwaysOnLines', 'Must be a whole number of at least 20.');
    }
  }
  return errors;
}

export function loadSpec(root) {
  const path = join(root, SPEC_PATH);
  if (!existsSync(path)) return { spec: null, errors: [{ path: SPEC_PATH, message: 'Not found. Run `agent-harness design` first.' }] };
  let spec;
  try { spec = JSON.parse(normalizeText(readFileSync(path, 'utf8'))); } catch (error) {
    return { spec: null, errors: [{ path: SPEC_PATH, message: `Invalid JSON: ${error.message}` }] };
  }
  const errors = validateSpec(spec);
  if (errors.length) return { spec, errors };
  return {
    spec: {
      ...spec,
      overrides: spec.overrides ?? {},
      tooling: spec.tooling ?? { cli: DEFAULT_CLI },
      budget: spec.budget ?? { alwaysOnLines: 200 },
    },
    errors,
  };
}

export function serializeSpec(spec) {
  return JSON.stringify(spec, null, 2) + '\n';
}
