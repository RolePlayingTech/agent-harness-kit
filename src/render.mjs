import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from './fs-safe.mjs';
import { APPROVALS, KIT_VERSION, RISK_AREAS, SPEC_PATH } from './spec.mjs';
import { DECISIONS_PATH, HANDOFF_PATH, deriveModules, isEnabled, riskAreas, skillDirs } from './engine.mjs';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

export const BLOCK_BEGIN = '<!-- agent-harness:begin -->';
export const BLOCK_END = '<!-- agent-harness:end -->';

const QUIET_FLAGS = [
  [/vitest/i, 'Vitest `--reporter=dot`'],
  [/jest/i, 'Jest `--silent`'],
  [/playwright/i, 'Playwright `--reporter=line`'],
  [/cypress/i, 'Cypress `--quiet`'],
  [/pytest/i, 'pytest `-q`'],
  [/cargo test/i, '`cargo test -q`'],
];

function code(s) { return `\`${s}\``; }

function areaText(id, values) {
  if (!values?.length) return '';
  return RISK_AREAS.includes(id) ? ` (code using ${values.map(code).join(', ')})` : ` (${values.map(code).join(', ')})`;
}

function approvalLine(id, sensitive) {
  if (!Object.hasOwn(APPROVALS, id)) return id;
  return `${APPROVALS[id]}${areaText(id, sensitive?.[id])}`;
}

function workspaceCommand(pm) {
  return { pnpm: 'pnpm --filter <package> <script>', yarn: 'yarn workspace <package> <script>', npm: 'npm run <script> -w <package>', bun: 'bun run --filter <package> <script>' }[pm] || null;
}

function template(name, vars) {
  const raw = normalizeText(readFileSync(join(TEMPLATES, 'skills', name, 'SKILL.md'), 'utf8'));
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(vars, key)) throw new Error(`Template ${name} uses unknown variable {{${key}}}.`);
    return vars[key];
  });
}

export function primarySkillDir(agents) {
  const dirs = skillDirs(agents);
  return dirs.includes('.agents/skills') ? '.agents/skills' : dirs[0];
}

function renderAgentsBlock(spec, modules) {
  const p = spec.project;
  const v = spec.verification;
  const on = (id) => isEnabled(modules, id);
  const out = [];
  const section = (title, lines) => { if (lines.length) out.push(`## ${title}`, ...lines, ''); };
  const skillDir = primarySkillDir(spec.agents);

  section('Purpose', [p.summary?.trim() || 'Not described yet. Ask the user for a one-sentence purpose and record it in `.harness/spec.json`.']);

  const stackLines = [];
  if (p.stack.length) stackLines.push(`- Stack: ${p.stack.join(', ')}`);
  if (on('stack-pending')) stackLines.push(`- Stack: not chosen yet. Before writing application code, agree on the stack with the user, record it in the decision log if there is one, and ask them to re-run ${code(`${spec.tooling.cli} design`)} so real check commands get wired in.`);
  for (const l of p.layout) stackLines.push(`- ${code(`${l.path}/`)}: ${l.purpose}`);
  section('Stack and layout', stackLines);

  const cmd = [];
  if (v.fast) cmd.push(`- Fast check, after each meaningful change: ${code(v.fast)}`);
  if (v.full) cmd.push(`- Full check, once before reporting a task done: ${code(v.full)}`);
  if (v.e2e) cmd.push(`- End-to-end, before done when a user-facing flow changed: ${code(v.e2e)}`);
  if (!cmd.length) cmd.push('- No check commands are configured yet. Until they exist, state explicitly which behavior you could not verify.');
  section('Commands', cmd);

  const done = [];
  const report = '- Report which checks you ran and their result. Never describe a check you did not run, or one that failed, as passing.';
  if (v.rigor === 'light') {
    done.push(v.fast ? '- Run the fast check before reporting a task done.' : '- Before reporting done, run whatever check exists, or say that nothing could be run.');
    if (v.full) done.push('- Run the full check only when the user asks, or before a release.');
  } else {
    if (v.fast) done.push('- Run the fast check after each meaningful change, not only at the end.');
    if (v.full || v.e2e) done.push(`- Before reporting done, run the ${v.full ? 'full check' : 'end-to-end suite'} once${v.full && v.e2e ? ', plus end-to-end when a user-facing flow changed' : ''}.`);
    if (v.rigor === 'strict' && on('verify-change')) done.push('- For every change that alters behavior, follow the `verify-change` skill.');
    else if (v.rigor === 'strict') done.push('- For a behavior fix, first write a test that fails without the fix. For changes in an ask-before area, get an independent review of the diff (a subagent or a fresh session).');
    else done.push('- When you change behavior that tests already cover, update or add a test in the same change.');
  }
  if (on('risk-areas')) {
    const areas = riskAreas(spec).map((r) => `${r.id}${areaText(r.id, r.evidence)}`).join(' or ');
    done.push(`- Changes touching ${areas || 'payments or auth code'}: run ${v.full || v.e2e ? 'the full check and, if a flow changed, end-to-end' : 'every available check'} before done, and list those changes separately in your report.`);
  }
  done.push(report);
  done.push('- If the same check still fails after three fix attempts, stop. Report what you tried and what you suspect, and ask how to proceed.');
  section('Definition of done', done);

  if (on('approvals')) section('Ask before', spec.approvals.map((id) => `- ${approvalLine(id, p.sensitive)}`));
  if (on('project-rules')) section('Project rules', spec.rules.map((r) => `- ${r}`));

  const memory = [];
  if (on('decision-log')) memory.push(`- Before changing architecture, conventions or dependencies, read ${code(DECISIONS_PATH)}. When you and the user settle something that should outlast the task, add an entry there.`);
  if (on('session-handoff')) memory.push(`- Work that spans sessions: use the \`session-handoff\` skill. Read ${code(HANDOFF_PATH)} when you start and update it before you stop.`);
  section('Memory', memory);

  const ctx = ['- Search (for example `rg`) before opening files, and open large files by line range.'];
  if (on('quiet-output')) {
    const text = `${v.full || ''} ${v.e2e || ''} ${(p.testFrameworks || []).join(' ')}`;
    const flags = QUIET_FLAGS.filter(([re]) => re.test(text)).map(([, f]) => f);
    const viaScripts = /\b(npm|pnpm|yarn|bun)\b/.test(`${v.full || ''} ${v.e2e || ''}`);
    const flagText = flags.length ? ` (${flags.join(', ')}${viaScripts ? '; through package scripts, pass flags after `--`' : ''})` : '';
    ctx.push(`- Run long suites with concise output and read only the failures${flagText}. Re-run a single failing test verbosely when you need detail; do not paste whole logs.`);
  }
  if (on('workspace-scope')) {
    const wc = workspaceCommand(p.packageManager);
    ctx.push(`- Workspace packages: ${p.workspaces.map(code).join(', ')}. While iterating, run checks only for the package you changed${wc ? ` (${code(wc)})` : ''}; run the full check before done.`);
  }
  if (on('exploration')) ctx.push('- For questions that span many files, delegate the survey to a subagent if your tool supports one, and ask for a short summary with file paths and line numbers. Open the cited lines yourself before editing.');
  section('Working with context', ctx);

  const skills = [];
  if (on('verify-change')) skills.push(`- \`verify-change\` (${code(`${skillDir}/verify-change/SKILL.md`)}): before and after any change that alters behavior.`);
  if (on('session-handoff')) skills.push(`- \`session-handoff\` (${code(`${skillDir}/session-handoff/SKILL.md`)}): at the start and end of a session on unfinished work.`);
  if (on('harness-maintenance')) skills.push(`- \`harness-maintenance\` (${code(`${skillDir}/harness-maintenance/SKILL.md`)}): when the user wants to change how you work, or the same problem has happened twice.`);
  section('Skills', skills);

  section('About this file', [`Generated by agent-harness-kit from ${code(SPEC_PATH)}. Do not edit between the agent-harness markers: change the spec and run ${code(`${spec.tooling.cli} build`)}. Notes outside the markers are preserved.`]);

  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function renderClaudeBlock() {
  return '@AGENTS.md';
}

function decisionsSeed(spec, date) {
  return `# Decisions

Durable agreements for this project, newest first. Read before changing architecture, conventions or dependencies. Remove entries that no longer apply; a wrong entry is worse than a missing one.

Entry format: a heading \`## YYYY-MM-DD: decision\`, then one to three lines on why.

## ${date}: Agent harness adopted
Rigor ${spec.verification.rigor}, memory ${spec.memory}, agents ${spec.agents.join(', ')}. The reasoning for each part is printed by \`${spec.tooling.cli} explain\`; the decisions themselves live in \`${SPEC_PATH}\`.
`;
}

function handoffSeed() {
  return `# Session handoff

Overwrite this note at the end of a session that leaves work unfinished. Keep it short; delete its content when the work is done.

- Goal:
- Done so far (with commit hashes):
- Checks run and results:
- Next step:
- Open questions for the user:
`;
}

function today() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  const date = epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000) : new Date();
  return date.toISOString().slice(0, 10);
}

