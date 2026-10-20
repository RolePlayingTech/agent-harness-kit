/**
 * Profiles, Trade-Off Matrices, Platform Adapters & Greenfield Stack Advisor
 * Fixes Issues #3, #11, #12, #13, #14
 */

export const TESTING_PROFILES = {
  'fast-prototype': {
    id: 'fast-prototype',
    nameEn: 'Fast Prototype / Eco-Context',
    namePl: 'Szybki Prototyp / Eko-Kontekst',
    contextImpact: 'Very Low (~5% window overhead)',
    tokenCostRating: 'Lowest',
    defectRisk: 'High (business logic bugs caught manually)',
    maxRepairAttempts: 2,
    runTestsPerEdit: false,
    useVerifierSubagent: false,
    useFreshEvaluator: false,
    summaryEn:
      'Runs only fast static type/syntax checks (<2s) during coding. Avoids verbose test runner logs in the context window to maximize speed and minimize token spend.',
    summaryPl:
      'Uruchamia wyłącznie błyskawiczne sprawdzanie typów/składni (<2s). Unika długich logów testowych w oknie kontekstowym, minimalizując zużycie tokenów kosztem wyższego ryzyka błędów.',
    whenToChooseEn: 'Hackathons, day-1 UI prototypes, or throwaway spikes.',
    whenToChoosePl: 'Hackathony, pierwszy dzień prototypu wizualnego, szybkie eksperymenty.',
  },
  'smart-tiered': {
    id: 'smart-tiered',
    nameEn: 'Smart Tiered Gate (Recommended)',
    namePl: 'Dwupoziomowa Bramka Smart Gate (Rekomendowany)',
    contextImpact: 'Low (~12–18% window overhead)',
    tokenCostRating: 'Balanced / Optimal',
    defectRisk: 'Low',
    maxRepairAttempts: 3,
    runTestsPerEdit: 'targeted-silent',
    useVerifierSubagent: false,
    useFreshEvaluator: false,
    summaryEn:
      'Two-stage filter: runs silent typechecks and single-file unit tests (`--silent` / dot reporter) during edits, and runs the full integration/E2E suite only once before task completion.',
    summaryPl:
      'Dwustopniowe sito: w trakcie edycji uruchamia tylko cichy typecheck i test pojedynczego pliku (z wycięciem szumu z terminala), a pełny zestaw testów odpala raz przed zamknięciem zadania.',
    whenToChooseEn: 'Default for 80% of web apps, SaaS products, and APIs.',
    whenToChoosePl: 'Domyślny wybór dla większości aplikacji webowych, SaaS i API.',
  },
  'isolated-verifier': {
    id: 'isolated-verifier',
    nameEn: 'High Coverage in Isolated Verifier Subagent',
    namePl: 'Pełne Testy w Odizolowanym Subagencie',
    contextImpact: 'Low Main Context (~15%), Higher Total Subagent Tokens',
    tokenCostRating: 'Medium-High (2x subagent turns)',
    defectRisk: 'Very Low',
    maxRepairAttempts: 3,
    runTestsPerEdit: 'delegated-subagent',
    useVerifierSubagent: true,
    useFreshEvaluator: true,
    summaryEn:
      'Enforces comprehensive unit + integration + E2E tests, but delegates test execution and stack-trace parsing to an isolated Verifier Subagent so 5,000-line logs never pollute the main coding window.',
    summaryPl:
      'Wymusza pisanie wielu testów (Unit + E2E), ale zleca ich odpalanie i analizę błędów osobnemu Subagentowi-Testerowi. Główne okno pozostaje czyste, choć rośnie łączny koszt tokenów subagenta.',
    whenToChooseEn: 'Large brownfield codebases, multi-file refactors, and noisy test suites.',
    whenToChoosePl: 'Duże istniejące repozytoria (Brownfield) oraz wieloplikowe refaktoryzacje.',
  },
  'mission-critical': {
    id: 'mission-critical',
    nameEn: 'Mission-Critical TDD + Fresh-Context Evaluator',
    namePl: 'Krytyczny TDD + Ewaluator z Czystym Kontekstem',
    contextImpact: 'Medium Main Context, High Verification Depth',
    tokenCostRating: 'Highest (Full Audit Trail)',
    defectRisk: 'Minimal (Production-Grade)',
    maxRepairAttempts: 3,
    runTestsPerEdit: 'strict-tdd',
    useVerifierSubagent: true,
    useFreshEvaluator: true,
    summaryEn:
      'Requires Red->Green tests before implementation, deterministic build/schema gates, a 3-Strike Circuit Breaker, an independent Fresh-Context Evaluator pass, and human Prepare->Confirm approval gates.',
    summaryPl:
      'Wymaga podejścia Red->Green (najpierw test), pełnej weryfikacji kontraktu, bezpiecznika 3 prób (Circuit Breaker), recenzji przez niezależnego Ewaluatora w czystym kontekście oraz bramek Prepare->Confirm.',
    whenToChooseEn: 'Payments, authentication, production database migrations, and regulated systems.',
    whenToChoosePl: 'Systemy płatności, autoryzacja, migracje produkcyjne i systemy krytyczne.',
  },
};

