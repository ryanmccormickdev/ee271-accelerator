#!/usr/bin/env python3
"""Check that an HTML page's inline scripts still parse:  python3 scripts/tutor/check_page.py docs/part2-sittings.html

JavaScript blocks go through `node --check`. JSON blocks (<script type="application/json">) go through
json.loads. Errors are reported with line numbers in the HTML file. Exit code 0 = all good. Run it after
editing a page; a syntax error in the page's script also breaks the Ask Claude panel.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_RE = re.compile(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>", re.S | re.I)


def main(paths):
    node = shutil.which("node")
    ok = True
    for p in paths:
        html = Path(p).read_text(encoding="utf-8")
        n_js = n_json = 0
        for m in SCRIPT_RE.finditer(html):
            attrs, body = m.group("attrs"), m.group("body")
            if "src=" in attrs or not body.strip():
                continue
            line0 = html.count("\n", 0, m.start("body"))
            if "application/json" in attrs:
                n_json += 1
                try:
                    json.loads(body)
                except ValueError as exc:
                    ok = False
                    print(f"{p}:{line0 + getattr(exc, 'lineno', 1)}: bad JSON: {exc}")
                continue
            n_js += 1
            if not node:
                continue
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
                f.write("\n" * line0 + body)     # pad so node's line numbers match the HTML file
            r = subprocess.run([node, "--check", f.name], capture_output=True, text=True)
            real = str(Path(f.name).resolve())
            Path(f.name).unlink(missing_ok=True)
            if r.returncode:
                ok = False
                print(f"{p}: script error (line numbers are lines of the HTML file):")
                err = r.stderr.replace(real, p).replace(f.name, p)
                print("\n".join(l for l in err.splitlines() if not l.lstrip().startswith(("at ", "Node.js"))).strip())
        note = "" if node else " (node not found: JavaScript not checked)"
        print(f"{p}: {n_js} script(s), {n_json} JSON block(s) {'OK' if ok else 'FAILED'}{note}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["docs/part2-sittings.html"]))
