# Agent Harness Kit

**Design, generate and check the working environment of your AI coding agent, built from your repository's real commands and your own decisions.**

A coding agent is a model plus a *harness*: the instructions it reads every session, the procedures it loads on demand, the commands it uses to check its own work, what it remembers between sessions and what it must not do without asking. Agent Harness Kit helps you decide what that harness should contain for *your* project, generates the files each tool actually reads, explains every choice, and checks that the result stays consistent as the project changes.

It works with **OpenAI Codex**, **Claude Code**, **Cursor** and any other tool that reads `AGENTS.md`. It is a single Node.js CLI (Node 20+) with no runtime dependencies.

```sh
npx github:RolePlayingTech/agent-harness-kit design   # a few questions, answered from your repo where possible
npx github:RolePlayingTech/agent-harness-kit build    # writes AGENTS.md, CLAUDE.md, skills
npx github:RolePlayingTech/agent-harness-kit check    # is the harness consistent with the repo and the spec?
```

> Built for the MUMRO Academy lesson [AI Agent Harness Engineering](https://academy.mumro.io/pl/lessons/ai-agent-harness-engineering/) (Polish), which explains the reasoning behind every part of this tool.

---

## Why not just ask the agent to write AGENTS.md?

You can, and for a small repository that is often enough. The result is usually plausible and generic: it lists `npm run typecheck` even when that script doesn't exist, adds rules nobody asked for, can't tell you why a section is there, and drifts as soon as the project changes. This kit takes a different approach:

| | Asking an agent for AGENTS.md | Agent Harness Kit |
| --- | --- | --- |
| Commands | Often guessed from conventions | Read from manifests, labelled *detected* or *inferred*; `check` fails if a script doesn't exist |
| Decisions | Hidden in prose | Recorded in `.harness/spec.json`: reviewable, diffable, re-runnable |
| Reasons | Not recorded | `explain` gives the reason and cost for every part that is in, **and every part left out** |
| Size | Tends to grow | Each section appears only when a rule fires; `check` warns when always-loaded text passes your budget |
| Tools | One file, one tool | One spec, files where each tool looks: `AGENTS.md`, a `CLAUDE.md` import, skills in `.agents/skills` or `.claude/skills` |
| Updates | Regenerate and hope | Managed blocks keep your own notes; hand edits inside generated regions stop the build instead of being overwritten |
| Guardrails | "NEVER push to main" presented as safety | Labelled as advisory, with concrete ways to enforce each one |

The agent is still useful here: it can run the design conversation for you (see [Let your agent drive](#let-your-agent-drive)). The difference is that the structure comes from deterministic rules applied to evidence, and the agent's job is to get the decisions right with you.

**When you don't need it:** a throwaway script, or a repository where a ten-line hand-written `AGENTS.md` already says everything. The kit pays off when the project has real check commands, sensitive areas, more than one tool, or a harness that will change over time.

---

## Walkthrough: a Next.js app worked on with Codex

> "I'm developing a Next.js app and I use Codex. I care about code quality, avoiding regressions and keeping decisions between sessions. I don't want a heavy process that runs a dozen test suites after every small change."

The repository is [`examples/nextjs-codex/project`](examples/nextjs-codex/project): Next.js, TypeScript, Prisma migrations, Stripe, next-auth, Vitest and Playwright.

### 1. Scan (read-only, never executes project code)

<!-- run: scan examples/nextjs-codex/project -->
```text
examples/nextjs-codex/project
  Existing project: Node.js, TypeScript, Next.js, React, Prisma
  Source files: 1
  fast  npm run typecheck  [detected: package.json#scripts.typecheck]
  fast  npm run lint  [detected: package.json#scripts.lint]
  full  npm test  [detected: package.json#scripts.test]
  e2e   npm run test:e2e  [detected: package.json#scripts.test:e2e]
  build npm run build  [detected: package.json#scripts.build]
  Sensitive: Database migrations [prisma/migrations]
  Sensitive: Payments code [package.json (stripe)]
  Sensitive: Authentication code [package.json (next-auth)]
```
<!-- /run -->

Everything the kit can read, it doesn't ask about. What remains are decisions only you can make.

### 2. Design

Run `design` in a terminal and answer the questions; Enter accepts the value the scan proposed. Each question shows why it matters and what was found. The same answers can be given as flags (this is what the example uses, via [`answers.json`](examples/nextjs-codex/answers.json)):

```sh
npx github:RolePlayingTech/agent-harness-kit design --yes \
  --set agents=codex --set rigor=standard --set memory=decisions \
  --rule "Money is stored as integer cents; never use floating point for amounts." \
  --rule 'Server Components by default; add "use client" only for interactive leaves.'
```

The user's sentence maps to: *standard* rigor (fast check while working, full suite once before done; not *strict*), *decisions* memory (a decision log, not a session handoff), Codex only. Payments and auth are detected, but asking permission before every edit there would be the heavy process the user rejected, so they get a lighter "extra care" rule instead. Migrations go on the ask-before list.

### 3. Explain

`explain` prints why each part is in or out and what it costs:

<details>
<summary>Full <code>explain</code> output</summary>

<!-- embed: examples/nextjs-codex/explain.txt -->
```text
Harness for invoice-hub (existing project; Node.js, TypeScript, Next.js, React, Prisma)
Agents: OpenAI Codex

Included
  [on]  Shared project instructions (AGENTS.md)
        Why: Every selected agent reads AGENTS.md (Claude Code through an import), so it is the
        single source of truth for purpose, commands and boundaries.
        Cost: Always loaded: every line costs context in every session, so it holds only what
        applies to most tasks.
        Files: AGENTS.md
  [on]  Definition of done (standard)
        Why: Standard rigor: catch regressions before a task is reported done, without running
        the whole suite after every edit.
        Cost: A regression found by the full suite surfaces at the end of a task rather than
        right after the edit that caused it.
        Files: AGENTS.md
  [on]  Concise test output
        Why: Full and end-to-end runs can print thousands of lines; reading only failures keeps
        the session focused.
        Cost: The first failure report is less detailed; the agent re-runs the single failing
        test verbosely when it needs more.
        Files: AGENTS.md
  [on]  Decision log (docs/agent/decisions.md)
        Why: You want agreements to survive between sessions. A short log the agent reads before
        structural changes is cheaper than re-explaining them.
        Cost: Needs pruning: superseded entries mislead. Entries are written by the agent, so
        review them like code.
        Files: docs/agent/decisions.md
  [on]  Ask-before list (advisory)
        Why: Actions with consequences outside the working tree, or areas detected as sensitive,
        need your approval: push, deploy, destructive, dependencies, migrations.
        Cost: These are instructions, not permissions. A model can ignore them; enforce the ones
        that matter with branch protection, CI or your tool's permission settings.
        Files: AGENTS.md
  [on]  Extra care in payments/auth code
        Why: Detected payments (stripe) and auth (next-auth). Mistakes there are costly, so
        changes get the full checks and are called out in the report, without asking permission
        for every edit.
        Cost: Slightly longer tasks when those areas change. If every change there needs your
        sign-off, add the area to approvals instead.
        Files: AGENTS.md
  [on]  Project rules
        Why: Conventions you named that the agent cannot infer from the code.
        Cost: Each rule is loaded every session; keep only rules that change behavior.
        Files: AGENTS.md
  [on]  Skill: harness-maintenance
        Why: Keeps changes to the harness going through .harness/spec.json, so rebuilding and
        checking stay meaningful as the project evolves.
        Cost: One more skill description in the agent's skill list (one line until used).
        Files: .agents/skills/harness-maintenance/SKILL.md

Left out
  [off] Claude Code entry point (CLAUDE.md → @AGENTS.md)
        Why not: Claude Code is not among the selected agents.
  [off] Skill: verify-change (test-first and review procedure)
        Why not: Not needed below strict rigor; the definition of done in AGENTS.md is enough.
  [off] Session handoff (note + skill)
        Why not: Not selected; tasks are expected to fit in one session, or git history is
        enough to resume.
  [off] Per-package checks in the monorepo
        Why not: Not a multi-package workspace.
  [off] Exploration discipline for a large codebase
        Why not: About 1 source files: small enough that the agent can read what it needs
        directly.
  [off] Stack decision pending
        Why not: The stack is known, so commands and layout come from the project itself.

Instructions are not enforcement
  Everything above is text the model reads. It shapes behavior but cannot prevent an action.
  Enforce what matters outside the model:
  - Pushing, merging or force-pushing to shared branches: Protect the default branch in your Git
  host (require pull requests and reviews).
  - Deploying, releasing or publishing: Keep deploy credentials out of the agent environment;
  deploy from CI with a manual approval step.
  - Deleting files, data or branches beyond what the task requires: Work on a branch or worktree
  so deletions are recoverable from git.
  - Adding, removing or upgrading dependencies: Review lockfile changes in pull requests; CI can
  fail on unexpected lockfile diffs.
  - Creating, editing or running database migrations: Require review of migration paths with
  CODEOWNERS; run migrations only from CI.
  - Codex: sandbox mode and approval policy in your Codex configuration.

Where each agent reads it
  - OpenAI Codex: AGENTS.md and .agents/skills/
```
<!-- /embed -->

</details>

### 4. Build

`build --dry-run` shows a unified diff of every file it would touch; `build` writes them. This is the complete `AGENTS.md` generated for the example:

<!-- embed: examples/nextjs-codex/expected/AGENTS.md -->
```markdown
# invoice-hub

<!-- agent-harness:begin -->
## Purpose
Invoicing app for small agencies: clients, invoices, Stripe payments and reminders.

## Stack and layout
- Stack: Node.js, TypeScript, Next.js, React, Prisma
- `src/app/`: App Router routes and layouts
- `prisma/`: database schema and migrations

## Commands
- Fast check, after each meaningful change: `npm run typecheck && npm run lint`
- Full check, once before reporting a task done: `npm test`
- End-to-end, before done when a user-facing flow changed: `npm run test:e2e`

## Definition of done
- Run the fast check after each meaningful change, not only at the end.
- Before reporting done, run the full check once, plus end-to-end when a user-facing flow changed.
- When you change behavior that tests already cover, update or add a test in the same change.
- Changes touching payments (code using `stripe`) or auth (code using `next-auth`): run the full check and, if a flow changed, end-to-end before done, and list those changes separately in your report.
- Report which checks you ran and their result. Never describe a check you did not run, or one that failed, as passing.
- If the same check still fails after three fix attempts, stop. Report what you tried and what you suspect, and ask how to proceed.

## Ask before
- Pushing, merging or force-pushing to shared branches
- Deploying, releasing or publishing
- Deleting files, data or branches beyond what the task requires
- Adding, removing or upgrading dependencies
- Creating, editing or running database migrations (`prisma/migrations`)

## Project rules
- Money is stored as integer cents; never use floating point for amounts.
- Server Components by default; add "use client" only for interactive leaves.

## Memory
- Before changing architecture, conventions or dependencies, read `docs/agent/decisions.md`. When you and the user settle something that should outlast the task, add an entry there.

## Working with context
- Search (for example `rg`) before opening files, and open large files by line range.
- Run long suites with concise output and read only the failures (Vitest `--reporter=dot`, Playwright `--reporter=line`; through package scripts, pass flags after `--`). Re-run a single failing test verbosely when you need detail; do not paste whole logs.

## Skills
- `harness-maintenance` (`.agents/skills/harness-maintenance/SKILL.md`): when the user wants to change how you work, or the same problem has happened twice.

## About this file
Generated by agent-harness-kit from `.harness/spec.json`. Do not edit between the agent-harness markers: change the spec and run `npx github:RolePlayingTech/agent-harness-kit build`. Notes outside the markers are preserved.
<!-- agent-harness:end -->
```
<!-- /embed -->

Notice what is *not* there: no test-first ceremony, no subagent instructions for a one-file project, no session handoff, no generic advice the model already follows. The full output is in [`examples/nextjs-codex/expected`](examples/nextjs-codex/expected): this file, one skill, a seeded decision log, the spec and the lock.

### 5. Check, now and in CI

```sh
npx github:RolePlayingTech/agent-harness-kit check        # static: drift, scripts, references, skills, size
npx github:RolePlayingTech/agent-harness-kit check --run  # also runs the fast, full and e2e commands once
```

`check` fails when the spec and the files disagree, when a configured `npm run` script doesn't exist, when `CLAUDE.md` imports a missing file or when a skill's frontmatter is invalid. It warns about dead path references, duplicated commands in hand-written notes, and always-loaded text above your budget. Commands run only with `--run`, because running them executes project code.

---

## A new project with no code yet

The kit doesn't pick your stack or scaffold an app. For an empty directory it produces a harness that is honest about the gaps: no invented commands, a first task to decide the stack with you, and light rigor until there is something to test. Here with Claude Code and Cursor and a session handoff ([answers](examples/new-project-claude/answers.json)):

<details>
<summary>Generated <code>AGENTS.md</code> for an empty directory</summary>

<!-- embed: examples/new-project-claude/expected/AGENTS.md -->
```markdown
# habit-garden

<!-- agent-harness:begin -->
## Purpose
Offline-first habit tracker for students; a small web app first, mobile later.

## Stack and layout
- Stack: not chosen yet. Before writing application code, agree on the stack with the user, record it in the decision log if there is one, and ask them to re-run `npx github:RolePlayingTech/agent-harness-kit design` so real check commands get wired in.

## Commands
- No check commands are configured yet. Until they exist, state explicitly which behavior you could not verify.

## Definition of done
- Before reporting done, run whatever check exists, or say that nothing could be run.
- Report which checks you ran and their result. Never describe a check you did not run, or one that failed, as passing.
- If the same check still fails after three fix attempts, stop. Report what you tried and what you suspect, and ask how to proceed.

## Ask before
- Pushing, merging or force-pushing to shared branches
- Deploying, releasing or publishing
- Deleting files, data or branches beyond what the task requires

## Memory
- Before changing architecture, conventions or dependencies, read `docs/agent/decisions.md`. When you and the user settle something that should outlast the task, add an entry there.
- Work that spans sessions: use the `session-handoff` skill. Read `docs/agent/handoff.md` when you start and update it before you stop.

## Working with context
- Search (for example `rg`) before opening files, and open large files by line range.

## Skills
- `session-handoff` (`.claude/skills/session-handoff/SKILL.md`): at the start and end of a session on unfinished work.
- `harness-maintenance` (`.claude/skills/harness-maintenance/SKILL.md`): when the user wants to change how you work, or the same problem has happened twice.

## About this file
Generated by agent-harness-kit from `.harness/spec.json`. Do not edit between the agent-harness markers: change the spec and run `npx github:RolePlayingTech/agent-harness-kit build`. Notes outside the markers are preserved.
<!-- agent-harness:end -->
```
<!-- /embed -->

</details>

`CLAUDE.md` contains only `@AGENTS.md` inside a managed block, so Claude Code and Cursor read the same instructions. Skills go to `.claude/skills/` only: Claude Code reads nothing else, and Cursor reads that directory too, so there is no duplicate copy. When you have chosen a stack, run `design` again and the real commands are wired in.

---

## Let your agent drive

Any agent that can run shell commands can conduct the design conversation in your language:

> Run `npx github:RolePlayingTech/agent-harness-kit design --agent` and follow its instructions to set up the agent harness for this repository with me.

`design --agent` prints the [`harness-designer`](skills/harness-designer/SKILL.md) protocol. The agent scans the repository, reads any existing instruction files, asks only what the scan could not answer (`design --questions --json` gives it the questions, evidence and defaults), maps your free-form answers to spec values, writes the spec with `design --set ... --yes`, shows you `explain` and the `build --dry-run` diff, and builds only after you agree. It never edits generated files by hand. You can also copy that skill into your personal skills directory to have it available everywhere.

---

## How it works

```text
  your repo ──► scan ──► facts with evidence (detected / inferred)
                              │
  your answers ──► design ◄───┘     (terminal interview, flags, answers file, or an agent)
                     │
                     ▼
            .harness/spec.json      decisions: agents, rigor, commands, memory, approvals, rules
                     │
                     ▼
          rule engine (src/engine.mjs) ──► modules, each with why / cost / files ──► explain
                     │
                     ▼
                   build ──► AGENTS.md block, CLAUDE.md import, skills, seeded docs
                     │            + .harness/lock.json (what the kit wrote)
                     ▼
                   check ──► drift, commands, references, skills, size  (--run: execute checks)
```

The spec is the source of truth; generated files are its output. Re-running `design` keeps your earlier answers and changes only what you change. You can also edit the spec directly; its [JSON Schema](schema/spec.schema.json) gives editors completion and validation.

| Path | Role |
| --- | --- |
| `src/scan.mjs` | Read-only reconnaissance: stack, package manager, scripts, test runners, CI, workspaces, sensitive areas, existing instruction files and skills |
| `src/spec.mjs` | Spec model, defaults derived from the scan, validation |
| `src/interview.mjs` | Questions (shared by the terminal interview and `design --questions`) |
| `src/engine.mjs` | Deterministic rules: which modules apply, why, and at what cost |
| `src/render.mjs`, `templates/skills/` | Content of `AGENTS.md`, `CLAUDE.md`, skills and seed files |
| `src/build.mjs`, `src/fs-safe.mjs`, `src/file-transaction.mjs` | Planning, diffs, managed blocks, ownership, path safety, rollback |
| `src/check.mjs` | Consistency checks and the optional command runner |
| `skills/harness-designer/` | Protocol for an agent running the design conversation |

---

## What it can generate

Each module is included only when its condition holds. `explain` shows the decision for your spec; `overrides` in the spec can force the overridable ones on or off.

| Module | Included when | Output |
| --- | --- | --- |
| `instructions` | Always | Managed block in `AGENTS.md`: purpose, stack and layout, commands, definition of done |
| `claude-import` | Claude Code selected | `CLAUDE.md` with `@AGENTS.md` |
| `verification` | Always; wording depends on rigor (`light`, `standard`, `strict`) | Definition of done, including a stop rule after three failed fix attempts |
| `verify-change` | Rigor is `strict` (overridable) | Skill: test-first, ordered checks, independent review, evidence report |
| `quiet-output` | A full or end-to-end command exists (overridable) | Read only failures; reporter flags for the detected test runners |
| `decision-log` | Memory is `decisions` or `handoff` | `docs/agent/decisions.md` (created once, then yours) and a rule to read it before structural changes |
| `session-handoff` | Memory is `handoff` | `docs/agent/handoff.md` and a skill for resuming and handing off |
| `approvals` | Any approvals selected; defaults include push, deploy, destructive changes, plus detected migrations, CI, infrastructure and secrets files | "Ask before" list, marked advisory in `explain` |
| `risk-areas` | Payments or auth code detected and not on the approvals list (overridable) | Full checks and a separate mention in the report for those changes |
| `project-rules` | You gave rules | One line each |
| `workspace-scope` | More than one workspace package (overridable) | Per-package check command for the package manager |
| `exploration` | 300 or more source files, or a multi-package workspace (overridable) | Search first; delegate wide surveys to a subagent where the tool supports it |
| `stack-pending` | New project without a chosen stack | First task: decide the stack and re-run `design` |
| `harness-maintenance` | Always (overridable) | Skill: change the harness through the spec, rebuild, check |

The thresholds (300 files, three attempts, a 200-line budget) are judgment calls, not measured optima. They are visible and adjustable for that reason.

---

## Where each tool reads the harness

| Tool | Instructions | Skills | Notes |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` | `.agents/skills/` | Lists each skill's name, description and path, loads the body on use |
| Claude Code | `CLAUDE.md`, which imports `AGENTS.md` | `.claude/skills/` | Recent versions can read `AGENTS.md` without `CLAUDE.md`; the import works in every version |
| Cursor | `AGENTS.md` | `.agents/skills/`, `.cursor/skills/`, and `.claude/skills/` for compatibility | With Codex *and* Claude Code selected, skills exist in both directories and Cursor may list them twice |
| Other (`other`) | `AGENTS.md` | `.agents/skills/` if the tool supports Agent Skills | Gemini CLI, GitHub Copilot and others read `AGENTS.md` or can be configured to |

Sources, checked in October 2026: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code memory](https://code.claude.com/docs/en/memory) and [skills](https://code.claude.com/docs/en/skills), [Cursor rules](https://cursor.com/docs/rules) and [skills](https://cursor.com/docs/skills). These locations change; the tests verify the files the kit writes, not that a given client version loads them. If your tool behaves differently, please open an issue.

---

## Changing the harness later

- **Re-run `design`.** Previous answers are the defaults; change one and the rest stays.
- **Edit `.harness/spec.json`** and run `build`. For example add a rule, switch `rigor` to `strict` before a payments refactor, or set `"overrides": { "exploration": true }`.
- **Let the agent propose it.** The generated `harness-maintenance` skill tells the agent to suggest spec changes when you correct the same behavior twice, show you the diff and rebuild only after you agree.
- **Keep it small.** Removing a rule that no longer changes behavior is as valuable as adding one. `check` reports the always-loaded line count against `budget.alwaysOnLines`.

## What build and remove do to your files

- `AGENTS.md` and `CLAUDE.md` get a block between `<!-- agent-harness:begin -->` and `<!-- agent-harness:end -->`. Everything outside it is yours and is never changed. An existing file keeps its content; the block is appended (prepended in `CLAUDE.md`, so the import comes first). Line endings (LF or CRLF) are preserved.
- Skills are generated whole. `.harness/lock.json` records the hash of what the kit wrote. A file is replaced only if its bytes still match that hash; otherwise the build stops with a conflict and writes nothing. `--force` overrides that, explicitly.
- `docs/agent/decisions.md` and `docs/agent/handoff.md` are created once and then belong to the project. A pre-existing file with that name is never recorded as the kit's, so `remove` never deletes it.
- The lock is treated as untrusted: entries outside the set of paths the kit can generate are rejected. Every write is checked to stay inside the target directory and not to pass through a symlink or junction.
- All writes of one command form a plan that is validated first and applied with best-effort rollback on failure. This is not crash-proof; commit before running it, as with any tool that writes to your repository.
- `remove` deletes what the kit wrote and you didn't change, strips managed blocks, and keeps `.harness/spec.json`.

---

## Command reference

| Command | What it does | Options |
| --- | --- | --- |
| `scan [dir]` | Read-only scan | `--json` |
| `design [dir]` | Interview or flags, then writes `.harness/spec.json` | `--set key=value` (repeatable: `agents`, `summary`, `name`, `stack`, `rigor`, `fast`, `full`, `e2e`, `memory`, `approvals`), `--rule "..."` (repeatable), `--answers file.json`, `--yes`, `--dry-run`, `--questions`, `--agent`, `--json` |
| `explain [dir]` | Reason and cost of every module in or out | `--brief`, `--json` |
| `build [dir]` | Generate files from the spec | `--dry-run` (shows diffs), `--force`, `--json` |
| `check [dir]` | Consistency checks; exit code 1 on errors | `--run`, `--timeout seconds`, `--strict` (warnings fail), `--json` |
| `remove [dir]` | Remove unchanged generated output | `--dry-run`, `--json` |

Without a TTY, `design` previews and writes nothing unless you pass `--yes`. Unknown options, or options that don't apply to a command, are errors.

The package is not published to npm yet. `npx github:RolePlayingTech/agent-harness-kit` runs the default branch (it needs git and network access); to pin a version, use a tag or commit, for example `npx github:RolePlayingTech/agent-harness-kit#<commit>`. From a clone, `node bin/agent-harness.mjs` works the same.

### In CI

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npx --yes github:RolePlayingTech/agent-harness-kit#<commit> check . --strict
```

---

## Limitations

- **Instructions are not enforcement.** Everything the kit writes is text a model reads and may ignore. `explain` names where each rule can actually be enforced: branch protection, CODEOWNERS, CI, your tool's permission settings.
- **No measured benefit is claimed.** There is no benchmark here comparing agents with and without this harness. The kit encodes practices that vendor documentation and research describe (short always-loaded instructions, procedures loaded on demand, deterministic checks, explicit stop rules), but how much they help depends on your model, tool and project.
- **The scan is heuristic.** It understands Node.js (npm, pnpm, yarn, bun), Python, Go, Rust and Makefile targets, common frameworks and test runners. For anything else you answer the questions yourself. It reads files only; it never runs your code.
- **It checks consistency, not quality.** `check` can tell you a script exists and the harness matches its spec; `check --run` can tell you the commands pass. Neither tells you whether your tests are good.
- **One spec per repository.** Nested `AGENTS.md` files for individual packages are not generated.
- **Format coverage.** `check` validates the YAML subset used in skill frontmatter (`key: value`, quoted values, `>` and `|` blocks) and reports anything else as unsupported rather than guessing.

## Upgrading from v2

v3 replaces v2's installer and its seven fixed skills. v2 files are not touched or managed by v3; [docs/MIGRATION.md](docs/MIGRATION.md) explains how to remove them and move to a spec.

## Background

- [Harness²: Recursive Agent Harnessing for an Open World](https://arxiv.org/abs/2610.14224) (Google Cloud AI Research, 2026) models a harness as eight editable components (system prompt, guardrails, memory, tool guidance, subagents, skills, scripts, plugins) and improves them automatically from repeated task runs. The kit borrows the vocabulary and the idea that harness changes should be small and backed by evidence; it does not implement the paper's automated method.
- [AGENTS.md](https://agents.md/), the shared instruction-file convention.
- [Claude Code: How Claude remembers your project](https://code.claude.com/docs/en/memory), including its guidance to keep instruction files short.
- [MUMRO Academy lesson: AI Agent Harness Engineering](https://academy.mumro.io/pl/lessons/ai-agent-harness-engineering/) (Polish).

## Development

```sh
npm test            # unit, lifecycle, CLI, example and README contract tests
npm run examples    # regenerate examples/*/expected and the README embeds after changing output
npm run check       # this repository's own harness, generated by the kit
```

This repository's [`AGENTS.md`](AGENTS.md) is generated from [`.harness/spec.json`](.harness/spec.json) by the kit itself.

## License

MIT © RolePlayingTech & MUMRO Academy. See [LICENSE](LICENSE).
