"""Build docs/oral-prep.html from every question bank in docs/oral-prep/*.md.

Usage:  python3 docs/oral-prep-src/build.py [--banks DIR] [--out FILE] [--strict]

Python 3 standard library only. Every bank that exists when you run it is included, so re-run it
after anyone adds or edits a bank. Malformed entries are skipped with a warning and the build never
fails because of what a bank contains; --strict exits with status 1 if there were any warnings.
The bank format is described in docs/oral-prep/README.md.
"""
import argparse
import datetime
import hashlib
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

BANK_ORDER = ["part1", "part2-rtl", "synthesis", "part3-ppa", "general"]   # others follow, alphabetically
LEVELS = ("core", "deeper", "stretch")
PART_TAGS = ("part1", "part2", "part3", "part4", "general")
FIELDS = {"tags": "tags", "tag": "tags", "level": "level", "answer": "answer", "model answer": "answer",
          "our design": "ours", "our-design": "ours", "ours": "ours", "see": "see", "see also": "see",
          "follow-up": "followup", "follow up": "followup", "followup": "followup", "follow-ups": "followup"}
FIELD_LABEL = {"followup": "Follow-up"}

HEADING = re.compile(r"^(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$")       # "### text", or a bare "###"
FIELD = re.compile(r"^\s{0,3}[-*+]\s+\*\*\s*(?P<name>[^*]+?)\s*\*\*\s*(?P<value>.*)$")
LOOSE_FIELD = re.compile(r"^\s{0,3}[-*+]\s+(?P<name>tags|level|answer|our design|see)\s*:\s*(?P<value>.*)$", re.I)
FENCE = re.compile(r"^\s*(```|~~~)")
CODE_SPAN = re.compile(r"(`+)(.+?)(?<!`)\1(?!`)", re.S)
MD_LINK = re.compile(r"\[([^\]\n]+)\]\(([^)\s]+)\)")
AUTOLINK = re.compile(r"\bhttps?://[^\s<>()\"']*[^\s<>().,;:!?\"']")
BOLD = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")
ITALIC = re.compile(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])")
SEE_TOKEN = re.compile(
    r"\[(?P<label>[^\]\n]+)\]\((?P<target>[^)\s]+)\)"
    r"|`(?P<code>[^`\n]+)`"
    r"|(?P<url>https?://[^\s,;<>()]*[^\s,;<>().])"
    r"|(?P<path>(?:\.\./)?(?:docs|part1|part2|handouts|scripts|playground|verif|runs|\.github)/[^\s,;()<>`'\"]*[^\s,;()<>`'\".:]"
    r"|\b(?:README\.md|Makefile|WORKFLOW\.md)\b)")


class Ctx:
    """Collects warnings and resolves links for one build."""

    def __init__(self, out_path):
        self.out_dir = os.path.dirname(os.path.abspath(out_path))
        self.warnings = []
        self.where = ""
        self._ids = {}

    def warn(self, msg):
        self.warnings.append(msg)

    def ids_of(self, path):
        if path not in self._ids:
            try:
                text = open(path, encoding="utf-8", errors="replace").read()
            except OSError:
                text = ""
            self._ids[path] = set(re.findall(r'\b(?:id|data-view)="([^"]+)"', text))
        return self._ids[path]

    def resolve(self, target):
        """-> (href or None, exists). Repo paths are relative to the repo root; docs/... works too."""
        target = target.strip()
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
            return (target, True) if re.match(r"^(https?|mailto):", target, re.I) else (None, False)
        if target.startswith("#"):
            return target, True
        path, _, frag = target.partition("#")
        path = re.sub(r"^(\./|\.\./)+", "", path)
        path = re.sub(r":\d+(-\d+)?$", "", path)          # file:line or file:a-b
        full = os.path.normpath(os.path.join(REPO, path))
        if not full.startswith(REPO):
            return None, False
        exists = os.path.exists(full)
        href = os.path.relpath(full, self.out_dir).replace(os.sep, "/")
        if frag:
            href += "#" + frag
            if exists and full.endswith(".html"):
                missing = [s for s in frag.split("/") if s and s not in self.ids_of(full)]
                if missing:
                    self.warn(f"{self.where}: anchor #{frag} not found in {path} (no id or data-view {', '.join(missing)})")
        return href, exists

    def link(self, target, label):
        href, exists = self.resolve(target)
        if href is None:
            return html.escape(label)
        if not exists:
            self.warn(f"{self.where}: link target not found yet: {target} (shown as text until it exists)")
            return f'<span class="ref missing" title="Not built yet: {html.escape(target, quote=True)}">{html.escape(label)}</span>'
        ext = ' target="_blank" rel="noopener"' if href.startswith(("http:", "https:")) else ""
        return f'<a class="ref" href="{html.escape(href, quote=True)}"{ext}>{html.escape(label)}</a>'


