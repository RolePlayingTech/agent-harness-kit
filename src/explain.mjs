import { AGENTS } from './spec.mjs';
import { deriveModules, enforcementHints, skillDirs } from './engine.mjs';

export function explainData(spec) {
  const modules = deriveModules(spec);
  return {
    project: { name: spec.project.name, stage: spec.project.stage, stack: spec.project.stack },
    agents: spec.agents.map((a) => ({ id: a, label: AGENTS[a].label, reads: AGENTS[a].reads })),
    skillDirectories: skillDirs(spec.agents),
    modules,
    enforcement: enforcementHints(spec),
  };
}

function wrap(text, indent, width = 96) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width - indent.length) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
}

export function formatExplain(spec, { brief = false } = {}) {
  const d = explainData(spec);
  const out = [];
  const stack = d.project.stack.length ? d.project.stack.join(', ') : 'stack not chosen';
  out.push(`Harness for ${d.project.name} (${d.project.stage} project; ${stack})`);
  out.push(`Agents: ${d.agents.map((a) => a.label).join(', ')}`);
  out.push('');
  const on = d.modules.filter((m) => m.enabled);
  const off = d.modules.filter((m) => !m.enabled);
  out.push('Included');
  for (const m of on) {
    out.push(`  [on]  ${m.title}${m.overridden ? ' (override)' : ''}`);
    if (!brief) {
      out.push(wrap(`Why: ${m.why}`, '        '));
      out.push(wrap(`Cost: ${m.tradeoff}`, '        '));
      if (m.files.length) out.push(wrap(`Files: ${[...new Set(m.files)].join(', ')}`, '        '));
    }
  }
  out.push('');
  out.push('Left out');
  for (const m of off) {
    out.push(`  [off] ${m.title}${m.overridden ? ' (override)' : ''}`);
    if (!brief) out.push(wrap(`Why not: ${m.why}`, '        '));
  }
  if (!brief) {
    out.push('');
    out.push('Instructions are not enforcement');
    out.push(wrap('Everything above is text the model reads. It shapes behavior but cannot prevent an action. Enforce what matters outside the model:', '  '));
    for (const h of d.enforcement.hints) out.push(wrap(`- ${h.approval}: ${h.hint}`, '  '));
    for (const t of d.enforcement.tools) out.push(wrap(`- ${t}`, '  '));
    out.push('');
    out.push('Where each agent reads it');
    for (const a of d.agents) out.push(wrap(`- ${a.label}: ${a.reads}`, '  '));
    if (spec.agents.includes('cursor') && d.skillDirectories.length > 1) {
      out.push(wrap('- Note: Cursor can read both skill directories; the kit keeps the two copies identical, so whichever it loads says the same thing.', '  '));
    }
  }
  return out.join('\n');
}
