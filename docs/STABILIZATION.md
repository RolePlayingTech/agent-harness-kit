# Stabilization scope and limits

This document describes the work on [PR #36](https://github.com/RolePlayingTech/agent-harness-kit/pull/36), following [epic #20](https://github.com/RolePlayingTech/agent-harness-kit/issues/20). It is not a release approval or an issue-closure claim.

## Filesystem lifecycle contract

A manifest is untrusted input. A syntactically valid path and matching SHA-256 do not prove that a file belongs to the kit.

- Managed destinations must match the exact package-path allowlist. Traversal, unsupported paths, invalid metadata and symlink/junction paths are rejected before mutation.
- Existing root instruction files and blueprint documents are user-owned. Update preserves them unless `--force` is explicit; uninstall preserves them even if an old manifest lists them.
- A pre-existing identical file is not adopted without prior ownership. Static package files are eligible for removal only when their content matches both the manifest checksum and bundled content. Unknown historical versions are preserved for manual review.
- The complete operation plan is validated before writes or deletes. `--dry-run --json` exposes intended paths and hashes and has no filesystem effects. It does not yet provide a line-by-line text diff.
- Synchronous filesystem failures trigger rollback of applied changes. Recovery failures are surfaced; retain the error output and compare the workspace with version control before retrying. Do not assume that rollback succeeded if a recovery error is reported.
- This is not a durable transaction across process termination, power loss or concurrent hostile filesystem changes. Do not run overlapping lifecycle operations. Ordinary filesystem permissions remain part of the security boundary.

On an invalid manifest, stop and inspect it against version control or a known installation backup. Do not replace its hashes with current file hashes to make an operation pass: that would obscure ownership. Preserved documents and customized files remain the user's responsibility after uninstall.

## Evidence and compatibility boundaries

The shipped feature-list JSON Schema is the canonical data contract. Schema validity checks structure, not the truth of an execution claim. `verify` does not execute application commands. The standalone verifier and CLI still have divergent validation paths; shared validation and a bounded application-check runner remain [#26](https://github.com/RolePlayingTech/agent-harness-kit/issues/26) and [#27](https://github.com/RolePlayingTech/agent-harness-kit/issues/27).

Provider tests establish generated file layout and resolvable links. They do not prove that a particular installed AI client discovers or follows those files. Native discovery smoke tests with client/version evidence remain part of [#25](https://github.com/RolePlayingTech/agent-harness-kit/issues/25).

The CLI stack catalog and optional blueprint scaffolds do not implement a persisted, approved ProjectSpec. Remaining placeholders, planning assumptions and selected commands require review before implementation; [#28](https://github.com/RolePlayingTech/agent-harness-kit/issues/28) tracks the actual wizard.

README and the EN/PL guides describe this narrower scope. Older walkthroughs, the testing playbook, profile descriptions and some skill wording still need reconciliation under [#33](https://github.com/RolePlayingTech/agent-harness-kit/issues/33). They are not measured product-performance evidence. No benchmark advantage is claimed; [#34](https://github.com/RolePlayingTech/agent-harness-kit/issues/34) remains open.

## Acceptance still requires review

Run `npm test`, `npm run verify` and `npm run doctor`. CI must pass on Windows/Ubuntu and Node.js 20/22 for the reviewed commit. Negative tests must cover forged manifests, user-owned files, partial I/O failures, schema constraints and rejected CLI input.

Issues #21, #23, #25 and #31 are not closed by adding these changes. Their remaining acceptance criteria, independent review and merge into the intended target branch must be satisfied first. In particular, durable crash recovery and text diffs are not supplied by this patch.
