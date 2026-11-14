"""Assemble docs/synthesis.html from body.html + style.css + parser.js + annotations.js + app.js, the recorded
data (lib_facts.json, yosys_results.json, samples/*.txt, examples/*.sv), and the REAL course files
part2/unoptimized_verilog/synth/{Makefile,dc_synth.tcl} split into the blocks listed in script_notes.py.
Stdlib only. Usage: python3 docs/synthesis-src/build.py   (or: make synthesis, if the repo Makefile has it)

It fails loudly if
  * a script block's first line (script_notes.py "at") is gone, so a note can't drift onto the wrong line,
  * an examples/*.sv file changed since run_yosys.py recorded yosys_results.json,
  * a {{...}} placeholder in body.html names data that doesn't exist, or any placeholder survives.
It warns if the colour tokens at the top of style.css no longer match docs/walkthrough-src/style.css.
"""
import hashlib
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(HERE, '..', '..'))
P2 = os.path.join(REPO, 'part2')
sys.path.insert(0, HERE)
import script_notes  # noqa: E402

EV = {'file': ('file', 'from the files'), 'local': ('local', 'checked locally'), 'lib': ('lib', '.lib'), 'docs': ('docs', 'DC docs, not run')}


def die(msg):
    raise SystemExit('build.py: ' + msg)


# ------------------------------------------------------------------ data
def load():
    lib = json.load(open(os.path.join(HERE, 'lib_facts.json')))
    yo = json.load(open(os.path.join(HERE, 'yosys_results.json')))
    ex = os.path.join(HERE, 'examples')
    h = hashlib.sha256()
    for p in sorted(os.path.join(ex, f) for f in os.listdir(ex)):
        h.update(open(p, 'rb').read())
    if h.hexdigest()[:16] != yo.get('sources_sha'):
        die('examples/ changed since yosys_results.json was recorded; rerun run_yosys.py (see README.md)')
    sources = {f: open(os.path.join(ex, f)).read() for f in sorted(os.listdir(ex))}
    sd = os.path.join(HERE, 'samples')
    samples = {f: open(os.path.join(sd, f)).read() for f in sorted(os.listdir(sd)) if f.endswith('.txt')}
    return lib, yo, sources, samples


# ------------------------------------------------------------------ tiny Make/Tcl highlighter
CMDS = r'\b(?:set|file|remove_design|define_design_lib|set_host_options|analyze|elaborate|link|create_clock|set_wire_load_model|set_wire_load_mode|set_max_fanout|remove_from_collection|all_inputs|get_port|get_ports|set_input_delay|set_driving_cell|set_max_area|remove_driving_cell|set_drive|set_dont_touch_network|set_optimize_registers|compile_ultra|redirect|report_design|check_design|report_area|report_power|report_timing|report_qor|check_error|write|echo|sh|exit|list|expr)\b'
TOK = re.compile(r'(?P<c>#.*$)|(?P<s>"(?:[^"\\]|\\.)*")|(?P<v>\$\(\w+\)|\$\{\w+\}|\$\w+)|(?P<k>' + CMDS + r')|(?P<n>\b\d+(?:\.\d+)?\b)')


def highlight(line):
    out, pos = [], 0
    for m in TOK.finditer(line):
        out.append(html.escape(line[pos:m.start()]))
        cls = {'c': 'tk-c', 's': 'tk-s', 'v': 'tk-d', 'k': 'tk-k', 'n': 'tk-n'}[m.lastgroup]
        out.append(f'<span class="{cls}">{html.escape(m.group())}</span>')
        pos = m.end()
    out.append(html.escape(line[pos:]))
    return ''.join(out)


def split(lines, blocks, path):
    starts, pos = [], 0
    for b in blocks:
        anchor = b['at'].split('\n')
        k = next((i for i in range(pos, len(lines) - len(anchor) + 1)
                  if all(lines[i + j].lstrip().startswith(a) for j, a in enumerate(anchor))), None)
        if k is None:
            die(f'{path}: block start not found after line {pos + 1}: {b["at"]!r} (did the staff change the file?)')
        starts.append(k)
        pos = k + 1
    starts[0] = 0                                  # leading blank lines belong to the first block
    out = []
    for n, (b, s) in enumerate(zip(blocks, starts)):
        e = starts[n + 1] if n + 1 < len(starts) else len(lines)
        while e > s + 1 and lines[e - 1].strip() == '':
            e -= 1
        out.append((b, s, e))
    return out


