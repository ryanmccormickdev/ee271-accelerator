"""Read numbers out of the open Nangate 45 nm Liberty file (the text version of the cell
library the course's NangateOpenCellLibrary.db is compiled from) and save them as
lib_facts.json for docs/synthesis.html.

Usage:  python3 docs/synthesis-src/lib_facts.py /path/to/NangateOpenCellLibrary_typical.lib
Stdlib only. Every number on the page that says "from the .lib" comes from here.

What it computes (all at the library's only corner: typical process, 1.10 V, 25 C):
  * area, leakage and pin capacitance of the cells the page talks about
  * delays read from the NLDM tables by bilinear interpolation (the same way an STA tool
    reads them), at a stated input slew and output load
  * flip-flop clock-to-Q, setup and hold
  * a self-consistent FO4 inverter delay
  * effective drive resistance (slope of delay vs load) and a rough logical effort
  * the 1K_hvratio_1_4 wire-load table the course script selects
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

TOKEN = re.compile(r'/\*.*?\*/|"(?:[^"\\]|\\.)*"|\\\n|[(){}:;,]|[^\s(){}:;,"]+', re.S)


# ------------------------------------------------------------------ a small Liberty parser
def tokens(text):
    for m in TOKEN.finditer(text):
        t = m.group()
        if t.startswith('/*') or t == '\\\n':
            continue
        yield t


class Group:
    __slots__ = ('kind', 'args', 'attrs', 'cattrs', 'groups')

    def __init__(self, kind, args):
        self.kind, self.args, self.attrs, self.cattrs, self.groups = kind, args, {}, {}, []

    def find(self, kind, name=None):
        return [g for g in self.groups if g.kind == kind and (name is None or (g.args and g.args[0] == name))]

    def one(self, kind, name=None):
        r = self.find(kind, name)
        return r[0] if r else None


def unq(s):
    return s[1:-1] if len(s) >= 2 and s[0] == '"' and s[-1] == '"' else s


def parse(text):
    toks = list(tokens(text))
    pos = 0

    def statement(parent):
        nonlocal pos
        name = toks[pos]
        pos += 1
        if toks[pos] == ':':                      # simple attribute  name : value ;
            pos += 1
            val = []
            while toks[pos] != ';':
                val.append(toks[pos])
                pos += 1
            pos += 1
            parent.attrs[name] = unq(' '.join(val))
            return
        if toks[pos] != '(':
            raise SystemExit(f'Liberty parse error near token {pos}: {toks[pos - 3:pos + 3]}')
        pos += 1
        args = []
        while toks[pos] != ')':
            if toks[pos] != ',':
                args.append(unq(toks[pos]))
            pos += 1
        pos += 1
        if toks[pos] == '{':                      # group  name (args) { ... }
            pos += 1
            g = Group(name, args)
            while toks[pos] != '}':
                statement(g)
            pos += 1
            parent.groups.append(g)
        else:                                     # complex attribute  name (args) ;
            if toks[pos] == ';':
                pos += 1
            parent.cattrs.setdefault(name, []).append(args)

    root = Group('root', [])
    while pos < len(toks):
        statement(root)
    return root.groups[0]


# ------------------------------------------------------------------ tables
def nums(s):
    return [float(x) for x in s.replace('\\', ' ').replace('"', ' ').replace(',', ' ').split()]


def table(g):
    """(index_1, index_2, rows) of a timing/constraint table group."""
    if 'index_1' not in g.cattrs:                      # scalar table: one value
        v = nums(','.join(g.cattrs['values'][0]))[0]
        return [0.0, 1.0], None, [[v, v]]
    i1 = nums(','.join(g.cattrs['index_1'][0]))
    i2 = nums(','.join(g.cattrs['index_2'][0])) if 'index_2' in g.cattrs else None
    vals = [nums(r) for r in g.cattrs['values'][0]]
    return i1, i2, vals


def interp1(xs, ys, x):
    # linear inside the table, linear extrapolation outside (what STA tools do)
    if x <= xs[0]:
        i = 0
    elif x >= xs[-1]:
        i = len(xs) - 2
    else:
        i = max(k for k in range(len(xs) - 1) if xs[k] <= x)
    x0, x1 = xs[i], xs[i + 1]
    return ys[i] + (ys[i + 1] - ys[i]) * (x - x0) / (x1 - x0)


def lookup(tab, v1, v2=None):
    i1, i2, vals = tab
    if i2 is None:
        return interp1(i1, vals[0], v1)
    col = [interp1(i2, row, v2) for row in vals]     # each row is one index_1 value
    return interp1(i1, col, v1)


# ------------------------------------------------------------------ cell access
class Lib:
    def __init__(self, root):
        self.root = root
        self.cells = {c.args[0]: c for c in root.find('cell')}

    def area(self, c):
        return float(self.cells[c].attrs['area'])

    def leak(self, c):
        return float(self.cells[c].attrs.get('cell_leakage_power', 'nan'))

    def pin(self, c, p):
        return self.cells[c].one('pin', p)

    def cap(self, c, p):
        return float(self.pin(c, p).attrs['capacitance'])

    def arcs(self, c, out, related, ttype=None):
        res = []
        for t in self.pin(c, out).find('timing'):
            if t.attrs.get('related_pin') != related:
                continue
            if ttype and t.attrs.get('timing_type', 'combinational') != ttype:
                continue
            res.append(t)
        return res

    def delay(self, c, out, related, slew, load, ttype=None):
        """worst/avg of cell_rise and cell_fall, plus output slews, at (input slew ns, load fF)."""
        best = None
        for t in self.arcs(c, out, related, ttype):
            r = {}
            for k in ('cell_rise', 'cell_fall', 'rise_transition', 'fall_transition'):
                g = t.one(k)
                if g is not None:
                    r[k] = lookup(table(g), slew, load)
            if best is None or max(r.get('cell_rise', 0), r.get('cell_fall', 0)) > max(best.get('cell_rise', 0), best.get('cell_fall', 0)):
                best = r
        if best is None:
            raise SystemExit(f'no arc {c}.{related}->{out} {ttype or ""}')
        return best

    def constraint(self, c, pin, related, ttype, data_slew, clk_slew):
        t = [x for x in self.pin(c, pin).find('timing') if x.attrs.get('related_pin') == related and x.attrs.get('timing_type') == ttype]
        if not t:
            raise SystemExit(f'no {ttype} on {c}.{pin}')
        out = {}
        for k in ('rise_constraint', 'fall_constraint'):
            g = t[0].one(k)
            if g is not None:
                out[k] = lookup(table(g), data_slew, clk_slew)
        return out


def r4(x):
    return float(f'{x:.4g}')


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    path = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'lib_facts.json')
    lib = Lib(parse(open(path).read()))
    L = lib.root
    facts = {'source': os.path.basename(path), 'library': L.args[0],
             'units': {k: L.attrs.get(k) for k in ('time_unit', 'leakage_power_unit', 'voltage_unit', 'current_unit', 'pulling_resistance_unit')},
             'cap_unit': L.cattrs.get('capacitive_load_unit', [[None]])[0],
             'corner': {'process': L.attrs.get('nom_process'), 'voltage': L.attrs.get('nom_voltage'), 'temperature': L.attrs.get('nom_temperature'),
                        'operating_conditions': L.attrs.get('default_operating_conditions')},
             'default_wire_load': L.attrs.get('default_wire_load'),
             'default_max_transition': float(L.attrs.get('default_max_transition', 'nan')), 'default_fanout_load': float(L.attrs.get('default_fanout_load', 'nan')),
             'cell_count': len(lib.cells)}

    # ---- the cells the page names
    names = ['INV_X1', 'INV_X2', 'INV_X4', 'INV_X8', 'INV_X16', 'INV_X32', 'BUF_X1', 'BUF_X2', 'BUF_X4', 'BUF_X8', 'BUF_X16', 'BUF_X32',
             'NAND2_X1', 'NAND2_X2', 'NAND2_X4', 'NOR2_X1', 'AND2_X1', 'OR2_X1', 'XOR2_X1', 'XNOR2_X1', 'AOI21_X1', 'OAI21_X1', 'AOI22_X1',
             'MUX2_X1', 'FA_X1', 'HA_X1', 'DFF_X1', 'DFF_X2', 'DFFR_X1', 'DFFS_X1', 'DFFRS_X1', 'SDFF_X1', 'DLH_X1', 'DLL_X1',
             'CLKGATETST_X1', 'CLKGATE_X1', 'TBUF_X1', 'LOGIC0_X1', 'LOGIC1_X1', 'FILLCELL_X1', 'TAPCELL_X1']
    cells = {}
    for n in names:
        if n not in lib.cells:
            continue
        c = lib.cells[n]
        pins = {}
        for p in c.find('pin'):
            d = {'dir': p.attrs.get('direction')}
            if 'capacitance' in p.attrs:
                d['cap'] = r4(float(p.attrs['capacitance']))
            if 'function' in p.attrs:
                d['fn'] = p.attrs['function']
            if p.attrs.get('clock') == 'true':
                d['clock'] = True
            pins[p.args[0]] = d
        lk = lib.leak(n)
        cells[n] = {'area': float(c.attrs['area']), 'leak_nW': None if lk != lk else r4(lk), 'pins': pins}   # fillers/tie cells have no leakage figure
    facts['cells'] = cells
    facts['all_areas'] = {n: float(c.attrs['area']) for n, c in sorted(lib.cells.items())}
    facts['all_leak_nW'] = {n: r4(float(c.attrs['cell_leakage_power'])) for n, c in sorted(lib.cells.items()) if 'cell_leakage_power' in c.attrs}

    # ---- operating point used for "typical" single numbers on the page
    SLEW = 0.02     # 20 ps input transition
    cin_inv = lib.cap('INV_X1', 'A')
    LOAD = 4 * cin_inv                      # a fanout of four X1 inverters
    facts['op'] = {'slew_ns': SLEW, 'load_fF': r4(LOAD), 'note': 'input slew 20 ps, load = 4 x INV_X1 input capacitance'}

    def d(c, o, i, ttype=None, slew=SLEW, load=LOAD):
        r = lib.delay(c, o, i, slew, load, ttype)
        return {k: r4(v * 1000) for k, v in r.items()}          # ns -> ps

    gates = {}
    for c, o, ins in [('INV_X1', 'ZN', ['A']), ('INV_X4', 'ZN', ['A']), ('BUF_X1', 'Z', ['A']), ('NAND2_X1', 'ZN', ['A1', 'A2']),
                      ('NOR2_X1', 'ZN', ['A1', 'A2']), ('AND2_X1', 'ZN', ['A1']), ('XOR2_X1', 'Z', ['A', 'B']), ('AOI21_X1', 'ZN', ['A', 'B1']),
                      ('OAI21_X1', 'ZN', ['A', 'B1']), ('MUX2_X1', 'Z', ['A', 'S']), ('FA_X1', 'S', ['A', 'CI']), ('FA_X1', 'CO', ['A', 'CI']),
                      ('HA_X1', 'S', ['A']), ('HA_X1', 'CO', ['A'])]:
        for i in ins:
            gates[f'{c} {i}->{o}'] = d(c, o, i)
    facts['gate_delays_ps'] = gates

    # ---- flip-flops and latches: clock-to-Q, setup, hold, recovery/removal
    ffs = {}
    for c in ('DFF_X1', 'DFFR_X1', 'DLH_X1'):
        e = {}
        if c.startswith('DLH'):
            e['G->Q'] = d(c, 'Q', 'G', 'rising_edge')
            e['D->Q (transparent)'] = d(c, 'Q', 'D')
            e['setup_falling'] = {k: r4(v * 1000) for k, v in lib.constraint(c, 'D', 'G', 'setup_falling', SLEW, SLEW).items()}
        else:
            e['CK->Q'] = d(c, 'Q', 'CK', 'rising_edge')
            e['setup'] = {k: r4(v * 1000) for k, v in lib.constraint(c, 'D', 'CK', 'setup_rising', SLEW, SLEW).items()}
            e['hold'] = {k: r4(v * 1000) for k, v in lib.constraint(c, 'D', 'CK', 'hold_rising', SLEW, SLEW).items()}
            e['CK_cap'] = lib.cap(c, 'CK')
            e['D_cap'] = lib.cap(c, 'D')
        if c == 'DFFR_X1':
            e['recovery'] = {k: r4(v * 1000) for k, v in lib.constraint(c, 'RN', 'CK', 'recovery_rising', SLEW, SLEW).items()}
            e['removal'] = {k: r4(v * 1000) for k, v in lib.constraint(c, 'RN', 'CK', 'removal_rising', SLEW, SLEW).items()}
            e['RN->Q'] = d(c, 'Q', 'RN', 'clear')
        ffs[c] = e
    facts['seq'] = ffs

    # ---- FO4: a chain of INV_X1, each driving four copies of itself; iterate the slew until it settles
    s = SLEW
    for _ in range(20):
        r = lib.delay('INV_X1', 'ZN', 'A', s, LOAD)
        s = (r['rise_transition'] + r['fall_transition']) / 2
    fo4 = (r['cell_rise'] + r['cell_fall']) / 2
    facts['fo4_ps'] = {'rise': r4(r['cell_rise'] * 1000), 'fall': r4(r['cell_fall'] * 1000), 'avg': r4(fo4 * 1000), 'slew': r4(s * 1000),
                       'per_2ns': r4(2.0 / fo4)}

    # ---- effective drive resistance R = d(delay)/d(load), and a rough logical effort
    def res(c, o, i, slew=SLEW):
        a = lib.delay(c, o, i, slew, 10.0)
        b = lib.delay(c, o, i, slew, 20.0)
        rr = (b['cell_rise'] - a['cell_rise']) / 10.0 * 1000      # ns/fF -> kOhm
        rf = (b['cell_fall'] - a['cell_fall']) / 10.0 * 1000
        z = lib.delay(c, o, i, slew, 0.0)
        return rr, rf, (z['cell_rise'] + z['cell_fall']) / 2
    drive = {}
    for c, o, i in [('INV_X1', 'ZN', 'A'), ('INV_X2', 'ZN', 'A'), ('INV_X4', 'ZN', 'A'), ('INV_X8', 'ZN', 'A'), ('INV_X16', 'ZN', 'A'), ('INV_X32', 'ZN', 'A'),
                    ('NAND2_X1', 'ZN', 'A1'), ('NOR2_X1', 'ZN', 'A1'), ('AOI21_X1', 'ZN', 'A'), ('XOR2_X1', 'Z', 'A')]:
        rr, rf, d0 = res(c, o, i)
        drive[c] = {'R_rise_kohm': r4(rr), 'R_fall_kohm': r4(rf), 'R_avg_kohm': r4((rr + rf) / 2), 'cin_fF': r4(lib.cap(c, i)), 'pin': i,
                    'area': lib.area(c), 'leak_nW': r4(lib.leak(c)), 'd0_ps': r4(d0 * 1000)}
    tau = drive['INV_X1']['R_avg_kohm'] * drive['INV_X1']['cin_fF']          # kOhm * fF = ps
    for c in drive:
        g = drive[c]['R_avg_kohm'] * drive[c]['cin_fF'] / tau
        drive[c]['g'] = r4(g)
        drive[c]['p_tau'] = r4(drive[c]['d0_ps'] / tau)
    facts['drive'] = drive
    facts['tau_ps'] = r4(tau)

    # ---- delay of INV_X1 vs INV_X4 driving a range of loads (for the sizing picture)
    loads = [1, 2, 5, 10, 20, 40, 60]
    facts['inv_sweep'] = {c: [r4((lambda r: (r['cell_rise'] + r['cell_fall']) / 2 * 1000)(lib.delay(c, 'ZN', 'A', SLEW, l))) for l in loads]
                          for c in ('INV_X1', 'INV_X2', 'INV_X4', 'INV_X8')}
    facts['inv_sweep_loads'] = loads

    # ---- wire load model selected by dc_synth.tcl line 52
    wl = L.one('wire_load', '1K_hvratio_1_4')
    cap = float(wl.attrs['capacitance'])
    resist = float(wl.attrs['resistance'])
    slope = float(wl.attrs['slope'])
    fl = [(int(float(a[0])), float(a[1])) for a in wl.cattrs['fanout_length']]
    rows = []
    for n in range(1, 13):
        known = dict(fl)
        if n in known:
            length = known[n]
        elif n > fl[-1][0]:
            length = fl[-1][1] + (n - fl[-1][0]) * slope
        else:                                                  # between table points: linear
            lo = max(k for k, _ in fl if k < n)
            hi = min(k for k, _ in fl if k > n)
            length = known[lo] + (known[hi] - known[lo]) * (n - lo) / (hi - lo)
        rows.append({'fanout': n, 'length': r4(length), 'C_fF': r4(length * cap), 'R_ohm': r4(length * resist * 1000),
                     'from_table': n in known})
    facts['wlm'] = {'name': '1K_hvratio_1_4', 'cap_per_len_fF': cap, 'res_per_len_kohm': resist, 'slope': slope,
                    'fanout_length': fl, 'rows': rows, 'has_area': 'area' in wl.attrs,
                    'all_names': [g.args[0] for g in L.find('wire_load')]}

    # ---- internal energy per clock edge at a flop's clock pin (CK internal_power, averaged over states)
    clk = {}
    for c in ('DFF_X1', 'DFFR_X1'):
        es = []
        for ip in lib.pin(c, 'CK').find('internal_power'):
            rp = ip.one('rise_power')
            fp = ip.one('fall_power')
            if rp is not None and fp is not None:
                es.append(lookup(table(rp), SLEW) + lookup(table(fp), SLEW))
        clk[c] = {'energy_per_cycle_fJ': r4(sum(es) / len(es)) if es else None, 'states': len(es)}
    facts['clock_pin_energy'] = clk

    json.dump(facts, open(out, 'w'), indent=1, sort_keys=True, allow_nan=False)
    print(f'wrote {out}: {len(cells)} cells described, FO4 = {facts["fo4_ps"]["avg"]} ps, tau = {facts["tau_ps"]} ps')


if __name__ == '__main__':
    main()
