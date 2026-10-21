#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from '../src/scan.mjs';
import { ANSWER_KEYS, DEFAULT_CLI, answersFromSpec, KIT_VERSION, SPEC_PATH, buildSpec, defaultAnswers, loadSpec, serializeSpec, validateSpec } from '../src/spec.mjs';
import { buildQuestions, confirm, runInterview } from '../src/interview.mjs';
import { formatExplain, explainData } from '../src/explain.mjs';
import { applyOps, planBuild, planRemove } from '../src/build.mjs';
import { checkHarness } from '../src/check.mjs';
import { unifiedDiff } from '../src/diff.mjs';
import { applyFilePlan } from '../src/file-transaction.mjs';
import { assertSafeTarget, normalizeText, safeJoin } from '../src/fs-safe.mjs';

const KIT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const COMMANDS = {
  scan: { flags: ['json'], summary: 'Read-only scan: stack, commands, sensitive areas, existing instructions.' },
  design: { flags: ['json', 'set', 'rule', 'answers', 'yes', 'dry-run', 'questions', 'agent'], summary: 'Interview (or flags) -> .harness/spec.json, with the reasoning shown.' },
  explain: { flags: ['json', 'brief'], summary: 'Why each part of the harness is in or out, and what it costs.' },
  build: { flags: ['json', 'dry-run', 'force'], summary: 'Generate agent files from the spec. Preserves your content; never overwrites hand edits without --force.' },
  check: { flags: ['json', 'run', 'strict', 'timeout'], summary: 'Verify the harness is consistent; --run also executes the configured checks.' },
  remove: { flags: ['json', 'dry-run'], summary: 'Remove what the kit generated and you did not change. Keeps the spec.' },
  help: { flags: [], summary: 'Show this help.' },
};
const VALUE_FLAGS = new Set(['set', 'rule', 'answers', 'timeout']);
const REPEATABLE = new Set(['set', 'rule']);
const BOOLEAN_FLAGS = new Set(['json', 'yes', 'dry-run', 'questions', 'agent', 'brief', 'force', 'run', 'strict', 'help', 'version']);

function parseArgs(argv) {
  const flags = { set: [], rule: [] };
  const positionals = [];
  const errors = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') { flags.help = true; continue; }
    if (a === '-v') { flags.version = true; continue; }
    if (!a.startsWith('--')) {
      if (a.startsWith('-') && a !== '-') errors.push(`Unknown option ${a}.`);
      else positionals.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (VALUE_FLAGS.has(key)) {
      const value = eq === -1 ? argv[++i] : a.slice(eq + 1);
      if (value === undefined || (eq === -1 && value.startsWith('--'))) { errors.push(`--${key} needs a value.`); continue; }
      if (REPEATABLE.has(key)) flags[key].push(value);
      else if (key in flags) errors.push(`--${key} given twice.`);
      else flags[key] = value;
    } else if (BOOLEAN_FLAGS.has(key)) {
      if (eq !== -1) errors.push(`--${key} does not take a value.`);
      flags[key] = true;
    } else {
      errors.push(`Unknown option --${key}.`);
    }
  }
  if (positionals.length > 2) errors.push(`Unexpected arguments: ${positionals.slice(2).join(' ')}.`);
  return { command: positionals[0], dir: positionals[1] || '.', flags, errors };
}

function help() {
  const lines = [`agent-harness-kit ${KIT_VERSION}: design, generate and check a harness for AI coding agents.`, '', 'Usage: agent-harness <command> [dir] [options]', '', 'Commands:'];
  for (const [name, c] of Object.entries(COMMANDS)) if (name !== 'help') lines.push(`  ${name.padEnd(8)} ${c.summary}`);
  lines.push('', 'Options:',
    '  --json               Machine-readable output (all commands).',
    '  --set key=value      design: answer a question (agents, summary, stack, rigor, fast, full, e2e, memory, approvals, name). Repeatable.',
    '  --rule "text"        design: a one-line project rule. Repeatable; replaces the rule list.',
    '  --answers file.json  design: answers from a JSON file with the same keys.',
    '  --yes                design: accept defaults for unanswered questions and write the spec without prompting.',
    '  --questions          design: print the questions, evidence and defaults (for an AI agent) and exit.',
    '  --agent              design: print instructions for an AI agent to run the design conversation.',
    '  --dry-run            design/build/remove: show what would change, write nothing.',
    '  --force              build: overwrite hand edits inside generated regions.',
    '  --brief              explain: titles only.',
    '  --run                check: also execute the configured fast/full/e2e commands (runs project code).',
    '  --timeout seconds    check --run: per-command timeout (default 900).',
    '  --strict             check: treat warnings as failures.',
    '', 'Typical flow:',
    '  agent-harness design      # answer a few questions; writes .harness/spec.json',
    '  agent-harness build --dry-run && agent-harness build',
    '  agent-harness check',
    '', `Run without installing: ${DEFAULT_CLI} <command>`);
  return lines.join('\n');
}

