"""Assemble docs/part3-ppa.html from body.html + style.css + lib.js + app.js + the recorded data (stdlib only).
Usage: python3 docs/part3-ppa-src/build.py"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


def main():
    body = read("body.html")
    data = {}
    for key, fname in (("cycles", "data/cycles.json"), ("blocks", "data/blocks.json")):
        path = os.path.join(HERE, fname)
        if not os.path.exists(path):
            sys.exit(f"missing {fname}: run collect_cycles.py / record_blocks.py first (see README.md)")
        with open(path, encoding="utf-8") as f:
            data[key] = json.load(f)
    blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    parts = (("/*STYLE*/", read("style.css")), ("/*DATA*/", "window.PPA_DATA = " + blob + ";"),
             ("/*LIB*/", read("lib.js")), ("/*APP*/", read("app.js")))
    for marker, text in parts:
        if body.count(marker) != 1:
            sys.exit(f"marker {marker} must appear exactly once in body.html")
        body = body.replace(marker, text)
    # nothing template-like may survive into the page
    left = re.findall(r"/\*(?:STYLE|DATA|LIB|APP)\*/|\{\{|\bTODO\b|\bFIXME\b|\bXXX\b|lorem ipsum", body, flags=re.I)
    if left:
        sys.exit(f"leftover markers in the output: {sorted(set(left))}")
    out = os.path.join(REPO, "docs", "part3-ppa.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"wrote {out} ({len(body):,} bytes)")


if __name__ == "__main__":
    main()
