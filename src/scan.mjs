import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { readTextIfExists } from './fs-safe.mjs';

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.astro', '.svelte-kit', '.turbo',
  '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', 'target', 'coverage', '.cache',
  'vendor', 'test-results', 'playwright-report', '.harness',
]);
const SOURCE_EXT = /\.(m?[jt]sx?|cjs|cts|mts|vue|svelte|astro|py|go|rs|java|kt|rb|php|cs|swift|c|cc|cpp|h|hpp|scala|ex|exs|dart)$/i;
const MAX_WALK_ENTRIES = 20000;

const SCRIPT_ROLES = {
  fast: ['typecheck', 'type-check', 'check-types', 'types', 'tsc', 'lint', 'check'],
  full: ['test', 'test:unit', 'test:ci'],
  e2e: ['test:e2e', 'e2e', 'test:playwright', 'test:cypress'],
  build: ['build'],
};

const SENSITIVE_RULES = [
  { id: 'migrations', label: 'Database migrations', paths: ['prisma/migrations', 'migrations', 'db/migrate', 'db/migrations', 'alembic', 'drizzle', 'supabase/migrations'] },
  { id: 'ci', label: 'CI/CD configuration', paths: ['.github/workflows', '.gitlab-ci.yml', '.circleci', 'azure-pipelines.yml', 'Jenkinsfile'] },
  { id: 'infra', label: 'Infrastructure and deployment config', paths: ['terraform', 'infra', 'k8s', 'helm', 'deploy', 'fly.toml', 'vercel.json', 'netlify.toml', 'docker-compose.yml', 'compose.yaml'] },
];
const SENSITIVE_DEPS = [
  { id: 'payments', label: 'Payments code', deps: ['stripe', '@stripe/stripe-js', '@stripe/react-stripe-js', '@paddle/paddle-node-sdk', '@lemonsqueezy/lemonsqueezy.js', 'braintree', 'paypal-rest-sdk', '@paypal/checkout-server-sdk'] },
  { id: 'auth', label: 'Authentication code', deps: ['next-auth', '@auth/core', '@clerk/nextjs', '@clerk/clerk-sdk-node', 'better-auth', 'lucia', 'passport', '@supabase/auth-helpers-nextjs', 'firebase-admin', 'jsonwebtoken', 'django-allauth'] },
];

const FRAMEWORK_DEPS = [
  ['next', 'Next.js'], ['astro', 'Astro'], ['@remix-run/node', 'Remix'], ['nuxt', 'Nuxt'], ['@sveltejs/kit', 'SvelteKit'],
  ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['@angular/core', 'Angular'], ['express', 'Express'],
  ['fastify', 'Fastify'], ['hono', 'Hono'], ['@nestjs/core', 'NestJS'], ['electron', 'Electron'], ['react-native', 'React Native'],
  ['prisma', 'Prisma'], ['@prisma/client', 'Prisma'], ['drizzle-orm', 'Drizzle ORM'], ['tailwindcss', 'Tailwind CSS'],
];
const TEST_DEPS = [
  ['vitest', 'Vitest'], ['jest', 'Jest'], ['@playwright/test', 'Playwright'], ['cypress', 'Cypress'], ['mocha', 'Mocha'],
];

const KNOWN_DIRS = {
  'src/app': 'App Router routes and layouts', app: 'application routes', pages: 'page routes', 'src/pages': 'page routes',
  components: 'UI components', 'src/components': 'UI components', lib: 'shared library code', 'src/lib': 'shared library code',
  prisma: 'database schema and migrations', migrations: 'database migrations', tests: 'tests', test: 'tests',
  e2e: 'end-to-end tests', 'tests/e2e': 'end-to-end tests', docs: 'documentation', packages: 'workspace packages',
  apps: 'workspace applications', scripts: 'project scripts', public: 'static assets',
};

function readJson(root, rel) {
  const text = readTextIfExists(join(root, rel));
  if (text === null) return { value: null, error: null };
  try { return { value: JSON.parse(text), error: null }; } catch (error) { return { value: null, error: error.message }; }
}

