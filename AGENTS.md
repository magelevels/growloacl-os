# GrowLocal OS agent contract

This repository is shared by multiple coding agents. Read this file and
`docs/AGENT-COLLABORATION.md` before making changes.

## Roles

- **Codex** coordinates the overall task, reviews changes, runs the full check
  suite, and is the only agent that deploys to production unless the user
  explicitly changes that rule.
- **Kimi** and **Antigravity** may investigate, design, implement, and review
  work in their assigned scope.

## Change protocol

1. Read the current branch, status, recent commits, and the collaboration
   document before editing.
2. Claim one bounded task in the collaboration board or in the shared MCP
   coordination channel.
3. Use a dedicated branch or worktree named `agent/<agent>/<short-task>`.
4. Do not edit another agent's active files or force-push.
5. Run the smallest relevant checks, describe the result, and commit the work.
6. Send a handoff containing the commit, files changed, tests run, and open
   risks. Codex reviews and integrates the change.

## Safety

- Never clear or reset browser demo data.
- Never expose secrets, tokens, customer data, or private notes in commits,
  logs, screenshots, or messages.
- Do not deploy, send external messages, or make destructive changes without
  explicit authorization from the user or Codex.