const { command, dir, flags, errors } = parseArgs(process.argv.slice(2));
const json = Boolean(flags.json);

function fail(message, code = 1) {
  if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`Error: ${message}`);
  process.exit(code);
}

function print(obj, text) {
  console.log(json ? JSON.stringify(obj, null, 2) : text);
}

if (flags.version) { console.log(KIT_VERSION); process.exit(0); }
if (flags.help || !command || command === 'help') { console.log(help()); process.exit(errors.length ? 1 : 0); }
if (errors.length) fail(`${errors.join(' ')} Run \`agent-harness help\`.`);
if (!Object.hasOwn(COMMANDS, command)) fail(`Unknown command "${command}". Commands: ${Object.keys(COMMANDS).filter((c) => c !== 'help').join(', ')}.`);
for (const key of Object.keys(flags)) {
  const used = Array.isArray(flags[key]) ? flags[key].length > 0 : flags[key] !== undefined;
  if (used && !COMMANDS[command].flags.includes(key)) fail(`--${key} does not apply to ${command}.`);
}

const root = resolve(dir);
if (command !== 'design' && !existsSync(root)) fail(`Directory not found: ${root}`);

function describeOps(ops) {
  const lines = [];
  for (const o of ops) {
    if (o.action === 'unchanged') continue;
    lines.push(`  ${o.action.padEnd(9)} ${o.rel}${o.reason ? `  (${o.reason})` : ''}`);
  }
  return lines.length ? lines.join('\n') : '  nothing to change';
}

function opsJson(ops, withDiff) {
  return ops.filter((o) => o.action !== 'unchanged').map((o) => ({
    path: o.rel, action: o.action, kind: o.kind, reason: o.reason,
    ...(withDiff && ['create', 'update', 'delete', 'conflict'].includes(o.action) ? { diff: unifiedDiff(o.before, o.after, o.rel) } : {}),
  }));
}

function diffs(ops) {
  return ops.filter((o) => ['create', 'update', 'delete', 'conflict'].includes(o.action) && o.kind !== 'lock')
    .map((o) => unifiedDiff(o.before, o.after, o.rel)).filter(Boolean).join('\n\n');
}

function scanText(s) {
  const shown = relative(process.cwd(), s.root).replaceAll('\\', '/');
  const lines = [shown && !shown.startsWith('..') && !isAbsolute(shown) ? shown : s.root, `  ${s.stage === 'new' ? 'New project: no code or manifests found' : `Existing project: ${s.stack.join(', ') || 'stack not recognized'}`}`, `  Source files: ${s.size.sourceFiles}${s.size.truncated ? '+ (scan stopped early)' : ''}`];
  for (const role of ['fast', 'full', 'e2e', 'build']) {
    for (const c of s.commands[role]) lines.push(`  ${role.padEnd(5)} ${c.cmd}  [${c.confidence}: ${c.evidence}]`);
  }
  if (s.workspaces.length) lines.push(`  Workspaces: ${s.workspaces.map((w) => w.path).join(', ')}`);
  for (const x of s.sensitive) lines.push(`  Sensitive: ${x.label} [${x.evidence}]`);
  for (const f of s.instructionFiles) lines.push(`  Instructions: ${f.path}${f.lines !== null ? ` (${f.lines} lines${f.managed ? ', managed by agent-harness' : ''})` : ''}`);
  for (const k of s.skills) lines.push(`  Skill: ${k.path}`);
  for (const h of s.agentHints) lines.push(`  Agent hint: ${h.agent} [${h.evidence}]`);
  for (const n of s.notes) lines.push(`  Note: ${n.message} [${n.evidence}]`);
  return lines.join('\n');
}

function collectAnswers() {
  let answers = {};
  if (flags.answers) {
    try { answers = JSON.parse(normalizeText(readFileSync(resolve(flags.answers), 'utf8'))); } catch (error) { fail(`Cannot read --answers ${flags.answers}: ${error.message}`); }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail('--answers must contain a JSON object.');
    for (const key of Object.keys(answers)) if (!ANSWER_KEYS.includes(key)) fail(`Unknown answer "${key}" in ${flags.answers}. Allowed: ${ANSWER_KEYS.join(', ')}.`);
  }
  for (const pair of flags.set) {
    const eq = pair.indexOf('=');
    if (eq < 1) fail(`--set expects key=value, got "${pair}".`);
    const key = pair.slice(0, eq).trim();
    if (!ANSWER_KEYS.includes(key) || key === 'rules' || key === 'overrides') fail(`Unknown --set key "${key}". Allowed: ${ANSWER_KEYS.filter((k) => !['rules', 'overrides'].includes(k)).join(', ')}.`);
    answers[key] = pair.slice(eq + 1);
  }
  if (flags.rule.length) answers.rules = flags.rule;
  return answers;
}