# ------------------------------------------------------------------ inline and block markdown (a small, safe subset)
def inline(text, ctx):
    slots = []

    def stash(h):
        slots.append(h)
        return f"\x00{len(slots) - 1}\x00"

    def code(m):
        c = m.group(2)
        if len(c) > 2 and c[0] == " " and c[-1] == " " and c.strip():
            c = c[1:-1]
        return stash("<code>" + html.escape(c) + "</code>")

    text = text.replace("\x00", "")
    text = CODE_SPAN.sub(code, text)
    text = MD_LINK.sub(lambda m: stash(ctx.link(m.group(2), m.group(1))), text)
    text = AUTOLINK.sub(lambda m: stash(ctx.link(m.group(0), m.group(0))), text)
    text = html.escape(text, quote=False)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = ITALIC.sub(r"<em>\1</em>", text)
    return re.sub("\x00(\\d+)\x00", lambda m: slots[int(m.group(1))], text)


def block(lines, ctx):
    """lines[0] is the rest of the field line; later lines are continuation lines."""
    out, para, items, code, in_code = [], [], [], [], False
    rest = [l for l in lines[1:] if l.strip()]
    indent = min((len(l) - len(l.lstrip()) for l in rest), default=0)

    def flush():
        if para:
            out.append("<p>" + inline(" ".join(para), ctx) + "</p>")
            para.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i, ctx)}</li>" for i in items) + "</ul>")
            items.clear()

    for k, raw in enumerate(lines):
        s = raw if k == 0 else raw[indent:] if raw[:indent].strip() == "" else raw.lstrip()
        if FENCE.match(s):
            if in_code:
                out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
                code, in_code = [], False
            else:
                flush()
                in_code = True
            continue
        if in_code:
            code.append(s)
            continue
        t = s.strip()
        if not t:
            flush()
            continue
        m = re.match(r"^(?:[-*+]|\d+[.)])\s+(.*)$", t) if k > 0 else None
        if m:
            if para:
                out.append("<p>" + inline(" ".join(para), ctx) + "</p>")
                para.clear()
            items.append(m.group(1))
        elif items and raw[:1].isspace():
            items[-1] += " " + t
        else:
            if items:
                flush()
            para.append(t)
    if in_code:
        out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
    flush()
    return "".join(out)


def see_html(text, ctx):
    out, pos = [], 0
    for m in SEE_TOKEN.finditer(text):
        out.append(html.escape(text[pos:m.start()]))
        pos = m.end()
        if m.group("label"):
            out.append(ctx.link(m.group("target"), m.group("label")))
        elif m.group("code"):
            c = m.group("code")
            inner = SEE_TOKEN.fullmatch(c)
            out.append(ctx.link(c, c) if inner and (inner.group("path") or inner.group("url")) else "<code>" + html.escape(c) + "</code>")
        else:
            tok = m.group("url") or m.group("path")
            out.append(ctx.link(tok, tok))
    out.append(html.escape(text[pos:]))
    return "".join(out)


