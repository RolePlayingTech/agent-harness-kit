#!/usr/bin/env node
// Regenerates examples/*/expected from examples/*/project and answers.json using the real CLI.
// The test suite runs the same function and compares, so README examples cannot drift from the code.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(KIT, 'bin', 'agent-harness.mjs');
export const EXAMPLE_DATE_EPOCH = '1792540800';

function cli(args, cwd) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, SOURCE_DATE_EPOCH: EXAMPLE_DATE_EPOCH } });
  if (res.status !== 0) throw new Error(`agent-harness ${args.join(' ')} failed:\n${res.stdout}\n${res.stderr}`);
  return res.stdout;
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).replaceAll('\\', '/'));
  }
  return out.sort();
}

/** Returns { files: { relPath: content }, explain } for one example. */
export function generateExample(name) {
  const exampleDir = join(KIT, 'examples', name);
  const work = mkdtempSync(join(tmpdir(), `ahk-${name}-`));
  const target = join(work, name);
  try {
    if (existsSync(join(exampleDir, 'project'))) cpSync(join(exampleDir, 'project'), target, { recursive: true });
    else mkdirSync(target);
    const inputs = new Set(existsSync(join(exampleDir, 'project')) ? listFiles(join(exampleDir, 'project')) : []);
    cli(['design', target, '--answers', join(exampleDir, 'answers.json'), '--yes'], work);
    cli(['build', target], work);
    const files = {};
    for (const rel of listFiles(target)) {
      if (!inputs.has(rel)) files[rel] = readFileSync(join(target, rel), 'utf8').replace(/\r\n/g, '\n');
    }
    const explain = cli(['explain', target], work).replace(/\r\n/g, '\n');
    return { files, explain };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function exampleNames() {
  return readdirSync(join(KIT, 'examples')).filter((n) => existsSync(join(KIT, 'examples', n, 'answers.json'))).sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const name of exampleNames()) {
    const { files, explain } = generateExample(name);
    const expected = join(KIT, 'examples', name, 'expected');
    rmSync(expected, { recursive: true, force: true });
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(expected, rel)), { recursive: true });
      writeFileSync(join(expected, rel), content);
    }
    writeFileSync(join(KIT, 'examples', name, 'explain.txt'), explain);
    console.log(`${name}: ${Object.keys(files).length} generated file(s)`);
  }
}