async function runBuild({ dryRun, force, interactive }) {
  const plan = planBuild(root, { force });
  const changes = plan.ops.filter((o) => o.action !== 'unchanged');
  if (dryRun) {
    if (json) return print({ ok: plan.conflicts.length === 0, dryRun: true, changes: opsJson(plan.ops, true) });
    const d = diffs(plan.ops);
    console.log(`Planned changes (nothing written):\n${describeOps(plan.ops)}${d ? `\n\n${d}` : ''}`);
    if (plan.conflicts.length) console.log(`\n${plan.conflicts.length} conflict(s): a real build would stop. Resolve them or pass --force.`);
    return;
  }
  if (plan.conflicts.length) {
    if (json) { print({ ok: false, conflicts: opsJson(plan.conflicts, true) }); process.exit(1); }
    console.error(`Build stopped: ${plan.conflicts.length} conflict(s). Nothing was written.\n${describeOps(plan.conflicts)}\n\nMove hand edits outside the agent-harness markers or into ${SPEC_PATH}, or re-run with --force to overwrite them.`);
    process.exit(1);
  }
  if (interactive && changes.length) {
    console.log(`\nPlanned changes:\n${describeOps(plan.ops)}`);
    if (!(await confirm('Write these files?'))) { console.log('Nothing written.'); return; }
  }
  const written = applyOps(root, plan.ops);
  print({ ok: true, written, changes: opsJson(plan.ops, false) }, written ? `Wrote ${written} file(s):\n${describeOps(plan.ops)}\n\nNext: \`${plan.spec.tooling.cli} check\`, then commit the result.` : 'Already up to date.');
}

