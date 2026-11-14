#!/usr/bin/env python3
"""Part 3 figure of merit from a synthesis run record and the equivalence-test cycle counts.

  FoM = (T_int8 + T_int16 + T_int32)^2.3 * Area(um^2) * Power(mW) * 1e-15,   T = cycles * clock period (ns)

  scripts/fom.py --run runs/<tag>                        area/power/slack/period from the run record, cycles from the
                                                         latest passing tests for that RTL and PE count
  scripts/fom.py --period 2.0 --area 123456 --power 12.3 --cycles 16440 8248 4152     all by hand
  scripts/fom.py --run runs/<tag> --baseline runs/<other>   also prints the % change vs another run

Cycles come from build/vcs/results.tsv (VCS on caddy, the graded simulator) if present, else build/eq/results.tsv
(local). The design only counts at a period where timing is met (slack >= 0): the script says so if it isn't.
Area is DC's "Total cell area"; power is total = dynamic + cell leakage (mW). Check these choices against staff
guidance if they say otherwise.
"""
import argparse
import csv
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UNIT = {"w": 1e3, "mw": 1.0, "uw": 1e-3, "nw": 1e-6, "pw": 1e-9}


def to_mw(value, unit):
    return float(value) * UNIT[unit.lower()]


def parse_reports(run):
    """Return dict(period, slack, area, power_mw, dyn_mw, leak_mw) from a run directory (results.txt and/or reports)."""
    out = {}
    texts = {}
    for name in ("results.txt", "timing_report_maxsm", "area_report", "power_report", "run.txt"):
        p = os.path.join(run, name)
        if os.path.exists(p):
            texts[name] = open(p, errors="replace").read()
    rt = texts.get("run.txt", "")
    m = re.search(r"clock_period_ns=([\d.]+)", rt)
    if m:
        out["period"] = float(m.group(1))
    m = re.search(r"pe_count=(\d+)", rt); out["pe_count"] = int(m.group(1)) if m else None
    m = re.search(r"rtl=(\S+)", rt); out["rtl"] = m.group(1) if m else None
    res = texts.get("results.txt", "")
    if "period" not in out and res.strip():
        try:
            out["period"] = float(res.split()[0])
        except ValueError:
            pass
    alltext = "\n".join(texts.values())
    slacks = [float(x) for x in re.findall(r"slack\s*\((?:MET|VIOLATED)[^)]*\)\s*(-?[\d.]+)", alltext)]
    if slacks:
        out["slack"] = min(slacks)
    m = re.search(r"Total cell area:\s*([\d.]+)", alltext)
    if m:
        out["area"] = float(m.group(1))
    m = re.search(r"Total Dynamic Power\s*=\s*([\d.eE+-]+)\s*([munp]?W)", alltext)
    dyn = to_mw(*m.groups()) if m else None
    m = re.search(r"Cell Leakage Power\s*=\s*([\d.eE+-]+)\s*([munp]?W)", alltext)
    leak = to_mw(*m.groups()) if m else None
    # newer DC: a table whose "Total" row ends with the total power and its unit
    m = re.search(r"^Total\s+(?:[\d.eE+-]+\s*[munp]?W\s+){3}([\d.eE+-]+)\s*([munp]?W)", alltext, re.M)
    table_total = to_mw(*m.groups()) if m else None
    if dyn is not None and leak is not None:
        out["power_mw"] = dyn + leak
    elif table_total is not None:
        out["power_mw"] = table_total
    out["dyn_mw"], out["leak_mw"], out["table_total_mw"] = dyn, leak, table_total
    return out


def latest_cycles(rtl, pe):
    """Latest PASS cycle count per mode for this RTL folder and PE count (official sizes only)."""
    official = {"INT8": ("1024", "1024"), "INT16": ("512", "512"), "INT32": ("256", "256")}
    for path, src in ((os.path.join(REPO, "build", "vcs", "results.tsv"), "VCS"),
                      (os.path.join(REPO, "build", "eq", "results.tsv"), "local")):
        if not os.path.exists(path):
            continue
        got = {}
        for row in csv.DictReader(open(path), delimiter="\t"):
            mode = row.get("mode", "").upper()
            if row.get("verdict") != "PASS" or row.get("rtl") != rtl or str(row.get("pe_count")) != str(pe):
                continue
            if src == "local" and ((row.get("rows"), row.get("cols")) != official.get(mode) or row.get("seeds") != "0,12345"
                                   or row.get("values") != "-5..5"):
                continue
            if row.get("cycles"):
                got[mode] = int(row["cycles"])
        if all(m in got for m in official):
            return [got["INT8"], got["INT16"], got["INT32"]], src
    return None, None


def fom(period, cycles, area, power):
    t = sum(c * period for c in cycles)
    return t ** 2.3 * area * power * 1e-15, t


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run"); ap.add_argument("--baseline")
    ap.add_argument("--period", type=float); ap.add_argument("--area", type=float); ap.add_argument("--power", type=float)
    ap.add_argument("--cycles", type=int, nargs=3, metavar=("INT8", "INT16", "INT32"))
    ap.add_argument("--pe", type=int); ap.add_argument("--rtl")
    a = ap.parse_args()

    def evaluate(run, label):
        r = parse_reports(run) if run else {}
        period = a.period if a.period is not None and label == "this" else r.get("period")
        area = a.area if a.area is not None and label == "this" else r.get("area")
        power = a.power if a.power is not None and label == "this" else r.get("power_mw")
        pe = a.pe or r.get("pe_count") or 16
        rtl = a.rtl or r.get("rtl") or "unoptimized_verilog"
        cycles, src = (a.cycles, "given") if a.cycles and label == "this" else latest_cycles(rtl, pe)
        missing = [n for n, v in (("clock period", period), ("area", area), ("power", power), ("cycles", cycles)) if v is None]
        if missing:
            print(f"[{label}] cannot compute the FoM yet; missing: {', '.join(missing)}"
                  + (" (run `make eq` for this RTL/PE count first)" if cycles is None else ""))
            return None
        f, t = fom(period, cycles, area, power)
        slack = r.get("slack")
        print(f"[{label}] {rtl}, {pe} PEs, {period} ns clock: cycles {cycles[0]}/{cycles[1]}/{cycles[2]} ({src}), "
              f"T = {t:,.1f} ns, area {area:,.1f} um^2, power {power:.4g} mW -> FoM = {f:.4g}")
        if slack is not None and slack < 0:
            print(f"[{label}] WARNING: worst slack {slack} ns < 0: timing is violated at {period} ns, so this FoM does not count.")
        if area > 1_000_000:
            print(f"[{label}] WARNING: area {area:,.0f} um^2 is over the 1,000,000 um^2 cap.")
        if r.get("dyn_mw") is None and r.get("table_total_mw") is None and run:
            print(f"[{label}] note: no power numbers found in {run}; pass --power")
        return f

    f = evaluate(a.run, "this")
    if a.baseline and f is not None:
        b = evaluate(a.baseline, "baseline")
        if b:
            print(f"FoM change vs baseline: {100 * (b - f) / b:+.1f}% improvement (lower FoM is better; "
                  f"improvement = (FoM_base - FoM_new) / FoM_base)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