function isDir(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function countLines(text) {
  if (!text) return 0;
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed.split('\n').length;
}

function walkSourceFiles(root) {
  let count = 0;
  let visited = 0;
  let truncated = false;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (++visited > MAX_WALK_ENTRIES) { truncated = true; return { count, truncated }; }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(join(dir, entry.name));
      } else if (SOURCE_EXT.test(entry.name)) {
        count++;
      }
    }
  }
  return { count, truncated };
}

function runCommand(pm, script) {
  if (pm === 'npm') return script === 'test' ? 'npm test' : `npm run ${script}`;
  if (pm === 'bun') return `bun run ${script}`;
  return `${pm} ${script}`;
}

function makefileTargets(root) {
  const text = readTextIfExists(join(root, 'Makefile'));
  if (!text) return new Set();
  return new Set([...text.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?!=)/gm)].map((m) => m[1]));
}

function workspacePackages(root, pkg) {
  const patterns = [];
  if (Array.isArray(pkg?.workspaces)) patterns.push(...pkg.workspaces);
  else if (Array.isArray(pkg?.workspaces?.packages)) patterns.push(...pkg.workspaces.packages);
  const pnpm = readTextIfExists(join(root, 'pnpm-workspace.yaml'));
  if (pnpm) {
    for (const m of pnpm.matchAll(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)) patterns.push(m[1]);
  }
  const packages = [];
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.startsWith('!')) continue;
    const clean = pattern.replace(/\/\*\*?$/, '');
    const dirs = pattern.endsWith('*') ? (isDir(join(root, clean)) ? readdirSync(join(root, clean)).map((d) => `${clean}/${d}`) : []) : [clean];
    for (const dir of dirs) {
      const manifest = readJson(root, `${dir}/package.json`).value;
      if (manifest) packages.push({ path: dir, name: manifest.name || basename(dir) });
    }
  }
  return { patterns, packages };
}

/**
 * Read-only reconnaissance. Never executes project code.
 * Every fact carries the file it came from and whether it was read directly
 * ("detected") or derived from a convention ("inferred").
 */
