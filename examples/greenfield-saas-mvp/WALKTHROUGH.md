# Worked Example 1: Greenfield SaaS MVP (Path A Walkthrough)

This walkthrough demonstrates how `agent-harness-kit` guides a developer step-by-step from an **empty folder** to a complete, verified project blueprint.

## Scenario
- **Starting State:** Empty directory `invoice-pilot/` (0 files).
- **User Goal:** Build a B2B micro-SaaS for freelancers to generate EU VAT-compliant PDF invoices and track payment status.

---

## Step 1: Inspection & Mode Detection
Running `npx github:RolePlayingTech/agent-harness-kit inspect .` outputs:
- **Detected Mode:** `greenfield` (No `package.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod` found).
- **Recommended Skill:** `skills/greenfield-advisor/SKILL.md` (Path A).

## Step 2: Guided Discovery Conversation (Summary)
1. **Product Scope & Non-Goals (`greenfield-advisor`):**
   - *Core Loop:* Create client → Generate PDF invoice with VAT rules → Mark as paid/overdue.
   - *Explicit Non-Goals for v1:* No automated bank feed PSD2 sync, no multi-currency crypto billing, no mobile native app.
2. **Stack Comparison Presented to User:**
   - **Option A (Selected):** Next.js + TypeScript + Tailwind + Drizzle ORM + SQLite/Turso (`Full-Stack TypeScript Web/SaaS`) — chosen for end-to-end type safety and instant AI compiler feedback.
   - *Option B:* FastAPI + React — rejected by user to avoid managing two runtimes as a solo founder.
3. **Testing vs. Context Profile (`testing-tradeoffs`):**
   - User selects **`smart-tiered`**: run `tsc --noEmit` + targeted unit test on VAT calculation math after every edit, and run Playwright E2E only before milestone completion.

## Step 3: Command Executed
```bash
npx github:RolePlayingTech/agent-harness-kit init . \
  --mode greenfield \
  --name invoice-pilot \
  --profile smart-tiered \
  --policy balanced \
  --adapters claude,cursor \
  --blueprint
```

## Step 4: Generated Artifact Tree & Token Budget Audit
- `AGENTS.md` (48 lines, ~390 tokens)
- `CLAUDE.md` (14 lines, ~110 tokens)
- `.cursor/rules/00-harness.mdc`
- `.agents/skills/` (6 modular skills, loaded on demand)
- `docs/PROJECT_BRIEF.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/0001-stack-and-testing-profile.md`
- `docs/ROADMAP.md`
- `feature_list.json` (initialized with 3 `"pending"` tasks — zero fake `"verified"` claims)
- `HANDOFF.md`