try {
  if (command === 'scan') {
    const s = scanRepository(root);
    print(s, scanText(s));
  } else if (command === 'design') {
    if (flags.agent) {
      const text = normalizeText(readFileSync(join(KIT_ROOT, 'skills', 'harness-designer', 'SKILL.md'), 'utf8')).replaceAll('{{cli}}', DEFAULT_CLI);
      print({ ok: true, instructions: text }, text);
      process.exit(0);
    }
    if (!existsSync(root)) {
      const quoting = / /.test(dir)
        ? ' If this text was meant to be part of --rule or --set, quote the whole value (in PowerShell use single quotes).'
        : ' Create it first (a new project can be an empty directory).';
      fail(`Directory not found: ${root}.${quoting}`);
    }
    const scan = scanRepository(root);
    const prev = existsSync(join(root, SPEC_PATH)) ? loadSpec(root) : null;
    if (prev && !prev.spec) fail(`Existing ${SPEC_PATH} cannot be read: ${prev.errors.map((e) => e.message).join('; ')}`);
    const previous = prev?.spec || null;
    let answers = collectAnswers();
    if (flags.questions) {
      const current = { ...defaultAnswers(scan), ...(previous ? answersFromSpec(previous) : {}), ...answers };
      const questions = buildQuestions(scan, current);
      print({ ok: true, stage: scan.stage, questions }, questions.map((q) => `${q.id}: ${q.prompt}\n  default: ${JSON.stringify(q.default)}\n  found: ${(q.evidence || []).join('; ') || '-'}`).join('\n\n'));
      process.exit(0);
    }
    const interactive = process.stdin.isTTY && process.stdout.isTTY && !flags.yes && !json;
    if (interactive) {
      const preset = { ...(previous ? answersFromSpec(previous) : {}), ...answers };
      answers = { ...preset, ...(await runInterview(scan, preset)) };
    }
    const spec = buildSpec(scan, answers, previous);
    const problems = validateSpec(spec);
    if (problems.length) {
      const hint = problems.some((p) => p.path === 'agents') ? ' Pass --set agents=codex (or claude, cursor, other; comma-separated).' : '';
      fail(`The answers do not form a valid spec: ${problems.map((p) => `${p.path}: ${p.message}`).join('; ')}.${hint}`);
    }
    const text = serializeSpec(spec);
    const specPath = safeJoin(root, SPEC_PATH);
    const existing = existsSync(specPath) ? normalizeText(readFileSync(specPath, 'utf8')) : null;
    const write = !flags['dry-run'] && (flags.yes || (interactive && (console.log(`\n${formatExplain(spec, { brief: true })}\n`), await confirm(`Save decisions to ${SPEC_PATH}?`))));
    if (!write) {
      if (json) print({ ok: true, written: false, spec, explain: explainData(spec) });
      else {
        console.log(`${formatExplain(spec)}\n\n${SPEC_PATH} (not written${flags['dry-run'] ? ', dry run' : interactive ? '' : '; pass --yes to write'}):\n${text}`);
      }
      process.exit(0);
    }
    if (existing !== text) {
      applyFilePlan([{ path: specPath, before: existsSync(specPath) ? readFileSync(specPath) : null, after: Buffer.from(text) }], (full) => assertSafeTarget(root, full));
    }
    if (json) print({ ok: true, written: existing !== text, spec, explain: explainData(spec) });
    else {
      if (!interactive) console.log(formatExplain(spec));
      console.log(`\n${existing === text ? 'Spec unchanged' : 'Saved'}: ${SPEC_PATH}`);
      if (interactive && (await confirm('Generate the agent files now (you will see the plan first)?'))) await runBuild({ dryRun: false, force: false, interactive: true });
      else console.log(`Next: \`${spec.tooling.cli} build --dry-run\` to preview the files, then \`${spec.tooling.cli} build\`.`);
    }
  } else if (command === 'explain') {
    const { spec, errors: specErrors } = loadSpec(root);
    if (!spec || specErrors.length) fail(specErrors.map((e) => `${e.path}: ${e.message}`).join('; '));
    print(explainData(spec), formatExplain(spec, { brief: Boolean(flags.brief) }));
  } else if (command === 'build') {
    await runBuild({ dryRun: Boolean(flags['dry-run']), force: Boolean(flags.force), interactive: false });
  } else if (command === 'check') {
    let timeoutSeconds = 900;
    if (flags.timeout !== undefined) {
      if (!/^[1-9]\d*$/.test(flags.timeout)) fail('--timeout needs a positive whole number of seconds.');
      timeoutSeconds = Number(flags.timeout);
    }
    if (flags.run) {
      console.error(`--run executes the verification commands from ${SPEC_PATH} in ${root}, with your permissions.\nOnly use it on a repository whose code and spec you trust, as with \`npm test\`.\n`);
    }
    const onRun = ({ check, command: cmd }) => console.error(`Running ${check} check: ${cmd}`);
    const report = checkHarness(root, { run: Boolean(flags.run), timeoutSeconds, onRun });
    const passed = report.passed && !(flags.strict && report.warnings > 0);
    if (json) { console.log(JSON.stringify({ ...report, passed }, null, 2)); process.exit(passed ? 0 : 1); }
    const order = { error: 0, warn: 1, info: 2 };
    for (const f of [...report.findings].sort((a, b) => order[a.level] - order[b.level])) {
      console.log(`${f.level.toUpperCase().padEnd(5)} ${f.file ? `${f.file}: ` : ''}${f.message}`);
    }
    for (const r of report.runs) {
      console.log(`RUN   ${r.check}: \`${r.command}\` -> exit ${r.exitCode ?? 'none'} in ${r.seconds}s${r.timedOut ? ' (timed out)' : ''}`);
      if (r.outputTail) console.log(r.outputTail.split('\n').map((l) => `      ${l}`).join('\n'));
    }
    const m = report.metrics;
    if (m.alwaysOnLines !== undefined) console.log(`\nAlways-loaded instructions: ${m.alwaysOnLines} lines (budget ${m.alwaysOnBudget}); skills found: ${m.skills}.`);
    console.log(`${passed ? 'PASSED' : 'FAILED'}: ${report.errors} error(s), ${report.warnings} warning(s)${flags.run ? '' : '. Commands were not executed; add --run to execute them'}.`);
    process.exit(passed ? 0 : 1);
  } else if (command === 'remove') {
    const plan = planRemove(root);
    if (flags['dry-run']) {
      const d = diffs(plan.ops);
      print({ ok: true, dryRun: true, changes: opsJson(plan.ops, true) }, `Planned removal (nothing written):\n${describeOps(plan.ops)}${d ? `\n\n${d}` : ''}\n\n${SPEC_PATH} is kept.`);
    } else {
      const written = applyOps(root, plan.ops);
      print({ ok: true, written, changes: opsJson(plan.ops, false) }, `${written ? `Removed or updated ${written} file(s):\n${describeOps(plan.ops)}` : 'Nothing generated by the kit was found.'}\n\n${SPEC_PATH} is kept; delete it yourself if you no longer want it.`);
    }
  }
} catch (error) {
  fail(error.message);
}

