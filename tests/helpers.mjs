import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';

export const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = join(KIT, 'bin', 'agent-harness.mjs');

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** Creates a temporary project from a { relPath: content } map. Objects are written as JSON. */
export function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ahk-test-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) write(root, rel, content);
  return root;
}

export function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

export function read(root, rel) {
  return readFileSync(join(root, rel), 'utf8');
}

export function cli(args, opts = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, SOURCE_DATE_EPOCH: '1792540800' }, ...opts });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

export function jsonCli(args) {
  const r = cli([...args, '--json']);
  return { ...r, data: JSON.parse(r.out) };
}

export const NEXT_APP = {
  'package.json': {
    name: 'shop', description: 'A shop.',
    scripts: { lint: 'next lint', typecheck: 'tsc --noEmit', test: 'vitest run', 'test:e2e': 'playwright test', build: 'next build' },
    dependencies: { next: '15.0.0', react: '19.0.0', stripe: '17.0.0' },
    devDependencies: { typescript: '5.7.0', vitest: '3.0.0', '@playwright/test': '1.50.0' },
  },
  'tsconfig.json': '{}',
  'src/app/page.tsx': 'export default function P() { return null; }\n',
  'prisma/migrations/0001/migration.sql': 'select 1;\n',
};

/** Runs design non-interactively; throws on failure. */
export function design(root, sets = [], extra = []) {
  const r = cli(['design', root, '--yes', ...sets.flatMap((s) => ['--set', s]), ...extra]);
  if (r.code !== 0) throw new Error(`design failed: ${r.err || r.out}`);
  return r;
}

export function build(root, extra = []) {
  return cli(['build', root, ...extra]);
}
