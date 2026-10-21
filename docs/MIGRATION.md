# Upgrading from v2 to v3

v3 is a redesign, not an update. v2 installed the same seven skills, a verifier script and a profile-based `AGENTS.md` into every repository. v3 records your decisions in `.harness/spec.json` and generates only what those decisions call for. v3 never reads, changes or deletes v2 files.

## What changed

| v2 | v3 |
| --- | --- |
| `inspect`, `plan` | `scan` (evidence with detected/inferred labels); stack catalogs were dropped, because the kit does not choose your stack |
| `init`, `update` with `--profile`/`--testing`, `--context`, `--provider` | `design` (questions or `--set`), then `build` |
| Four testing profiles and four context policies | `rigor`: `light`, `standard`, `strict`; context rules are derived from the repository (size, workspaces, test runners) |
| Seven skills copied into `.agents/skills` and `.claude/skills` | Up to three generated skills, only in the directories your tools read |
| `.cursor/rules/00-harness-core.mdc` | Not generated: Cursor reads `AGENTS.md` directly |
| `scripts/verify-harness.mjs` copied into the repository | `check`, run through `npx` locally or in CI; `check --run` executes your configured commands |
| `--blueprint` (`PROJECT_BRIEF.md`, `ROADMAP.md`, `feature_list.json`, ...) | Dropped. Memory is `decisions` (a decision log) or `handoff` (plus a session note) |
| `audit` token "savings" estimates | Dropped: they were estimates against a hypothetical baseline, not measurements. `check` reports line counts against your own budget |
| `autotrigger` | Not needed: every generated skill is listed in `AGENTS.md` with its trigger |
| `.agents/harness-manifest.json` | `.harness/lock.json`, which only permits replacing bytes the kit wrote |

## Steps

1. Commit or stash your work.
2. Remove the v2 files you don't want to keep. v2's own uninstaller is still reachable at its last commit on `main` (`npx github:RolePlayingTech/agent-harness-kit#887b153 uninstall . --dry-run`); review its plan before running it without `--dry-run`. Deleting by hand and reviewing `git status` is just as good. Typical v2 paths:
   - `.agents/skills/{harness-architect,greenfield-advisor,brownfield-onboarder,testing-tradeoffs,context-hygiene,verification-loop,recursive-refiner}/`
   - the same names under `.claude/skills/`
   - `scripts/verify-harness.mjs`, `scripts/feature-ledger-schema.mjs`, `docs/schemas/feature-list.schema.json`
   - `.cursor/rules/00-harness-core.mdc`, `.agents/harness-manifest.json`
   - blueprint files if you never used them: `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/adr/0001-harness-and-testing-tradeoffs.md`, `feature_list.json`, `HANDOFF.md`
3. Keep the parts of your old `AGENTS.md` that still describe your project. Either move them into the spec as rules (`design --rule "..."`) or leave them in `AGENTS.md`: v3 appends its managed block and never touches text outside it. `check` reports commands that appear in both places.
4. Run `design`, `build --dry-run`, `build`, `check`, and commit.

`scan` and `check` print a note while `.agents/harness-manifest.json` is still present.
