"""Assemble docs/walkthrough.html from body.html + style.css + model.js + app.js, and build the
"Read the code" tab from the real files in part1/ (split into the blocks listed in regions.py,
with the values recorded by trace_values.py).
Usage: python3 docs/walkthrough-src/build.py   (or: make walkthrough)"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(HERE, "..", ".."))
P1 = os.path.join(REPO, "part1")
sys.path.insert(0, HERE)
import regions  # noqa: E402

KIND_LABEL = {"design": "Part of the design", "plumbing": "Python plumbing", "yours": "You write this",
              "host": "The host (test script)", "test": "Unit test"}

# ------------------------------------------------------------------ tiny syntax highlighter (no multi-line strings in these files)
KEYWORDS = r"\b(?:def|class|return|for|in|if|elif|else|import|from|as|try|except|raise|not|and|or|None|True|False|is|while|pass|lambda|with)\b"
TOKEN = re.compile(r"(?P<c>#.*$)|(?P<s>[fbr]?\"(?:[^\"\\]|\\.)*\"|[fbr]?'(?:[^'\\]|\\.)*')|(?P<d>^\s*@\w+)|(?P<k>" + KEYWORDS + r")|(?P<n>\b\d+\b)")


def highlight(line):
    out, pos = [], 0
    for m in TOKEN.finditer(line):
        out.append(html.escape(line[pos:m.start()]))
        out.append(f'<span class="tk-{m.lastgroup}">{html.escape(m.group())}</span>')
        pos = m.end()
    out.append(html.escape(line[pos:]))
    return "".join(out)


def code_html(first, lines):
    out, yours = [], False
    for i, line in enumerate(lines):
        if "# START IMPLEMENTATION" in line:
            yours = True
        cls = ' class="yours"' if yours else ""
        out.append(f'<span{cls}><span class="ln">{first + i}</span>{highlight(line)}</span>')
        if "# END IMPLEMENTATION" in line:
            yours = False
    return "".join(out)          # each line is its own block-level span, so no newlines between them


# ------------------------------------------------------------------ splitting a file into its blocks
def split(path, blocks):
    lines = open(os.path.join(P1, path)).read().split("\n")
    while lines and lines[-1] == "":
        lines.pop()
    starts, pos = [], 0
    for b in blocks:
        i = next((k for k in range(pos, len(lines)) if lines[k].startswith(b["at"])), None)
        if i is None:
            raise SystemExit(f"{path}: block start not found after line {pos + 1}: {b['at']!r}")
        starts.append(i)
        pos = i + 1
    if starts[0] != 0:
        raise SystemExit(f"{path}: the first block must start at line 1, found {starts[0] + 1}")
    out = []
    for n, (b, s) in enumerate(zip(blocks, starts)):
        e = starts[n + 1] if n + 1 < len(starts) else len(lines)
        while e > s + 1 and lines[e - 1].strip() == "":
            e -= 1
        out.append((b, s + 1, lines[s:e]))
    return out, len(lines)


def vals_html(names, values):
    out = []
    for name in names or []:
        t = values.get(name)
        if not t:
            raise SystemExit(f"values.json has no table {name!r}; rerun trace_values.py")
        rows = "".join(f'<tr><th><code>{html.escape(k)}</code></th><td><pre>{html.escape(v)}</pre></td></tr>' for k, v in t["rows"])
        out.append(f'<table class="vals"><caption>{html.escape(t["caption"])}</caption>{rows}</table>')
    return "".join(out)


def note_html(b, num, values):
    parts = [f'<div class="rhead"><span class="rnum">{num}</span><h4>{b["title"]}</h4><span class="kindtag">{KIND_LABEL[b["kind"]]}</span></div>',
             f'<div class="prose rwhat"><p>{b["what"]}</p></div>']
    if b.get("spec"):
        src, text = b["spec"]
        parts.append(f'<blockquote class="spec"><span class="src">{html.escape(src)} says:</span>{text}</blockquote>')
    for key in b.get("steps", []):
        parts.append(f'<div class="stepref" data-step="{key}"></div>')
    if b.get("vals"):
        parts.append('<div class="valwrap"><div class="valhead">What the variables hold, from actually running this code</div>' + vals_html(b["vals"], values) + "</div>")
    if b.get("todo"):
        parts.append(f'<div class="todo"><div class="todohead">Your code here has to</div>{b["todo"]}</div>')
    if b.get("py"):
        parts.append('<details class="py" open><summary>Reading the Python</summary><ul>' + "".join(f"<li>{p}</li>" for p in b["py"]) + "</ul></details>")
    if b.get("see"):
        parts.append('<div class="seeit">' + "".join(f'<button class="small" data-goto="{g}">{html.escape(lbl)}</button>' for lbl, g in b["see"]) + "</div>")
    return "".join(parts)


def file_id(path):
    return "cmf-" + re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-")


def reader(values):
    bar, sections, seen_ids, total = {}, [], set(), 0
    files = regions.FILES
    for fi, f in enumerate(files):
        blocks, nlines = split(f["path"], f["regions"])
        fid = file_id(f["path"])
        bar.setdefault(f["group"], []).append(
            f'<button class="rfbtn" data-file="{fid}"><code>{html.escape(f["path"].split("/")[-1])}</code><small>{html.escape(f["blurb"])}</small></button>')
        badge = '<span class="badge yours">you finish this</span>' if f["kind"] == "yours" else '<span class="badge given">given, don\'t edit</span>'
        spec = ""
        if f.get("spec"):
            src, text = f["spec"]
            spec = f'<blockquote class="spec"><span class="src">{html.escape(src)} says:</span>{text}</blockquote>'
        rows = []
        for n, (b, first, lines) in enumerate(blocks, 1):
            rid = b.get("id") or f"{fid}-b{n}"
            if rid in seen_ids:
                raise SystemExit(f"duplicate block id {rid}")
            seen_ids.add(rid)
            rows.append(f'<div class="cblock k-{b["color"]} kind-{b["kind"]}" id="{rid}">'
                        f'<div class="rcode"><span class="rnum">{n}</span><pre class="code">{code_html(first, lines)}</pre></div>'
                        f'<div class="rnote">{note_html(b, n, values)}</div></div>')
        total += len(blocks)
        prev_btn = f'<button class="rfjump" data-file="{file_id(files[fi - 1]["path"])}">← {html.escape(files[fi - 1]["path"])}</button>' if fi else "<span></span>"
        next_btn = f'<button class="rfjump primary" data-file="{file_id(files[fi + 1]["path"])}">Next: {html.escape(files[fi + 1]["path"])} →</button>' if fi + 1 < len(files) else "<span></span>"
        sections.append(
            f'<section class="rfile" id="{fid}" data-file="{fid}" hidden>'
            f'<div class="rfhead"><div class="rftitle"><h3>part1/{html.escape(f["path"])}</h3>{badge}'
            f'<span class="muted">{nlines} lines in {len(blocks)} blocks</span></div>'
            f'<p class="rfintro">{f["intro"]}</p>{spec}</div>'
            f'<div class="reader">{"".join(rows)}</div>'
            f'<div class="rfnav">{prev_btn}{next_btn}</div></section>')
    bar_html = '<div class="rfbar" role="group" aria-label="Files">' + "".join(
        f'<div class="rfgroup"><span class="rfglabel">{html.escape(g)}</span><div class="rfgbtns">{"".join(btns)}</div></div>' for g, btns in bar.items()) + "</div>"
    return bar_html + "".join(sections), total, len(files)


def main():
    vpath = os.path.join(HERE, "values.json")
    values = json.load(open(vpath)) if os.path.exists(vpath) else {}
    if not values:
        raise SystemExit("missing values.json: run trace_values.py (make walkthrough does it)")
    body = open(os.path.join(HERE, "body.html")).read()
    rd, nblocks, nfiles = reader(values)
    for marker, fname in (("/*STYLE*/", "style.css"), ("/*MODEL*/", "model.js"), ("/*APP*/", "app.js")):
        if marker not in body:
            raise SystemExit("missing marker " + marker)
        body = body.replace(marker, open(os.path.join(HERE, fname)).read())
    if "<!--READER-->" not in body:
        raise SystemExit("missing marker <!--READER-->")
    body = body.replace("<!--READER-->", rd)
    out = os.path.join(REPO, "docs", "walkthrough.html")
    open(out, "w").write(body)
    print(f"wrote {out} ({len(body):,} bytes; code reader: {nfiles} files, {nblocks} blocks)")


if __name__ == "__main__":
    main()
