"""Write the ILLUSTRATIVE Design Compiler reports in samples/ that docs/synthesis.html uses to
teach the report formats and to test its "paste your report" parser.

None of this is real DC output. Nobody has run DC on this design yet. The layout follows DC's
report formats as documented by Synopsys and as shown in public course tutorials; the numbers
are made up, but they are internally consistent (path increments add up, the power table adds
up, areas add up) and sized like a 16-PE design so they look like what you will see.
Every file starts with a banner that says so. Usage: python3 docs/synthesis-src/make_samples.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'samples')
BANNER = ('# ILLUSTRATIVE SAMPLE, NOT REAL DC OUTPUT. Written by docs/synthesis-src/make_samples.py to show\n'
          '# the layout of this report. The numbers are invented (but add up). Your own report is the authority.\n')
VERSION = 'S-2021.06-SP5-4'
DATE = 'Thu Nov 19 14:02:11 2026'
LIBFILE = '/home/you/ee271/part2/unoptimized_verilog/synth/lib/NangateOpenCellLibrary.db'


def header(report, opts=()):
    lines = ['****************************************', f'Report : {report}']
    lines += [f'        {o}' for o in opts]
    lines += ['Design : top', f'Version: {VERSION}', f'Date   : {DATE}', '****************************************', '']
    return '\n'.join(lines) + '\n'


def point(name, incr, path, edge='', width=48):
    """one row of the Point / Incr / Path table; DC wraps names that do not fit (no -nosplit)."""
    nums = f'{incr:10.4f} {path:10.4f} {edge}'.rstrip()
    if len(name) > width:
        return f'  {name}\n  {"":{width}}{nums}\n'
    return f'  {name:{width}}{nums}\n'


def timing(path, period, setup, start, end, start_kind, end_kind):
    t = 0.0
    rows = [point('clock clk (rise edge)', 0.0, 0.0), point('clock network delay (ideal)', 0.0, 0.0)]
    for name, incr, edge in path:
        t += incr
        rows.append(point(name, incr, t, edge))
    arrival = t
    required = period - setup
    slack = required - arrival
    verdict = 'MET' if slack >= 0 else 'VIOLATED'
    rule = '  ' + '-' * 70 + '\n'
    s = header('timing', ['-path full', '-delay max', '-max_paths 1', '-sort_by group'])
    s += '\nOperating Conditions: typical   Library: NangateOpenCellLibrary\nWire Load Model Mode: top\n\n'
    s += f'  Startpoint: {start}\n              ({start_kind})\n'
    s += f'  Endpoint: {end}\n            ({end_kind})\n'
    s += '  Path Group: clk\n  Path Type: max\n\n'
    s += '  Des/Clust/Port     Wire Load Model       Library\n  ------------------------------------------------\n'
    s += '  top                1K_hvratio_1_4        NangateOpenCellLibrary\n\n'
    s += f'  {"Point":{48}}{"Incr":>10} {"Path":>10}\n' + rule
    s += ''.join(rows)
    s += f'  {"data arrival time":{48}}{"":10} {arrival:10.4f}\n\n'
    s += point('clock clk (rise edge)', period, period)
    s += point('clock network delay (ideal)', 0.0, period)
    s += point(end + '/CK (DFFR_X1)', 0.0, period, 'r')
    s += point('library setup time', -setup, required)
    s += f'  {"data required time":{48}}{"":10} {required:10.4f}\n' + rule
    s += f'  {"data required time":{48}}{"":10} {required:10.4f}\n'
    s += f'  {"data arrival time":{48}}{"":10} {-arrival:10.4f}\n' + rule
    s += f'  {"slack (" + verdict + ")":{48}}{"":10} {slack:10.4f}\n\n\n1\n'
    return s, arrival, required, slack


def main():
    os.makedirs(OUT, exist_ok=True)
    pe = 'g_pe[5].u_pe/'
    dp = pe + 'DP_OP_123J5_122_4815/'
    met_path = [                       # increments sized like the .lib numbers (FA_X1 ~0.1 ns, DFFR_X1 clk->Q ~0.1 ns)
        (pe + 'acc_reg[3]/CK (DFFR_X1)', 0.0, 'r'),
        (pe + 'acc_reg[3]/Q (DFFR_X1)', 0.1032, 'f'),
        (pe + 'U2211/ZN (INV_X2)', 0.0195, 'r'),
        (pe + 'U2214/Z (BUF_X2)', 0.0480, 'r'),
        (dp + 'U1001/ZN (XNOR2_X1)', 0.0647, 'f'),
        (dp + 'U1088/CO (FA_X1)', 0.0954, 'f'),
        (dp + 'U1132/S (FA_X1)', 0.1288, 'r'),
        (dp + 'U1170/S (FA_X1)', 0.1302, 'f'),
        (dp + 'U1215/S (FA_X1)', 0.1265, 'r'),
        (dp + 'U1260/CO (FA_X1)', 0.0893, 'r'),
        (dp + 'U1901/ZN (NAND2_X1)', 0.0274, 'f'),
        (dp + 'U1902/ZN (OAI21_X2)', 0.0431, 'r'),
        (dp + 'U1950/ZN (AOI21_X2)', 0.0298, 'f'),
        (dp + 'U1977/ZN (OAI21_X2)', 0.0452, 'r'),
        (dp + 'U2003/ZN (AOI21_X2)', 0.0311, 'f'),
        (dp + 'U2031/ZN (OAI21_X2)', 0.0467, 'r'),
        (dp + 'U2044/ZN (AOI21_X1)', 0.0390, 'f'),
        (dp + 'U2061/ZN (OAI21_X1)', 0.0512, 'r'),
        (dp + 'U2068/ZN (AOI21_X1)', 0.0402, 'f'),
        (dp + 'U2071/ZN (OAI21_X1)', 0.0498, 'r'),
        (dp + 'U2075/ZN (INV_X1)', 0.0170, 'f'),
        (dp + 'U2090/Z (XOR2_X1)', 0.0702, 'r'),
        (pe + 'U3091/ZN (NAND2_X1)', 0.0251, 'f'),
        (pe + 'U3100/ZN (AOI22_X1)', 0.0488, 'r'),
        (pe + 'U3101/ZN (NAND3_X1)', 0.0372, 'f'),
        (pe + 'U3102/ZN (INV_X1)', 0.0181, 'r'),
        (pe + 'U3107/ZN (AOI221_X1)', 0.0743, 'f'),
        (pe + 'U3108/ZN (OAI21_X1)', 0.0456, 'r'),
        (pe + 'U3110/Z (MUX2_X1)', 0.0655, 'r'),
        (pe + 'acc_reg[61]/D (DFFR_X1)', 0.0, 'r'),
    ]
    ff = 'rising edge-triggered flip-flop clocked by clk'
    s, met_arr, _, met_slack = timing(met_path, 2.0, 0.0391, pe + 'acc_reg[3]', pe + 'acc_reg[61]', ff, ff)
    open(os.path.join(OUT, 'timing_met.txt'), 'w').write(BANNER + s)

    viol_path = [
        ('u_controller/count_reg[2]/CK (DFFR_X1)', 0.0, 'r'),
        ('u_controller/count_reg[2]/Q (DFFR_X1)', 0.1105, 'r'),
        ('u_controller/U301/ZN (XNOR2_X1)', 0.0633, 'r'),
        ('u_controller/U305/ZN (NAND4_X1)', 0.0458, 'f'),
        ('u_controller/U306/ZN (NOR4_X1)', 0.0911, 'r'),
        ('u_controller/U310/ZN (NAND2_X1)', 0.0302, 'f'),
        ('u_controller/U311/ZN (OAI21_X1)', 0.0545, 'r'),
        ('u_controller/count_reg[15]/D (DFFR_X1)', 0.0, 'r'),
    ]
    s, *_ = timing(viol_path, 0.35, 0.0352, 'u_controller/count_reg[2]', 'u_controller/count_reg[15]', ff, ff)
    open(os.path.join(OUT, 'timing_violated.txt'), 'w').write(BANNER + s)

    # ---- area (flat) and area -hierarchy: 16 PEs plus small blocks
    pes = [(f'g_pe[{i}].u_pe', 7958.36 + 13.1 * ((i * 7) % 5), 564.756 + (2.66 if i == 9 else 0.0)) for i in range(16)]
    small = [('u_buffer', 716.229, 186.212 + 122.36), ('u_controller', 402.118, 223.440), ('u_instruction_memory', 61.908, 37.240)]
    comb = sum(c for _, c, _ in pes) + sum(c for _, c, _ in small) + 64.106
    noncomb = sum(n for _, _, n in pes) + sum(n for _, _, n in small)
    bufinv = 9502.392009
    total = comb + noncomb
    counts = [('ports', 13104), ('nets', 131207), ('cells', 110412), ('combinational cells', 108618), ('sequential cells', 1794),
              ('macros/black boxes', 4), ('buf/inv', 16123), ('references', 22)]
    a = header('area')
    a += f'\nLibrary(s) Used:\n\n    NangateOpenCellLibrary (File: {LIBFILE})\n\n'
    for k, v in counts:
        a += f'{"Number of " + k + ":":40}{v:>8}\n'
    a += '\n'
    a += f'{"Combinational area:":28}{comb:>16.6f}\n{"Buf/Inv area:":28}{bufinv:>16.6f}\n{"Noncombinational area:":28}{noncomb:>16.6f}\n'
    a += f'{"Macro/Black Box area:":28}{0.0:>16.6f}\n{"Net Interconnect area:":28}undefined  (Wire load has zero net area)\n\n'
    a += f'{"Total cell area:":28}{total:>16.6f}\n{"Total area:":28}undefined\n1\n'
    open(os.path.join(OUT, 'area.txt'), 'w').write(BANNER + a)

    h = header('area', ['-hierarchy'])
    h += f'\nLibrary(s) Used:\n\n    NangateOpenCellLibrary (File: {LIBFILE})\n\n'
    for k, v in counts:
        h += f'{"Number of " + k + ":":40}{v:>8}\n'
    h += f'\n{"Combinational area:":28}{comb:>16.6f}\n{"Buf/Inv area:":28}{bufinv:>16.6f}\n{"Noncombinational area:":28}{noncomb:>16.6f}\n'
    h += f'{"Macro/Black Box area:":28}{0.0:>16.6f}\n{"Net Interconnect area:":28}undefined  (Wire load has zero net area)\n\n'
    h += f'{"Total cell area:":28}{total:>16.6f}\n{"Total area:":28}undefined\n\n'
    h += 'Hierarchical area distribution\n------------------------------\n\n'
    h += f'{"":34}{"Global cell area":22}{"Local cell area"}\n'
    h += f'{"":34}{"-" * 20}  {"-" * 30}\n'
    h += f'{"Hierarchical cell":34}{"Absolute":12}{"Percent":9}{"Combi-":12}{"Noncombi-":12}{"Black-"}\n'
    h += f'{"":34}{"Total":12}{"Total":9}{"national":12}{"national":12}{"boxes":8}Design\n'
    h += f'{"-" * 32}  {"-" * 10}  {"-" * 7}  {"-" * 10}  {"-" * 10}  {"-" * 6}  {"-" * 28}\n'

    def row(name, absolute, comb_, noncomb_, design):
        line = f'{absolute:10.4f}  {100 * absolute / total:7.1f}  {comb_:10.4f}  {noncomb_:10.4f}  {0.0:6.4f}  {design}\n'
        if len(name) > 32:                       # DC wraps long instance names onto their own line
            return f'{name}\n{"":34}{line}'
        return f'{name:32}  {line}'
    h += row('top', total, 64.106, 0.0, 'top')
    for name, c, n in pes:
        h += row(name, c + n, c, n, 'processing_element_' + name.split('[')[1].split(']')[0])
    mems = {'u_buffer': [('u_buffer/u_matrix_mem', 'array_DW512_NW65536_AW16'), ('u_buffer/u_output_mem', 'array_DW512_NW65536_AW16_INITIALIZE_MEMORY1'),
                         ('u_buffer/u_vector_mem', 'array_DW32_NW16384_AW14')],
            'u_instruction_memory': [('u_instruction_memory/u_instruction_memory', 'array_DW63_NW128_AW7')]}
    for name, c, n in small:                     # depth-first: each block, then the memories inside it
        h += row(name, c + n, c, n, name[2:])
        for mname, design in mems.get(name, []):
            h += row(mname, 0.0, 0.0, 0.0, design)
    h += f'{"-" * 32}  {"-" * 10}  {"-" * 7}  {"-" * 10}  {"-" * 10}  {"-" * 6}  {"-" * 28}\n'
    h += f'{"Total":32}  {"":10}  {"":7}  {comb:10.4f}  {noncomb:10.4f}  {0.0:6.4f}\n\n1\n'
    open(os.path.join(OUT, 'area_hier.txt'), 'w').write(BANNER + h)

    # ---- power: register / sequential / combinational groups that add up
    groups = [('io_pad', 0, 0, 0), ('memory', 0, 0, 0), ('black_box', 0, 0, 0), ('clock_network', 0, 0, 0),
              ('register', 8602.10, 210.5532, 1.5560e5), ('sequential', 55.2101, 2.1020, 3.4123e3), ('combinational', 2311.40, 3405.70, 3.1005e6)]
    I = sum(g[1] for g in groups)
    S = sum(g[2] for g in groups)
    L = sum(g[3] for g in groups)
    T = I + S + L / 1000

    def e(x):
        return f'{x:.4e}' if x >= 1000 else f'{x:.4f}'
    p = header('power', ['-analysis_effort high'])
    p += f'\nLibrary(s) Used:\n\n    NangateOpenCellLibrary (File: {LIBFILE})\n\n\n'
    p += 'Operating Conditions: typical   Library: NangateOpenCellLibrary\nWire Load Model Mode: top\n\n'
    p += 'Design        Wire Load Model            Library\n------------------------------------------------\n'
    p += 'top                    1K_hvratio_1_4    NangateOpenCellLibrary\n\n\n'
    p += ('Global Operating Voltage = 1.1  \nPower-specific unit information :\n    Voltage Units = 1V\n    Capacitance Units = 1.000000ff\n'
          '    Time Units = 1ns\n    Dynamic Power Units = 1uW    (derived from V,C,T units)\n    Leakage Power Units = 1nW\n\n\n')
    p += f'  Cell Internal Power  = {I / 1000:8.4f} mW   ({round(100 * I / (I + S)):.0f}%)\n'
    p += f'  Net Switching Power  = {S / 1000:8.4f} mW   ({round(100 * S / (I + S)):.0f}%)\n'
    p += '                         ---------\n'
    p += f'Total Dynamic Power    = {(I + S) / 1000:8.4f} mW  (100%)\n\n'
    p += f'Cell Leakage Power     = {L / 1e6:8.4f} mW\n\n\n'
    p += f'{"":17}{"Internal":17}{"Switching":20}{"Leakage":19}Total\n'
    p += f'{"Power Group":17}{"Power":17}{"Power":20}{"Power":19}Power   (   %    )  Attrs\n'
    p += '-' * 98 + '\n'
    for name, i_, s_, l_ in groups:
        tot = i_ + s_ + l_ / 1000
        p += f'{name:14}{e(i_):>11}{e(s_):>18}{e(l_):>18}{e(tot):>18}  ({100 * tot / T:7.2f}%)\n'
    p += '-' * 98 + '\n'
    p += f'{"Total":14}{e(I):>11} uW{e(S):>15} uW{e(L):>15} nW{e(T):>15} uW\n1\n'
    open(os.path.join(OUT, 'power.txt'), 'w').write(BANNER + p)

    # ---- qor
    q = header('qor')
    q += ("\n  Timing Path Group 'clk'\n  -----------------------------------\n"
          f"  Levels of Logic:             {len(met_path) - 3:.2f}\n  Critical Path Length:         {met_arr:.2f}\n  Critical Path Slack:          {met_slack:.2f}\n"
          "  Critical Path Clk Period:     2.00\n  Total Negative Slack:         0.00\n  No. of Violating Paths:       0.00\n"
          "  Worst Hold Violation:         0.00\n  Total Hold Violation:         0.00\n  No. of Hold Violations:       0.00\n"
          "  -----------------------------------\n\n\n  Cell Count\n  -----------------------------------\n"
          "  Hierarchical Cell Count:         23\n  Hierarchical Port Count:      13104\n  Leaf Cell Count:             110412\n"
          "  Buf/Inv Cell Count:           16123\n  Buf Cell Count:                3450\n  Inv Cell Count:               12673\n"
          "  CT Buf/Inv Cell Count:            0\n  Combinational Cell Count:    108618\n  Sequential Cell Count:         1794\n"
          "  Macro Count:                      0\n  -----------------------------------\n\n\n  Area\n  -----------------------------------\n")
    q += f"  Combinational Area:   {comb:14.6f}\n  Noncombinational Area: {noncomb:13.6f}\n  Buf/Inv Area:         {bufinv:14.6f}\n"
    q += f"  Macro/Black Box Area:       0.000000\n  Net Area:                   0.000000\n  -----------------------------------\n"
    q += f"  Cell Area:            {total:14.6f}\n  Design Area:          {total:14.6f}\n\n\n"
    q += ("  Design Rules\n  -----------------------------------\n  Total Number of Nets:        131207\n  Nets With Violations:             0\n"
          "  Max Trans Violations:             0\n  Max Cap Violations:               0\n  -----------------------------------\n\n"
          "  (a real report also has a Compile CPU Statistics block with your run time here)\n\n"
          "  --------------------------------------------------------------------\n\n"
          "  Design  WNS: 0.00  TNS: 0.00  Number of Violating Paths: 0\n\n\n"
          "  Design (Hold)  WNS: 0.00  TNS: 0.00  Number of Violating Paths: 0\n\n"
          "  --------------------------------------------------------------------\n\n1\n")
    open(os.path.join(OUT, 'qor.txt'), 'w').write(BANNER + q)

    # ---- results.txt exactly as the script's last lines would assemble it from the samples above
    tm = open(os.path.join(OUT, 'timing_met.txt')).read()
    pw = open(os.path.join(OUT, 'power.txt')).read()
    ar = open(os.path.join(OUT, 'area.txt')).read()
    r = '2.000\n'
    r += '\n'.join(l for l in tm.split('\n') if 'slack' in l.lower() and not l.startswith('#')) + '\n'
    r += '\n'.join(l for l in pw.split('\n') if 'Total' in l and not l.startswith('#')) + '\n'
    r += '\n'.join(l for l in pw.split('\n') if 'Cell' in l and 'Leakage' in l and not l.startswith('#')) + '\n'
    r += '\n'.join(l for l in ar.split('\n') if 'Total' in l and 'cell' in l and not l.startswith('#')) + '\n'
    open(os.path.join(OUT, 'results.txt'), 'w').write(BANNER + r)
    import json, re
    def last_num(text, label):
        m = re.search(label + r'\s*[:=]?\s*(-?[\d.]+(?:e[-+]?\d+)?)', text)
        return float(m.group(1))
    exp = {
        'timing_met': {'arrival': met_arr, 'slack': round(met_slack, 4), 'period': 2.0, 'setup': -0.0391, 'cells': len(met_path)},
        'timing_violated': {'slack': round(0.35 - 0.0352 - sum(i for _, i, _ in viol_path), 4), 'period': 0.35},
        'area': {'totalCell': last_num(ar, 'Total cell area'), 'combinational': last_num(ar, '\nCombinational area'), 'noncombinational': last_num(ar, 'Noncombinational area'),
                 'bufinv': last_num(ar, 'Buf/Inv area'), 'cells': 110412, 'hier_rows': 24},
        'power': {'internal': last_num(pw, 'Cell Internal Power'), 'switching': last_num(pw, 'Net Switching Power'), 'dynamic': last_num(pw, 'Total Dynamic Power'),
                  'leakage': last_num(pw, 'Cell Leakage Power'), 'total_uW': float(re.search(r'\nTotal\s+\S+ uW\s+\S+ uW\s+\S+ nW\s+(\S+) uW', pw).group(1)),
                  'register_pct': float(re.search(r'\nregister.*\(\s*([\d.]+)%\)', pw).group(1)), 'groups': len(groups)},
        'qor': {'length': round(met_arr, 2), 'slack': round(met_slack, 2), 'levels': len(met_path) - 3},
    }
    json.dump(exp, open(os.path.join(OUT, 'expected.json'), 'w'), indent=1)
    print('wrote', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    main()