def plain(text):
    """Searchable plain text."""
    text = MD_LINK.sub(r"\1", text)
    text = re.sub(r"[`*]", "", text)
    return re.sub(r"\s+", " ", text).strip()


# ------------------------------------------------------------------ parsing one bank
def parse(text, fname, ctx):
    title, intro, entries, section = None, [], [], None
    cur, field, in_fence = None, None, False

    def close():
        nonlocal cur, field
        if cur is not None:
            entries.append(cur)
        cur, field = None, None

    for ln, raw in enumerate(text.split("\n"), 1):
        line = raw.rstrip()
        if FENCE.match(line):
            in_fence = not in_fence
        elif not in_fence:
            h = HEADING.match(line)
            if h and len(h.group(1)) <= 3:
                level, htext = len(h.group(1)), (h.group(2) or "").strip()
                if level == 1:
                    if title is None and cur is None and not entries:
                        title = htext
                    else:
                        ctx.warn(f"{fname}:{ln}: a second '# ' title was ignored")
                    close()
                elif level == 2:
                    close()
                    section = htext or None
                else:
                    close()
                    cur = {"q": [htext], "line": ln, "section": section, "fields": {}, "extra": [], "order": []}
                continue
            if cur is not None:
                fm = FIELD.match(line)
                loose = None if fm else LOOSE_FIELD.match(line)
                m = fm or loose
                if m:
                    name = m.group("name").strip().rstrip(":").strip()
                    value = m.group("value").strip()
                    value = value[1:].strip() if value.startswith(":") else value
                    key = FIELDS.get(name.lower())
                    if loose:
                        ctx.warn(f"{fname}:{ln}: field '{name}' is not bold (write **{name.capitalize()}:**); accepted")
                    if key is None:
                        ctx.warn(f"{fname}:{ln}: unknown field '{name}' kept as an extra note")
                        cur["extra"].append([name, [value]])
                        field = ("extra", len(cur["extra"]) - 1)
                    elif key in cur["fields"]:
                        ctx.warn(f"{fname}:{ln}: second '{name}' field appended to the first")
                        cur["fields"][key].append(value)
                        field = key
                    else:
                        cur["fields"][key] = [value]
                        cur["order"].append(key)
                        field = key
                    continue
        if cur is None:
            if title is not None and line.strip() and not line.lstrip().startswith("<!--"):
                intro.append(line)
            elif line.strip() and title is None and not line.lstrip().startswith("<!--"):
                ctx.warn(f"{fname}:{ln}: text before the '# ' title ignored")
            continue
        if field is None:
            if line.strip():
                cur["q"].append(line.strip())
            continue
        if isinstance(field, tuple):
            cur["extra"][field[1]][1].append(line)
        else:
            cur["fields"][field].append(line)
    close()
    if in_fence:
        ctx.warn(f"{fname}: a ``` code fence is never closed")
    return title, intro, entries


def norm_tags(value):
    tags = []
    for t in re.split(r"[,;]", value.replace("`", "")):
        t = re.sub(r"\s+", "-", t.strip().lower()).strip("-#")
        if t and t not in tags:
            tags.append(t)
    return tags


def bank_part(stem):
    """The part a bank's questions belong to when a question has no part tag."""
    m = re.match(r"^(part\d)", stem.lower())
    return m.group(1) if m else {"synthesis": "part2", "rtl": "part2", "ppa": "part3", "hls": "part4"}.get(stem.lower(), "general")


