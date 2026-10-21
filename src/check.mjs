import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readTextIfExists } from './fs-safe.mjs';
import { findBlock, planBuild } from './build.mjs';
import { scanRepository } from './scan.mjs';
import { loadSpec, SPEC_PATH } from './spec.mjs';

const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.cursor/skills'];
const NPX_PACKAGES = { tsc: ['typescript'], playwright: ['@playwright/test', 'playwright'], vitest: ['vitest'], jest: ['jest'], eslint: ['eslint'], prettier: ['prettier'], biome: ['@biomejs/biome'], astro: ['astro'], next: ['next'], cypress: ['cypress'] };
const PM_BUILTINS = new Set(['install', 'i', 'add', 'exec', 'dlx', 'run', 'x', 'create', 'why', 'list', 'ls']);

/**
 * Parses the YAML subset used by SKILL.md frontmatter: `key: value`, quoted scalars and
 * `>`/`|` block scalars. Anything else is reported as unsupported rather than guessed.
 */
export function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { error: 'Frontmatter must start with `---` on the first line.' };
  const close = lines.indexOf('---', 1);
  if (close === -1) return { error: 'Frontmatter has no closing `---`.' };
  const data = {};
  const unsupported = [];
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) { unsupported.push(i + 1); continue; }
    const [, key, rest] = m;
    if (/^[>|][-+]?$/.test(rest)) {
      const body = [];
      while (i + 1 < close && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) body.push(lines[++i].trim());
      data[key] = rest.startsWith('>') ? body.filter(Boolean).join(' ') : body.join('\n').trim();
    } else if (/^".*"$/.test(rest) || /^'.*'$/.test(rest)) {
      data[key] = rest.slice(1, -1);
    } else if (rest === '' || rest.startsWith('[') || rest.startsWith('{')) {
      while (i + 1 < close && /^\s+/.test(lines[i + 1])) i++;
      data[key] = undefined;
      unsupported.push(i + 1);
    } else {
      data[key] = rest.replace(/\s+#.*$/, '');
    }
  }
  return { data, unsupported };
}

function listSkills(root) {
  const skills = [];
  for (const dir of SKILL_ROOTS) {
    const full = join(root, dir);
    let names = [];
    try { if (statSync(full).isDirectory()) names = readdirSync(full); } catch { continue; }
    for (const name of names) {
      const rel = `${dir}/${name}/SKILL.md`;
      const text = readTextIfExists(join(root, rel));
      if (text !== null) skills.push({ dir, name, rel, text });
    }
  }
  return skills;
}

function checkCommand(root, command, scripts, deps, makeTargets) {
  const problems = [];
  for (const part of command.split('&&').map((s) => s.trim()).filter(Boolean)) {
    let m;
    if ((m = /^npm\s+(?:run(?:-script)?\s+)?(test|start)(?=\s|$)/.exec(part)) || (m = /^npm\s+run(?:-script)?\s+(\S+)/.exec(part))) {
      if (!scripts) problems.push({ level: 'error', message: `\`${part}\` needs package.json, which is missing.` });
      else if (!Object.hasOwn(scripts, m[1])) problems.push({ level: 'error', message: `\`${part}\`: package.json has no "${m[1]}" script.` });
    } else if ((m = /^(?:pnpm|yarn|bun\s+run|bun)\s+(?:run\s+)?([^\s-][^\s]*)/.exec(part))) {
      if (PM_BUILTINS.has(m[1])) continue;
      if (!scripts) problems.push({ level: 'error', message: `\`${part}\` needs package.json, which is missing.` });
      else if (!Object.hasOwn(scripts, m[1])) problems.push({ level: 'error', message: `\`${part}\`: package.json has no "${m[1]}" script.` });
    } else if ((m = /^npx\s+(?:--no-install\s+)?([^\s@]+)/.exec(part))) {
      const pkgs = NPX_PACKAGES[m[1]] || [m[1]];
      const local = existsSync(join(root, 'node_modules', '.bin', m[1])) || existsSync(join(root, 'node_modules', '.bin', `${m[1]}.cmd`));
      if (!local && !pkgs.some((p) => deps[p])) problems.push({ level: 'warn', message: `\`${part}\`: "${m[1]}" is not a declared dependency, so npx may download it or fail.` });
    } else if ((m = /^make\s+(\S+)/.exec(part))) {
      if (!makeTargets.has(m[1])) problems.push({ level: 'error', message: `\`${part}\`: Makefile has no "${m[1]}" target.` });
    }
  }
  return problems;
}

