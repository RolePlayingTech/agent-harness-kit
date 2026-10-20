# AGENTS.md — Workspace Harness & Operational Map

## 1. Project Identity & Stack
- **System:** [1-sentence description of what this repository builds]
- **Stack:** TypeScript, Node.js 22, Astro / Next.js, Playwright
- **Key Paths:** `src/` (application code), `tests/` (E2E & unit tests), `scripts/` (verification gates)

## 2. Deterministic Verification Loop (Run Before Completing Any Task)
1. **Typecheck & Contracts:** `npx tsc --noEmit`
2. **Build & Schema Audit:** `npm run build`
3. **Automated Test Suite:** `npm test`
4. **Harness Budget Check:** `node scripts/verify-harness.mjs`

## 3. Context Hygiene & Subagent Rules
- **Keep Main Context Under 60%:** Treat the context window as working RAM, not storage.
- **Delegate Exploration to Subagents:** When searching across >4 files or analyzing verbose logs, spawn an isolated `research` subagent and request a <250-word summary with exact file/line links.
- **One Task = One Session:** Run `/compact` or start a fresh session after finishing each discrete feature.

## 4. Progressive Disclosure Map (Load Only When Needed)
- Token saving & subagent delegation → `.agents/skills/context-hygiene/SKILL.md`
- Default-FAIL verification & evaluator loop → `.agents/skills/verification-loop/SKILL.md`
- Interactive harness updates → `.agents/skills/harness-architect/SKILL.md`

## 5. Hard Guardrails (Red Lines — Require Human Confirmation)
- NEVER push directly to `main` or run destructive production migrations without explicit confirmation.
- NEVER silence failing tests, delete assertions, or add `@ts-ignore` to force a passing build.
- NEVER hardcode secrets, API keys, or credentials outside `.env.example`.