/**
 * Renders every output for a spec.
 * blocks: managed regions inside files the user may also edit.
 * files: wholly generated files (skills).
 * seeds: created once if missing, then owned by the project.
 */
export function renderOutputs(spec) {
  const modules = deriveModules(spec);
  const on = (id) => isEnabled(modules, id);
  const dirs = skillDirs(spec.agents);
  const v = spec.verification;
  const vars = {
    fast: v.fast ? code(v.fast) : 'the fast check (none is configured; say so in your report)',
    full: v.full ? code(v.full) : 'the full check (none is configured; say so in your report)',
    e2e: v.e2e ? code(v.e2e) : 'the end-to-end suite, if one exists',
    decisions: code(DECISIONS_PATH),
    handoff: code(HANDOFF_PATH),
    spec: code(SPEC_PATH),
    cli: spec.tooling.cli,
    version: KIT_VERSION,
  };

  const blocks = { 'AGENTS.md': renderAgentsBlock(spec, modules) };
  if (on('claude-import')) blocks['CLAUDE.md'] = renderClaudeBlock();

  const files = {};
  for (const name of ['verify-change', 'session-handoff', 'harness-maintenance']) {
    if (!on(name)) continue;
    const content = template(name, vars);
    for (const dir of dirs) files[`${dir}/${name}/SKILL.md`] = content;
  }

  const seeds = {};
  if (on('decision-log')) seeds[DECISIONS_PATH] = decisionsSeed(spec, today());
  if (on('session-handoff')) seeds[HANDOFF_PATH] = handoffSeed();

  return { modules, blocks, files, seeds, newFileHeaders: { 'AGENTS.md': `# ${spec.project.name}\n\n`, 'CLAUDE.md': '' } };
}

/** All paths the renderer could ever produce, for validating an untrusted lock file. */
export function possibleOutputPaths() {
  const paths = new Set(['AGENTS.md', 'CLAUDE.md', DECISIONS_PATH, HANDOFF_PATH]);
  for (const dir of ['.agents/skills', '.claude/skills']) {
    for (const name of ['verify-change', 'session-handoff', 'harness-maintenance']) paths.add(`${dir}/${name}/SKILL.md`);
  }
  return paths;
}
