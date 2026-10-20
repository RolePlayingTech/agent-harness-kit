# AGENTS.md — AI Agent Harness Kit Operational Map

## 1. Project Identity & Stack
- **System:** Open-source AI Agent Harness Architect & Context Hygiene Toolkit (`RolePlayingTech/agent-harness-kit`).
- **Stack:** Node.js (zero-dependency ES Modules `.mjs`), Markdown Skills (`SKILL.md`), JSON Plugin Manifest.
- **Key Paths:** `skills/` (portable agent skills), `scripts/` (installers & context linter), `templates/` (reference specs).

## 2. Deterministic Verification Loop (Run Before Completing Any Task)
1. **Context Budget & Skill Linter:** `node scripts/verify-harness.mjs`

## 3. Context Hygiene & Subagent Rules
- **Keep Main Context Under 60%:** Root `AGENTS.md` and `CLAUDE.md` files must stay under 65 lines.
- **Delegate Broad Searches:** Use a `research` subagent for multi-file exploration; return only compact summaries.
- **One Task = One Session:** Run `/compact` or start a fresh context window after completing each discrete task.

## 4. Progressive Disclosure Map (Load Only When Needed)
- Interactive Harness Bootstrapper & Interview → `skills/harness-architect/SKILL.md`
- Token conservation & subagent isolation → `skills/context-hygiene/SKILL.md`
- Default-FAIL verification & evaluator protocol → `skills/verification-loop/SKILL.md`
- Reference templates → `templates/AGENTS.template.md`, `templates/feature_list.template.json`

## 5. Hard Guardrails (Red Lines — Require Human Confirmation)
- NEVER push breaking changes to `main` without running `node scripts/verify-harness.mjs`.
- NEVER bloat root instruction files above 80 lines.
