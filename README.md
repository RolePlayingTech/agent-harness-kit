# Universal AI Agent Harness Kit (`agent-harness-kit` v2.0)

[![Agent Skills Standard](https://img.shields.io/badge/Standard-AGENTS.md_%26_SKILL.md-10b981)](https://agents.md)
[![Version](https://img.shields.io/badge/Version-2.0.0-3b82f6)](./package.json)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero_(Node_20%2B)-8b5cf6)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b)](./LICENSE)

> **Interactive Dual-Mode (Greenfield & Brownfield) AI Agent Harness Architect, Testing-vs-Context Trade-off Advisor, and Verification CLI.**
> Built for **Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Windsurf, and Google Antigravity**.
>
> 🇵🇱 **[Pełny Podręcznik po Polsku (`docs/GUIDE_PL.md`)](./docs/GUIDE_PL.md)** | 🇬🇧 **[Complete English Guide (`docs/GUIDE_EN.md`)](./docs/GUIDE_EN.md)** | 📊 **[Testing vs. Context Playbook (`docs/TESTING_AND_CONTEXT_PLAYBOOK.md`)](./docs/TESTING_AND_CONTEXT_PLAYBOOK.md)**

---

## Why v2.0? Guiding the Developer "By the Hand" Across Two Distinct Paths

Most AI prompt templates make one of two fatal mistakes:
1. **In a brand-new empty repository (Greenfield):** They ask you for "exact linter flags and test commands" before a single line of code or technology stack even exists.
2. **In an existing codebase (Brownfield):** They ask you "what language and framework do you use?" instead of reading `package.json`, `pyproject.toml`, or `.github/workflows` first — or worse, they silently overwrite your existing `AGENTS.md` and `SKILL.md` files.

**`agent-harness-kit` v2.0** solves both problems with a **Dual-Mode Architecture**, an explicit **Testing Depth vs. Context Token Trade-off Advisor**, and a **non-destructive CLI lifecycle manager**.

```
                      ┌───────────────────────────────────────┐
                      │   agent-harness inspect / init / AI   │
                      └───────────────────┬───────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
   ┌──────────────────────────────┐                ┌──────────────────────────────┐
   │  PATH A: GREENFIELD WIZARD   │                │ PATH B: BROWNFIELD ONBOARDER │
   │   (Empty / Idea-Stage Repo)  │                │  (Existing Codebase / Mono)  │
   ├──────────────────────────────┤                ├──────────────────────────────┤
   │ 1. Scope MVP & Non-Goals     │                │ 1. Silent Repo Scan FIRST    │
   │ 2. Compare 2-3 Tech Stacks   │                │ 2. Present Grounded Evidence │
   │ 3. Pick Testing/Token Profile│                │ 3. Discuss Unknowns & Risks  │
   │ 4. Generate Blueprint + ADR  │                │ 4. Non-Destructive Install   │
   └──────────────┬───────────────┘                └──────────────┬───────────────┘
                  └───────────────────────┬───────────────────────┘
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │  4 TESTING-VS-CONTEXT TRADE-OFF PROFILES      │
                  │  • fast-prototype    (~300-600 tok/turn)      │
                  │  • smart-tiered      (~800-1,500 tok/turn) ★  │
                  │  • isolated-verifier (~500 tok main thread)   │
                  │  • mission-critical  (~3,000-8,000 tok/turn)  │
                  └───────────────────────────────────────────────┘
```

---

## Quick Start (30 Seconds)

### 1. Run via `npx` (Zero Install Required)

```bash
# 1. Inspect any folder (detects Greenfield vs. Brownfield, stack, scripts, risks)
npx github:RolePlayingTech/agent-harness-kit inspect .

# 2. Preview the recommended interview path & Testing-vs-Context trade-off matrix
npx github:RolePlayingTech/agent-harness-kit plan .

# 3. Safely install the 6 modular skills + generate harness & blueprint files
npx github:RolePlayingTech/agent-harness-kit init . --profile smart-tiered --blueprint

# 4. Run strict deterministic verification (CI-ready exit codes)
npx github:RolePlayingTech/agent-harness-kit verify . --strict
```

### 2. Run Interactive Hand-Holding Mode with Your AI Agent

Once installed, open your AI coding agent (Claude Code, Cursor, Copilot, Windsurf, Codex, Antigravity) and prompt:

> 🇬🇧 **"Use the `harness-architect` skill. Inspect this repository and guide me step-by-step through our architecture, testing-vs-context trade-offs, and harness configuration."**
>
> 🇵🇱 **„Użyj skilla `harness-architect`. Przeskanuj to repozytorium i poprowadź mnie za rączkę przez architekturę, wybór profilu testów względem zużycia kontekstu oraz konfigurację uprzęży.”**

---

## The 6 Modular Skills (`skills/*/SKILL.md`)

Instead of stuffing 5,000 tokens of rules into a single bloated root file that taxes every turn, `agent-harness-kit` keeps `AGENTS.md` under **80 lines** and loads specialized protocols **on demand**:

| Skill Directory | Role & Activation Trigger | Est. On-Demand Tokens |
| :--- | :--- | :---: |
| [`skills/harness-architect`](./skills/harness-architect/SKILL.md) | **Master Dual-Mode Router:** Detects Path A (Greenfield) vs. Path B (Brownfield) and orchestrates the guided interview. | ~1,600 |
| [`skills/greenfield-advisor`](./skills/greenfield-advisor/SKILL.md) | **Path A (New Repo):** Defines MVP boundaries & Non-Goals, compares 2–3 tech stacks, and writes `PROJECT_BRIEF.md`, `ARCHITECTURE.md`, ADR, and `ROADMAP.md`. | ~930 |
| [`skills/brownfield-onboarder`](./skills/brownfield-onboarder/SKILL.md) | **Path B (Existing Repo):** Performs silent workspace reconnaissance first, presents grounded evidence, and asks only about fragile zones and trade-offs. | ~860 |
| [`skills/testing-tradeoffs`](./skills/testing-tradeoffs/SKILL.md) | **Testing vs. Context Advisor:** Helps the user choose between `fast-prototype`, `smart-tiered`, `isolated-verifier`, and `mission-critical`. | ~1,030 |
| [`skills/context-hygiene`](./skills/context-hygiene/SKILL.md) | **Context RAM & 7 Crisis Playbooks:** Enforces the 60% Context Ceiling, subagent isolation, and recovery from log floods, poisoning, and long-thread drift. | ~1,120 |
| [`skills/verification-loop`](./skills/verification-loop/SKILL.md) | **Default-FAIL Evaluator & 3-Strike Circuit Breaker:** Prevents infinite repair loops and requires deterministic command proof before marking tasks `verified`. | ~900 |
| [`skills/recursive-refiner`](./skills/recursive-refiner/SKILL.md) | **Google Research `Harness²` Recursive Refiner (`c1..c8`):** Evolves the harness via Task-Level (`Propose → Probe → Compose`) and Harnessing-Level (`Experience Reflector`) recursion (arXiv:2610.14224). | ~780 |

---

## The Testing Depth vs. Context Token Trade-Off Matrix

More tests mean higher code safety — but running verbose E2E suites in the main chat after every edit floods the context window and burns tokens. You choose the exact profile for your project stage:

| Profile (`--profile`) | Inner Loop (Every Edit) | Outer Gate (Before Completion) | Est. Token Tax / Turn | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **`fast-prototype`** | Fast typecheck / syntax only | Build check on demand | **~300–600 tokens** | Hackathons, weekend PoCs, UI spikes |
| **`smart-tiered`** *(Default)* | Typecheck + 1 targeted unit test for touched file | Full build + integration/E2E suite once before commit | **~800–1,500 tokens** | **90% of production engineering projects** |
| **`isolated-verifier`** | Fast typecheck in main session | Heavy E2E / test suite delegated to an isolated subagent returning `<200 words` | **~500 tokens in main chat** | Apps with noisy Playwright, Cypress, or Docker logs |
| **`mission-critical`** | Typecheck + lint + unit suite + coverage | Full E2E + security audit + schema validation | **~3,000–8,000 tokens** | Payments, auth, billing, DB migrations |

---

## Complete CLI Reference (`agent-harness`)

| Command | Flags | Behavior & Exit Code Contract |
| :--- | :--- | :--- |
| `agent-harness inspect [dir]` | `--json` | **Read-only.** Detects `greenfield`, `brownfield`, or `monorepo`, languages, frameworks, scripts, CI, and risks. Never modifies files. |
| `agent-harness plan [dir]` | `--json` | **Read-only.** Outputs the recommended interview path (Path A vs. Path B), stack/testing trade-off matrix, and tailored questions. |
| `agent-harness init [dir]` | `--mode auto\|greenfield\|brownfield`<br>`--profile <id>`<br>`--policy strict\|balanced\|expansive`<br>`--security <tier>`<br>`--adapters claude,cursor,copilot,windsurf`<br>`--blueprint`<br>`--dry-run` `--force` | **Safe & Non-Destructive by default.** Installs skills to `.agents/skills/`, creates `AGENTS.md`, `HANDOFF.md`, `feature_list.json` (initialized as `pending`), optional `docs/` blueprint, and `.agents/harness-manifest.json` with SHA-256 checksums. Preserves existing user files unless `--force` is passed. |
| `agent-harness verify [dir]` | `--strict` `--policy <id>` `--json` | **Deterministic Gate.** Validates root `AGENTS.md` existence & line budget, real YAML frontmatter & schema on all `SKILL.md` files, referenced file paths, `package.json` scripts, and `feature_list.json` Default-FAIL integrity. Exits `1` on failure. |
| `agent-harness audit [dir]` | `--policy <id>` `--json` | **Advisory Report.** Calculates Always-On vs. On-Demand token tax and architectural drift warnings. |
| `agent-harness doctor [dir]` | `--json` | **Diagnostic Guide.** Runs verification and outputs exact remediation commands for every error or warning. |
| `agent-harness autotrigger [dir]` | `--json` | **Harness² Dead-Weight Skill Repair.** Ensures every `.agents/skills/<name>/SKILL.md` is explicitly named with a trigger condition in `AGENTS.md` (respecting the `8,000-char` Always-On cap). |
| `agent-harness update [dir]` | `--dry-run` `--force` | Updates only unmodified managed skill files by comparing current SHA-256 hashes against `.agents/harness-manifest.json`. |
| `agent-harness uninstall [dir]` | `--dry-run` `--force` | Removes unmodified harness files tracked in `.agents/harness-manifest.json` while preserving any user-customized files. |

---

## Multi-Tool Compatibility Matrix (`--adapters`)

| AI Coding Tool | Native Discovery File | Adapter Flag | How It Works |
| :--- | :--- | :--- | :--- |
| **Codex / OpenCode / Antigravity / Zed** | `AGENTS.md` + `.agents/skills/*/SKILL.md` | *(Default)* | Native `AGENTS.md` & Agent Skills discovery |
| **Anthropic Claude Code** | `CLAUDE.md` | `--adapters claude` | Generates lightweight `@AGENTS.md` import bridge |
| **Cursor** | `.cursor/rules/00-harness.mdc` | `--adapters cursor` | Generates MDC rule pointing to `AGENTS.md` & `.agents/skills/` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | `--adapters copilot` | Bridges Copilot workspace instructions to `AGENTS.md` |
| **Windsurf** | `.windsurfrules` | `--adapters windsurf` | Bridges Windsurf rules to `AGENTS.md` |

---

## 🇵🇱 Podsumowanie po Polsku (PL)

**`agent-harness-kit` v2.0** to kompletny zestaw narzędzi i skilli prowadzący programistę **za rączkę** w dwóch trybach:
1. **Ścieżka A (Nowy Projekt / Greenfield):** Gdy uruchamiasz skilla w pustym folderze, agent nie pyta o nieistniejący kod — pomaga Ci zdefiniować MVP oraz *Non-Goals*, porównuje 2–3 stosy technologiczne (koszt, szybkość, czytelność dla AI), dobiera profil testów i generuje pełny blueprint (`docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `feature_list.json`).
2. **Ścieżka B (Istniejący Projekt / Brownfield):** Gdy uruchamiasz skilla na działającym repozytorium, agent **najpierw po cichu skanuje pliki projektu**, prezentuje wykryte technologie i ryzyka, a następnie rozmawia z Tobą o kompromisach (np. ile testów uruchamiać, żeby nie spalić okna kontekstowego i tokenów).

👉 Przeczytaj pełny przewodnik krok po kroku w pliku **[`docs/GUIDE_PL.md`](./docs/GUIDE_PL.md)**.

---

## Repository Structure

```text
agent-harness-kit/
├── AGENTS.md                              # Self-hosted <80-line operational map
├── bin/
│   └── agent-harness.mjs                  # Unified CLI (inspect, plan, init, verify, audit, doctor, update, uninstall)
├── src/
│   ├── detector.mjs                       # Read-only Greenfield/Brownfield/Monorepo workspace detector
│   ├── profiles.mjs                       # 4 Testing-vs-Context profiles, 3 Context policies, 4 Security tiers, Stack catalog
│   ├── yaml-validator.mjs                 # Strict YAML frontmatter & Agent Skills schema parser
│   ├── installer.mjs                      # Safe non-destructive installer, SHA-256 manifest, update & uninstall
│   └── auditor.mjs                        # Strict verifier, broken-link & script drift detector, token calculator
├── skills/
│   ├── harness-architect/SKILL.md         # Master Dual-Mode Router (Path A & Path B)
│   ├── greenfield-advisor/SKILL.md        # Path A: Idea -> Stack Matrix -> Blueprint
│   ├── brownfield-onboarder/SKILL.md      # Path B: Silent Repo Scan -> Grounded Interview
│   ├── testing-tradeoffs/SKILL.md         # Interactive Testing Depth vs. Context Token Advisor
│   ├── context-hygiene/SKILL.md           # 60% Context Ceiling & 7 Crisis Playbooks
│   └── verification-loop/SKILL.md         # Default-FAIL Evaluator & 3-Strike Circuit Breaker
├── docs/
│   ├── GUIDE_PL.md                        # Pełny podręcznik użytkownika "za rączkę" (PL)
│   ├── GUIDE_EN.md                        # Complete step-by-step user guide (EN)
│   ├── TESTING_AND_CONTEXT_PLAYBOOK.md    # Token economics, testing profiles & crisis recovery
│   └── schemas/feature-list.schema.json   # Local JSON Schema for Default-FAIL task ledger
├── examples/
│   ├── greenfield-saas-mvp/WALKTHROUGH.md
│   └── brownfield-legacy-audit/WALKTHROUGH.md
└── tests/
    └── harness-kit.test.mjs               # Automated node:test unit & integration test suite
```

## License

MIT © RolePlayingTech & MUMRO Academy ([academy.mumro.io](https://academy.mumro.io))