def reader():
    parts, chips = [], []
    for k, v in script_notes.AFFECTS.items():
        chips.append(f'<button class="small" data-aff="{k}" aria-pressed="false">{html.escape(v)}</button>')
    for f in script_notes.FILES:
        path = os.path.join(P2, f['path'])
        lines = open(path).read().split('\n')
        while lines and lines[-1].strip() == '':
            lines.pop()
        blocks = split(lines, f['blocks'], f['path'])
        rows = []
        for n, (b, s, e) in enumerate(blocks, 1):
            bid = f'{f["id"]}-{n}'
            code = ''.join(f'<span class="row"><span class="ln">{s + i + 1}</span><span class="lt">{highlight(l) or " "}</span></span>'
                           for i, l in enumerate(lines[s:e]))
            ev = ''.join(f'<span class="ev {EV[t][0]}">{EV[t][1]}</span>' for t in b['ev'])
            aff = ''.join(f'<span class="affchip on">{html.escape(script_notes.AFFECTS[a])}</span>' for a in b['affects'])
            where = f'{os.path.basename(f["path"])} line{"s" if e - s > 1 else ""} {s + 1}' + (f'–{e}' if e - s > 1 else '')
            what = b['what'] if b['what'].lstrip().startswith('<') else f'<p>{b["what"]}</p>'
            note = (f'<h4>{b["title"]}</h4><div class="where">{where}</div><div>{ev}</div><div class="prose" style="margin-top:6px">{what}</div>'
                    + (f'<div class="aff"><span class="cap" style="margin:0 4px 0 0">changes:</span>{aff}</div>' if aff else ''))
            rows.append(f'<button class="sblock" type="button" data-b="{bid}" data-aff="{" ".join(b["affects"])}" id="b-{bid}" aria-label="{html.escape(b["title"])}, {where}">{code}</button>'
                        f'<div class="inline-note" id="note-{bid}">{note}</div>')
        parts.append(f'<div class="sfile" id="sf-{f["id"]}"><h3>part2/{html.escape(f["path"])} <small>{f["intro"]}</small></h3>'
                     f'<div class="scode">{"".join(rows)}</div></div>')
    return ''.join(parts), ''.join(chips), sum(len(f['blocks']) for f in script_notes.FILES)


# ------------------------------------------------------------------ placeholders
def fmt(v, digits):
    if isinstance(v, str):
        try:
            v = float(v)          # Liberty attributes such as nom_temperature come in as text
        except ValueError:
            return v
    d = int(digits) if digits not in (None, '') else (0 if float(v).is_integer() else 2)
    s = f'{v:,.{d}f}'
    return s.replace('-', '−')