export const CONTEXT_POLICIES = {
  minimal: {
    id: 'minimal',
    maxRootLines: 60,
    maxSkillLines: 180,
    subagentThresholdFiles: 3,
    circuitBreakerMaxRetries: 2,
    descriptionEn: 'Strictest token budget for small context windows or cost-sensitive API usage.',
    descriptionPl: 'Najbardziej rygorystyczny budżet tokenów dla mniejszych okien lub redukcji kosztów API.',
  },
  balanced: {
    id: 'balanced',
    maxRootLines: 80,
    maxSkillLines: 260,
    subagentThresholdFiles: 4,
    circuitBreakerMaxRetries: 3,
    descriptionEn: 'Recommended balance between rich routing instructions and low per-turn token tax.',
    descriptionPl: 'Optymalny balans między czytelnością mapy projektu a niskim narzutem tokenów na turę.',
  },
  'deep-research': {
    id: 'deep-research',
    maxRootLines: 100,
    maxSkillLines: 320,
    subagentThresholdFiles: 6,
    circuitBreakerMaxRetries: 4,
    descriptionEn: 'Allows slightly larger architectural maps and deeper exploration for complex monorepos.',
    descriptionPl: 'Pozwala na nieco szerszą mapę architektury i głębszą analizę w złożonych monorepo.',
  },
  'low-cost': {
    id: 'low-cost',
    maxRootLines: 55,
    maxSkillLines: 160,
    subagentThresholdFiles: 8,
    circuitBreakerMaxRetries: 2,
    descriptionEn:
      'Minimizes both main-context tax and subagent spawns (prefers local grep + line ranges over spawning extra subagents).',
    descriptionPl:
      'Minimalizuje łączny koszt tokenów (zamiast częstego tworzenia subagentów wymusza lokalny grep i czytanie krótkich zakresów linii).',
  },
};

export const PLATFORM_ADAPTERS = {
  universal: {
    id: 'universal',
    name: 'Universal (Antigravity + Claude Code + Codex + Cursor)',
    rootFiles: ['AGENTS.md', 'CLAUDE.md'],
    skillDirs: ['.agents/skills', '.claude/skills'],
    cursorRule: '.cursor/rules/00-harness-core.mdc',
    supportsSubagents: 'capability-dependent (native in Antigravity & Claude Code; fallback to sequential targeted reads in others)',
    supportsCompaction: 'capability-dependent (`/compact` in Claude Code / Antigravity; `HANDOFF.md` session restart in all tools)',
  },
  antigravity: {
    id: 'antigravity',
    name: 'Google Antigravity IDE / CLI',
    rootFiles: ['AGENTS.md'],
    skillDirs: ['.agents/skills'],
    cursorRule: null,
    supportsSubagents: 'native (`invoke_subagent` with `research` / `self`)',
    supportsCompaction: 'native (`/compact` and artifact handoffs)',
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude Code',
    rootFiles: ['AGENTS.md', 'CLAUDE.md'],
    skillDirs: ['.claude/skills'],
    cursorRule: null,
    supportsSubagents: 'native (Task / Subagent dispatch)',
    supportsCompaction: 'native (`/compact` command)',
  },
  codex: {
    id: 'codex',
    name: 'OpenAI Codex CLI / Agents',
    rootFiles: ['AGENTS.md'],
    skillDirs: ['.agents/skills'],
    cursorRule: null,
    supportsSubagents: 'via delegated task / worktree execution or sequential grep reads',
    supportsCompaction: 'via `HANDOFF.md` and `feature_list.json` state files',
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor IDE',
    rootFiles: ['AGENTS.md'],
    skillDirs: ['.agents/skills'],
    cursorRule: '.cursor/rules/00-harness-core.mdc',
    supportsSubagents: 'fallback to scoped `@file` / grep reads + `HANDOFF.md`',
    supportsCompaction: 'new composer thread grounded in `HANDOFF.md`',
  },
};

