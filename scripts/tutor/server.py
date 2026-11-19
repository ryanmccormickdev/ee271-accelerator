#!/usr/bin/env python3
"""Local app for docs/part2-sittings.html with an "Ask Claude" chat panel.  Run: make tutor

Serves docs/ on http://127.0.0.1:8271 and answers POST /api/chat by running Claude Code headless
(`claude -p`) with your existing Claude Code login, so there is no API key to set up. Claude runs with
full permissions in this repo (it can run the checks and edit the explainer pages), no MCP servers, and
the tutor rules in system-prompt.md (explain, don't write the graded RTL). When a turn changes a page in
docs/, the page offers a reload. Each chat is a resumable Claude Code session; a readable copy of every
exchange goes to scratch/tutor-chats/ (git-ignored) for the AI-use log.

Only standard-library Python. Listens on 127.0.0.1 only and rejects requests whose Host or Origin
isn't this server, so other websites can't drive it.

Environment knobs: TUTOR_PORT (8271), TUTOR_MODEL (passed to --model; default: your Claude Code
default), TUTOR_CLAUDE (path to the claude binary, if it isn't on PATH).
"""

import argparse
import collections
import errno
import json
import mimetypes
import os
import re
import select
import shutil
import socket
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DOCS = (REPO / "docs").resolve()
CHATS = REPO / "scratch" / "tutor-chats"
PROMPT_FILE = HERE / "system-prompt.md"
HOME_PAGE = "/part2-sittings.html"

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MAX_BODY = 300_000          # bytes of JSON per chat request
MAX_MESSAGE = 60_000        # characters (a long pasted log fits)
MAX_CONTEXT = 20_000        # characters of sitting text


def page_mtimes():
    """Modification times of the pages this server serves, to tell the browser what the agent changed."""
    return {p.name: p.stat().st_mtime_ns for p in DOCS.glob("*.html")}


def find_claude():
    if os.environ.get("TUTOR_CLAUDE"):
        return os.environ["TUTOR_CLAUDE"]
    found = shutil.which("claude")
    if found:
        return found
    for cand in (Path.home() / ".local/bin/claude", Path.home() / ".claude/local/claude"):
        if cand.exists():
            return str(cand)
    return None


def child_env():
    # When this server is started from inside a Claude Code session, don't let the child think it is
    # nested in that session.
    return {k: v for k, v in os.environ.items()
            if not (k == "CLAUDECODE" or k.startswith("CLAUDE_CODE_") or k in ("CLAUDE_PID", "CLAUDE_EFFORT"))}


def claude_command(claude, session_id):
    # Full permissions (Ryan's call, Nov 18): every built-in tool, no prompts. The no-RTL rule lives in the
    # system prompt. MCP servers stay off so each message starts fast.
    cmd = [claude, "-p",
           "--output-format", "stream-json", "--verbose", "--include-partial-messages",
           "--permission-mode", "bypassPermissions",
           "--strict-mcp-config",
           "--append-system-prompt", PROMPT_FILE.read_text(encoding="utf-8")]
    if os.environ.get("TUTOR_MODEL"):
        cmd += ["--model", os.environ["TUTOR_MODEL"]]
    if session_id:
        cmd += ["--resume", session_id]
    return cmd


def build_prompt(message, context):
    if not context or not str(context.get("text", "")).strip():
        return message
    title = re.sub(r"[\"<>\n]", " ", str(context.get("title", "")))[:200]
    sid = re.sub(r"[^\w-]", "", str(context.get("id", "")))[:20]
    text = str(context["text"])[:MAX_CONTEXT]
    return f'<sitting id="{sid}" title="{title}">\n{text}\n</sitting>\n\n{message}'


def describe_tool(name, inp):
    inp = inp if isinstance(inp, dict) else {}

    def rel(p):
        try:
            return str(Path(p).resolve().relative_to(REPO))
        except (ValueError, OSError):
            return str(p)

    if "file_path" in inp:
        return rel(inp["file_path"])
    if "command" in inp:
        cmd = " ".join(str(inp["command"]).split())
        return cmd[:140] + ("…" if len(cmd) > 140 else "")
    if "pattern" in inp:
        where = rel(inp["path"]) if inp.get("path") else ""
        return f'"{inp["pattern"]}"' + (f" in {where}" if where else "")
    return ""


