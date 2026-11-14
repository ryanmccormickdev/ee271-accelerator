"""Measure the area (and ABC's delay estimate) of generic building blocks with Yosys + the open
Nangate45 Liberty, and write data/blocks.json next to this file.

Generic blocks only (multipliers, adders, registers, a mux), never a PE or any module you write.
Every number is a "Yosys + open Nangate45 estimate, not Design Compiler".

Flow per block:  synth -noabc [-booth]  ->  dfflibmap  ->  abc: strash; map -D <target>; stime -p
  * "relaxed" = map -D 100000 (no real timing pressure, so ABC recovers area)
  * "fast"    = map -D 100   (an impossible target, so ABC maps for minimum delay)
ABC's delay uses the Liberty tables with no wire load and ideal input drivers, so it is only good
for comparing blocks with each other, not for predicting DC's timing report.

Usage:  python3 docs/part3-ppa-src/record_blocks.py --lib /path/to/NangateOpenCellLibrary_typical.lib
Needs:  yosys on PATH (tested with Yosys 0.68). Takes about a minute.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BLOCKS = os.path.join(HERE, "blocks")

ITEMS = [  # module, description, booth?
    ("mul32s", "32x32 signed multiplier, 64-bit product", True),
    ("mul17s", "17x17 signed multiplier, 34-bit product", True),
    ("mul16s", "16x16 signed multiplier, 32-bit product", True),
    ("mul8s", "8x8 signed multiplier, 16-bit product", True),
    ("add64", "64-bit adder (Yosys's own adder structure)", False),
    ("add64_ks", "64-bit adder written as a Kogge-Stone prefix tree", False),
    ("reg64_arst", "64-bit register, async active-low reset (DFFR_X1)", False),
    ("reg64_norst", "64-bit register, no reset (DFF_X1)", False),
    ("reg64_en", "64-bit register with load enable, no reset, no clock gating", False),
    ("mux4_32", "4:1 mux, 32 bits wide", False),
]
RELAXED, FAST = 100000, 100
SWEEP = {"mul32s": [100, 1850, 1900, 1950, 2000, 2050, 100000],
         "add64": [100, 450, 500, 550, 600, 100000]}


def run(module, lib, booth, target, workdir):
    src = os.path.join(BLOCKS, module + ".v")
    stat = os.path.join(workdir, f"{module}.stat")
    script = f"+strash;map,-D,{target};topo;stime,-p"
    cmds = (f"read_verilog -sv {src}; synth -top {module} -noabc{' -booth' if booth else ''}; "
            f"dfflibmap -liberty {lib}; abc -liberty {lib} -script {script}; opt_clean; "
            f"tee -q -o {stat} stat -liberty {lib}")
    p = subprocess.run(["yosys", "-p", cmds], capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(f"yosys failed on {module}:\n{p.stdout[-3000:]}\n{p.stderr[-2000:]}")
    text = open(stat).read()
    area = float(re.search(r"Chip area for module '\\?" + module + r"':\s*([0-9.]+)", text).group(1))
    m = re.search(r"of which used for sequential elements:\s*([0-9.]+)", text)
    seq = float(m.group(1)) if m else 0.0
    cells = {}
    for line in text.splitlines():
        mm = re.match(r"\s+(\d+)\s+[0-9.E+]+\s+([A-Z][A-Z0-9_]+_X\d+)\s*$", line)
        if mm:
            cells[mm.group(2)] = int(mm.group(1))
    delays = re.findall(r"Delay =\s*([0-9.]+) ps", p.stdout)
    comb = seq == 0.0
    return {"area_um2": round(area, 2), "seq_area_um2": round(seq, 2),
            "abc_delay_ps": float(delays[-1]) if (delays and comb) else None,
            "cells": dict(sorted(cells.items(), key=lambda kv: -kv[1]))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib", required=True, help="NangateOpenCellLibrary_typical.lib")
    lib = os.path.abspath(ap.parse_args().lib)
    ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    out = {"tool": ver, "liberty": os.path.basename(lib),
           "label": "Yosys + open Nangate45 estimate, not Design Compiler",
           "flow": "synth -noabc [-booth]; dfflibmap; abc: strash; map -D <target>; stime -p",
           "blocks": [], "sweeps": {}}
    with tempfile.TemporaryDirectory() as wd:
        for module, what, is_mul in ITEMS:
            row = {"module": module, "what": what}
            row["relaxed"] = run(module, lib, is_mul, RELAXED, wd)
            row["fast"] = run(module, lib, is_mul, FAST, wd)
            if is_mul:
                row["array_relaxed"] = run(module, lib, False, RELAXED, wd)
            out["blocks"].append(row)
            r, f = row["relaxed"], row["fast"]
            print(f"{module:12s} relaxed {r['area_um2']:9.2f} um2 {r['abc_delay_ps']} ps | fast {f['area_um2']:9.2f} um2 {f['abc_delay_ps']} ps"
                  + (f" | array (no Booth) relaxed {row['array_relaxed']['area_um2']:.2f}" if is_mul else ""))
        for module, targets in SWEEP.items():
            booth = module.startswith("mul")
            pts = []
            for t in targets:
                r = run(module, lib, booth, t, wd)
                pts.append({"target_ps": t, "area_um2": r["area_um2"], "abc_delay_ps": r["abc_delay_ps"]})
                print(f"  sweep {module} D={t}: {r['area_um2']:.1f} um2, {r['abc_delay_ps']} ps")
            out["sweeps"][module] = pts
    path = os.path.join(HERE, "data", "blocks.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote", path)


if __name__ == "__main__":
    main()
