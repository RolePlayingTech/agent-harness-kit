/**
 * Read-Only Workspace Reconnaissance & Auto-Discovery Engine (Fixes Issue #4, #2, #19)
 * Inspects an existing (brownfield) or empty (greenfield) repository without executing
 * untrusted code, returning grounded evidence paths, confidence levels, and open questions.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.astro',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'coverage',
  '.cache',
  'test-results',
  'playwright-report',
]);

/**
 * Performs safe, read-only reconnaissance of a target directory.
 * @param {string} targetDir
 */
export function inspectWorkspace(targetDir) {
  const facts = [];
  const risksAndDrift = [];
  const unknowns = [];

  const hasFile = (relPath) => existsSync(join(targetDir, relPath));
  const readJsonSafe = (relPath) => {
    try {
      const full = join(targetDir, relPath);
      if (!existsSync(full)) return null;
      return JSON.parse(readFileSync(full, 'utf8'));
    } catch {
      return null;
    }
  };

  // 1. Scan top-level entries (excluding noise)
  const topEntries = existsSync(targetDir)
    ? readdirSync(targetDir).filter((name) => !IGNORED_DIRS.has(name))
    : [];

  // 2. Detect manifests and languages
  const pkgJson = readJsonSafe('package.json');
  const hasPyproject = hasFile('pyproject.toml');
  const hasRequirements = hasFile('requirements.txt');
  const hasCargo = hasFile('Cargo.toml');
  const hasGoMod = hasFile('go.mod');
  const hasTsConfig = hasFile('tsconfig.json');

  const detectedStack = [];
  const verificationCommands = {
    typecheck: null,
    lint: null,
    test: null,
    build: null,
  };

  let isMonorepo = false;

  if (pkgJson) {
    const deps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.devDependencies || {}),
    };

    if (pkgJson.workspaces || hasFile('pnpm-workspace.yaml') || hasFile('turbo.json')) {
      isMonorepo = true;
      facts.push({
        category: 'topology',
        summary: 'Monorepo workspace structure detected',
        evidencePath: hasFile('pnpm-workspace.yaml') ? 'pnpm-workspace.yaml' : 'package.json#workspaces',
        confidence: 'high',
      });
    }

    const pkgManager = hasFile('pnpm-lock.yaml')
      ? 'pnpm'
      : hasFile('yarn.lock')
        ? 'yarn'
        : hasFile('bun.lockb') || hasFile('bun.lock')
          ? 'bun'
          : 'npm';

    detectedStack.push(`Node.js (${pkgManager})`);
    facts.push({
      category: 'runtime',
      summary: `Node.js project managed with ${pkgManager}`,
      evidencePath: 'package.json',
      confidence: 'high',
    });

    if (hasTsConfig || deps.typescript) {
      detectedStack.push('TypeScript');
      facts.push({
        category: 'language',
        summary: 'TypeScript enabled',
        evidencePath: hasTsConfig ? 'tsconfig.json' : 'package.json',
        confidence: 'high',
      });
      verificationCommands.typecheck = 'npx tsc --noEmit';
    }

    if (deps.astro) {
      detectedStack.push('Astro');
      facts.push({ category: 'framework', summary: `Astro (${deps.astro})`, evidencePath: 'package.json', confidence: 'high' });
    }
    if (deps.next) {
      detectedStack.push('Next.js');
      facts.push({ category: 'framework', summary: `Next.js (${deps.next})`, evidencePath: 'package.json', confidence: 'high' });
    }
    if (deps.react) {
      detectedStack.push('React');
      facts.push({ category: 'framework', summary: `React (${deps.react})`, evidencePath: 'package.json', confidence: 'high' });
    }
    if (deps.vue) {
      detectedStack.push('Vue');
      facts.push({ category: 'framework', summary: `Vue (${deps.vue})`, evidencePath: 'package.json', confidence: 'high' });
    }
    if (deps.fastify || deps.hono || deps.express) {
      const srv = deps.fastify ? 'Fastify' : deps.hono ? 'Hono' : 'Express';
      detectedStack.push(srv);
      facts.push({ category: 'backend', summary: `${srv} HTTP server`, evidencePath: 'package.json', confidence: 'high' });
    }

    const scripts = pkgJson.scripts || {};
    const runPrefix = pkgManager === 'npm' ? 'npm run' : pkgManager;
    if (scripts.typecheck || scripts.check) {
      verificationCommands.typecheck = `${runPrefix} ${scripts.typecheck ? 'typecheck' : 'check'}`;
    }
    if (scripts.lint) {
      verificationCommands.lint = `${runPrefix} lint`;
    }
    if (scripts.build) {
      verificationCommands.build = `${runPrefix} build`;
    }
    if (scripts.test && !scripts.test.includes('no test specified')) {
      verificationCommands.test = pkgManager === 'npm' ? 'npm test' : `${pkgManager} test`;
    }

    if (deps['@playwright/test'] || hasFile('playwright.config.ts') || hasFile('playwright.config.js')) {
      facts.push({
        category: 'testing',
        summary: 'Playwright E2E test suite detected',
        evidencePath: hasFile('playwright.config.ts') ? 'playwright.config.ts' : 'package.json',
        confidence: 'high',
      });
      if (!verificationCommands.test) verificationCommands.test = 'npx playwright test';
    }
    if (deps.vitest || hasFile('vitest.config.ts')) {
      facts.push({
        category: 'testing',
        summary: 'Vitest unit test runner detected',
        evidencePath: hasFile('vitest.config.ts') ? 'vitest.config.ts' : 'package.json',
        confidence: 'high',
      });
    }
  }

  if (hasPyproject || hasRequirements) {
    detectedStack.push('Python');
    const pyEvidence = hasPyproject ? 'pyproject.toml' : 'requirements.txt';
    facts.push({
      category: 'language',
      summary: 'Python project detected',
      evidencePath: pyEvidence,
      confidence: 'high',
    });
    if (hasFile('pytest.ini') || hasFile('tests')) {
      verificationCommands.test = verificationCommands.test || 'pytest -q';
    }
    verificationCommands.lint = verificationCommands.lint || 'ruff check .';
  }

  if (hasCargo) {
    detectedStack.push('Rust (Cargo)');
    facts.push({ category: 'language', summary: 'Rust Cargo workspace', evidencePath: 'Cargo.toml', confidence: 'high' });
    verificationCommands.typecheck = verificationCommands.typecheck || 'cargo check';
    verificationCommands.test = verificationCommands.test || 'cargo test';
  }

  if (hasGoMod) {
    detectedStack.push('Go');
    facts.push({ category: 'language', summary: 'Go module detected', evidencePath: 'go.mod', confidence: 'high' });
    verificationCommands.test = verificationCommands.test || 'go test ./...';
  }

  // 3. Detect Database / Migrations & CI
  const dbPaths = ['prisma/schema.prisma', 'drizzle.config.ts', 'migrations', 'supabase/config.toml', 'alembic.ini'];
  for (const dbp of dbPaths) {
    if (hasFile(dbp)) {
      facts.push({
        category: 'database',
        summary: `Database / migration artifacts detected at ${dbp}`,
        evidencePath: dbp,
        confidence: 'high',
      });
    }
  }

  if (hasFile('.github/workflows')) {
    const wfFiles = readdirSync(join(targetDir, '.github/workflows')).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    if (wfFiles.length > 0) {
      facts.push({
        category: 'ci',
        summary: `GitHub Actions CI workflows (${wfFiles.join(', ')})`,
        evidencePath: `.github/workflows/${wfFiles[0]}`,
        confidence: 'high',
      });
    }
  }

  // 4. Detect Existing AI Harness & Provider Configurations
  const existingHarness = {
    agentsMd: hasFile('AGENTS.md'),
    claudeMd: hasFile('CLAUDE.md'),
    geminiMd: hasFile('GEMINI.md'),
    cursorRules: hasFile('.cursorrules') || hasFile('.cursor/rules'),
    agentsSkillsDir: hasFile('.agents/skills'),
    claudeSkillsDir: hasFile('.claude/skills'),
    featureLedger: hasFile('feature_list.json'),
    handoffMd: hasFile('HANDOFF.md'),
    manifest: hasFile('.agents/harness-manifest.json'),
  };

  if (existingHarness.agentsMd) {
    const lines = readFileSync(join(targetDir, 'AGENTS.md'), 'utf8').split(/\r?\n/).length;
    facts.push({
      category: 'harness',
      summary: `Existing AGENTS.md (${lines} lines)`,
      evidencePath: 'AGENTS.md',
      confidence: 'high',
    });
    if (lines > 80) {
      risksAndDrift.push({
        severity: 'high',
        code: 'ROOT_CONTEXT_BLOAT',
        message: `AGENTS.md is ${lines} lines (>80 recommended). This causes permanent token overhead on every turn.`,
        evidencePath: 'AGENTS.md',
        proposedFix: 'Move detailed runbooks into .agents/skills/*/SKILL.md (Progressive Disclosure).',
      });
    }
  }

  if (existingHarness.claudeMd) {
    const lines = readFileSync(join(targetDir, 'CLAUDE.md'), 'utf8').split(/\r?\n/).length;
    facts.push({
      category: 'harness',
      summary: `Existing CLAUDE.md (${lines} lines)`,
      evidencePath: 'CLAUDE.md',
      confidence: 'high',
    });
  }

  // Determine overall mode: greenfield vs brownfield
  const hasCodeDirs = ['src', 'app', 'lib', 'server', 'packages', 'cmd', 'bin'].some((d) => hasFile(d));
  const isBrownfield = detectedStack.length > 0 || hasCodeDirs;
  const mode = isBrownfield ? (isMonorepo ? 'brownfield-monorepo' : 'brownfield') : 'greenfield';

  // 5. Compute grounded risks & unknowns to discuss with the user
  if (isBrownfield && !verificationCommands.test) {
    risksAndDrift.push({
      severity: 'medium',
      code: 'NO_TEST_SENSOR_DETECTED',
      message: 'No automated test command was detected in manifests. AI agents will lack a behavioral verification sensor.',
      evidencePath: pkgJson ? 'package.json' : '.',
      proposedFix: 'Discuss testing trade-offs (`fast-prototype` vs `smart-tiered`) and wire a smoke test command.',
    });
  }

  if (mode === 'greenfield') {
    unknowns.push(
      {
        id: 'product_vision',
        questionEn: 'What are we building, who is the target user, and what is the single core workflow for the MVP?',
        questionPl: 'Co budujemy, dla kogo i jaka jest jedna kluczowa ścieżka użytkownika (MVP)?',
      },
      {
        id: 'stack_choice',
        questionEn: 'Would you like me to compare 2–3 technology stacks with pros, cons, cost drivers, and AI legibility before we scaffold?',
        questionPl: 'Czy porównać dla Ciebie 2–3 warianty technologii (Za / Przeciw / Koszty / Czytelność dla AI) przed wyborem stacku?',
      },
      {
        id: 'testing_vs_context',
        questionEn: 'Which Testing vs. Context Token Budget profile fits this stage (`fast-prototype`, `smart-tiered`, `isolated-verifier`, or `mission-critical`)?',
        questionPl: 'Który profil kompromisu Testy vs. Zużycie Kontekstu i Tokenów wybieramy (`fast-prototype`, `smart-tiered`, `isolated-verifier` czy `mission-critical`)?',
      }
    );
  } else {
    unknowns.push(
      {
        id: 'testing_vs_context',
        questionEn: `We detected [${detectedStack.join(', ')}]. How aggressively should the agent run tests during coding vs. conserving context tokens (\`smart-tiered\` silent checks vs. \`isolated-verifier\` subagent vs. \`fast-prototype\`)?`,
        questionPl: `Wykryto stack [${detectedStack.join(', ')}]. Jak intensywnie agent ma uruchamiać testy względem oszczędzania kontekstu i tokenów (\`smart-tiered\` ciche sito vs. \`isolated-verifier\` w subagencie vs. \`fast-prototype\`)?`,
      },
      {
        id: 'red_lines',
        questionEn: 'Which sensitive boundaries in this repository require explicit human confirmation (`Prepare -> Confirm`) before the agent touches them (e.g., DB migrations, production deploy scripts, auth)?',
        questionPl: 'Które wrażliwe obszary w tym repozytorium wymagają jawnej zgody człowieka (`Prepare -> Confirm`), zanim agent ich dotknie (np. migracje bazy, skrypty wdrożeniowe, autoryzacja)?',
      }
    );
  }

  // Map top-level directories for architectural summary
  const keyDirectories = topEntries.filter((name) => {
    try {
      return statSync(join(targetDir, name)).isDirectory();
    } catch {
      return false;
    }
  });

  return {
    mode,
    targetDir,
    detectedStack,
    keyDirectories,
    verificationCommands,
    existingHarness,
    facts,
    risksAndDrift,
    unknowns,
  };
}
