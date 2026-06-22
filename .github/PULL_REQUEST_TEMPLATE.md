# Pull Request

## Branch confirmation
- [ ] This PR was developed on a feature branch (not `main`)
- Branch name: `feat/`
- [ ] No direct commits to `main` were made during this session

## Summary
<!-- What does this PR do and why? -->

## Reviewer verdicts

**code-reviewer** verdict:
<!-- Paste the code-reviewer agent's output here. PR cannot be merged without this. -->
- [ ] code-reviewer ran
- Verdict: `pass / pass-with-notes / fail`
- Notes:

**security-auditor** verdict (required if PR touches auth, secrets, input handling, or data):
- [ ] security-auditor ran (or: [ ] N/A — no security-sensitive changes)
- Verdict: `pass / pass-with-notes / fail`
- Notes:

**eval-runner** score (required for non-trivial features):
- [ ] eval-runner ran (or: [ ] N/A — trivial change)
- Score: `0.0 – 1.0`
- Notes:

## Test confirmation
- [ ] `npx vitest run` passes with no failures
- [ ] `npx next build` completes cleanly (if applicable)

## Secret scan
- [ ] gitleaks pre-commit hook ran on all commits in this branch
- [ ] No secrets, tokens, or credentials in the diff

## Checklist
- [ ] Follows the branch+PR rule (clone → branch → PR → owner decides)
- [ ] No destructive operations (rm, DROP, force-push, prod changes) without Matt's approval
- [ ] Scope matches the stated goal — no gold-plating
