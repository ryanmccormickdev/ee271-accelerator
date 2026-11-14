"""Synthesize the small examples in examples/ with Yosys onto the open Nangate 45 nm Liberty
and record the real cells, areas and ABC timing estimates in yosys_results.json.

Usage:
  python3 docs/synthesis-src/run_yosys.py --lib /path/to/NangateOpenCellLibrary_typical.lib [--work DIR]

Needs: yosys on PATH (tested with Yosys 0.68), and for the vector_decoder examples the Part 2
conda env (part2/ee271-conda-env/bin/python) so ivd-gv can generate defines.sv.
Raw logs and netlists go to --work (default: a new temp dir); only the summary JSON is kept.

Every number this produces is "Yosys + open Nangate45, not Design Compiler". Yosys/ABC is a
different tool with different algorithms; use these to build intuition, not to predict DC.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
EX = os.path.join(HERE, 'examples')
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

# Two ways to run Yosys, because its built-in generic ABC pass (inside `synth`) restructures
# logic for AREA and can turn a fast adder architecture back into a ripple chain:
#   default : `synth` as is (with its generic ABC pass), then remap onto Nangate cells with ABC's
#             usual script (AIG restructuring + area-oriented mapping). What most people run.
#   keep    : `synth -noabc` (keep the structure the techmap built), then a plain ABC mapping.
#   size    : keep, then ABC's buffer / upsize / dnsize (gate sizing) toward the delay target.
# Every ABC run ends with `stime -p`, which prints the critical path with Liberty delays.
ABC_FULL = """strash
&get -n
&fraig -x
&put
scorr
dc2
dretime
strash
&get -n
&dch -f
&nf -D {D}
&put
topo
stime -p
"""
ABC_PLAIN = """strash
&get -n
&nf -D {D}
&put
topo
stime -p
"""
ABC_SIZE = ABC_PLAIN + """buffer -p
upsize -D {D}
dnsize -D {D}
stime -p
"""
FLOWS = {'default': ('', ABC_FULL), 'keep': ('-noabc', ABC_PLAIN), 'size': ('-noabc', ABC_SIZE)}
KS = '-extra-map +/choices/kogge-stone.v'
SK = '-extra-map +/choices/sklansky.v'
HC = '-extra-map +/choices/han-carlson.v'

# id, file(s), top, extra synth options, flow, abc delay target (ps), group, title
EXPERIMENTS = [
    ('add8_reg', ['add8_reg.sv'], 'add8_reg', '', 'default', 2000, 'arith', 'Registered 8-bit adder'),
    ('mux4_case', ['mux4_case.sv'], 'mux4_case', '', 'default', 2000, 'logic', '4:1 mux from a case statement'),
    ('reg_plain', ['reg32_styles.sv'], 'reg_plain', '', 'default', 2000, 'regs', '32-bit register, no reset'),
    ('reg_async', ['reg32_styles.sv'], 'reg_async', '', 'default', 2000, 'regs', '32-bit register, async reset'),
    ('reg_sync', ['reg32_styles.sv'], 'reg_sync', '', 'default', 2000, 'regs', '32-bit register, sync reset'),
    ('reg_en', ['reg32_styles.sv'], 'reg_en', '', 'default', 2000, 'regs', '32-bit register with load enable'),
    ('vd_staff', ['@defines.sv'], 'vector_decoder', '', 'default', 2000, 'latch', 'Staff vector_decoder as generated (always_comb)'),
    ('vd_star', ['@defines_star.sv'], 'vector_decoder', '', 'default', 2000, 'latch', 'Same code with always @* so Yosys builds the latch'),
    ('vd_default', ['@defines_default.sv'], 'vector_decoder', '', 'default', 2000, 'latch', 'Same code plus a default arm'),
    ('prio_chain', ['prio_chain.sv'], 'prio_chain', '', 'default', 2000, 'logic', 'Priority if / else-if chain'),
    ('onehot_andor', ['onehot_andor.sv'], 'onehot_andor', '', 'default', 2000, 'logic', 'One-hot AND-OR select'),
    ('share_two_muls', ['share_two_muls.sv'], 'share_two_muls', '', 'default', 2000, 'share', 'Two multipliers then a mux'),
    ('share_two_muls_noalumacc', ['share_two_muls.sv'], 'share_two_muls', '-noalumacc', 'default', 2000, 'share', 'Two multipliers then a mux, sharing pass run before alumacc'),
    ('share_one_mul', ['share_one_mul.sv'], 'share_one_mul', '', 'default', 2000, 'share', 'Mux the operand, one multiplier'),
    ('bb_empty', ['bb_anchor.sv'], 'top_empty', '', 'default', 2000, 'bb', 'Memory is an empty module (like macros/array.sv)'),
    ('bb_blackbox', ['bb_anchor.sv'], 'top_bb', '', 'default', 2000, 'bb', 'Memory is a black-box cell'),
    ('bb_keep', ['bb_anchor.sv'], 'top_bb_keep', '', 'default', 2000, 'bb', 'Memory is a black-box cell marked keep'),
    # multipliers
    ('mul8_unsigned', ['mul8_unsigned.sv'], 'mul8_unsigned', '', 'default', 2000, 'mul', '8 x 8 unsigned, array'),
    ('mul8_signed', ['mul8_signed.sv'], 'mul8_signed', '', 'default', 2000, 'mul', '8 x 8 signed, array'),
    ('mul8_unsigned_booth', ['mul8_unsigned.sv'], 'mul8_unsigned', '-booth', 'default', 2000, 'mul', '8 x 8 unsigned, Booth'),
    ('mul8_signed_booth', ['mul8_signed.sv'], 'mul8_signed', '-booth', 'default', 2000, 'mul', '8 x 8 signed, Booth'),
    ('mul8_signed_keep', ['mul8_signed.sv'], 'mul8_signed', '', 'keep', 2000, 'mul', '8 x 8 signed, array, structure kept'),
    ('mul8_signed_booth_keep', ['mul8_signed.sv'], 'mul8_signed', '-booth', 'keep', 2000, 'mul', '8 x 8 signed, Booth, structure kept'),
    ('mul16_signed', ['mul16_signed.sv'], 'mul16_signed', '', 'default', 2000, 'mul', '16 x 16 signed, array'),
    ('mul16_signed_booth', ['mul16_signed.sv'], 'mul16_signed', '-booth', 'default', 2000, 'mul', '16 x 16 signed, Booth'),
    ('mul16_signed_keep', ['mul16_signed.sv'], 'mul16_signed', '', 'keep', 2000, 'mul', '16 x 16 signed, array, structure kept'),
    ('mul16_signed_booth_keep', ['mul16_signed.sv'], 'mul16_signed', '-booth', 'keep', 2000, 'mul', '16 x 16 signed, Booth, structure kept'),
    ('mul32_signed', ['mul32_signed.sv'], 'mul32_signed', '', 'default', 2000, 'mul', '32 x 32 signed, array'),
    ('mul32_signed_booth', ['mul32_signed.sv'], 'mul32_signed', '-booth', 'default', 2000, 'mul', '32 x 32 signed, Booth'),
    ('mul32_signed_keep', ['mul32_signed.sv'], 'mul32_signed', '', 'keep', 2000, 'mul', '32 x 32 signed, array, structure kept'),
    ('mul32_signed_booth_keep', ['mul32_signed.sv'], 'mul32_signed', '-booth', 'keep', 2000, 'mul', '32 x 32 signed, Booth, structure kept'),
    ('mac8_lane', ['mac8_lane.sv'], 'mac8_lane', '', 'default', 2000, 'mac', 'Signed MAC lane, INT8 widths, array'),
    ('mac8_lane_booth', ['mac8_lane.sv'], 'mac8_lane', '-booth', 'default', 2000, 'mac', 'Signed MAC lane, INT8 widths, Booth'),
    ('mac32_lane', ['mac32_lane.sv'], 'mac32_lane', '', 'default', 2000, 'mac', 'Signed MAC lane, INT32 widths, array'),
    ('mac32_lane_booth', ['mac32_lane.sv'], 'mac32_lane', '-booth', 'default', 2000, 'mac', 'Signed MAC lane, INT32 widths, Booth'),
    # one 64-bit adder, five architectures, then gate sizing
    ('add64_area', ['add64.sv'], 'add64', '', 'default', 2000, 'adder', 'Yosys default flow (area-oriented restructuring)'),
    ('add64_bk', ['add64.sv'], 'add64', '', 'keep', 2000, 'adder', 'Brent-Kung prefix (Yosys\'s built-in $lcu)'),
    ('add64_sk', ['add64.sv'], 'add64', SK, 'keep', 2000, 'adder', 'Sklansky prefix'),
    ('add64_hc', ['add64.sv'], 'add64', HC, 'keep', 2000, 'adder', 'Han-Carlson prefix'),
    ('add64_ks', ['add64.sv'], 'add64', KS, 'keep', 2000, 'adder', 'Kogge-Stone prefix'),
    ('add64_bk_sized', ['add64.sv'], 'add64', '', 'size', 200, 'sizing', 'Brent-Kung, then sized and buffered'),
    ('add64_sk_sized', ['add64.sv'], 'add64', SK, 'size', 200, 'sizing', 'Sklansky, then sized and buffered'),
    ('add64_hc_sized', ['add64.sv'], 'add64', HC, 'size', 200, 'sizing', 'Han-Carlson, then sized and buffered'),
    ('add64_ks_sized', ['add64.sv'], 'add64', KS, 'size', 200, 'sizing', 'Kogge-Stone, then sized and buffered'),
]

STIME = re.compile(r'Gates\s*=\s*(\d+).*?Area\s*=\s*([\d.]+).*?Delay\s*=\s*([\d.]+)\s*ps')
PATH = re.compile(r'Path\s+(\d+)\s+--\s+\d+\s*:\s*(\d+)\s+(\d+)\s+(\S+)\s+A\s*=\s*([\d.]+)\s+Df\s*=\s*([-\d.]+)\s+([-\d.]+)\s*ps\s+S\s*=\s*([\d.]+)\s*ps\s+Cin\s*=\s*([\d.]+)\s*ff\s+Cout\s*=\s*([\d.]+)\s*ff')
ENDS = re.compile(r'Start-point = (\S+) \((.*?)\)\.\s+End-point = (\S+) \((.*?)\)\.')


def sha(paths):
    h = hashlib.sha256()
    for p in paths:
        h.update(open(p, 'rb').read())
    return h.hexdigest()[:16]


def gen_defines(work):
    """defines.sv exactly as `make synthesize` would generate it (ivd-gv defaults), plus two variants."""
    py = os.path.join(REPO, 'part2', 'ee271-conda-env', 'bin', 'python')
    gv = os.path.join(REPO, 'part2', 'simulator', 'bin', 'ivd-gv')
    if not os.path.exists(py):
        raise SystemExit(f'need the Part 2 conda env at {py} to run ivd-gv (make setup PART=part2)')
    out = os.path.join(work, 'defines.sv')
    subprocess.run([py, gv, '--out', out], check=True, cwd=work)
    s = open(out).read()
    open(os.path.join(work, 'defines_star.sv'), 'w').write(s.replace('always_comb begin', 'always @* begin'))
    old = "                data_to_pe = data_from_mem;\n            end\n        endcase"
    new = ("                data_to_pe = data_from_mem;\n            end\n"
           "            default: begin\n                addr_to_mem = '0;\n                data_to_pe  = '0;\n            end\n        endcase")
    if s.count(old) != 1:
        raise SystemExit('the generated vector_decoder changed shape; update gen_defines() in run_yosys.py')
    open(os.path.join(work, 'defines_default.sv'), 'w').write(s.replace(old, new))
    lines = s.split('\n')
    a = next(i for i, l in enumerate(lines) if l.startswith('module vector_decoder'))
    b = next(i for i in range(a, len(lines)) if lines[i].startswith('endmodule'))
    return {'first_line': a + 1, 'lines': lines[a:b + 1], 'path_note': 'generated by part2/simulator/bin/ivd-gv --out defines.sv (defaults)'}


def run_one(exp, lib, work):
    eid, files, top, opts, flow, D, group, title = exp
    srcs = [os.path.join(work, f[1:]) if f.startswith('@') else os.path.join(EX, f) for f in files]
    script = os.path.join(work, eid + '.abc')
    noabc, abc_script = FLOWS[flow]
    opts = (noabc + ' ' + opts).strip()
    open(script, 'w').write(abc_script.format(D=D))
    stat_json = os.path.join(work, eid + '.stat.json')
    log = os.path.join(work, eid + '.log')
    netlist = os.path.join(work, eid + '.v')
    cmds = [f'read_verilog -sv {" ".join(srcs)}',
            f'synth -top {top} -flatten {opts}'.strip(),
            f'techmap -map {os.path.join(EX, "nangate45_latch_map.v")}',
            f'dfflibmap -liberty {lib}',
            f'abc -liberty {lib} -script {script}',
            'opt_clean',
            f'tee -q -o {stat_json} stat -json -liberty {lib}',
            f'write_verilog -noattr {netlist}']
    p = subprocess.run(['yosys', '-q', '-l', log, '-p', '; '.join(cmds)], capture_output=True, text=True)
    text = open(log).read() if os.path.exists(log) else p.stdout + p.stderr
    shown = ['read_verilog -sv ' + ' '.join(os.path.basename(s) for s in srcs),
             f'synth -top {top} -flatten {opts}'.strip(),
             'techmap -map nangate45_latch_map.v      # latches -> DLH_X1 / DLL_X1',
             'dfflibmap -liberty NangateOpenCellLibrary_typical.lib',
             f'abc -liberty NangateOpenCellLibrary_typical.lib   # ' + {'default': 'restructure, map', 'keep': 'map only', 'size': 'map, then buffer + upsize + dnsize'}[flow] + f' (-D {D}), stime -p',
             'opt_clean', 'stat -liberty NangateOpenCellLibrary_typical.lib']
    res = {'id': eid, 'title': title, 'group': group, 'files': [os.path.basename(s) for s in srcs], 'top': top, 'opts': opts,
           'flow': flow, 'delay_target_ps': D, 'yosys': shown, 'ok': p.returncode == 0}
    notes = []
    for l in text.split('\n'):
        if re.search(r'Latch inferred|No latch inferred|ERROR:|multi-output cells', l):
            l = re.sub(r'\$auto\$\S+', '', l).replace(work + '/', '').replace(EX + '/', '').replace(REPO + '/', '').strip()
            if l not in notes:
                notes.append(l)
    res['notes'] = notes
    if not res['ok']:
        res['error'] = next((l.strip() for l in text.split('\n') if 'ERROR' in l), 'yosys failed').replace(work + '/', '').replace(EX + '/', '')
        return res
    st = json.load(open(stat_json))['design']
    res['cells'] = st.get('num_cells_by_type', {})
    res['num_cells'] = st.get('num_cells', 0)
    res['area'] = round(st.get('area', 0.0), 3)
    res['seq_area'] = round(st.get('sequential_area', 0.0), 3)
    runs = []
    for m in STIME.finditer(text):
        runs.append({'gates': int(m.group(1)), 'comb_area': float(m.group(2)), 'delay_ps': float(m.group(3)), 'pos': m.start()})
    paths = []
    for i, r in enumerate(runs):
        end = runs[i + 1]['pos'] if i + 1 < len(runs) else len(text)
        seg = text[r['pos']:end]
        pth = [{'cell': m.group(4), 'fanin': int(m.group(2)), 'fanout': int(m.group(3)), 'area': float(m.group(5)), 'arrival_ps': float(m.group(6)),
                'slew_ps': float(m.group(8)), 'cin_fF': float(m.group(9)), 'cout_fF': float(m.group(10))} for m in PATH.finditer(seg)]
        e = ENDS.search(seg)
        paths.append({'gates': r['gates'], 'comb_area': r['comb_area'], 'delay_ps': r['delay_ps'], 'path': pth,
                      'start': e.group(2) if e else None, 'end': e.group(4) if e else None})
    res['abc'] = paths
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lib', required=True)
    ap.add_argument('--work', default=None)
    ap.add_argument('--out', default=os.path.join(HERE, 'yosys_results.json'))
    a = ap.parse_args()
    work = os.path.abspath(a.work or tempfile.mkdtemp(prefix='synth-yosys-'))
    os.makedirs(work, exist_ok=True)
    lib = os.path.abspath(a.lib)
    ver = subprocess.run(['yosys', '-V'], capture_output=True, text=True).stdout.strip()
    vd = gen_defines(work)
    out = {'yosys_version': ver, 'liberty': os.path.basename(lib), 'liberty_sha256_16': sha([lib]),
           'label': 'Yosys + open Nangate45, not Design Compiler', 'vector_decoder': vd,
           'sources_sha': sha(sorted(os.path.join(EX, f) for f in os.listdir(EX))), 'experiments': []}
    for exp in EXPERIMENTS:
        r = run_one(exp, lib, work)
        out['experiments'].append(r)
        tag = f"{r['num_cells']} cells, {r['area']} um2" if r['ok'] else 'ERROR (expected for some): ' + r['error'][:90]
        dl = ' / '.join(f"{p['delay_ps']} ps" for p in r.get('abc', []))
        print(f"{r['id']:24s} {tag} {dl}")
    json.dump(out, open(a.out, 'w'), indent=1, allow_nan=False)
    print(f'wrote {a.out}  (raw logs in {work})')


if __name__ == '__main__':
    main()
