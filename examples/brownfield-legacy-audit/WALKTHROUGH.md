# Worked Example 2: Brownfield Legacy Repository Onboarding (Path B Walkthrough)

This walkthrough demonstrates how `agent-harness-kit` silently inspects an **existing production codebase** and conducts a grounded trade-off interview without overwriting developer files.

## Scenario
- **Starting State:** Existing TypeScript + Astro + Playwright repository with 45 components, existing `package.json` scripts (`build`, `test`, `verify:content`), and a custom `CLAUDE.md`.

---

## Step 1: Silent Reconnaissance (`agent-harness inspect .`)
Before asking the developer any questions, `inspectWorkspace` detects:
- **Mode:** `brownfield`
- **Languages & Frameworks:** `typescript`, `astro`, `playwright`
- **Package Manager:** `npm` (`package-lock.json`)
- **Detected Scripts:** `build`, `test`, `verify:content`
- **Existing Harness Files:** `CLAUDE.md` (detected — flagged for non-destructive preservation)

## Step 2: Grounded Interview (`brownfield-onboarder`)
Instead of asking *"What stack do you use?"*, the agent states:
> *"I scanned your repository and found an Astro + TypeScript project using `npm` with Playwright E2E tests (`npm test`) and content verification (`npm run verify:content`). Your existing `CLAUDE.md` will be preserved untouched. Before I generate the harness skills, let's align on three questions:"*
1. **Fragile Zones:** Are there directories where edits must require human approval? *(User answers: `scripts/deploy-*` and production SSH configs).*
2. **Noisy Test Isolation:** Playwright outputs verbose HTML/trace logs on failure. Should we use `smart-tiered` or `isolated-verifier`? *(User selects `isolated-verifier` so Playwright runs in a subagent without flooding the main coding context).*
3. **Context Policy:** Standard `balanced` (80-line root `AGENTS.md` ceiling).

## Step 3: Safe Non-Destructive Initialization
```bash
# Preview changes first with zero disk modifications
npx github:RolePlayingTech/agent-harness-kit init . --profile isolated-verifier --dry-run

# Apply safely (existing CLAUDE.md is automatically skipped and preserved)
npx github:RolePlayingTech/agent-harness-kit init . --profile isolated-verifier --adapters claude
```

## Step 4: Verification Gate (`agent-harness verify . --strict`)
- Root `AGENTS.md`: 50 lines / 80 max (~410 always-on tokens)
- 6 Modular Skills validated via strict YAML frontmatter & schema parser
- Existing `CLAUDE.md` preserved without data loss
- Exit code: `0` (`PASSED`)
