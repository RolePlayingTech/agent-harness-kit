# AGENTS.md — Universal AI Agent Harness Kit (v2.0)

## 1. Project Identity & Stack
- **System:** `agent-harness-kit` — Interactive Dual-Mode (Greenfield & Brownfield) AI Agent Harness Architect, CLI, and 6-Skill Open Standard Kit.
- **Stack:** Node.js >= 20 (ESM `.mjs`, zero external runtime dependencies), `node:test`, Markdown Agent Skills (`SKILL.md`).
- **Key Paths:** `bin/agent-harness.mjs`, `src/` (`detector.mjs`, `profiles.mjs`, `installer.mjs`, `auditor.mjs`, `yaml-validator.mjs`), `skills/*/SKILL.md`, `tests/harness-kit.test.mjs`.

## 2. Deterministic Verification Loop (Mandatory Before Completing Any Task)
1. **Unit & Integration Test Suite:** `npm test`
2. **Strict Self-Verification & Budget Gate:** `npm run verify`
3. **Health & Readiness Doctor:** `npm run doctor`

## 3. Context Hygiene & Subagent Rules
- **60% Context Ceiling:** Treat the context window as working RAM; read targeted line ranges instead of dumping full files.
- **Scout Subagents:** Delegate >4-file exploration or noisy test triage to an isolated subagent returning a `<250-word` synthesis.
- **3-Strike Repair Circuit Breaker:** Max 3 consecutive auto-repair attempts per failing test before updating `HANDOFF.md` and escalating.

## 4. Progressive Disclosure Map (Load Just-In-Time)
- Master Dual-Mode Router (Path A / Path B) → `skills/harness-architect/SKILL.md`
- Path A: Greenfield Product & Stack Advisor → `skills/greenfield-advisor/SKILL.md`
- Path B: Brownfield Silent Repo Reconnaissance → `skills/brownfield-onboarder/SKILL.md`
- Interactive Testing vs. Context Token Advisor → `skills/testing-tradeoffs/SKILL.md`
- Context Hygiene & 7 Crisis Playbooks → `skills/context-hygiene/SKILL.md`
- Default-FAIL Evaluator & 3-Strike Circuit Breaker → `skills/verification-loop/SKILL.md`
- Recursive Harness Evolution (Harness² c1..c8) → `skills/recursive-refiner/SKILL.md`

## 5. Hard Guardrails (Red Lines — Require Human Confirmation)
- NEVER overwrite user-customized `AGENTS.md` or `SKILL.md` files without explicit `--force` confirmation.
- NEVER bloat root `AGENTS.md` or `CLAUDE.md` above 80 lines.
- NEVER mark a feature `verified` in `feature_list.json` until its deterministic command exits with code `0`.
