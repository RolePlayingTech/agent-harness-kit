import { APPROVALS, RISK_AREAS } from './spec.mjs';

export const EXPLORATION_FILE_THRESHOLD = 300;

export const DECISIONS_PATH = 'docs/agent/decisions.md';
export const HANDOFF_PATH = 'docs/agent/handoff.md';

/** Skill directories that the selected agents read, without creating duplicates where avoidable. */
export function skillDirs(agents) {
  const set = new Set(agents);
  const dirs = [];
  if (set.has('claude')) dirs.push('.claude/skills');
  // Cursor also reads .claude/skills, so it needs .agents/skills only when Claude is not selected.
  if (set.has('codex') || set.has('other') || (set.has('cursor') && !set.has('claude'))) dirs.push('.agents/skills');
  return dirs;
}

const ENFORCEMENT_HINTS = {
  push: 'Protect the default branch in your Git host (require pull requests and reviews).',
  deploy: 'Keep deploy credentials out of the agent environment; deploy from CI with a manual approval step.',
  destructive: 'Work on a branch or worktree so deletions are recoverable from git.',
  dependencies: 'Review lockfile changes in pull requests; CI can fail on unexpected lockfile diffs.',
  migrations: 'Require review of migration paths with CODEOWNERS; run migrations only from CI.',
  secrets: 'Keep real secrets out of the working tree; Claude Code permission rules can deny reads of secrets files.',
  ci: 'Require review of workflow files with CODEOWNERS.',
  infra: 'Require review of infrastructure paths with CODEOWNERS; keep cloud credentials out of the agent environment.',
  payments: 'Require review of payments paths with CODEOWNERS and keep test-mode keys only.',
  auth: 'Require review of auth paths with CODEOWNERS.',
};

const AGENT_ENFORCEMENT = {
  claude: 'Claude Code: permission rules (allow/ask/deny) in .claude/settings.json, or hooks.',
  codex: 'Codex: sandbox mode and approval policy in your Codex configuration.',
  cursor: 'Cursor: terminal command approval / auto-run settings.',
  other: "Your tool's own command approval settings.",
};

function module(id, title, enabled, why, tradeoff, files = [], { overridable = false } = {}) {
  return { id, title, enabled, why, tradeoff, files, overridable, overridden: false };
}

/**
 * Derives the harness modules from a validated spec. Pure and deterministic:
 * the same spec always yields the same modules, reasons and files.
 */
