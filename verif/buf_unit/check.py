#!/usr/bin/env python3
"""Check the buffer unit test: READ data (matrix_data, vector_data) and the final MEM2 contents.

  check.py DIR

observed[k] is sampled just before the rising edge of cycle k, after cycle k's instruction is applied, so data for a
READ driven in cycle i shows up in observed[i + L] while the NEXT instruction is on buf_inst; L = the read latency
(1 for a plain synchronous SRAM). A WRITE issued in cycle i should store the
output_data present in cycle i + 1 (our timing contract: the WRITE commits in the same cycle as its paired PE
instruction, i.e. after the OUT issued just before it has updated the PE outputs); the check reports what it sees.
"""
import os
import sys

MODE = {0: "INT8", 1: "INT16", 2: "INT32"}


def main():
    d = sys.argv[1]
    vec = [l.split() for l in open(os.path.join(d, "vectors.txt"))]
    steps = [(int(v[0], 16), int(v[1], 16), int(v[2], 16), int(v[3], 16), int(v[4], 16), int(v[5], 16)) for v in vec]
    exp = [l.split() for l in open(os.path.join(d, "expected.txt"))]
    exp = [(int(e[0]), int(e[1], 16), int(e[2], 16)) for e in exp]
    obs = []
    for l in open(os.path.join(d, "observed.txt")):
        p = l.split()
        try:
            obs.append((int(p[0], 16), int(p[1], 16)))
        except (ValueError, IndexError):
            obs.append(None)   # x/z
    mem1 = [int(l, 2) for l in open(os.path.join(d, "mem1.bits"))]
    ok = True

    # ---- reads
    def bad_reads(L):
        out = []
        for i, m, v in exp:
            j = i + L
            if j >= len(obs) or obs[j] is None or obs[j] != (m, v):
                out.append((i, m, v, obs[j] if j < len(obs) else None))
        return out
    res = {L: bad_reads(L) for L in (1, 2)}
    L = 1 if not res[1] else (2 if not res[2] else 1)
    if not res[L]:
        print(f"  reads:  PASS. {len(exp)} READs; data appears {L} cycle(s) after the READ is presented"
              + ("" if L == 1 else " (one more than a plain SRAM: the controller must delay the PE instruction to match)"))
    else:
        ok = False
        i, m, v, got = res[L][0]
        _, op, mode, ma, mb, _ = steps[i]
        print(f"  reads:  FAIL. {len(res[L])} of {len(exp)} READs wrong; first at cycle {i}: READ {MODE.get(mode, mode)} "
              f"MemAOffset={ma} MemBOffset={mb}")
        nxt = steps[i + 1] if i + 1 < len(steps) else None
        if nxt:
            print(f"          the instruction presented in the NEXT cycle (while this data is on the output) is "
                  f"op={['READ', 'WRITE', 'NOP'][nxt[1]] if nxt[1] < 3 else nxt[1]} mode={MODE.get(nxt[2], nxt[2])}")
        if got is None:
            print("          observed x/z (uninitialised or undriven)")
        else:
            if got[0] != m:
                print(f"          matrix_data expected {m:032x}\n                      got      {got[0]:032x}")
            if got[1] != v:
                w = [8, 16, 32][mode] if mode < 3 else 32
                sh = {8: 2, 16: 1, 32: 0}[w]
                word = mem1[mb >> sh] if (mb >> sh) < len(mem1) else 0
                print(f"          vector_data expected {v:08x}, got {got[1]:08x}; MEM1 word {mb >> sh} = {word:08x}, "
                      f"lane select MemBOffset[{sh - 1 if sh else 0}:0] = {mb & ((1 << sh) - 1) if sh else 0}")
                wrong_modes = [n for n, x in (("INT8", 0), ("INT16", 1), ("INT32", 2)) if x != mode]
                for name in wrong_modes:
                    ww = [8, 16, 32][["INT8", "INT16", "INT32"].index(name)]
                    s2 = {8: 2, 16: 1, 32: 0}[ww]
                    lane = (word >> (ww * (mb & ((1 << s2) - 1)))) & ((1 << ww) - 1) if s2 else word
                    rep = 0
                    for k in range(32 // ww):
                        rep |= lane << (ww * k)
                    if rep == got[1]:
                        print(f"          -> got is that word decoded as {name}: the lane select is using another "
                              f"cycle's mode. Register the mode (and offset) from the READ cycle.")

    # ---- writes
    mem2 = [l.strip() for l in open(os.path.join(d, "mem2.bits"))]
    final = {}
    for i, (valid, op, mode, ma, mb, out) in enumerate(steps):
        if valid and op == 1:
            final[ma] = i
    lat_seen = {}
    wbad = []
    for addr, i in sorted(final.items()):
        word = mem2[addr]
        if set(word) - {"0", "1"}:
            wbad.append((addr, i, "x/z")); continue
        val = int(word, 2)
        k = next((k for k in range(0, 4) if i + k < len(steps) and steps[i + k][5] == val), None)
        lat_seen[k] = lat_seen.get(k, 0) + 1
        if k != 1:
            wbad.append((addr, i, k))
    stray = [a for a in range(512) if a not in final and mem2[a].strip("0")]
    if not wbad and not stray:
        print(f"  writes: PASS. {len(final)} addresses written; each holds the output_data from 1 cycle after its WRITE "
              f"was presented; no other address changed")
    else:
        ok = False
        if lat_seen:
            desc = ", ".join(f"{n} write(s) stored the data from {'?' if k is None else k} cycle(s) after the WRITE" for k, n in sorted(lat_seen.items(), key=lambda t: (t[0] is None, t[0])))
            print(f"  writes: FAIL. {desc}. The contract (docs/PLAN.md) is 1 cycle.")
        for addr, i, k in wbad[:3]:
            print(f"          MEM2[{addr}]: written by the WRITE in cycle {i}; "
                  + ("holds x/z" if k == "x/z" else "matches no nearby output_data (never written, or written at the wrong address?)" if k is None else f"holds the output_data from cycle {i + k}"))
        if stray:
            print(f"          addresses changed without a valid WRITE: {stray[:8]} (a WRITE with valid low, a NOP, or a wrong address)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
