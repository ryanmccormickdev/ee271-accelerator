"""Collect the measured numbers the page quotes into docs/part2-rtl-src/facts.json.

    part2/ee271-conda-env/bin/python docs/part2-rtl-src/collect_facts.py <runs_root> [--out facts.json]

<runs_root> holds one folder per official-size run made with record.sh, named
    ni_<design>_<test>        (official seeds: matrix 0, vector 12345)
    ni_<design>_<test>_v7     (vector seed 7)
    icarus_<design>_<test>    (same, simulated with Icarus instead of Verilator)
where <test> is int8, int16 or int32. For each run it records the testbench's cycle count and how
many MEM2 rows differ from ivd-sim, plus one real mismatching row. It also computes, from the
matrices the runs used, how many outputs OUT has to clamp. Needs numpy (the Part 2 conda env).
"""
import json
import os
import re
import sys

import numpy as np

TESTS = {"int8": 8, "int16": 16, "int32": 32}
PAT = re.compile(r"^(ni|icarus)_(.+)_(int8|int16|int32)(_v7)?$")


def rows(path):
    with open(path) as f:
        return [l.strip() for l in f]


def tb_facts(root):
    """Module-testbench runs (record_tb.sh), folders named tb_<pe|buffer_wb|top>_<verilator|noinline|icarus>:
    the PE register values over time, and every MEM2 write (cycle, address, data)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import vcd2json as V
    out = {}
    for d in sorted(os.listdir(root)):
        m = re.match(r"^tb_(pe|buffer_wb|top)_(verilator|noinline|icarus)$", d)
        if not m or not os.path.exists(os.path.join(root, d, "waves.vcd")):
            continue
        tb, sim = m.groups()
        names, ch = V.parse_vcd(os.path.join(root, d, "waves.vcd"))
        top = f"tb_{tb}."
        rises = [t for t, v in ch[names[top + "clk"][0]] if v == "1" and t > 0]

        def series(n):
            ident, w = names[top + "dut." + n]
            return [V.to_hex(V.value_at(ch.get(ident, []), r), w) for r in rises]
        rec = {}
        if tb == "pe":
            acc, out_q, inst, val = (series("u_processing_element.acc"), series("u_processing_element.vector_output"),
                                     series("pe_inst"), series("pe_inst_valid"))
            rec["pe_ops"] = [[c, inst[c]] for c in range(len(rises)) if val[c] == "1"]
            rec["acc_changes"] = [[c, acc[c]] for c in range(1, len(rises)) if acc[c] != acc[c - 1]]
            rec["out_changes"] = [[c, out_q[c]] for c in range(1, len(rises)) if out_q[c] != out_q[c - 1]]
            rec["final"] = {"acc": acc[-1], "out": out_q[-1]}
        else:
            g, a, dd = series("u_buffer.u_output_mem.gwen"), series("u_buffer.u_output_mem.a"), series("u_buffer.u_output_mem.d")
            rec["mem2_writes"] = [[c, int(a[c], 16), dd[c].lstrip("0") or "0"] for c in range(len(rises)) if g[c] == "0"]
        log = open(os.path.join(root, d, "sim.log")).read()
        rec["finished_ps"] = int(re.search(r"\$finish (?:called )?at (\d+)", log).group(1)) if re.search(r"\$finish (?:called )?at (\d+) \(1ps\)", log) else None
        out[f"{tb}|{sim}"] = rec
    return out


def sweep(root):
    """Reference runs at other PE counts, folders named p<P>_ref_<test> (record.sh with PE_COUNT=P)."""
    out = []
    for d in sorted(os.listdir(root)):
        m = re.match(r"^p(\d+)_ref_(int8|int16|int32)$", d)
        if not m:
            continue
        n = {"int8": 1024, "int16": 512, "int32": 256}[m.group(2)]
        if not os.path.exists(os.path.join(root, d, "sim.log")):
            outer = os.path.join(root, d + ".log")
            why = "the staff ivd-sim stopped with a ValueError" if os.path.exists(outer) and "ValueError" in open(outer).read() else "no RTL run"
            out.append({"P": int(m.group(1)), "test": m.group(2), "n": n, "w": TESTS[m.group(2)], "took": None, "match": False, "note": why})
            continue
        log = open(os.path.join(root, d, "sim.log")).read()
        took = re.search(r"Computation took (\d+) clock cycles", log)
        ok = os.path.exists(os.path.join(root, d, "result.bits")) and open(os.path.join(root, d, "result.bits")).read() == open(os.path.join(root, d, "out.bits")).read()
        out.append({"P": int(m.group(1)), "test": m.group(2), "n": n, "w": TESTS[m.group(2)], "took": int(took.group(1)) if took else None,
                    "match": ok, "note": "Verilator -O2 -fno-inline" + ("" if ok else ", MEM2 MISMATCH")})
    return sorted(out, key=lambda r: (r["test"], r["P"]))


def file_sizes(root):
    """Sizes of the files one official-size flow produces (from the INT8 reference run)."""
    p = os.path.join(root, "ni_ref_int8")
    res = {}
    for f in ("matrix.npy", "vector.npy", "mem0.bits", "mem1.bits", "mat_mul.asm", "inst.bits", "out.bits", "result.bits"):
        fp = os.path.join(p, f)
        if os.path.exists(fp):
            res[f] = {"bytes": os.path.getsize(fp), "lines": sum(1 for _ in open(fp, "rb")) if not f.endswith(".npy") else None}
    return res


def main(argv):
    root = argv[0]
    out = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), "facts.json")
    runs, stats, examples = {}, {}, {}
    for d in sorted(os.listdir(root)):
        m = PAT.match(d)
        if not m or not os.path.isdir(os.path.join(root, d)):
            continue
        sim, design, test, v7 = m.group(1), m.group(2), m.group(3), bool(m.group(4))
        if design.startswith("o2_"):
            continue                      # a timing-only run
        p = os.path.join(root, d)
        log = open(os.path.join(p, "sim.log")).read() if os.path.exists(os.path.join(p, "sim.log")) else ""
        took = re.search(r"Computation took (\d+) clock cycles", log)
        res, gold = os.path.join(p, "result.bits"), os.path.join(p, "out.bits")
        bad, first = None, None
        if os.path.exists(res) and os.path.exists(gold):
            a, b = rows(res), rows(gold)
            diff = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
            bad = len(diff) + abs(len(a) - len(b))
            if diff:
                i = diff[0]
                first = {"row": i, "got": a[i], "want": b[i]}
        key = f"{design}|{test}|{'v7' if v7 else 'official'}|{'icarus' if sim == 'icarus' else 'verilator'}"
        runs[key] = {"took": int(took.group(1)) if took else None, "bad_rows": bad,
                     "asm_lines": sum(1 for _ in open(os.path.join(p, "mat_mul.asm"))) if os.path.exists(os.path.join(p, "mat_mul.asm")) else None}
        if first and design in ("live_mode", "pe_not_delayed", "live_offset", "write_not_delayed", "slices_reversed") and test not in examples.get(design, {}):
            examples.setdefault(design, {})[test + ("_v7" if v7 else "")] = first
        if design == "ref" and sim == "ni":
            M = np.load(os.path.join(p, "matrix.npy"))
            v = np.load(os.path.join(p, "vector.npy"))
            y = (M @ v).ravel()
            w = TESTS[test]
            lo, hi = -(1 << (w - 1)), (1 << (w - 1)) - 1
            stats[test + ("_v7" if v7 else "")] = {
                "rows": int(M.shape[0]), "cols": int(M.shape[1]), "y_min": int(y.min()), "y_max": int(y.max()),
                "y_mean": round(float(y.mean()), 1), "clamped": int(((y < lo) | (y > hi)).sum()),
                "v_last": [int(x) for x in v[-4:, 0]], "m_min": int(M.min()), "m_max": int(M.max())}
    data = {"runs": runs, "stats": stats, "mismatch_examples": examples, "tb": tb_facts(root), "files": file_sizes(root), "sweep": sweep(root)}
    with open(out, "w") as f:
        json.dump(data, f, indent=1, sort_keys=True)
    print(f"wrote {out}: {len(runs)} runs, stats for {sorted(stats)}")
    for k in sorted(runs):
        print(f"  {k:48s} took {runs[k]['took']}, rows differing {runs[k]['bad_rows']}")


if __name__ == "__main__":
    main(sys.argv[1:])
