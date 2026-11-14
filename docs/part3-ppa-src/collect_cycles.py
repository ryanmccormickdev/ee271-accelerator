"""Collect the recorded cycle-count runs into data/cycles.json (stdlib only).

The runs themselves are made by record_cycles.sh (it calls an equivalence-test script once per
PE count and mode and appends one summary line per run). This script only parses those summary
lines and logs, checks each count against the cycle model, and writes the JSON the page embeds.

Usage:  python3 docs/part3-ppa-src/collect_cycles.py <runs_dir>
        (runs_dir holds icarus/, ref/, vrace/, bubble*/, tworep*/, odd/, trunc/ from record_cycles.sh)
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TESTS = {"INT8": (1024, 1024, 4), "INT16": (512, 512, 2), "INT32": (256, 256, 1)}


def model(P, rows, cols, lanes, kind="zero"):
    t = math.ceil(rows / (P * lanes))
    if kind == "zero":
        return t * (cols + 3) + 8
    if kind == "bubble":          # one idle cycle before every instruction except the first
        return t * (cols + 7) + 8
    if kind == "tworep":          # every repetition takes two cycles
        return 2 * t * (cols + 3) + 8
    raise ValueError(kind)


def parse_summary(path):
    rows = []
    if not os.path.exists(path):
        return rows
    for line in open(path):
        kv = dict(re.findall(r"(\w+)=(\S+)", line))
        if "P" in kv:
            rows.append(kv)
    return rows


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    R = os.path.abspath(sys.argv[1])
    out = {"what": "Cycle counts printed by part2/equivalence_testing/testbench/tb_top.sv ('Computation took N clock cycles') "
                   "for a throwaway zero-bubble reference RTL (never in the repo), at the official test sizes.",
           "simulators": {"icarus": "Icarus Verilog 13.0", "verilator": "Verilator 5.052"},
           "tests": {m: {"rows": r, "cols": c, "lanes": l} for m, (r, c, l) in TESTS.items()},
           "official": [], "variants": [], "odd": [], "trunc": []}

    # every run must have used the stock array.sv (a local copy in a run folder would shadow it)
    for sub in ("icarus2", "ver2", "bubble_icarus2", "tworep_icarus2", "bubble_v2", "tworep_v2", "odd2"):
        d = os.path.join(R, sub)
        if os.path.isdir(d):
            bad = [x for x in os.listdir(d) if os.path.exists(os.path.join(d, x, "array.sv"))]
            if bad:
                sys.exit(f"{sub}: run folders with a local array.sv: {bad[:5]}")
    ica = {(int(k["P"]), k["mode"]): k for k in parse_summary(os.path.join(R, "icarus2", "summary.txt"))}
    ver = {}
    # Verilator runs recorded with the fixed proto_eq.sh (stock array.sv, -O2 -fno-inline)
    for k in parse_summary(os.path.join(R, "ver2", "summary.txt")):
        ver[(int(k["P"]), k["mode"])] = k
    for (P, mode) in sorted(set(ica) | set(ver), key=lambda x: (x[0], x[1])):
        rows, cols, lanes = TESTS[mode]
        i, v = ica.get((P, mode)), ver.get((P, mode))
        cyc = None
        for src in (i, v):
            if src and src.get("cycles", "NA") != "NA":
                cyc = int(src["cycles"])
                break
        rec = {"P": P, "mode": mode, "tiles": math.ceil(rows / (P * lanes)), "asm_lines": int((i or v)["asm_lines"]),
               "imem_depth": int((i or v)["imem_depth"]), "cycles": cyc, "model": model(P, rows, cols, lanes),
               "icarus": i["result"] if i else None, "verilator": v["result"] if v else None}
        if cyc is None:
            rec["note"] = "staff ivd-sim raises ValueError (MemAOffset 65,536 does not fit 16 bits), so there is no reference output"
        elif cyc != rec["model"]:
            sys.exit(f"model mismatch at P={P} {mode}: measured {cyc}, model {rec['model']}")
        if i and v and i.get("cycles") != v.get("cycles"):
            sys.exit(f"simulators disagree on cycles at P={P} {mode}: icarus {i.get('cycles')} verilator {v.get('cycles')}")
        out["official"].append(rec)

    for kind in ("bubble", "tworep"):
        for sim, sub in (("icarus", kind + "_icarus2"), ("verilator", kind + "_v2")):
            for k in parse_summary(os.path.join(R, sub, "summary.txt")):
                rows, cols, lanes = TESTS[k["mode"]]
                P = int(k["P"])
                out["variants"].append({"kind": kind, "sim": sim, "P": P, "mode": k["mode"], "cycles": int(k["cycles"]),
                                        "model": model(P, rows, cols, lanes, kind), "result": k["result"]})

    for k in parse_summary(os.path.join(R, "odd2", "summary.txt")):
        P, rows, cols = int(k["P"]), int(k["rows"]), int(k["cols"])
        lanes = TESTS[k["mode"]][2]
        rec = {"P": P, "mode": k["mode"], "rows": rows, "cols": cols, "cycles": int(k["cycles"]),
               "cycles_verilator": int(k["cycles_verilator"]) if k.get("cycles_verilator") else None,
               "model": model(P, rows, cols, lanes), "verilator": k.get("verilator"), "icarus": k.get("icarus")}
        if rec["cycles"] != rec["model"]:
            sys.exit(f"model mismatch (odd size) {rec}")
        out["odd"].append(rec)

    for P in (6, 8):
        log = os.path.join(R, "trunc", f"P{P}.log")
        if not os.path.exists(log):
            continue
        txt = open(log).read()
        head = dict(re.findall(r"(\w+)=(\d+)", txt.splitlines()[0] if txt else ""))
        for line in txt.splitlines():
            if line.startswith("asm_lines="):
                head = dict(re.findall(r"(\w+)=(\d+)", line))
        rec = {"P": P, "mode": "INT8", "imem_depth": 128, "asm_lines": int(head["asm_lines"]),
               "inst_bits_lines": int(head["inst_bits_lines"]), "inst_count_passed": int(head["INST_COUNT_passed"]),
               "imem_addr_width": int(head["imem_addr_width"])}
        rec["inst_count_seen"] = rec["inst_count_passed"] % (1 << rec["imem_addr_width"])
        for sim in ("icarus", "verilator"):
            m = re.search(sim + r": .*took (\d+) clock", txt)
            r = re.search(sim + r": (EQUIVALENT|MISMATCH)", txt)
            rows = re.search(sim + r": nonzero MEM2 rows rtl=(\d+) python=(\d+)", txt)
            rec[sim] = {"cycles": int(m.group(1)) if m else None, "result": r.group(1) if r else None,
                        "rtl_rows": int(rows.group(1)) if rows else None, "python_rows": int(rows.group(2)) if rows else None}
        rec["rows_needed"] = math.ceil(1024 / (4 * P))
        out["trunc"].append(rec)

    path = os.path.join(HERE, "data", "cycles.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    n = sum(1 for r in out["official"] if r["cycles"] is not None)
    print(f"wrote {path}: {n} official runs (all match the model), {len(out['variants'])} variant runs, "
          f"{len(out['odd'])} odd-size runs, {len(out['trunc'])} truncation demos")


if __name__ == "__main__":
    main()
