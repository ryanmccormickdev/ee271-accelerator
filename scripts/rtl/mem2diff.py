#!/usr/bin/env python3
"""Explain an equivalence-test mismatch: decode MEM2 words into matrix rows, PEs and lanes, and guess the bug.

  mem2diff.py result.bits out.bits --mode INT8 --pe 16 [--matrix matrix.npy --vector vector.npy] [--max 3]

result.bits is what the RTL wrote (dumped by the testbench), out.bits what the staff's Python reference wrote.
Each MEM2 word holds P PE outputs, PE 0 in the most significant 32 bits (like the Python cut()/join()), and each PE
output holds 32/w lanes. Reading a word from the most significant end in w-bit chunks gives consecutive matrix rows
(that's how compiler.extract_results_from_memory reads it back), so chunk k of word a is row a*(P*lanes) + k.

A cause is only suggested when it explains most of the differing lanes (a vote), so one coincidence can't mislead.
"""
import argparse
import sys

WIDTH = {"INT8": 8, "INT16": 16, "INT32": 32}


def signed(bits):
    v = int(bits, 2)
    return v - (1 << len(bits)) if bits[0] == "1" else v


def clamp(x, w):
    return max(-(1 << (w - 1)), min((1 << (w - 1)) - 1, x))


def wrap(x, w):
    x &= (1 << w) - 1
    return x - (1 << w) if x >> (w - 1) else x


