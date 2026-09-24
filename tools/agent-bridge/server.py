#!/usr/bin/env python3
"""Small local MCP bridge for coordinating coding agents.

The server intentionally exposes coordination-only tools. It never edits the
repository, runs commands, or reads files outside its own state directory.
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
STATE = Path(os.environ.get("GROWLOCAL_AGENT_BRIDGE_DIR", "~/.growlocal-agent-bridge/growlocal-os")).expanduser()
MESSAGES = STATE / "messages"
CLAIMS = STATE / "claims"
HANDOFFS = STATE / "handoffs"
for directory in (MESSAGES, CLAIMS, HANDOFFS):
    directory.mkdir(parents=True, exist_ok=True)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def safe(value: Any, label: str, limit: int = 120) -> str:
    text = str(value or "").strip()
    if not text or len(text) > limit or not re.fullmatch(r"[A-Za-z0-9._/@ -]+", text):
        raise ValueError(f"{label} must contain only letters, numbers, spaces, '.', '_', '/', '@' or '-'.")
    return text


def required(value: Any, label: str, limit: int = 10_000) -> str:
    text = str(value or "").strip()
    if not text or len(text) > limit:
        raise ValueError(f"{label} is required and must be at most {limit} characters.")
    return text


def write_json(directory: Path, prefix: str, payload: dict[str, Any]) -> Path:
    filename = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}-{prefix}-{uuid.uuid4().hex[:8]}.json"
    path = directory / filename
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def read_json_files(directory: Path, limit: int = 50) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json"), reverse=True)[:limit]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            data["_file"] = path.name
            items.append(data)
        except (OSError, json.JSONDecodeError):
            continue
    return items


TOOLS = [
    {
        "name": "read_board",
        "description": "Read the shared agent claims, messages, and handoffs.",
        "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 100}}},
    },
    {
        "name": "claim_task",
        "description": "Claim a bounded task so other agents can avoid overlapping edits.",
        "inputSchema": {"type": "object", "required": ["agent", "task"], "properties": {"agent": {"type": "string"}, "task": {"type": "string"}, "branch": {"type": "string"}}},
    },
    {
        "name": "send_message",
        "description": "Send a durable message to one agent or the whole team.",
        "inputSchema": {"type": "object", "required": ["agent", "message"], "properties": {"agent": {"type": "string"}, "to": {"type": "string"}, "message": {"type": "string"}}},
    },
    {
        "name": "submit_handoff",
        "description": "Record a completed task, commit, checks, and risks for the next agent.",
        "inputSchema": {"type": "object", "required": ["agent", "task", "result"], "properties": {"agent": {"type": "string"}, "task": {"type": "string"}, "branch": {"type": "string"}, "commit": {"type": "string"}, "files": {"type": "string"}, "checks": {"type": "string"}, "result": {"type": "string"}, "risks": {"type": "string"}, "nextAgent": {"type": "string"}}},
    },
]


def call_tool(name: str, args: dict[str, Any]) -> str:
    if name == "read_board":
        limit = max(1, min(int(args.get("limit", 50)), 100))
        return json.dumps({"project": str(ROOT), "claims": read_json_files(CLAIMS, limit), "messages": read_json_files(MESSAGES, limit), "handoffs": read_json_files(HANDOFFS, limit)}, indent=2, ensure_ascii=False)
    if name == "claim_task":
        agent = safe(args.get("agent"), "agent")
        task = safe(args.get("task"), "task")
        branch = safe(args.get("branch", f"agent/{agent}/{task.lower().replace(' ', '-') }"), "branch")
        slug = re.sub(r"[^A-Za-z0-9._-]+", "-", task.lower()).strip("-")[:80] or "task"
        path = CLAIMS / f"{slug}.json"
        payload = {"agent": agent, "task": task, "branch": branch, "createdAt": now()}
        try:
            with path.open("x", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
                handle.write("\n")
        except FileExistsError:
            current = json.loads(path.read_text(encoding="utf-8"))
            raise ValueError(f"Task is already claimed by {current.get('agent', 'another agent')}: {current.get('task', task)}")
        return json.dumps(payload, indent=2)
    if name == "send_message":
        payload = {"agent": safe(args.get("agent"), "agent"), "to": safe(args.get("to", "team"), "to"), "message": required(args.get("message"), "message"), "createdAt": now()}
        path = write_json(MESSAGES, "message", payload)
        return json.dumps({"saved": str(path), **payload}, indent=2, ensure_ascii=False)
    if name == "submit_handoff":
        payload = {"agent": safe(args.get("agent"), "agent"), "task": required(args.get("task"), "task", 500), "branch": str(args.get("branch", "")).strip(), "commit": str(args.get("commit", "")).strip(), "files": str(args.get("files", "")).strip(), "checks": str(args.get("checks", "")).strip(), "result": required(args.get("result"), "result", 5_000), "risks": str(args.get("risks", "none")).strip(), "nextAgent": str(args.get("nextAgent", "codex")).strip(), "createdAt": now()}
        path = write_json(HANDOFFS, "handoff", payload)
        return json.dumps({"saved": str(path), **payload}, indent=2, ensure_ascii=False)
    raise ValueError(f"Unknown tool: {name}")


def reply(request_id: Any, result: Any = None, error: dict[str, Any] | None = None) -> None:
    response: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id}
    if error is None:
        response["result"] = result
    else:
        response["error"] = error
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            method = request.get("method")
            request_id = request.get("id")
            if method == "initialize":
                reply(request_id, {"protocolVersion": request.get("params", {}).get("protocolVersion", "2024-11-05"), "capabilities": {"tools": {}}, "serverInfo": {"name": "growlocal-agent-bridge", "version": "1.0.0"}})
            elif method in ("notifications/initialized", "notifications/cancelled"):
                continue
            elif method == "ping":
                reply(request_id, {})
            elif method == "tools/list":
                reply(request_id, {"tools": TOOLS})
            elif method == "tools/call":
                params = request.get("params", {})
                try:
                    text = call_tool(params.get("name", ""), params.get("arguments", {}))
                    reply(request_id, {"content": [{"type": "text", "text": text}]})
                except (ValueError, OSError, json.JSONDecodeError) as exc:
                    reply(request_id, {"content": [{"type": "text", "text": str(exc)}], "isError": True})
            else:
                reply(request_id, error={"code": -32601, "message": f"Method not found: {method}"})
        except (json.JSONDecodeError, AttributeError, TypeError) as exc:
            reply(None, error={"code": -32700, "message": f"Invalid JSON-RPC request: {exc}"})


if __name__ == "__main__":
    main()
