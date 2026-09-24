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

The repository includes a local MCP coordination bridge at
`tools/agent-bridge/server.py`. Kimi Code loads it from `.kimi-code/mcp.json`
and Antigravity loads it from `.agents/mcp_config.json`. The bridge stores
messages outside the repository at `~/.growlocal-agent-bridge/growlocal-os`,
so coordination does not create noisy commits. Available tools are
`read_board`, `claim_task`, `send_message`, and `submit_handoff`.

## Connecting the clients

1. Open this repository as the active project in Kimi Code and Antigravity.
2. In Kimi Code, run `/mcp` and confirm `growlocal-agent-bridge` is connected.
3. In Antigravity, reload the workspace MCP configuration or open `/mcp` and
   confirm the same server is connected.
4. In Codex, add the same stdio server through the desktop MCP configuration:
   command `python3`, arguments `tools/agent-bridge/server.py`, working
   directory set to the repository root.
5. Start each agent with: “Read `AGENTS.md`, call `read_board`, claim a
   bounded task, and send a message before editing.”

If the Codex desktop client does not expose local MCP configuration in the
current build, Codex can still coordinate through the shared GitHub branches
and the board files; the other two agents remain connected to the live bridge.

If an agent cannot load MCP, use GitHub pull-request comments or a committed
note under `docs/agent-handoffs/`; never rely on an unrecorded chat message.

## Suggested division of work

- Kimi: implementation reviews, data/API logic, and focused refactors.
- Antigravity: browser QA, visual polish, accessibility, and interaction
  verification.
- Codex: integration, regression checks, release decisions, and deployment.
