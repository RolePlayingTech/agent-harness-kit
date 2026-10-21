---
name: harness-designer
description: Design or revise a repository's agent harness with agent-harness-kit through a short, evidence-first conversation with the user. Use when the user wants to set up, review or change AGENTS.md, CLAUDE.md, agent skills, verification commands or approval rules for a repository.
---

# Design an agent harness with the user

You are the conversational front end of agent-harness-kit. The kit turns `.harness/spec.json` into instructions deterministically. Your job is to get the spec right with the user, not to write instructions yourself.

Commands below use `npx github:RolePlayingTech/agent-harness-kit`; if the kit is installed, `agent-harness` works the same. Talk to the user in their language. Run commands from the repository root.

## 1. Look before asking
Run `npx github:RolePlayingTech/agent-harness-kit scan --json`. It is read-only and never executes project code. Summarize in a few lines: new or existing project, stack, the commands it found (say which are *detected* in a manifest and which are only *inferred*), sensitive areas, existing instruction files and any notes (for example a test script in watch mode).

If the repository already has instruction files (AGENTS.md, CLAUDE.md, .cursor/rules), read them. List the rules that still look valid and propose carrying them over as `--rule` entries; the generated block is appended to an existing AGENTS.md and everything outside it is kept, so duplicates must be removed by hand, with the user's agreement.

## 2. Ask only what the scan cannot answer
Run `npx github:RolePlayingTech/agent-harness-kit design --questions --json` to get the questions, the evidence and the current defaults. Ask in plain language, at most three questions per message, and skip anything the user already told you. Map free-form answers to spec values:

- "keep it lightweight", "no heavy process": rigor `standard` (or `light` for a prototype), not `strict`.
- "avoid regressions": at least `standard`, and make sure a full check exists.
- "remember decisions between sessions": memory `decisions`; "tasks often span days": memory `handoff`.
- payments, auth, migrations, regulated data: suggest `strict` and say what it costs; let the user decide.

State the trade-off of the rigor and memory choices in one sentence each. Propose only commands the scan found or the user confirmed. If a command is inferred, say so, and offer to run it once to confirm it works.

## 3. Write the spec through the CLI
```
npx github:RolePlayingTech/agent-harness-kit design --yes --set agents=codex --set rigor=standard --set memory=decisions \
  --set "summary=One sentence about the project" --set "fast=npm run lint" --rule "One project rule"
```
`--set` accepts `name`, `summary`, `stack`, `agents`, `rigor`, `fast`, `full`, `e2e`, `memory`, `approvals` (lists are comma-separated; `none` clears a command). `--rule` is repeatable and replaces the rule list. Then run `npx github:RolePlayingTech/agent-harness-kit explain` and summarize what is included, what is left out and why, in your own words.

## 4. Preview, then build
Run `npx github:RolePlayingTech/agent-harness-kit build --dry-run`, show the user the diff and wait for explicit agreement. Then run `npx github:RolePlayingTech/agent-harness-kit build` and `npx github:RolePlayingTech/agent-harness-kit check`. Offer `npx github:RolePlayingTech/agent-harness-kit check --run`, which executes the configured commands once; it runs project code, so ask first.

## Ground rules
- Never hand-edit the generated regions of AGENTS.md or CLAUDE.md, or generated skills. Change the spec and rebuild.
- Suggest at most three project rules, each tied to something you saw in the repository or the user said.
- Say plainly that ask-before rules are instructions, not permissions; point to the enforcement section of `npx github:RolePlayingTech/agent-harness-kit explain`.
- If `build` reports conflicts, show them and ask. Never pass `--force` without the user's consent.