function referencedPaths(text) {
  const refs = new Set();
  for (const m of text.matchAll(/`([^`\s]+)`/g)) {
    const token = m[1].replace(/[.,;:]+$/, '');
    if (/^(https?:|mailto:|--?|[~$@<])/.test(token) || /[<>*{}|=]/.test(token)) continue;
    if (/^[\w.-]+\/[\w./-]*$/.test(token) || /^[\w.-]+\.(md|json|ya?ml|toml|mjs|js|ts|py)$/.test(token)) refs.add(token.replace(/\/$/, ''));
  }
  return [...refs];
}

function claudeImports(text) {
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').replace(/<!--[\s\S]*?-->/g, '');
  return [...withoutCode.matchAll(/(?:^|\s)@([^\s]+)/g)].map((m) => m[1]).filter((p) => !p.includes('@'));
}

function tail(text, n) {
  return (text || '').replace(/\r\n?/g, '\n').trimEnd().split('\n').slice(-n).join('\n');
}

export function checkHarness(targetDir, { run = false, timeoutSeconds = 900 } = {}) {
  const root = resolve(targetDir);
  const findings = [];
  const add = (level, code, message, file) => findings.push({ level, code, message, file });
  const runs = [];
  const metrics = {};

  const { spec, errors } = loadSpec(root);
  if (!spec) {
    errors.forEach((e) => add('error', 'spec', e.message, SPEC_PATH));
    return finish();
  }
  errors.forEach((e) => add('error', 'spec', `${e.path}: ${e.message}`, SPEC_PATH));
  if (errors.length) return finish();

  try {
    const plan = planBuild(root);
    for (const o of plan.ops) {
      if (o.kind === 'lock') continue;
      if (o.action === 'create') add('error', 'drift', o.kind === 'seed' ? 'Missing; `build` will create it.' : 'Missing generated output; run `build`.', o.rel);
      else if (o.action === 'update') add('error', 'drift', 'Out of date with the spec; review `build --dry-run`, then run `build`.', o.rel);
      else if (o.action === 'conflict') add('error', 'hand-edit', `Generated content differs from the spec and the lock: ${o.reason}.`, o.rel);
      else if (o.action === 'delete') add('warn', 'stale', 'Generated for a module that is now disabled; `build` will remove it.', o.rel);
      else if (o.action === 'orphaned') add('warn', 'orphaned', o.reason, o.rel);
    }
    if (!plan.ops.some((o) => o.kind !== 'lock' && o.action !== 'unchanged') && plan.ops.some((o) => o.kind === 'lock')) {
      add('warn', 'lock', 'Generated files match the spec but .harness/lock.json is missing or outdated; run `build` to record ownership.', '.harness/lock.json');
    }
  } catch (error) {
    add('error', 'lock', error.message, '.harness/lock.json');
  }

  const pkgText = readTextIfExists(join(root, 'package.json'));
  let pkg = null;
  try { pkg = pkgText ? JSON.parse(pkgText) : null; } catch { add('warn', 'package-json', 'package.json is not valid JSON; npm script checks are unreliable.', 'package.json'); }
  const scripts = pkg ? pkg.scripts || {} : null;
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const makefile = readTextIfExists(join(root, 'Makefile'));
  const makeTargets = new Set(makefile ? [...makefile.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?!=)/gm)].map((m) => m[1]) : []);
  const v = spec.verification;
  for (const key of ['fast', 'full', 'e2e']) {
    if (!v[key]) continue;
    for (const p of checkCommand(root, v[key], scripts, deps, makeTargets)) add(p.level, 'command', `verification.${key}: ${p.message}`, SPEC_PATH);
  }
  if (!v.fast && !v.full && !v.e2e) add('warn', 'no-checks', 'No check commands are configured, so the agent cannot verify behavior. Add at least a fast check.', SPEC_PATH);
  else if (!v.full && !v.e2e && v.rigor !== 'light') add('warn', 'no-full-check', `Rigor is ${v.rigor}, but there is no full check to run before done.`, SPEC_PATH);

  const scan = scanRepository(root);
  for (const role of ['fast', 'full', 'e2e']) {
    const detected = scan.commands[role].filter((c) => c.confidence === 'detected').map((c) => c.cmd);
    const missing = detected.filter((c) => !(v[role] || '').includes(c));
    if (missing.length && !v[role]) add('info', 'scan', `The repository now has ${missing.map((c) => `\`${c}\``).join(', ')}, but verification.${role} is empty. Re-run \`design\` to include it.`, SPEC_PATH);
  }
  for (const note of scan.notes) add(note.level === 'warn' ? 'warn' : 'info', 'scan', note.message, note.evidence);

  const agentsText = readTextIfExists(join(root, 'AGENTS.md'));
  const claudeText = readTextIfExists(join(root, 'CLAUDE.md'));
  for (const [rel, text] of [['AGENTS.md', agentsText], ['CLAUDE.md', claudeText]]) {
    if (text === null) continue;
    for (const ref of referencedPaths(text)) if (!existsSync(join(root, ref))) add('warn', 'reference', `Mentions \`${ref}\`, which does not exist.`, rel);
  }
  if (claudeText !== null) {
    for (const imp of claudeImports(claudeText)) if (!existsSync(join(root, imp))) add('error', 'import', `Imports @${imp}, which does not exist.`, 'CLAUDE.md');
  }

  const alwaysOn = (agentsText ? agentsText.replace(/\n$/, '').split('\n').length : 0) +
    (claudeText && spec.agents.includes('claude') ? claudeText.split('\n').filter((l) => !/^\s*@AGENTS\.md\s*$/.test(l) && !l.startsWith('<!-- agent-harness:')).filter((l) => l.trim()).length : 0);
  const budget = spec.budget?.alwaysOnLines ?? 200;
  metrics.alwaysOnLines = alwaysOn;
  metrics.alwaysOnBudget = budget;
  if (alwaysOn > budget) add('warn', 'size', `Always-loaded instructions are ${alwaysOn} lines (budget ${budget}). Move procedures into skills and drop rules that no longer change behavior.`, 'AGENTS.md');
  if (agentsText) {
    const found = findBlock(agentsText);
    if (found && !found.malformed) {
      const outside = agentsText.slice(0, found.start) + agentsText.slice(found.end);
      metrics.handWrittenLines = outside.split('\n').filter((l) => l.trim()).length;
      const repeated = [...new Set(['fast', 'full', 'e2e'].flatMap((k) => (v[k] || '').split('&&').map((s) => s.trim())).filter((c) => c.length > 4 && outside.includes(c)))];
      if (repeated.length) add('info', 'duplicate', `Hand-written notes outside the managed block repeat ${repeated.map((c) => `\`${c}\``).join(', ')}. Two copies drift apart; keep the generated one and remove the other.`, 'AGENTS.md');
    }
  }

  const skills = listSkills(root);
  metrics.skills = skills.length;
  const needsName = spec.agents.some((a) => a !== 'claude');
  for (const s of skills) {
    const fm = parseFrontmatter(s.text);
    if (fm.error) { add('error', 'skill', fm.error, s.rel); continue; }
    if (fm.unsupported.length) add('warn', 'skill', `Frontmatter lines ${fm.unsupported.join(', ')} use YAML this checker does not parse (lists or maps); verify them in your agent.`, s.rel);
    const { name, description } = fm.data;
    if (!description || !String(description).trim()) add('error', 'skill', 'Missing `description`; agents use it to decide when to load the skill.', s.rel);
    else if (String(description).length > 1024) add('error', 'skill', `\`description\` is ${String(description).length} characters; the Agent Skills limit is 1024.`, s.rel);
    if (!name) add(needsName && s.dir !== '.claude/skills' ? 'error' : 'warn', 'skill', 'Missing `name`; Codex requires it, Claude Code falls back to the directory name.', s.rel);
    else {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) add('error', 'skill', `\`name\` "${name}" must be lowercase letters, digits and hyphens, at most 64 characters.`, s.rel);
      if (name !== s.name) add('warn', 'skill', `\`name\` "${name}" differs from its directory "${s.name}".`, s.rel);
    }
  }
  if (spec.agents.includes('cursor')) {
    const byName = new Map();
    for (const s of skills) byName.set(s.name, [...(byName.get(s.name) || []), s.dir]);
    const dupes = [...byName].filter(([, dirs]) => new Set(dirs).size > 1).map(([name]) => name);
    if (dupes.length) add('info', 'duplicate-skill', `${dupes.length} skill(s) exist in more than one skill directory (${dupes.join(', ')}); Cursor reads all of them, so they may be listed twice.`, SKILL_ROOTS.filter((d) => skills.some((s) => s.dir === d)).join(', '));
  }

  if (spec.approvals.length) add('info', 'advisory', `${spec.approvals.length} ask-before rule(s) are instructions only; \`explain\` lists ways to enforce them.`, 'AGENTS.md');

  if (run) {
    for (const key of ['fast', 'full', 'e2e']) {
      const cmd = v[key];
      if (!cmd) continue;
      const started = Date.now();
      const res = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', timeout: timeoutSeconds * 1000, maxBuffer: 64 * 1024 * 1024 });
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      const timedOut = res.error?.code === 'ETIMEDOUT';
      const entry = { check: key, command: cmd, exitCode: res.status, seconds, timedOut };
      if (res.status !== 0) entry.outputTail = tail(`${res.stdout || ''}\n${res.stderr || ''}`, 20);
      runs.push(entry);
      if (res.status !== 0) add('error', 'run', `${key} check \`${cmd}\` ${timedOut ? `timed out after ${timeoutSeconds}s` : `exited with ${res.status ?? res.error?.message}`}.`, SPEC_PATH);
    }
  }
  return finish();

  function finish() {
    const errorsCount = findings.filter((f) => f.level === 'error').length;
    const warningsCount = findings.filter((f) => f.level === 'warn').length;
    return { root, passed: errorsCount === 0, errors: errorsCount, warnings: warningsCount, findings, metrics, runs };
  }
}