export const STACK_ADVISOR_CATALOG = {
  'saas-web': {
    archetype: 'saas-web',
    titleEn: 'Full-Stack Web Application / B2B or B2C SaaS',
    titlePl: 'Aplikacja Webowa Full-Stack / SaaS (B2B lub B2C)',
    whenSimplestIsEnoughEn:
      'If your MVP has <5 screens and no complex realtime state, start with a single-repo monolith (e.g., Next.js or Astro + SQLite/Postgres) instead of splitting frontend and backend microservices.',
    whenSimplestIsEnoughPl:
      'Jeśli Twoje MVP ma poniżej 5 ekranów i nie wymaga złożonego czasu rzeczywistego, zacznij od jednego repozytorium (monolit np. Next.js lub Astro + SQLite/Postgres), zamiast dzielić projekt na mikroserwisy.',
    options: [
      {
        id: 'nextjs-ts-postgres',
        name: 'Next.js (App Router) + TypeScript + PostgreSQL (Drizzle/Prisma) + Playwright',
        recommended: true,
        aiLegibility: 'Very High (strict TS types, colocated routes & schemas)',
        prosEn: ['Single TypeScript codebase for UI and API', 'Massive training data familiarity for all LLMs', 'Fast local typechecking & E2E verification'],
        consEn: ['App Router caching/SSR boundaries can confuse agents without explicit rules', 'Higher hosting complexity than static sites'],
        prosPl: ['Jeden kod TypeScript dla UI oraz API', 'Modele AI doskonale znają ten ekosystem', 'Szybka weryfikacja typów i testów E2E'],
        consPl: ['Granice Server/Client Components wymagają jasnej reguły w AGENTS.md', 'Większa złożoność hostingu niż przy stronach statycznych'],
        costDrivers: 'Managed Postgres + Node/Serverless compute',
      },
      {
        id: 'fastapi-react-postgres',
        name: 'Python FastAPI + React/Vite (TypeScript) + PostgreSQL + Pytest',
        recommended: false,
        aiLegibility: 'High (OpenAPI schema auto-generated from Pydantic models)',
        prosEn: ['Best choice when heavy Python AI/ML or data pipelines are core to the product', 'Pydantic + OpenAPI provides a rock-solid contract between backend and frontend'],
        consEn: ['Two runtimes (Node + Python) to manage in local dev and CI'],
        prosPl: ['Najlepszy wybór, gdy sercem produktu jest przetwarzanie danych lub AI/ML w Pythonie', 'Pydantic i OpenAPI tworzą twardy kontrakt między backendem a frontendem'],
        consPl: ['Dwa środowiska uruchomieniowe (Node + Python) do utrzymania lokalnie i w CI'],
        costDrivers: 'Container/VPS hosting + Postgres',
      },
      {
        id: 'astro-sqlite-monolith',
        name: 'Astro + TypeScript + SQLite (LibSQL/Turso) + Playwright',
        recommended: false,
        aiLegibility: 'Extremely High (minimal boilerplate, deterministic HTML output)',
        prosEn: ['Lowest complexity and fastest build times', 'Zero-config file-based database for rapid solo MVPs'],
        consEn: ['Less suited for heavy client-side canvas apps'],
        prosPl: ['Najmniejszy narzut kodu i błyskawiczny build', 'Lokalna baza plikowa SQLite idealna na szybki start MVP'],
        consPl: ['Mniej wygodny przy bardzo ciężkich aplikacjach typu edytor graficzny w przeglądarce'],
        costDrivers: 'Near-zero (runs on basic VPS or static/edge)',
      },
    ],
  },
  'content-seo-marketing': {
    archetype: 'content-seo-marketing',
    titleEn: 'Content Hub, Documentation, Academy or Marketing Site',
    titlePl: 'Platforma Treści, Akademia, Dokumentacja lub Strona Produktowa',
    whenSimplestIsEnoughEn:
      'Do not use a heavy SPA or database if content changes via Git or CMS webhooks—static HTML generation gives 100% SEO legibility and zero runtime database maintenance.',
    whenSimplestIsEnoughPl:
      'Nie używaj ciężkiego SPA ani bazy danych, jeśli treści są wersjonowane w Gicie lub przez CMS — statyczny HTML daje idealne SEO i zero kosztów utrzymania bazy.',
    options: [
      {
        id: 'astro-static-ts',
        name: 'Astro (Static Output) + TypeScript Content Contracts + Playwright',
        recommended: true,
        aiLegibility: 'Maximum (deterministic static HTML files verifiable in <2 seconds)',
        prosEn: ['Instant static verification of canonicals, hreflang, JSON-LD, and links', 'Zero runtime server crashes or DB vulnerabilities'],
        consEn: ['Requires rebuild on content update'],
        prosPl: ['Błyskawiczna weryfikacja statycznego HTML, tagów canonical, hreflang i JSON-LD', 'Zero ryzyka awarii bazy danych na produkcji'],
        consPl: ['Wymaga przebudowania przy aktualizacji treści'],
        costDrivers: 'Static hosting / Nginx VPS ($0–$5/mo)',
      },
      {
        id: 'nextjs-headless-cms',
        name: 'Next.js + Headless CMS / WordPress API + Incremental Static Regeneration',
        recommended: false,
        aiLegibility: 'High',
        prosEn: ['Non-technical editors can publish without Git commits'],
        consEn: ['Requires webhook/cache invalidation debugging'],
        prosPl: ['Redaktorzy nietechniczni mogą publikować bez znajomości Gita'],
        consPl: ['Wymaga utrzymania webhooków i cache’u ISR'],
        costDrivers: 'CMS subscription + Node hosting',
      },
    ],
  },
  'api-backend-service': {
    archetype: 'api-backend-service',
    titleEn: 'Backend API, Microservice, Webhook Worker or MCP Server',
    titlePl: 'Backend API, Mikroserwis, Worker lub Serwer MCP',
    whenSimplestIsEnoughEn:
      'Start with a single modular service and in-process queue before introducing Kafka, RabbitMQ, or Kubernetes.',
    whenSimplestIsEnoughPl:
      'Zacznij od jednego modułowego serwisu przed wprowadzaniem Kafki, RabbitMQ czy Kubernetesa.',
    options: [
      {
        id: 'node-ts-fastify-zod',
        name: 'Node.js 22 + TypeScript + Fastify/Hono + Zod Schemas + Node Test Runner',
        recommended: true,
        aiLegibility: 'Very High (Zod input/output contracts + zero-config `node --test`)',
        prosEn: ['Strict runtime + compile-time validation with Zod', 'Ideal for Model Context Protocol (MCP) servers and JSON APIs'],
        consEn: ['CPU-bound heavy math is better suited for Rust/Go/Python'],
        prosPl: ['Ścisła walidacja w czasie kompilacji i działania dzięki Zod', 'Idealny do budowy serwerów Model Context Protocol (MCP) i szybkich API'],
        consPl: ['Mniej wydajny przy ciężkich obliczeniach numerycznych niż Rust/Go/Python'],
        costDrivers: 'Lightweight VPS or container',
      },
      {
        id: 'python-fastapi-pydantic',
        name: 'Python 3.12 + FastAPI + Pydantic v2 + Pytest + Ruff',
        recommended: false,
        aiLegibility: 'Very High',
        prosEn: ['Ruff + Pyright + Pytest form an ultra-fast (<1s) deterministic feedback loop for AI agents'],
        consEn: ['Async concurrency tuning requires care'],
        prosPl: ['Ruff + Pyright + Pytest tworzą ultraszybką (<1s) pętlę weryfikacji dla agenta AI'],
        consPl: ['Wymaga dbałości o zależności środowisk wirtualnych'],
        costDrivers: 'VPS / Container',
      },
    ],
  },
};