def fill(body, lib, yo):
    E = {e['id']: e for e in yo['experiments']}

    def L(path):
        v = lib
        for k in path.split('|'):
            if isinstance(v, dict) and k in v:
                v = v[k]
            else:
                die(f'placeholder: no lib fact {path!r}')
        return v

    def Yf(eid, field):
        e = E.get(eid) or die(f'placeholder: no experiment {eid!r}')
        if field == 'area':
            return e['area']
        if field == 'cells':
            return e['num_cells']
        if field == 'seq':
            return e['seq_area']
        if field == 'delay':
            return e['abc'][0]['delay_ps']
        if field == 'delayN':
            return e['abc'][-1]['delay_ps']
        if field == 'gates':
            return len(e['abc'][-1]['path']) - 1
        if field.startswith('ncell.'):
            return e['cells'].get(field[6:], 0)
        die(f'placeholder: unknown field {field!r}')

    seq = lib['seq']['DFF_X1']
    vdl = yo['vector_decoder']
    special = {
        'SUMSEQ': fmt(round(seq['CK->Q']['cell_rise'] + seq['setup']['fall_constraint']), 0),
        'WLM4C': fmt(next(r['C_fF'] for r in lib['wlm']['rows'] if r['fanout'] == 4), 2),
        'MEM0MM2': fmt(65536 * 512 * lib['cells']['DFF_X1']['area'] / 1e6, 0),
        'PEFLOPS': fmt(96 * lib['cells']['DFFR_X1']['area'], 0),
        'VDLINE': str(vdl['first_line'] + next(i for i, l in enumerate(vdl['lines']) if 'always_comb' in l)),
    }

    def rep(m):
        parts = m.group(1).split(':')
        kind = parts[0]
        if kind in special and len(parts) == 1:
            return special[kind]
        if kind == 'V':
            return {'yosys': yo['yosys_version'].split(' (')[0].replace('Yosys ', ''), 'liberty': yo['liberty'], 'libsha': yo['liberty_sha256_16']}[parts[1]]
        if kind == 'L':
            return fmt(L(parts[1]), parts[2] if len(parts) > 2 else None)
        if kind == 'Y':
            return fmt(Yf(parts[1], parts[2]), parts[3] if len(parts) > 3 else None)
        if kind == 'R':          # ratio of one experiment field to another's
            return fmt(Yf(parts[1], parts[3]) / Yf(parts[2], parts[3]), parts[4] if len(parts) > 4 else 1)
        if kind == 'RL':         # ratio of two lib facts
            return fmt(L(parts[1]) / L(parts[2]), parts[3] if len(parts) > 3 else 1)
        die(f'placeholder: unknown {m.group(0)!r}')
    return re.sub(r'\{\{([^{}]+)\}\}', rep, body)


def main():
    lib, yo, sources, samples = load()
    body = open(os.path.join(HERE, 'body.html')).read()
    # colour tokens must stay those of the walkthrough
    wt = os.path.join(REPO, 'docs', 'walkthrough-src', 'style.css')
    mine = open(os.path.join(HERE, 'style.css')).read().split('\n')[:28]
    if os.path.exists(wt) and open(wt).read().split('\n')[:28] != mine:
        print('build.py: WARNING: the colour tokens in docs/walkthrough-src/style.css changed; copy lines 1-28 into style.css')
    rd, chips, nblocks = reader()
    # static anchors so links like synthesis.html#see-it/ex-vd_star can be checked without running the page
    anchors = '<div hidden>' + ''.join(f'<span id="ex-{e["id"]}"></span>' for e in yo['experiments']) + '</div>'
    for marker, text in (('<!--SCRIPT-READER-->', rd), ('<!--AFFECT-CHIPS-->', chips), ('<!--EX-ANCHORS-->', anchors)):
        if marker not in body:
            die('missing marker ' + marker)
        body = body.replace(marker, text)
    body = fill(body, lib, yo)
    data = {'lib': lib, 'yosys': yo, 'sources': sources, 'samples': samples}
    blob = json.dumps(data, separators=(',', ':'), allow_nan=False).replace('<', '\\u003c')    # valid JSON, and no '</script>' or '<!--' inside the tag
    if '<!--DATA-->' not in body:
        die('missing marker <!--DATA-->')
    body = body.replace('<!--DATA-->', blob)
    for marker, fname in (('/*STYLE*/', 'style.css'), ('/*PARSER*/', 'parser.js'), ('/*ANNOTATIONS*/', 'annotations.js'), ('/*APP*/', 'app.js')):
        if marker not in body:
            die('missing marker ' + marker)
        body = body.replace(marker, open(os.path.join(HERE, fname)).read())
    left = re.findall(r'\{\{[^{}]*\}\}', body.split('<script type="application/json"')[0])
    if left:
        die(f'unfilled placeholders: {left[:5]}')
    out = os.path.join(REPO, 'docs', 'synthesis.html')
    open(out, 'w').write(body)
    print(f'wrote {out} ({len(body):,} bytes; script reader: {nblocks} blocks; {len(yo["experiments"])} Yosys experiments; {len(samples)} illustrative samples)')


if __name__ == '__main__':
    main()
