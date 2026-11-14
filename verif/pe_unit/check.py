#!/usr/bin/env python3
"""Compare the PE unit test's observed outputs with the staff reference's, and explain the first difference.

  check.py DIR        (DIR has vectors.txt, expected.txt, labels.txt from gen_vectors.py and observed.txt from the tb)

observed[0] is sampled before the first step is driven; with a latency of L cycles, the output after step i shows
up in observed[i + L]. The check tries L = 1..4 and reports the latency that matches.
"""
import os
import sys

OPS = {(0, 0): "MAC", (0, 1): "NOP", (0, 2): "OUT", (0, 3): "PASS", (0, 4): "CLR"}
MODE = {0: "INT8", 1: "INT16", 2: "INT32"}
WIDTH = {0: 8, 1: 16, 2: 32}


def lanes(x, w, total):
    out = []
    for i in range(total // w):
        v = (x >> (w * i)) & ((1 << w) - 1)
        out.append(v - (1 << w) if v >> (w - 1) else v)
    return out  # lane 0 first


def describe(vec):
    valid, op, mode, val, A, B = vec
    name = "RND s=%d" % val if op == 1 else OPS.get((op, val), f"opcode {op} value {val}")
    m = MODE.get(mode, f"mode {mode}")
    w = WIDTH.get(mode, 32)
    return (f"{'' if valid else '(pe_inst_valid=0) '}{name} {m}   vector_input (A) lanes {lanes(A, w, 32)}"
            f"   matrix_input (B) lanes {lanes(B, w, 32)}")


def main():
    d = sys.argv[1]
    vecs = [tuple(int(x, 16) for x in l.split()) for l in open(os.path.join(d, "vectors.txt"))]
    exp = [tuple(int(x, 16) for x in l.split()) for l in open(os.path.join(d, "expected.txt"))]
    labels = [l.rstrip("\n") for l in open(os.path.join(d, "labels.txt"))]
    obs_lines = [l.split() for l in open(os.path.join(d, "observed.txt")) if l.strip()]
    has_acc = bool(obs_lines) and len(obs_lines[0]) > 1
    if any("x" in t.lower() or "z" in t.lower() for line in obs_lines[:64] for t in line):
        print("PE unit test: vector_output has x/z bits right after reset. Reset the output register "
              "(and the accumulator) in the PE's reset branch.")
    obs = []
    for line in obs_lines:
        try:
            obs.append(tuple(int(t, 16) for t in line))
        except ValueError:
            obs.append(None)

    def first_bad(L):
        for i, (eo, ea) in enumerate(exp):
            j = i + L
            if j >= len(obs) or obs[j] is None:
                return i
            if obs[j][0] != eo or (has_acc and obs[j][1] != ea):
                return i
        return None

    results = {L: first_bad(L) for L in (1, 2, 3, 4)}
    for L, bad in results.items():
        if bad is None:
            extra = "" if L == 1 else f" ({L - 1} extra pipeline cycle(s): fine for Part 3, but the controller must account for it)"
            acc = " and the accumulator" if has_acc else ""
            print(f"PE unit test: PASS. {len(exp)} steps; vector_output{acc} match the staff reference with a latency "
                  f"of {L} cycle(s){extra}.")
            return 0
    L = max(results, key=lambda k: results[k])
    i = results[L]
    print(f"PE unit test: FAIL at step {i} of {len(exp)} (assuming latency {L}). Scenario: {labels[i]}")
    for k in range(max(0, i - 3), i):
        print(f"   step {k}: {describe(vecs[k])}")
    print(f" > step {i}: {describe(vecs[i])}")
    mode = vecs[i][2]
    w = WIDTH.get(mode, 32); aw = 64 // (32 // w)
    eo, ea = exp[i]
    print(f"   expected vector_output lanes {lanes(eo, w, 32)}   (0x{eo:08x})")
    j = i + L
    if j < len(obs) and obs[j] is None:
        print("   got      x/z (not reset, or not driven)")
    elif j < len(obs):
        print(f"   got      vector_output lanes {lanes(obs[j][0], w, 32)}   (0x{obs[j][0]:08x})")
        if has_acc:
            print(f"   expected acc lanes {lanes(ea, aw, 64)}\n   got      acc lanes {lanes(obs[j][1], aw, 64)}")
    else:
        print("   (no observation: the simulation ended early)")
    if not has_acc:
        print(f"   expected acc after this step (lanes, {aw}-bit): {lanes(ea, aw, 64)}  "
              f"(re-run with ACC=<your accumulator signal name> to check it directly)")
    print("   Re-run with waves: make pe-unit WAVES=1, then make waves")
    return 1


if __name__ == "__main__":
    sys.exit(main())
