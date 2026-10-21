---
name: verify-change
description: Test-first and evidence procedure for changes that alter behavior. Use before starting, and again before reporting done, on any bug fix, feature or refactor that changes what the code does.
---

# Verify a behavior change

1. **State the expected behavior** in one or two sentences, including the edge case most likely to break.
2. **Make it fail first.** For a bug fix, write or adjust a test that fails without the fix, and run it. If a test is impractical (visual layout, a third-party service), write down the manual check you will do instead and tell the user.
3. **Change the code**, keeping the diff focused on the task.
4. **Run checks from cheapest to most expensive:** the test from step 2, then {{fast}}, then {{full}}, then {{e2e}} when a user-facing flow changed.
5. **Stop rule.** If the same check still fails after three fix attempts, stop and report what you tried, the exact failure and your best hypothesis.
6. **Independent review** for changes in an ask-before area or across several modules: ask a subagent, or a fresh session, to review the diff against the expected behavior from step 1 without reading your reasoning first. Fix or answer each finding.
7. **Report** what changed, which commands ran and their results, and what could not be verified and why.

Do not weaken or delete an assertion to make a check pass. If a test is wrong, say why and change it as a separate, visible step.