def build_bank(path, ctx):
    fname = os.path.basename(path)
    stem = os.path.splitext(fname)[0]
    bank_id = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-") or "bank"
    raw = open(path, "rb").read()
    text = raw.decode("utf-8", errors="replace")
    if "\ufffd" in text and b"\xef\xbf\xbd" not in raw:
        ctx.warn(f"{fname}: not valid UTF-8; bad bytes were replaced")
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    title, intro, entries = parse(text, fname, ctx)
    if not title:
        ctx.warn(f"{fname}: no '# Title' line; using the file name")
        title = stem
    short = title.split(":")[0].strip() if ":" in title and len(title.split(":")[0].strip()) <= 26 else (title if len(title) <= 26 else stem)
    ctx.where = fname
    out, seen, skipped = [], set(), 0
    for e in entries:
        where = f"{fname}:{e['line']}"
        ctx.where = where
        try:
            qtext = " ".join(e["q"]).strip()
            f = {k: v for k, v in e["fields"].items()}
            if not qtext:
                ctx.warn(f"{where}: skipped: the '### ' line has no question text")
                skipped += 1
                continue
            label = qtext if len(qtext) < 60 else qtext[:57] + "..."
            answer = "\n".join(f.get("answer", [])).strip()
            if not answer:
                ctx.warn(f"{where}: skipped \"{label}\": no **Answer:**")
                skipped += 1
                continue
            lv = re.findall(r"[a-z]+", " ".join(f.get("level", [])).lower())
            level = lv[0] if lv else ""
            if level not in LEVELS:
                ctx.warn(f"{where}: skipped \"{label}\": **Level:** must be core, deeper or stretch (got '{' '.join(f.get('level', [])).strip()}')")
                skipped += 1
                continue
            key = re.sub(r"\W+", " ", qtext.lower()).strip()
            if key in seen:
                ctx.warn(f"{where}: skipped \"{label}\": the same question appears earlier in {fname}")
                skipped += 1
                continue
            seen.add(key)
            tags = norm_tags(" ".join(f.get("tags", [])))
            if not tags:
                ctx.warn(f"{where}: \"{label}\" has no **Tags:**; using '{bank_part(stem)}'")
            part = next((t for t in tags if t in PART_TAGS), None)
            if part is None:
                part = bank_part(stem)
                if tags:
                    ctx.warn(f"{where}: \"{label}\" has no part tag (part1, part2, part3, general); added '{part}'")
                tags.insert(0, part)
            ours_raw = "\n".join(f.get("ours", [])).strip()
            ours, fill = ours_raw, ""
            mo = re.search(r"\bOurs:\s*", ours_raw)
            if mo:
                ours, fill = ours_raw[:mo.start()].strip(), ours_raw[mo.end():].strip()
            see_raw = " ".join(s.strip() for s in f.get("see", []) if s.strip())
            extra = [[FIELD_LABEL.get(k, k), block(f[k], ctx)] for k in ("followup",) if k in f]
            extra += [[n, block(v, ctx)] for n, v in e["extra"]]
            qhash = hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]
            out.append({
                "id": f"{bank_id}-{qhash}", "bank": bank_id, "file": fname, "line": e["line"], "section": e["section"],
                "q": inline(qtext, ctx), "level": level, "tags": tags, "part": part,
                "a": block(f["answer"], ctx),
                "ours": block([ours], ctx) if ours else "", "oursFill": block([fill], ctx) if fill else "",
                "see": see_html(see_raw, ctx) if see_raw else "",
                "extra": extra,
                "text": plain(" ".join([qtext, answer, ours_raw, see_raw, " ".join(tags)])).lower(),
            })
        except Exception as ex:  # noqa: BLE001  (one bad entry must never stop the build)
            ctx.warn(f"{where}: skipped: could not read this entry ({type(ex).__name__}: {ex})")
            skipped += 1
    for n, q in enumerate(out, 1):
        q["n"] = n
    ctx.where = fname
    meta = {"id": bank_id, "file": fname, "title": title, "short": short, "count": len(out), "skipped": skipped,
            "intro": block([""] + intro, ctx) if intro else "",
            "levels": {lv: sum(q["level"] == lv for q in out) for lv in LEVELS},
            "ours": sum(bool(q["ours"] or q["oursFill"]) for q in out), "filled": sum(bool(q["oursFill"]) for q in out)}
    return meta, out


