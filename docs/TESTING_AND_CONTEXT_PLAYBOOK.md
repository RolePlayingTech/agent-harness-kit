# Testing Depth vs. Context Token Economics & Crisis Playbook

## 1. The Core Engineering Trade-Off: Verification Rigor vs. Context Window RAM

Every time an AI coding agent runs a test command in the main conversation thread, two things happen:
1. **Safety increases:** Deterministic compilers, typecheckers, and tests catch hallucinated imports, broken contracts, and regressions.
2. **Context RAM shrinks:** Standard output (`stdout`) and error traces (`stderr`) are appended permanently to the conversation history. Every subsequent turn re-reads those tokens.

### Reproducible Token Tax Formula
Used by `agent-harness verify` and `agent-harness audit`:
- **Estimated Tokens per File:** $\lceil \text{character\_count} / 4 \rceil$
- **Always-On Tax per Turn:** $\text{Tokens}(\text{AGENTS.md}) + \text{Tokens}(\text{CLAUDE.md})$
- **Offloaded On-Demand Skill Pool:** $\sum \text{Tokens}(\text{skills/*/SKILL.md})$ (loaded *only* when triggered by task intent)
- **25-Turn Session Savings:** $\text{Offloaded\_Skill\_Tokens} \times 25$

---

## 2. Detailed Comparison of the 4 Testing Profiles

### Profile 1: `fast-prototype` (Minimal Context Burn)
- **Inner Loop (Every Edit):** Fast syntax / typecheck (`tsc --noEmit` or `ruff check`).
- **Outer Gate (Task Completion):** Build check on demand (`npm run build`).
- **Token Tax per Turn:** `~300–600 tokens`
- **When to Choose:** Weekend prototypes, UI layout exploration, disposable PoCs where speed matters more than regression guarantees.
- **Risk Warning:** Logic bugs and runtime regressions can slip through until manual testing.

### Profile 2: `smart-tiered` (Recommended Default — The Golden Ratio)
- **Inner Loop (Every Edit):** Fast typecheck + **single targeted unit test** for the modified module (`npx vitest run src/foo.test.ts --reporter=dot`).
- **Outer Gate (Task Completion):** Full static build + integration/E2E test suite run **once** before declaring the task complete.
- **Token Tax per Turn:** `~800–1,500 tokens`
- **When to Choose:** 90% of production web, API, and full-stack repositories.

### Profile 3: `isolated-verifier` (Subagent Log Shield)
- **Inner Loop (Every Edit):** Fast typecheck in the main coding session.
- **Outer Gate (Task Completion):** Main agent spawns an isolated **Verifier Subagent** to execute heavy Playwright/Cypress/pytest suites. The subagent absorbs 10,000+ tokens of raw terminal logs in its temporary context and returns a **`<200-word` structured pass/fail report** with exact file:line pointers.
- **Token Tax per Turn (Main Thread):** `~500 tokens`
- **When to Choose:** Repositories with verbose E2E runners, Docker compose logs, or multi-browser test matrices.

### Profile 4: `mission-critical` (Maximum Verification)
- **Inner Loop (Every Edit):** Typecheck + linter + unit test suite + coverage check.
- **Outer Gate (Task Completion):** Full build + E2E suite + security/dependency audit + schema contract check.
- **Token Tax per Turn:** `~3,000–8,000 tokens` (requires frequent session handoffs via `HANDOFF.md` every 10–15 turns).
- **When to Choose:** Authentication, billing/payments, database migrations, healthcare/financial compliance.

---

## 3. Bounded Self-Healing: The 3-Strike Repair Circuit Breaker

Unbounded "run test → fail → guess fix → run test" loops are the #1 cause of runaway token bills and corrupted working trees.

```
[Attempt 1 Fails] ──> Read exact error line & fix root cause
       │
[Attempt 2 Fails] ──> Inspect git diff, verify assumptions & types
       │
[Attempt 3 Fails] ──> 🚨 CIRCUIT BREAKER TRIPPED!
                      1. STOP blind edits immediately
                      2. Revert speculative changes if tree is degraded
                      3. Log all 3 failed hypotheses in HANDOFF.md
                      4. Escalate to the human developer with 2 concrete options
```

---

## 4. Configurable Context Policies (`--policy`)

| Policy | Max `AGENTS.md` Lines | Max `SKILL.md` Lines | Max Always-On Tokens | Recommended Use Case |
| :--- | :---: | :---: | :---: | :--- |
| **`strict`** | 60 | 90 | 1,200 | Tight token budgets, smaller context models, high-frequency edits |
| **`balanced`** *(Default)* | 80 | 120 | 1,600 | Standard production repositories & bilingual apps |
| **`expansive`** | 110 | 160 | 2,200 | Complex polyglot monorepos with multiple sub-packages |
