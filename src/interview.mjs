import { createInterface } from 'node:readline/promises';
import { AGENTS, APPROVALS, MEMORY, RIGOR, defaultAnswers } from './spec.mjs';

/**
 * The questions the kit asks, with what the scan already knows.
 * The same list drives the terminal interview and `design --questions --json` for agents.
 */
export function buildQuestions(scan, current) {
  const cmdEvidence = (role) => scan.commands[role].map((c) => `${c.cmd} (${c.confidence}, ${c.evidence})`);
  const q = [
    {
      id: 'agents', type: 'multi', required: true, prompt: 'Which AI coding tools will work in this repository?',
      why: 'Decides which entry files and skill directories are generated; each tool reads different paths.',
      options: Object.entries(AGENTS).map(([id, a]) => ({ id, label: a.label, detail: `reads ${a.reads}` })),
      evidence: scan.agentHints.map((h) => `${h.agent} (${h.evidence})`),
      default: current.agents,
    },
    {
      id: 'summary', type: 'text', prompt: 'In one sentence: what is this project, and for whom?',
      why: 'Opens AGENTS.md, so every session starts from the purpose rather than from the file tree.',
      evidence: scan.project.descriptionEvidence ? [scan.project.descriptionEvidence] : [],
      default: current.summary,
    },
  ];
  if (scan.stage === 'new') {
    q.push({
      id: 'stack', type: 'list', prompt: 'Planned stack (comma-separated), or leave empty if undecided.',
      why: 'With no stack yet, the harness makes "decide the stack and record it" the first task instead of guessing commands.',
      evidence: [], default: current.stack,
    });
  }
  q.push(
    {
      id: 'rigor', type: 'single', prompt: 'How much verification should the agent do before calling a task done?',
      why: 'The main trade-off: more checks catch more regressions but make every task slower and longer.',
      options: Object.entries(RIGOR).map(([id, detail]) => ({ id, label: id, detail })),
      evidence: scan.testFrameworks.length ? [`test frameworks: ${scan.testFrameworks.join(', ')}`] : ['no test framework detected'],
      default: current.rigor,
    },
    {
      id: 'fast', type: 'command', prompt: 'Fast check (seconds) the agent runs after each meaningful change. "none" to leave empty.',
      why: 'A fast, deterministic signal is what lets the agent correct itself before you look at the diff.',
      evidence: cmdEvidence('fast'), default: current.fast,
    },
    {
      id: 'full', type: 'command', prompt: 'Full check the agent runs once before reporting done. "none" to leave empty.',
      why: 'Catches regressions outside the files the agent touched. Add the build if it catches errors the tests miss.',
      evidence: [...cmdEvidence('full'), ...cmdEvidence('build').map((e) => `build: ${e}`)], default: current.full,
    },
    {
      id: 'e2e', type: 'command', prompt: 'End-to-end suite, run when a user-facing flow changes. "none" to leave empty.',
      why: 'Slow and noisy, so it runs only when flows change, with concise output.',
      evidence: cmdEvidence('e2e'), default: current.e2e,
    },
    {
      id: 'memory', type: 'single', prompt: 'What should persist between sessions?',
      why: 'Agents start each session without the previous conversation; files on disk are the memory.',
      options: Object.entries(MEMORY).map(([id, detail]) => ({ id, label: id, detail })),
      evidence: [], default: current.memory,
    },
    {
      id: 'approvals', type: 'multi', prompt: 'Which actions must the agent ask you about first?',
      why: 'Listed in AGENTS.md as instructions. They are advisory; `explain` shows how to enforce them.',
      options: Object.entries(APPROVALS).map(([id, label]) => ({ id, label })),
      evidence: scan.sensitive.map((s) => `${s.id}: ${s.evidence}`),
      default: current.approvals,
    },
    {
      id: 'rules', type: 'lines', prompt: 'Project rules the agent cannot infer from the code (one per line, empty line to finish).',
      why: 'Only rules that change behavior earn a place in always-loaded instructions. Leave empty if unsure; add rules when a mistake repeats.',
      evidence: [], default: current.rules,
    },
  );
  return q;
}

function show(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(none)';
  return value === null || value === undefined || value === '' ? '(none)' : String(value);
}

/** Terminal interview. Enter accepts the shown default. */
export async function runInterview(scan, preset, { input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output });
  const say = (s = '') => output.write(`${s}\n`);
  const current = { ...defaultAnswers(scan), ...preset };
  const answers = {};
  try {
    say(`Scanned ${scan.root}`);
    say(`  ${scan.stage === 'new' ? 'New project (no code found)' : `Existing project: ${scan.stack.join(', ') || 'stack not recognized'}`}, about ${scan.size.sourceFiles} source files`);
    for (const n of scan.notes) say(`  note: ${n.message}`);
    say('Press Enter to accept the value in [brackets].');
    for (const q of buildQuestions(scan, current)) {
      say('');
      say(q.prompt);
      say(`  why: ${q.why}`);
      if (q.evidence?.length) say(`  found: ${q.evidence.join('; ')}`);
      if (q.options) q.options.forEach((o, i) => say(`  ${i + 1}. ${o.label}${o.detail ? `: ${o.detail}` : ''}`));
      if (q.type === 'lines') {
        if (q.default?.length) say(`  current: ${q.default.join(' | ')}  (Enter keeps them)`);
        const lines = [];
        while (true) {
          const line = (await rl.question('  > ')).trim();
          if (!line) break;
          lines.push(line);
        }
        answers[q.id] = lines.length ? lines : q.default;
        continue;
      }
      const hint = q.options && q.type === 'multi' ? ' (numbers or ids, comma-separated)' : q.options ? ' (number or id)' : '';
      while (true) {
        const raw = (await rl.question(`  [${show(q.default)}]${hint} > `)).trim();
        if (!raw && q.required && !(Array.isArray(q.default) ? q.default.length : q.default)) { say('  Choose at least one.'); continue; }
        if (!raw) { answers[q.id] = q.default; break; }
        if (!q.options) { answers[q.id] = q.type === 'list' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : raw; break; }
        const picked = raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (/^\d+$/.test(s) ? q.options[Number(s) - 1]?.id : s));
        if (picked.some((p) => !p || !q.options.some((o) => o.id === p))) { say('  Not one of the options; try again.'); continue; }
        if (q.type === 'single' && picked.length !== 1) { say('  Choose exactly one.'); continue; }
        answers[q.id] = q.type === 'single' ? picked[0] : picked;
        break;
      }
    }
    return answers;
  } finally {
    rl.close();
  }
}

export async function confirm(question, { input = process.stdin, output = process.stdout, defaultYes = true } = {}) {
  const rl = createInterface({ input, output });
  try {
    const raw = (await rl.question(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)).trim().toLowerCase();
    return raw ? raw === 'y' || raw === 'yes' : defaultYes;
  } finally {
    rl.close();
  }
}