def bank_files(folder, ctx):
    try:
        names = [n for n in os.listdir(folder) if n.lower().endswith(".md") and n.lower() != "readme.md" and not n.startswith(("_", "."))]
    except OSError as ex:
        ctx.warn(f"cannot read {folder}: {ex}")
        return []
    rank = {s: i for i, s in enumerate(BANK_ORDER)}
    return sorted(names, key=lambda n: (rank.get(os.path.splitext(n)[0].lower(), len(rank)), n.lower()))


def check_tokens(ctx):
    """The page must use the same colour tokens as the Part 1 walkthrough."""
    try:
        theirs = open(os.path.join(REPO, "docs", "walkthrough-src", "style.css"), encoding="utf-8").read()
        ours = open(os.path.join(HERE, "style.css"), encoding="utf-8").read()
    except OSError:
        return
    def tokens(css):
        start = css.find(":root {")
        end = css.find("*, *::before")
        return re.sub(r"\s+", " ", css[start:end]) if 0 <= start < end else None
    if tokens(theirs) != tokens(ours):
        ctx.warn("style.css: the colour tokens differ from docs/walkthrough-src/style.css; copy its first block again")


def main():
    ap = argparse.ArgumentParser(description="Build docs/oral-prep.html from docs/oral-prep/*.md")
    ap.add_argument("--banks", default=os.path.join(REPO, "docs", "oral-prep"), help="folder with the *.md banks")
    ap.add_argument("--out", default=os.path.join(REPO, "docs", "oral-prep.html"), help="page to write")
    ap.add_argument("--strict", action="store_true", help="exit 1 if there were warnings")
    args = ap.parse_args()
    ctx = Ctx(args.out)
    banks, questions = [], []
    for name in bank_files(args.banks, ctx):
        try:
            meta, qs = build_bank(os.path.join(args.banks, name), ctx)
        except Exception as ex:  # noqa: BLE001
            ctx.warn(f"{name}: skipped the whole file ({type(ex).__name__}: {ex})")
            continue
        if not qs:
            ctx.warn(f"{name}: no usable questions, so it is left off the page")
            continue
        banks.append(meta)
        questions.extend(qs)
    ids = set()
    for q in questions:                       # ids must be unique for saved progress
        while q["id"] in ids:
            q["id"] += "x"
        ids.add(q["id"])
    check_tokens(ctx)
    data = {"built": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), "banks": banks, "questions": questions,
            "warnings": ctx.warnings}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    def source(fname):
        try:
            return open(os.path.join(HERE, fname), encoding="utf-8").read()
        except OSError as ex:
            raise SystemExit(f"cannot read the page source {fname}: {ex}")
    page = source("page.html")
    for marker, fname in (("/*STYLE*/", "style.css"), ("/*APP*/", "app.js")):
        if marker not in page:
            raise SystemExit(f"page.html is missing the marker {marker}")
        page = page.replace(marker, source(fname))
    if "/*DATA*/" not in page:
        raise SystemExit("page.html is missing the marker /*DATA*/")
    page = page.replace("/*DATA*/", payload)
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(page)
    os.replace(tmp, args.out)
    print(f"wrote {os.path.relpath(args.out, os.getcwd())} ({len(page.encode('utf-8')):,} bytes): {len(questions)} questions from {len(banks)} banks")
    for b in banks:
        lv = ", ".join(f"{b['levels'][k]} {k}" for k in LEVELS)
        extra = f"; skipped {b['skipped']}" if b["skipped"] else ""
        print(f"  {b['file']:<16} {b['count']:>3} question{'' if b['count'] == 1 else 's'} ({lv}; {b['ours']} with Our design, {b['filled']} filled in{extra})")
    if ctx.warnings:
        print(f"{len(ctx.warnings)} warning(s):")
        for w in ctx.warnings:
            print("  - " + w)
    sys.exit(1 if (args.strict and ctx.warnings) else 0)


if __name__ == "__main__":
    main()
