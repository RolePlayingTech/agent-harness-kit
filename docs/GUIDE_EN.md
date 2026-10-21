# User guide (EN)

Agent Harness Kit installs coding-agent instructions and checks their configuration. It requires Node.js 20 or later. This stabilization branch is under review; read the [CLI contract](../README.md#cli-contract) and [known limits](STABILIZATION.md) before adopting it.

## Start with a preview

From a checkout of the intended version:

```sh
node bin/agent-harness.mjs inspect . --json
node bin/agent-harness.mjs plan . --archetype saas-web
node bin/agent-harness.mjs init ../my-project --provider codex --profile smart-tiered --policy balanced --dry-run --json
node bin/agent-harness.mjs init ../my-project --provider codex --profile smart-tiered --policy balanced
node bin/agent-harness.mjs verify ../my-project --strict
```

`inspect` and `plan` are read-only. The scanner reads selected repository signals; findings are not a complete architecture audit. `plan` prints predefined technology alternatives. It does not conduct an interview, use a model or save a project decision.

`--provider` and `--adapters` are aliases for **one** selection: `codex`, `claude`, `cursor`, `antigravity` or `universal`. Comma-separated lists are rejected; choose `universal` explicitly if you want its combined output. This option describes generated files, not verified native skill discovery in every provider. The [provider table](../README.md#provider-output-and-discovery) lists exact paths.

`--testing` / `--profile` accepts `fast-prototype`, `smart-tiered`, `isolated-verifier` or `mission-critical`. These profiles suggest workflows; they do not execute checks or guarantee defect rates. `--context` / `--policy` accepts `minimal`, `balanced`, `deep-research` or `low-cost`. Legacy `strict` and `expansive` remain aliases. Budgets are configurable preferences, not measured model limits.

Unknown flags, missing values, invalid values and conflicting aliases fail. There are no `--mode`, `--security` or `--name` options. `copilot` and `windsurf` are not supported provider selections. `--force` applies to `init` and `update`; uninstall has no force mode.

## New project: conversation before a blueprint

Ask your agent: “Use the harness-architect skill. Help me define the problem, users, MVP, non-goals and constraints. Separate my decisions from your suggestions.”

The skill guides a conversation when the host agent can discover and use it. The CLI does not persist those answers in a shared ProjectSpec yet. Record open questions and approval explicitly; do not infer acceptance from generated documents.

Optional `init --blueprint` creates editable scaffolds:

- `docs/PROJECT_BRIEF.md` and `docs/ARCHITECTURE.md`;
- `docs/adr/0001-harness-and-testing-tradeoffs.md` and `docs/ROADMAP.md`;
- `feature_list.json`, `docs/schemas/feature-list.schema.json` and `HANDOFF.md`.

These files contain placeholders and generic steps. Review every generated claim and command. A generated ADR is not evidence of a user-approved architecture. A planned command does not prove that the application's test suite exists. The actual approved-decision workflow is tracked in [#28](https://github.com/RolePlayingTech/agent-harness-kit/issues/28).

## Existing project: read first

Review `inspect --json` and verify important observations against their source files. A detected script proves only that its definition exists. The current scanner does not establish complete component dependencies, API contracts, authorization boundaries or migration safety. Ask the agent to distinguish confirmed facts, hypotheses and unanswered questions before proposing changes.

Preview installation before applying it. Existing root instructions and blueprint documents are user-owned: update preserves them unless explicitly forced, and uninstall always preserves them. Identical existing unowned files are not silently adopted.

```sh
node bin/agent-harness.mjs update ../my-project --provider codex --dry-run --json
node bin/agent-harness.mjs update ../my-project --provider codex
node bin/agent-harness.mjs uninstall ../my-project --dry-run --json
```

The JSON plan exposes paths and content hashes; it is not a text diff. Manifest checksums alone do not authorize overwrites or deletion. Only allowlisted static files matching the current bundle and manifest checksum are eligible for removal. Modified or unknown historical content is preserved. A complete preflight precedes writes; synchronous failures trigger rollback, with any recovery failure reported. There is no durable crash journal or protection against a concurrent adversarial filesystem. See [the recovery contract](STABILIZATION.md).

## What verification establishes

`verify` checks configuration: root files, supported frontmatter checks, references and task-ledger constraints. It does **not** run application tests, builds or typechecks, and does not authenticate a manually supplied evidence record. The copied standalone verifier still differs from the CLI; do not treat the two as equivalent application gates.

`audit` reports static findings and character-based instruction-size estimates. Its hypothetical savings values are not observed token usage. `doctor` is informational. `autotrigger` writes missing skill references into `AGENTS.md`; inspect its diff.

Run the application's actual checks separately and record their commands, exit codes and checked revision. Never infer application completion from a harness check. A bounded executor with structured execution evidence is tracked in [#26](https://github.com/RolePlayingTech/agent-harness-kit/issues/26).

Markdown skills guide behavior. They cannot enforce sandbox permissions, production approval or branch protection. Configure those controls in your provider and CI. No measured token savings, reliability advantage or benchmark superiority is claimed; benchmark work remains [#34](https://github.com/RolePlayingTech/agent-harness-kit/issues/34).