CAUSES = {
    "zero_word": "Whole words are zero: nothing (or zeros) was written there. Does the WRITE fire, at the right address, "
                 "after the OUT has updated the output registers? (After CLR the output register is 0, so a WRITE that "
                 "commits too early also writes zeros.)",
    "prev_word": "Words equal the PREVIOUS tile's result: the WRITE captured the PE outputs before this tile's OUT reached "
                 "the output register (it committed one cycle too early), or the OUT came too late.",
    "pe_order":  "All PE outputs are present but in the wrong positions: the MEM0 slice a PE reads and the MEM2 slice it "
                 "writes must be the same position (PE 0 = most significant 32 bits, as in the Python).",
    "truncate":  "Lanes hold the dot product truncated to w bits instead of clamped: OUT must saturate each lane to "
                 "[-2^(w-1), 2^(w-1)-1] by comparing the signed lane value with the limits.",
    "no_last":   "Lanes are missing exactly the LAST column's product: the final MAC repetition of each run is lost "
                 "(controller stops one repetition early, or the PE instruction for it is dropped).",
    "no_first":  "Lanes are missing exactly the FIRST column's product: the first MAC of each run is lost (the PE "
                 "instruction arrives before its read data, or the CLR lands after the first MAC).",
    "bad_last":  "The LAST column was multiplied by the wrong vector value (consistently): the cycle after the last READ "
                 "of a run decodes MEM1 data wrongly. Typical cause: the lane select uses the CURRENT instruction's "
                 "mode/offset instead of the ones registered from the READ cycle (the next instruction is a NOP whose "
                 "mode field is 0 = INT8).",
    "bad_first": "The FIRST column was multiplied by the wrong vector value: the first READ of each run is decoded with "
                 "stale state (offset/mode register not loaded in time).",
    "x_bits":    "The result contains x or z bits: a register without reset or an undriven signal (find the first X in "
                 "the waveform, starting from the PE outputs).",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("result"); ap.add_argument("expected")
    ap.add_argument("--mode", required=True, choices=list(WIDTH)); ap.add_argument("--pe", type=int, required=True)
    ap.add_argument("--matrix"); ap.add_argument("--vector"); ap.add_argument("--max", type=int, default=3)
    a = ap.parse_args()
    w = WIDTH[a.mode]; lanes = 32 // w; per_word = a.pe * lanes

    got = [l.strip() for l in open(a.result)]
    exp = [l.strip() for l in open(a.expected)]
    if len(got) != len(exp):
        print(f"result has {len(got)} MEM2 lines, the reference has {len(exp)}: the dump is incomplete "
              f"(did the simulation end early or time out?).")
    M = v = None
    if a.matrix and a.vector:
        try:
            import numpy as np
            M = np.load(a.matrix); v = np.load(a.vector).flatten()
        except Exception as e:  # numpy missing or files unreadable: still report the raw diff
            print(f"(could not load matrix/vector for hints: {e})")
    rows = len(M) if M is not None else None
    used = (rows + per_word - 1) // per_word if rows else None

    bad = [i for i in range(min(len(got), len(exp))) if got[i] != exp[i]]
    if not bad:
        print("No word differs (the lengths may differ, see above).")
        return 0
    span = f" of the {used} MEM2 words the program writes" if used else ""
    print(f"{len(bad)} MEM2 word(s) differ{span}: addresses {bad[:12]}{' ...' if len(bad) > 12 else ''}")

    votes = dict.fromkeys(CAUSES, 0)
    lanes_seen = words_seen = 0
    wrong_last_values = []
    detail = []
    for addr in bad[:32]:
        g, e = got[addr], exp[addr]
        if set(g) - {"0", "1"}:
            votes["x_bits"] += 1; words_seen += 1
            detail.append(f"MEM2[{addr}]: contains x/z bits"); continue
        words_seen += 1
        votes["zero_word"] += set(g) <= {"0"}
        votes["prev_word"] += addr > 0 and g == exp[addr - 1]
        gpe = [g[p * 32:(p + 1) * 32] for p in range(a.pe)]; epe = [e[p * 32:(p + 1) * 32] for p in range(a.pe)]
        votes["pe_order"] += gpe != epe and sorted(gpe) == sorted(epe)
        gch = [g[k * w:(k + 1) * w] for k in range(per_word)]; ech = [e[k * w:(k + 1) * w] for k in range(per_word)]
        diffs = [k for k in range(per_word) if gch[k] != ech[k]]
        show = addr in bad[: a.max]
        if show:
            detail.append(f"MEM2[{addr}] (row tile {addr}): {len(diffs)} of {per_word} lanes differ")
        for k in diffs:
            pe, lane = k // lanes, lanes - 1 - (k % lanes)
            row = addr * per_word + k
            gv, ev = signed(gch[k]), signed(ech[k])
            line = f"  row {row}: PE {pe} lane {lane} (bits [{(lane + 1) * w - 1}:{lane * w}] of its output): expected {ev}, got {gv}"
            if M is not None and row < rows:
                lanes_seen += 1
                true = int(M[row].astype(object) @ v.astype(object))
                line += f"   [true dot product {true}]"
                cols = M.shape[1]
                m_last, m_first = int(M[row, cols - 1]), int(M[row, 0])
                votes["truncate"] += clamp(true, w) == ev and wrap(true, w) == gv
                if ev == true:                      # unclamped lane: the arithmetic difference is meaningful
                    d = gv - true
                    votes["no_last"] += m_last * int(v[cols - 1]) != 0 and d == -m_last * int(v[cols - 1])
                    votes["no_first"] += m_first * int(v[0]) != 0 and d == -m_first * int(v[0])
                    if m_last and d % m_last == 0:
                        votes["bad_last"] += 1; wrong_last_values.append(int(v[cols - 1]) + d // m_last)
                    elif m_first and d % m_first == 0:
                        votes["bad_first"] += 1
            if show and len([x for x in detail if x.startswith("  ")]) < 4 * a.max:
                detail.append(line)

    print()
    reported = []
    for key, n in votes.items():
        base = lanes_seen if key in ("truncate", "no_last", "no_first", "bad_last", "bad_first") else words_seen
        if base and n >= max(1, 0.6 * base):
            reported.append(key)
    # a missing product is also "a wrong value" (0); prefer the more specific message
    if "no_last" in reported and "bad_last" in reported: reported.remove("bad_last")
    if "no_first" in reported and "bad_first" in reported: reported.remove("bad_first")
    if reported:
        print("Likely cause(s):")
        for key in reported:
            msg = CAUSES[key]
            if key == "bad_last" and wrong_last_values:
                common = max(set(wrong_last_values), key=wrong_last_values.count)
                msg += f" (most rows behave as if the last vector element were {common} instead of {int(v[-1])})"
            print(f"  - {msg}")
    else:
        print("No single pattern explains most lanes. Open the waveform (WAVES=1, then make waves) at the cycle of the "
              f"WRITE to MEM2[{bad[0]}] and walk backwards: OUT, the last MAC, the READ that fed it.")
    print()
    print("\n".join(detail))
    return 0


if __name__ == "__main__":
    sys.exit(main())