def save_transcript(session_id, context, message, reply, tools, error):
    if not session_id:
        return
    try:
        CHATS.mkdir(parents=True, exist_ok=True)
        path = CHATS / f"{datetime.now():%Y-%m-%d}-{session_id[:8]}.md"
        new = not path.exists()
        with path.open("a", encoding="utf-8") as f:
            if new:
                f.write(f"# Tutor chat {session_id}\n\nFrom `make tutor` (docs/part2-sittings.html). "
                        f"Resume in a terminal with `claude --resume {session_id}`.\n\n")
            about = f" (about: {context.get('title')})" if context and context.get("title") else ""
            f.write(f"## Ryan, {datetime.now():%a %b %d %H:%M}{about}\n\n{message}\n\n## Claude\n\n")
            if tools:
                f.write("".join(f"- *{t}*\n" for t in tools) + "\n")
            f.write((reply or "") + ("\n\n**Error:** " + error if error else "") + "\n\n")
    except OSError as exc:
        sys.stderr.write(f"[tutor] couldn't save transcript: {exc}\n")


class Handler(BaseHTTPRequestHandler):
    server_version = "ee271-tutor"

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/chat"):
            sys.stderr.write("[tutor] %s\n" % (fmt % args))

    # ---- guards: only this page, on this machine, may talk to the server
    def _allowed_hosts(self):
        port = self.server.server_address[1]
        return {f"127.0.0.1:{port}", f"localhost:{port}"}

    def _host_ok(self):
        return (self.headers.get("Host") or "").lower() in self._allowed_hosts()

    def _origin_ok(self):
        origin = (self.headers.get("Origin") or "").lower()
        return origin in {"http://" + h for h in self._allowed_hosts()}

    def _send(self, code, body, ctype="text/plain; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    # ---- static files from docs/
    def do_GET(self):
        if not self._host_ok():
            return self._send(403, "Forbidden: open http://127.0.0.1:%d/ instead.\n" % self.server.server_address[1])
        path = unquote(urlsplit(self.path).path)
        if path == "/api/health":
            return self._send(200, json.dumps({"ok": True, "claude": bool(find_claude())}), "application/json")
        if path in ("", "/"):
            return self._send(302, "", extra={"Location": HOME_PAGE})
        target = (DOCS / path.lstrip("/")).resolve()
        if not target.is_relative_to(DOCS) or not target.is_file():
            return self._send(404, "Not found\n")
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        return self._send(200, target.read_bytes(), ctype)

    do_HEAD = do_GET

    # ---- chat
    def do_POST(self):
        if not (self._host_ok() and self._origin_ok()):
            return self._send(403, "Forbidden\n")
        if urlsplit(self.path).path != "/api/chat":
            return self._send(404, "Not found\n")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._send(413, "Message too large\n")
        try:
            body = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            return self._send(400, "Bad JSON\n")
        message = str(body.get("message") or "").strip()[:MAX_MESSAGE]
        session_id = body.get("session_id") or None
        context = body.get("context") if isinstance(body.get("context"), dict) else None
        if not message:
            return self._send(400, "Empty message\n")
        if session_id is not None and not UUID_RE.match(str(session_id)):
            return self._send(400, "Bad session id\n")

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.close_connection = True   # the stream ends when the connection closes
        self._chat(message, session_id, context)

    def _emit(self, obj):
        self.wfile.write((json.dumps(obj) + "\n").encode("utf-8"))
        self.wfile.flush()

    def _chat(self, message, session_id, context):
        claude = find_claude()
        if not claude:
            return self._emit({"type": "error", "message": "Couldn't find the `claude` command. Install Claude Code, "
                               "or set TUTOR_CLAUDE=/path/to/claude, then restart `make tutor`."})
        try:
            proc = subprocess.Popen(claude_command(claude, session_id), cwd=REPO, env=child_env(),
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    text=True, encoding="utf-8", errors="replace", bufsize=1)
        except OSError as exc:
            return self._emit({"type": "error", "message": f"Couldn't start claude: {exc}"})

        stderr_tail = collections.deque(maxlen=40)
        threading.Thread(target=lambda: stderr_tail.extend(proc.stderr), daemon=True).start()
        stopped = threading.Event()

        def watch_client():
            # Stop pressed or tab closed: the socket reads as EOF. Kill claude right away instead of
            # waiting for its next output (it can think silently for a while).
            while proc.poll() is None:
                try:
                    ready, _, _ = select.select([self.connection], [], [], 0.5)
                    if ready and self.connection.recv(1, socket.MSG_PEEK) == b"":
                        stopped.set()
                        proc.kill()
                        return
                except (OSError, ValueError):
                    stopped.set()
                    proc.kill()
                    return

        threading.Thread(target=watch_client, daemon=True).start()
        pages_before = page_mtimes()
        reply, tools = [], []
        saw_text = got_result = False
        error = None
        sid = session_id
        try:
            proc.stdin.write(build_prompt(message, context))
            proc.stdin.close()
            for line in proc.stdout:
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                kind = ev.get("type")
                if kind == "system" and ev.get("subtype") == "init":
                    sid = ev.get("session_id") or sid
                    self._emit({"type": "session", "session_id": sid})
                elif kind == "stream_event":
                    e = ev.get("event") or {}
                    if e.get("type") == "content_block_start":
                        block = (e.get("content_block") or {}).get("type")
                        if block == "text" and saw_text:
                            reply.append("\n\n")
                            self._emit({"type": "text", "text": "\n\n"})
                        elif block == "thinking":
                            self._emit({"type": "status", "text": "thinking"})
                    elif e.get("type") == "content_block_delta":
                        d = e.get("delta") or {}
                        if d.get("type") == "text_delta" and d.get("text"):
                            saw_text = True
                            reply.append(d["text"])
                            self._emit({"type": "text", "text": d["text"]})
                elif kind == "assistant":
                    for b in (ev.get("message") or {}).get("content") or []:
                        if b.get("type") == "tool_use":
                            label = f'{b.get("name")} {describe_tool(b.get("name"), b.get("input"))}'.strip()
                            tools.append(label)
                            self._emit({"type": "tool", "text": label})
                elif kind == "rate_limit_event":
                    info = ev.get("rate_limit_info") or {}
                    if info.get("status") not in (None, "allowed", "allowed_warning"):
                        self._emit({"type": "status", "text": f"rate limit: {info.get('status')}"})
                elif kind == "result":
                    got_result = True
                    sid = ev.get("session_id") or sid
                    now = page_mtimes()
                    changed = sorted(n for n, m in now.items() if pages_before.get(n) != m)
                    if changed:
                        self._emit({"type": "edited", "pages": changed})
                    if ev.get("is_error") or ev.get("subtype") != "success":
                        error = str(ev.get("result") or ev.get("subtype") or "Claude reported an error.")
                    self._emit({"type": "done", "session_id": sid, "error": error})
            proc.wait(timeout=30)
            if stopped.is_set() and not got_result:
                error = "stopped (the page closed the request)"
            elif not got_result:
                tail = "".join(stderr_tail).strip()[-1500:]
                error = f"claude exited with code {proc.returncode}." + (f"\n\n{tail}" if tail else "")
                self._emit({"type": "error", "message": error})
        except (BrokenPipeError, ConnectionResetError):
            error = "stopped (the page closed the request)"
        except subprocess.TimeoutExpired:
            error = "claude didn't exit after its answer"
        finally:
            if proc.poll() is None:
                proc.kill()
            save_transcript(sid, context, message, "".join(reply), tools, error)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=int(os.environ.get("TUTOR_PORT", "8271")))
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    args = ap.parse_args()
    url = f"http://127.0.0.1:{args.port}{HOME_PAGE}"
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE:
            print(f"Port {args.port} is busy; the tutor is probably already running. Opening {url}")
            if not args.no_open:
                webbrowser.open(url)
            return
        raise
    httpd.daemon_threads = True
    claude = find_claude()
    print(f"Part 2 sittings + Ask Claude: {url}")
    print(f"  claude: {claude or 'NOT FOUND (install Claude Code or set TUTOR_CLAUDE)'}")
    print(f"  chat copies: {CHATS.relative_to(REPO)}/   ·   Ctrl-C to stop")
    if not args.no_open:
        threading.Timer(0.4, webbrowser.open, args=(url,)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