export function deriveModules(spec) {
  const v = spec.verification;
  const p = spec.project;
  const agents = new Set(spec.agents);
  const dirs = skillDirs(spec.agents);
  const skillFiles = (name) => dirs.map((d) => `${d}/${name}/SKILL.md`);
  const hasChecks = Boolean(v.fast || v.full || v.e2e);
  const workspaces = p.workspaces || [];
  const sourceFiles = p.sourceFiles ?? 0;
  const modules = [];

  modules.push(module('instructions', 'Shared project instructions (AGENTS.md)', true,
    'Every selected agent reads AGENTS.md (Claude Code through an import), so it is the single source of truth for purpose, commands and boundaries.',
    'Always loaded: every line costs context in every session, so it holds only what applies to most tasks.',
    ['AGENTS.md']));

  modules.push(module('claude-import', 'Claude Code entry point (CLAUDE.md → @AGENTS.md)', agents.has('claude'),
    agents.has('claude')
      ? 'Claude Code prefers CLAUDE.md; importing AGENTS.md keeps one copy of the instructions instead of two that drift apart.'
      : 'Claude Code is not among the selected agents.',
    'None beyond one extra file; Claude-specific notes can go below the managed block.',
    agents.has('claude') ? ['CLAUDE.md'] : []));

  const rigorWhy = {
    light: 'Light rigor: suited to prototypes, where speed matters more than catching every regression.',
    standard: 'Standard rigor: catch regressions before a task is reported done, without running the whole suite after every edit.',
    strict: 'Strict rigor: mistakes here are costly, so evidence matters more than speed.',
  }[v.rigor];
  const rigorTradeoff = {
    light: 'Regressions that only the full suite catches can reach review; run it before merging.',
    standard: 'A regression found by the full suite surfaces at the end of a task rather than right after the edit that caused it.',
    strict: 'Slower tasks and more tokens spent on tests and review; overkill for throwaway work.',
  }[v.rigor];
  modules.push(module('verification', `Definition of done (${v.rigor})`, true,
    hasChecks ? rigorWhy : `${rigorWhy} No check command is set yet, so the agent is told to say what it could not verify.`,
    rigorTradeoff, ['AGENTS.md']));

  const strictDefault = v.rigor === 'strict';
  modules.push(module('verify-change', 'Skill: verify-change (test-first and review procedure)', strictDefault,
    strictDefault
      ? 'Strict rigor needs a step-by-step procedure; a skill keeps it out of the always-loaded instructions until a behavior change starts.'
      : 'Not needed below strict rigor; the definition of done in AGENTS.md is enough.',
    'Loaded only when a behavior change starts, but adds a procedure the agent must follow every time.',
    strictDefault ? skillFiles('verify-change') : [], { overridable: true }));

  const quiet = Boolean(v.full || v.e2e);
  modules.push(module('quiet-output', 'Concise test output', quiet,
    quiet
      ? 'Full and end-to-end runs can print thousands of lines; reading only failures keeps the session focused.'
      : 'No full or end-to-end suite is configured, so there is no long output to manage.',
    'The first failure report is less detailed; the agent re-runs the single failing test verbosely when it needs more.',
    quiet ? ['AGENTS.md'] : [], { overridable: true }));

  const memoryOn = spec.memory !== 'none';
  modules.push(module('decision-log', 'Decision log (docs/agent/decisions.md)', memoryOn,
    memoryOn
      ? 'You want agreements to survive between sessions. A short log the agent reads before structural changes is cheaper than re-explaining them.'
      : 'You chose no persistent memory; decisions live in code review and git history.',
    'Needs pruning: superseded entries mislead. Entries are written by the agent, so review them like code.',
    memoryOn ? [DECISIONS_PATH] : []));

  const handoffOn = spec.memory === 'handoff';
  modules.push(module('session-handoff', 'Session handoff (note + skill)', handoffOn,
    handoffOn
      ? 'You work on tasks that span several sessions; a handoff note lets a fresh session continue without replaying the previous conversation.'
      : 'Not selected; tasks are expected to fit in one session, or git history is enough to resume.',
    'A stale note is worse than none, so the skill tells the agent to check it against git before trusting it.',
    handoffOn ? [HANDOFF_PATH, ...skillFiles('session-handoff')] : []));

  const approvals = spec.approvals || [];
  modules.push(module('approvals', 'Ask-before list (advisory)', approvals.length > 0,
    approvals.length
      ? `Actions with consequences outside the working tree, or areas detected as sensitive, need your approval: ${approvals.map((a) => (Object.hasOwn(APPROVALS, a) ? a : 'custom')).join(', ')}.`
      : 'No approvals selected.',
    'These are instructions, not permissions. A model can ignore them; enforce the ones that matter with branch protection, CI or your tool\'s permission settings.',
    approvals.length ? ['AGENTS.md'] : []));

  const risk = riskAreas(spec);
  modules.push(module('risk-areas', 'Extra care in payments/auth code', risk.length > 0,
    risk.length
      ? `Detected ${risk.map((r) => `${r.id} (${r.evidence.join(', ')})`).join(' and ')}. Mistakes there are costly, so changes get the full checks and are called out in the report, without asking permission for every edit.`
      : 'No payments or auth code detected outside the ask-before list.',
    'Slightly longer tasks when those areas change. If every change there needs your sign-off, add the area to approvals instead.',
    risk.length ? ['AGENTS.md'] : [], { overridable: true }));

  modules.push(module('project-rules', 'Project rules', spec.rules.length > 0,
    spec.rules.length ? 'Conventions you named that the agent cannot infer from the code.' : 'No project-specific rules given yet; add them when the agent repeats a mistake.',
    'Each rule is loaded every session; keep only rules that change behavior.',
    spec.rules.length ? ['AGENTS.md'] : []));

  const wsOn = workspaces.length > 1 && Boolean(p.packageManager);
  modules.push(module('workspace-scope', 'Per-package checks in the monorepo', wsOn,
    wsOn
      ? `The repository has ${workspaces.length} workspace packages; running checks for the affected package first is faster and produces less output.`
      : 'Not a multi-package workspace.',
    'A change can break a dependent package; the full check before done still covers the whole workspace.',
    wsOn ? ['AGENTS.md'] : [], { overridable: true }));

  const large = sourceFiles >= EXPLORATION_FILE_THRESHOLD || workspaces.length > 1;
  modules.push(module('exploration', 'Exploration discipline for a large codebase', large,
    large
      ? `About ${sourceFiles} source files${workspaces.length > 1 ? ` in ${workspaces.length} packages` : ''}: reading broadly fills the context before work starts, so the agent searches first and delegates wide surveys when its tool supports subagents.`
      : `About ${sourceFiles} source files: small enough that the agent can read what it needs directly.`,
    'Delegated summaries can miss details; the agent opens the cited lines before editing them.',
    large ? ['AGENTS.md'] : [], { overridable: true }));

  const stackPending = p.stage === 'new' && !p.stack.length;
  modules.push(module('stack-pending', 'Stack decision pending', stackPending,
    stackPending
      ? 'No stack is chosen yet, so the first task is to decide it with you and record it, then re-run design to wire real commands.'
      : 'The stack is known, so commands and layout come from the project itself.',
    'Until commands exist the agent cannot verify behavior; that is stated explicitly instead of hidden.',
    stackPending ? ['AGENTS.md'] : []));

  modules.push(module('harness-maintenance', 'Skill: harness-maintenance', true,
    'Keeps changes to the harness going through .harness/spec.json, so rebuilding and checking stay meaningful as the project evolves.',
    'One more skill description in the agent\'s skill list (one line until used).',
    skillFiles('harness-maintenance'), { overridable: true }));

  for (const m of modules) {
    if (m.overridable && Object.hasOwn(spec.overrides || {}, m.id)) {
      const forced = spec.overrides[m.id];
      if (forced !== m.enabled) {
        m.enabled = forced;
        m.overridden = true;
        m.why = `${forced ? 'Enabled' : 'Disabled'} by an override in the spec. Default reasoning: ${m.why}`;
        if (forced && !m.files.length) {
          m.files = ['verify-change', 'harness-maintenance'].includes(m.id) ? skillFiles(m.id) : ['AGENTS.md'];
        }
        if (!forced) m.files = [];
      }
    }
  }
  return modules;
}

export function enforcementHints(spec) {
  const hints = (spec.approvals || []).map((id) => ({
    approval: Object.hasOwn(APPROVALS, id) ? APPROVALS[id] : id,
    hint: ENFORCEMENT_HINTS[id] || 'Decide where this can be enforced (code review, CI, permissions); until then it is advisory.',
  }));
  const tools = spec.agents.map((a) => AGENT_ENFORCEMENT[a]).filter(Boolean);
  return { hints, tools };
}

/** Detected payments/auth areas that are not already gated by an approval. */
export function riskAreas(spec) {
  const sensitive = spec.project.sensitive || {};
  return RISK_AREAS.filter((id) => sensitive[id]?.length && !(spec.approvals || []).includes(id))
    .map((id) => ({ id, evidence: sensitive[id] }));
}

export function isEnabled(modules, id) {
  return modules.some((m) => m.id === id && m.enabled);
}
