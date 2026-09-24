# Agent collaboration

The project is worked on by Codex, Kimi Code, and Google Antigravity.

## Shared source of truth

- GitHub `main` is the integrated source of truth.
- Every agent works in its own branch or worktree.
- Pull requests or committed handoff notes are the durable record of changes.
- The production deployment remains a Codex-owned step after checks pass.

## Handoff format

When an agent finishes a task, report:

```text
Agent: <codex|kimi|antigravity>
Task: <short description>
Branch/commit: <branch and commit>
Files: <important files>
Checks: <commands and results>
Open risks: <none or details>
Next agent: <who should review or continue>
```

## Direct messaging

When an MCP coordination bridge is configured, use it for live messages and
task claims. Otherwise, use GitHub pull-request comments or a committed note
under `docs/agent-handoffs/`; never rely on an unrecorded chat message.

## Suggested division of work

- Kimi: implementation reviews, data/API logic, and focused refactors.
- Antigravity: browser QA, visual polish, accessibility, and interaction
  verification.
- Codex: integration, regression checks, release decisions, and deployment.
