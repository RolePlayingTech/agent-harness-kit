# Complete User Guide (EN) — AI Agent Harness Kit v2.0

This guide walks you **step by step ("by the hand")** through designing, installing, and operating an AI Agent Harness — whether you are starting from a **blank directory with just an app idea (Path A: Greenfield)** or onboarding an agent onto a **production codebase (Path B: Brownfield)**.

---

## 1. Why Dual-Mode Harness Engineering Matters

Static prompt templates fail because **new projects** and **existing codebases** have opposite failure modes:
1. **In a Greenfield (empty) repo:** Asking a developer for "exact linter flags and test runner commands" makes no sense when no code exists yet. You need an **AI Product & Stack Advisor** that scopes your MVP, compares technology stacks with honest trade-offs, and writes a durable blueprint (`PROJECT_BRIEF.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `feature_list.json`) before generating application code.
2. **In a Brownfield (existing) repo:** Asking a developer "what language and test runner do you use?" when `package.json`, `pyproject.toml`, or `.github/workflows` are sitting right there wastes time and trust. The agent must **silently inspect the workspace first**, present grounded findings with file paths, and only ask about architectural unknowns and testing trade-offs.
3. **The Testing vs. Context Token Dilemma:** Running full E2E and unit test suites after every single line edit floods the LLM context window with thousands of lines of terminal output, triggering **Context Rot** and burning token budgets. Running zero tests causes silent regressions.

---

## 2. Quick Start (CLI or Conversational Skill)

### Option A: Zero-Dependency CLI
Run directly in any repository (Node.js 20+):

```bash
# 1. Read-only workspace inspection (Greenfield vs. Brownfield detection)
npx github:RolePlayingTech/agent-harness-kit inspect .

# 2. Preview the recommended interview & trade-off plan
npx github:RolePlayingTech/agent-harness-kit plan .

# 3. Safely install the 6 skills + generate harness & blueprint files
npx github:RolePlayingTech/agent-harness-kit init . --profile smart-tiered --blueprint
```

### Option B: Conversational "Hand-Holding" Wizard
Once the skills are installed in `.agents/skills/`, prompt your AI coding agent:

> **"Activate the `harness-architect` skill. Inspect this repository and guide me step-by-step through our architecture, testing-vs-context trade-offs, and harness setup."**

---

## 3. Path A: Greenfield Wizard (`greenfield-advisor`)

Triggered automatically when the repository has no application manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.).

### Step 1: Product Discovery & MVP Boundaries
The agent asks at most 3 focused questions per turn:
- **Problem & Target Audience:** Who uses this product and what is the core value loop?
- **Explicit Non-Goals:** What features are strictly *out of scope* for v1 so future agent sessions don't over-engineer them?
- **Team & Budget Constraints:** Solo builder, startup team, or enterprise environment?

### Step 2: Stack Comparison Matrix (2–3 Options)
Instead of guessing a stack, the agent compares 2–3 concrete options across **Setup Speed, Hosting Cost, Operational Complexity, and AI-Legibility** (how well static types and schemas help AI agents catch their own mistakes).

### Step 3: Testing vs. Context Token Profile Selection
You choose one of the 4 profiles (`fast-prototype`, `smart-tiered`, `isolated-verifier`, `mission-critical`) based on your token budget and reliability requirements.

### Step 4: Durable Project Blueprint Generation (`--blueprint`)
Generates:
- `AGENTS.md` (and optional `CLAUDE.md`) — Always-on router under 80 lines.
- `docs/PROJECT_BRIEF.md` — Vision, core loop, and explicit non-goals.
- `docs/ARCHITECTURE.md` — Directory layout, boundaries, and verification contract.
- `docs/adr/0001-stack-and-testing-profile.md` — Architecture Decision Record.
- `docs/ROADMAP.md` — Phased milestones.
- `feature_list.json` — Default-FAIL task ledger initialized with `"status": "pending"`.
- `HANDOFF.md` — Session bridge template.

---

## 4. Path B: Brownfield Onboarder (`brownfield-onboarder`)

Triggered automatically when existing manifests, source directories, or CI pipelines are detected.

### Step 1: Silent Reconnaissance (`inspectWorkspace`)
Before asking a single question, the agent inspects:
- Languages, frameworks, and lockfiles (`pnpm`, `npm`, `yarn`, `bun`, `poetry`, `cargo`, `go`).
- Existing verification commands (`build`, `test`, `lint`, `typecheck`) and CI workflows.
- Monorepo workspaces (`apps/*`, `packages/*`) vs. single-package layout.
- Existing agent instructions (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules`) to prevent destructive overwrites.

### Step 2: Grounded Findings Summary
The agent reports exact file paths and detected risks first, then conducts a collaborative discussion focused strictly on:
1. **Fragile / Off-Limits Directories** (migrations, legacy modules, vendor code).
2. **Slow or Flaky Tests** that should be separated from the fast inner loop.
3. **Testing Depth vs. Context Budget Trade-off Profile.**

---

## 5. Testing Depth vs. Context Token Trade-Off Matrix (`testing-tradeoffs`)

| Profile (`--profile`) | Inner Loop (Every Edit) | Outer Gate (Before Completion) | Est. Token Tax / Turn | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **`fast-prototype`** | Typecheck / syntax check only | Build check on demand | **~300–600 tokens** | Hackathons, PoCs, early UI spikes |
| **`smart-tiered`** *(Default)* | Typecheck + targeted unit test for touched file | Full build + integration/E2E suite before commit | **~800–1,500 tokens** | **90% of daily engineering projects** |
| **`isolated-verifier`** | Fast typecheck in main session | Heavy E2E / test suite delegated to an isolated subagent returning `<200 words` | **~500 tokens in main chat** | Large apps with noisy Playwright / Docker logs |
| **`mission-critical`** | Typecheck + lint + unit tests + coverage | Full E2E + security audit + schema validation | **~3,000–8,000 tokens** | Fintech, auth, billing, healthcare, core infra |

---

## 6. Four-Tier Security & Capability Model

Every generated harness encodes explicit permission boundaries (`--security`):
- **`tier-0-readonly`**: Read/search analysis only (audits, code review).
- **`tier-1-workspace-safe`**: File edits + local deterministic test execution; no network or destructive git operations.
- **`tier-2-network-dev`** *(Default)*: Package installation, local dev servers, and non-destructive git branches.
- **`tier-3-human-gated`**: Production deployments, database migrations, secret rotation, and force-pushes **always require explicit human confirmation**.

---

## 7. CLI Command Reference (`agent-harness`)

- `agent-harness inspect [dir] [--json]` — Read-only workspace detection & risk discovery.
- `agent-harness plan [dir]` — Recommended interview path (Greenfield vs. Brownfield) & trade-off matrix.
- `agent-harness init [dir] [--mode auto|greenfield|brownfield] [--profile ...] [--policy strict|balanced|expansive] [--adapters claude,cursor,copilot,windsurf] [--blueprint] [--dry-run] [--force]` — Non-destructive installation.
- `agent-harness verify [dir] [--strict] [--json]` — Deterministic pass/fail verification for CI gates.
- `agent-harness audit [dir] [--json]` — Advisory token tax & drift report.
- `agent-harness doctor [dir]` — Actionable health check and remediation guide.
- `agent-harness update [dir] [--dry-run] [--force]` — Safe checksum-verified upgrade of unmodified kit files.
- `agent-harness uninstall [dir] [--dry-run] [--force]` — Clean removal of unmodified kit files.