export function scanRepository(targetDir) {
  const root = resolve(targetDir);
  const facts = [];
  const notes = [];
  const fact = (id, label, value, evidence, confidence = 'detected') => facts.push({ id, label, value, evidence, confidence });
  const has = (rel) => existsSync(join(root, rel));

  const exists = existsSync(root);
  const topEntries = exists ? readdirSync(root).filter((n) => !IGNORED_DIRS.has(n)) : [];

  const pkgRead = readJson(root, 'package.json');
  if (pkgRead.error) notes.push({ level: 'warn', message: `package.json is not valid JSON (${pkgRead.error}); Node.js facts were skipped.`, evidence: 'package.json' });
  const pkg = pkgRead.value;
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};

  const stack = [];
  const testFrameworks = [];
  const commands = { fast: [], full: [], e2e: [], build: [] };
  const addCommand = (role, cmd, evidence, confidence) => {
    if (!commands[role].some((c) => c.cmd === cmd)) commands[role].push({ cmd, evidence, confidence });
  };

  let packageManager = null;
  if (pkg) {
    packageManager = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm';
    const lockEvidence = { pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: has('bun.lock') ? 'bun.lock' : 'bun.lockb', npm: has('package-lock.json') ? 'package-lock.json' : 'package.json' }[packageManager];
    fact('packageManager', 'Package manager', packageManager, lockEvidence, lockEvidence === 'package.json' ? 'inferred' : 'detected');
    stack.push('Node.js');
    if (has('tsconfig.json') || deps.typescript) {
      stack.push('TypeScript');
      fact('typescript', 'TypeScript', true, has('tsconfig.json') ? 'tsconfig.json' : 'package.json#devDependencies');
    }
    for (const [dep, name] of FRAMEWORK_DEPS) {
      if (deps[dep] && !stack.includes(name)) {
        stack.push(name);
        fact(`framework:${dep}`, name, deps[dep], 'package.json');
      }
    }
    for (const [dep, name] of TEST_DEPS) {
      if (deps[dep]) {
        testFrameworks.push(name);
        fact(`test:${dep}`, `${name} test runner`, deps[dep], 'package.json');
      }
    }
    for (const [role, names] of Object.entries(SCRIPT_ROLES)) {
      for (const name of names) {
        const body = scripts[name];
        if (typeof body !== 'string' || !body.trim()) continue;
        if (name === 'test' && /no test specified/.test(body)) continue;
        addCommand(role, runCommand(packageManager, name), `package.json#scripts.${name}`, 'detected');
        if (/(^|\s)--watch(\s|$)|(^|\s)(jest|vitest)\s+watch\b/.test(body)) {
          notes.push({ level: 'warn', message: `Script "${name}" starts watch mode ("${body}"); an agent's shell call would not exit. Use a one-shot variant.`, evidence: `package.json#scripts.${name}` });
        }
      }
    }
    if (!commands.fast.length && stack.includes('TypeScript') && has('tsconfig.json')) {
      addCommand('fast', 'npx tsc --noEmit', 'tsconfig.json', 'inferred');
    }
    const scriptRunsE2e = Object.values(scripts).some((s) => typeof s === 'string' && /\b(playwright|cypress)\b/.test(s));
    if (!commands.e2e.length && !scriptRunsE2e && deps['@playwright/test']) addCommand('e2e', 'npx playwright test', 'package.json#devDependencies', 'inferred');
    if (pkg.workspaces || has('pnpm-workspace.yaml')) {
      const ws = workspacePackages(root, pkg);
      fact('workspaces', 'Workspace packages', ws.packages.map((p) => p.path), has('pnpm-workspace.yaml') ? 'pnpm-workspace.yaml' : 'package.json#workspaces');
    }
  }

  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) {
    const evidence = has('pyproject.toml') ? 'pyproject.toml' : has('requirements.txt') ? 'requirements.txt' : 'setup.py';
    stack.push('Python');
    fact('python', 'Python', true, evidence);
    const py = (readTextIfExists(join(root, 'pyproject.toml')) || '') + (readTextIfExists(join(root, 'requirements.txt')) || '');
    if (/\bruff\b/.test(py) || has('ruff.toml') || has('.ruff.toml')) addCommand('fast', 'ruff check .', has('ruff.toml') ? 'ruff.toml' : evidence, 'inferred');
    if (/\bmypy\b/.test(py)) addCommand('fast', 'mypy .', evidence, 'inferred');
    if (/\bpytest\b/.test(py) || has('pytest.ini') || has('conftest.py')) {
      testFrameworks.push('pytest');
      addCommand('full', 'pytest -q', has('pytest.ini') ? 'pytest.ini' : evidence, 'inferred');
    }
    for (const [dep, name] of [['django', 'Django'], ['fastapi', 'FastAPI'], ['flask', 'Flask']]) {
      if (new RegExp(`\\b${dep}\\b`, 'i').test(py)) { stack.push(name); fact(`framework:${dep}`, name, true, evidence, 'inferred'); }
    }
  }
  if (has('go.mod')) {
    stack.push('Go');
    fact('go', 'Go module', true, 'go.mod');
    addCommand('fast', 'go vet ./...', 'go.mod', 'inferred');
    addCommand('full', 'go test ./...', 'go.mod', 'inferred');
  }
  if (has('Cargo.toml')) {
    stack.push('Rust');
    fact('rust', 'Rust crate', true, 'Cargo.toml');
    addCommand('fast', 'cargo check', 'Cargo.toml', 'inferred');
    addCommand('full', 'cargo test', 'Cargo.toml', 'inferred');
  }
  const make = makefileTargets(root);
  for (const [target, role] of [['lint', 'fast'], ['check', 'fast'], ['test', 'full'], ['e2e', 'e2e']]) {
    if (make.has(target)) addCommand(role, `make ${target}`, 'Makefile', 'detected');
  }

  const ci = [];
  if (isDir(join(root, '.github/workflows'))) {
    for (const f of readdirSync(join(root, '.github/workflows'))) if (/\.ya?ml$/.test(f)) ci.push(`.github/workflows/${f}`);
  }
  for (const f of ['.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile']) if (has(f)) ci.push(f);
  if (ci.length) fact('ci', 'CI configuration', ci, ci[0]);

  const instructionFiles = [];
  for (const rel of ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md', 'GEMINI.md', '.cursorrules', '.github/copilot-instructions.md']) {
    const text = readTextIfExists(join(root, rel));
    if (text === null) continue;
    instructionFiles.push({ path: rel, lines: countLines(text), managed: text.includes('<!-- agent-harness:begin') });
    fact(`instructions:${rel}`, `Existing ${rel}`, `${countLines(text)} lines`, rel);
  }
  if (isDir(join(root, '.cursor/rules'))) {
    instructionFiles.push({ path: '.cursor/rules', lines: null, managed: false });
    fact('instructions:.cursor/rules', 'Existing Cursor rules', true, '.cursor/rules');
  }

  const skills = [];
  for (const dir of ['.agents/skills', '.claude/skills', '.cursor/skills', '.codex/skills']) {
    if (!isDir(join(root, dir))) continue;
    for (const name of readdirSync(join(root, dir))) {
      if (existsSync(join(root, dir, name, 'SKILL.md'))) skills.push({ dir, name, path: `${dir}/${name}/SKILL.md` });
    }
  }

  const agentHints = [];
  const hint = (agent, evidence) => { if (!agentHints.some((h) => h.agent === agent)) agentHints.push({ agent, evidence }); };
  if (has('CLAUDE.md') || has('.claude')) hint('claude', has('CLAUDE.md') ? 'CLAUDE.md' : '.claude/');
  if (has('.cursor') || has('.cursorrules')) hint('cursor', has('.cursor') ? '.cursor/' : '.cursorrules');
  if (has('.codex')) hint('codex', '.codex/');
  if (has('GEMINI.md') || has('.gemini')) hint('other', has('GEMINI.md') ? 'GEMINI.md' : '.gemini/');
  if (has('.github/copilot-instructions.md')) hint('other', '.github/copilot-instructions.md');

  const sensitive = [];
  for (const rule of SENSITIVE_RULES) {
    const found = rule.paths.filter(has);
    if (found.length) sensitive.push({ id: rule.id, label: rule.label, paths: found, evidence: found[0] });
  }
  for (const rule of SENSITIVE_DEPS) {
    const found = rule.deps.filter((d) => deps[d]);
    if (found.length) sensitive.push({ id: rule.id, label: rule.label, paths: [], deps: found, evidence: `package.json (${found.join(', ')})` });
  }
  const envFiles = topEntries.filter((n) => /^\.env(\..+)?$/.test(n) && !/\.(example|sample|template)$/.test(n));
  if (envFiles.length) sensitive.push({ id: 'secrets', label: 'Local secrets files', paths: envFiles, evidence: envFiles[0] });

  const layout = Object.entries(KNOWN_DIRS)
    .filter(([dir]) => isDir(join(root, dir)))
    .filter(([dir], _, all) => !(dir === 'app' && all.some(([d]) => d === 'src/app')))
    .map(([path, purpose]) => ({ path, purpose }));

  const { count: sourceFiles, truncated } = exists ? walkSourceFiles(root) : { count: 0, truncated: false };
  const hasCode = stack.length > 0 || sourceFiles > 0;
  const stage = hasCode ? 'existing' : 'new';

  const readme = readTextIfExists(join(root, 'README.md'));
  const readmeSummary = readme
    ?.split('\n\n')
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('[') && !p.startsWith('!') && !p.startsWith('<') && p.length > 20)
    ?.replace(/\s+/g, ' ')
    .slice(0, 240) || null;

  const legacyV2 = has('.agents/harness-manifest.json');
  if (legacyV2) notes.push({ level: 'warn', message: 'An agent-harness-kit v2 installation manifest exists. v3 does not manage v2 files; see docs/MIGRATION.md.', evidence: '.agents/harness-manifest.json' });

  return {
    root,
    stage,
    project: {
      name: (typeof pkg?.name === 'string' && pkg.name) || basename(root),
      description: (typeof pkg?.description === 'string' && pkg.description.trim()) || readmeSummary,
      descriptionEvidence: pkg?.description ? 'package.json#description' : readmeSummary ? 'README.md' : null,
    },
    stack,
    packageManager,
    testFrameworks,
    commands,
    workspaces: pkg ? workspacePackages(root, pkg).packages : [],
    layout,
    ci,
    instructionFiles,
    skills,
    agentHints,
    sensitive,
    size: { sourceFiles, truncated },
    hasSpec: has('.harness/spec.json'),
    legacyV2,
    facts,
    notes,
  };
}
