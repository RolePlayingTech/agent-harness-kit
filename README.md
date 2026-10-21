# Agent Harness Kit

Agent Harness Kit installs reusable coding-agent instructions and checks their configuration. It includes seven Markdown skills, a read-only repository scanner, a stack-options catalog, and a Node.js CLI. Requires Node.js 20 or later.

[English guide](docs/GUIDE_EN.md) · [Polski przewodnik](docs/GUIDE_PL.md) · [Stabilization scope and limitations](docs/STABILIZATION.md)

This branch continues [PR #36](https://github.com/RolePlayingTech/agent-harness-kit/pull/36). Stabilization is under review; no release or product-performance claim follows from passing these tests.

## Quick start

Run these commands from a checkout of the version you intend to use:

```sh
node bin/agent-harness.mjs inspect .
node bin/agent-harness.mjs plan . --archetype saas-web
node bin/agent-harness.mjs init ../my-project --provider codex --profile smart-tiered --dry-run --json
node bin/agent-harness.mjs init ../my-project --provider codex --profile smart-tiered
node bin/agent-harness.mjs verify ../my-project --strict
```

`inspect` reads selected manifests, scripts and directories. It does not establish complete architectural understanding. `plan` prints a predefined catalog; it does not interview you or persist project decisions. `verify` checks harness configuration; it **does not run application tests, builds or typechecks**.

When using a compatible agent, ask: “Use the harness-architect skill. Inspect this repository, distinguish facts from assumptions, and help me choose the next implementation step.” Skill execution and discovery depend on the agent's capabilities and settings.

## CLI contract

Run `node bin/agent-harness.mjs --help` for the executable reference. The installed executable is named `agent-harness`.

| Command | Purpose |
| --- | --- |
| `inspect [dir]` | Read-only repository observations and questions; `--json` supported. |
| `plan [dir]` | Predefined stack comparison; `--archetype` and `--json` supported. |
| `init [dir]` | Install skills and instruction files; supports the profile options below, `--blueprint`, `--dry-run`, `--force`, `--json`. |
| `update [dir]` | Plan or apply eligible package-file changes; review `--dry-run --json` first. |
| `uninstall [dir]` | Remove eligible unchanged package files; supports `--dry-run` and `--json`. |
| `verify [dir]` | Configuration pass/fail check; supports `--context`, `--max-lines`, `--strict`, `--json`. |
| `audit [dir]` | Advisory static findings and instruction-size estimates; supports `--context`, `--max-lines`, `--json`. |
| `doctor [dir]` | Informational configuration diagnostics; supports `--context`, `--max-lines`, `--json`. |
| `autotrigger [dir]` | **Writes** missing skill references into `AGENTS.md`; review the resulting diff. |

For `init` and `update`:

- `--provider` / `--adapters`: one of `universal`, `claude`, `codex`, `cursor`, `antigravity`.
- `--testing` / `--profile`: `fast-prototype`, `smart-tiered`, `isolated-verifier`, `mission-critical`.
- `--context` / `--policy`: `minimal`, `balanced`, `deep-research`, `low-cost`. Legacy `strict` and `expansive` map to `minimal` and `deep-research`.
- `--blueprint`: add editable planning scaffolds. This is **not** an approved ProjectSpec or a completed project design.

Multiple comma-separated adapters are unsupported; choose one provider or explicitly choose `universal`. Unsupported flags, missing values, conflicting aliases and invalid choices fail instead of silently changing configuration. `--mode`, `--security`, `--name`, `copilot`, and `windsurf` are not supported CLI selections.

## Preserving your work

Installation uses an exact package-path allowlist and validates the full operation plan before writing. Existing root instructions and blueprint documents are treated as user-owned: update preserves them unless `--force` is explicitly supplied, and uninstall always preserves them. Identical pre-existing unowned files are not adopted.

Static package files can be removed only when their bytes match both the manifest checksum and the bundled package content. A checksum supplied by a manifest alone does not prove ownership. Unknown historical package content is preserved. Corrupted or invalid manifests fail before mutation; do not repair them by guessing ownership.

`update --dry-run --json` exposes planned paths and hashes without writing. This is a change inventory, not a line-by-line text diff. Synchronous I/O failures trigger rollback; rollback errors are reported. There is no durable crash-recovery or concurrent hostile-filesystem guarantee. See [lifecycle details](docs/STABILIZATION.md).

## Provider output and discovery

| Provider | Generated skill directories | Root entry points |
| --- | --- | --- |
| `codex` | `.agents/skills` | `AGENTS.md` |
| `claude` | `.claude/skills` | `AGENTS.md`, `CLAUDE.md` |
| `cursor` | `.agents/skills` | `AGENTS.md`, `.cursor/rules/00-harness-core.mdc` |
| `antigravity` | `.agents/skills` | `AGENTS.md` |
| `universal` | `.agents/skills`, `.claude/skills` | Both root files and the Cursor rule |

This table describes generated files, not certified native integration. Tests check installation and reference resolution. Native agent discovery, duplicate loading and provider-version behavior require separate integration evidence; [#25](https://github.com/RolePlayingTech/agent-harness-kit/issues/25) remains open.

## Skills, testing and evidence

The seven skills cover project planning, Brownfield onboarding, testing choices, context management, verification and optional recursive refinement. They are instructions for a model, not sandbox permissions or an application-check runner. CI and provider permissions must enforce the boundaries that matter to your project.

Testing profiles suggest different review and test workflows. They do not establish a measured token budget or defect rate. Context line budgets are configurable project preferences, not scientific model-capacity thresholds. Audit token estimates use character counts and a hypothetical combined-instructions baseline; they are not measured savings. No benchmark evidence currently establishes a benefit over an agent without this kit.

`--blueprint` creates `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/adr/0001-harness-and-testing-tradeoffs.md`, `docs/ROADMAP.md`, `feature_list.json`, its local schema, and `HANDOFF.md`. Review placeholders and planned commands before implementation. Do not treat generated ADR wording as user approval. An approved shared decision model is tracked in [#28](https://github.com/RolePlayingTech/agent-harness-kit/issues/28).

## Development checks

```sh
npm test
npm run verify
npm run doctor
```

CI covers Windows and Ubuntu with Node.js 20 and 22. See [epic #20](https://github.com/RolePlayingTech/agent-harness-kit/issues/20) for acceptance criteria and remaining work, including application-check evidence, shared YAML validation, Project Wizard and benchmarks. Legacy walkthroughs and the testing playbook are illustrative material pending reconciliation with the current contract; use this README and CLI help for executable commands.

## License

MIT © RolePlayingTech & MUMRO Academy. See [LICENSE](LICENSE).
