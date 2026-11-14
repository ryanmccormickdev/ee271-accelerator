#!/usr/bin/env python3
"""Golden vectors for the PE unit test, computed by the staff's reference PE (part2/simulator/src).

  gen_vectors.py OUTDIR [--seed 1] [--random 1500]

Writes OUTDIR/vectors.txt (what the testbench drives, one step per line, hex:
  valid opcode mode value vector_input matrix_input), OUTDIR/expected.txt (out acc after each step, hex) and
OUTDIR/labels.txt (which scenario each step belongs to). The directed scenarios cover every instruction in every mode
with the spec's edge cases (clamp limits, ties to even, sign extension, s = 0 and s >= lane width, valid low, OUT then
more MACs, ...); then a random section mixes everything. The equivalence tests only ever run CLR, MAC, OUT and NOP;
this is where PASS, RND and the clamp limits get checked.

Vector input = A = Data0 = the broadcast MEM1 word (PASS copies it). Matrix input = B = this PE's MEM0 slice.
Lane 0 is the least significant lane. A step the reference cannot represent (accumulator overflow, which the spec
leaves undefined: Ed #226) is skipped.
"""
import argparse
import os
import random
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "part2", "simulator"))
from bitstring import Bits  # noqa: E402
from src.instruction import PEI, ProcessingElementInstruction, ProcessingElementInstructionConfiguration  # noqa: E402
from src.processing_element import ProcessingElement, ProcessingElementConfiguration  # noqa: E402

CFG = ProcessingElementConfiguration(INPUT_BITWIDTH=32, ACCUMULATION_BITWIDTH=64, OUTPUT_BITWIDTH=32)
ICFG = ProcessingElementInstructionConfiguration(OPCODE_BITWIDTH=2, MODE_BITWIDTH=2, VALUE_BITWIDTH=5)
MODES = {"INT8": 0, "INT16": 1, "INT32": 2}
WIDTH = {0: 8, 1: 16, 2: 32}


def lanes_of(mode):
    return 32 // WIDTH[mode]


def pack(vals, w):
    """lane values (lane 0 first = least significant) -> unsigned int"""
    x = 0
    for i, v in enumerate(vals):
        x |= (v & ((1 << w) - 1)) << (w * i)
    return x


class Gen:
    def __init__(self):
        self.pe = ProcessingElement(CFG)
        self.rows = []
        self.label = ""

    def step(self, op, mode, a=(), b=(), s=0, valid=1):
        """op: MAC NOP OUT PASS CLR RND. a, b: lane values (lane 0 first). Returns False if skipped."""
        w = WIDTH[mode]
        n = lanes_of(mode)
        A = pack(list(a) + [0] * (n - len(a)), w) if a else 0
        B = pack(list(b) + [0] * (n - len(b)), w) if b else 0
        inst = ProcessingElementInstruction(ICFG)
        if op == "RND":
            opcode, value = PEI.RND, s
        else:
            opcode, value = PEI.NO_VALUE, getattr(PEI, op)
        inst.set_opcode(opcode); inst.set_mode(mode); inst.set_value(value)
        if valid:
            self.pe.input_a(Bits(uint=A, length=32))
            self.pe.input_b(Bits(uint=B, length=32))
            try:
                self.pe.execute_instruction(inst)
            except Exception:  # the reference raises when a MAC overflows its lane: undefined, skip it
                return False
        self.rows.append((valid, opcode, mode, value, A, B,
                          self.pe.get_output().uint, self.pe.get_accumulation().uint, self.label))
        return True

    def load_acc(self, mode, targets):
        """CLR, then a few MACs that leave acc lane i exactly at targets[i] (any value that fits the acc lane).
        A target that fits in w bits takes one MAC (target x 1); a bigger one is built from +-max x k steps."""
        w = WIDTH[mode]
        hi = (1 << (w - 1)) - 1
        lo = -hi - 1
        self.step("CLR", mode)
        rest = list(targets)
        for _ in range(6):
            if not any(rest):
                return
            a, b = [], []
            for t in rest:
                if lo <= t <= hi:
                    a.append(t); b.append(1)
                else:
                    a.append(hi if t > 0 else -hi); b.append(min(hi, abs(t) // hi))
            if not self.step("MAC", mode, a, b):
                raise RuntimeError(f"load_acc overflowed for {targets}")
            rest = [t - x * y for t, x, y in zip(rest, a, b)]
        raise RuntimeError(f"load_acc did not converge for {targets}")


def directed(g):
    for name, m in MODES.items():
        w = WIDTH[m]; n = lanes_of(m); lo, hi = -(1 << (w - 1)), (1 << (w - 1)) - 1
        aw = 64 // n
        def lanes(*vals):
            return [vals[i % len(vals)] for i in range(n)]

        g.label = f"{name}: NOP after reset, then CLR"
        g.step("NOP", m); g.step("CLR", m)

        g.label = f"{name}: PASS sign-extends each Data0 (vector) lane; OUT shows it"
        g.step("PASS", m, lanes(lo, -1, 1, hi)); g.step("OUT", m)
        g.step("PASS", m, lanes(-2, hi, lo, 0), lanes(7, 7, 7, 7)); g.step("OUT", m)

        g.label = f"{name}: MAC with mixed signs, OUT, more MACs (OUT must not change acc), OUT"
        g.step("CLR", m)
        g.step("MAC", m, lanes(1, 2, 3, 4), lanes(5, -6, 7, -8))
        g.step("MAC", m, lanes(-3, -3, 2, 2), lanes(-4, 4, -1, 1))
        g.step("OUT", m)
        g.step("MAC", m, lanes(hi, lo, hi, lo), lanes(1, 1, -1, -1))
        g.step("OUT", m)
        g.step("MAC", m, lanes(lo, lo, hi, hi), lanes(lo, -1, hi, 1))
        g.step("OUT", m)

        g.label = f"{name}: OUT clamps at the limits (exactly max, max+1, min, min-1, and far beyond)"
        for t in ([hi, hi + 1, lo, lo - 1], [hi - 1, -hi, 3 * hi, 3 * lo], [hi * hi, lo * lo, -(hi * hi), 0]):
            tt = [t[i % 4] for i in range(n)]
            tt = [max(-(1 << (aw - 1)), min((1 << (aw - 1)) - 1, x)) for x in tt]
            g.load_acc(m, tt); g.step("OUT", m)

        g.label = f"{name}: only OUT and CLR change the output register (PASS, RND, MAC, NOP keep it)"
        g.step("PASS", m, lanes(9, -9, 5, -5)); g.step("OUT", m)
        g.step("PASS", m, lanes(1, 1, 1, 1)); g.step("RND", m, s=1); g.step("MAC", m, lanes(2), lanes(3)); g.step("NOP", m)
        g.step("OUT", m); g.step("CLR", m)

        g.label = f"{name}: RND ties to even (2.5->2, 3.5->4, -2.5->-2, -3.5->-4) at s=1"
        g.load_acc(m, lanes(5, 7, -5, -7)); g.step("RND", m, s=1); g.step("OUT", m)
        g.label = f"{name}: RND s=1 on +-0.5 (both -> 0) and s=2 on 1.5/-1.5/0.75/-0.75"
        g.load_acc(m, lanes(1, -1, 2, -2)); g.step("RND", m, s=1); g.step("OUT", m)
        g.load_acc(m, lanes(6, -6, 3, -3)); g.step("RND", m, s=2); g.step("OUT", m)
        g.label = f"{name}: RND s=0 changes nothing"
        g.load_acc(m, lanes(37, -37, 1, -1)); g.step("RND", m, s=0); g.step("OUT", m)
        g.label = f"{name}: RND with s at/above the lane width, and s=31"
        big = [(1 << (aw - 2)), -(1 << (aw - 2)), -(1 << (aw - 1)) + 1, (1 << (aw - 1)) - 1]
        for s in sorted({x for x in (aw // 2 - 1, aw // 2, aw - 2, aw - 1, aw, 31) if 0 <= x <= 31}):
            g.load_acc(m, lanes(*big)); g.step("RND", m, s=s); g.step("OUT", m)
        g.label = f"{name}: RND then keep accumulating"
        g.load_acc(m, lanes(10, -10, 22, -22)); g.step("RND", m, s=2); g.step("MAC", m, lanes(1, 1, 1, 1), lanes(1, 1, 1, 1))
        g.step("OUT", m)

        g.label = f"{name}: pe_inst_valid low means nothing happens, whatever the instruction"
        g.step("PASS", m, lanes(4, 3, 2, 1)); g.step("OUT", m)
        g.step("MAC", m, lanes(hi), lanes(hi), valid=0); g.step("CLR", m, valid=0); g.step("OUT", m, valid=0)
        g.step("OUT", m)


def random_section(g, rnd, count):
    ops = ["MAC"] * 35 + ["OUT"] * 15 + ["PASS"] * 10 + ["CLR"] * 8 + ["RND"] * 10 + ["NOP"] * 7 + ["INVALID"] * 5
    mode = 0
    done = 0
    while done < count:
        if rnd.random() < 0.15:
            mode = rnd.choice([0, 1, 2])
        w = WIDTH[mode]; n = lanes_of(mode); lo, hi = -(1 << (w - 1)), (1 << (w - 1)) - 1
        def val():
            r = rnd.random()
            if r < 0.5:
                return rnd.randint(-8, 8)
            if r < 0.8:
                return rnd.randint(-(1 << (w // 2)), 1 << (w // 2))
            return rnd.randint(lo, hi)
        op = rnd.choice(ops)
        g.label = f"random ({['INT8', 'INT16', 'INT32'][mode]})"
        a = [val() for _ in range(n)]; b = [val() for _ in range(n)]
        if op == "INVALID":
            ok = g.step(rnd.choice(["MAC", "OUT", "PASS", "CLR"]), mode, a, b, valid=0)
        elif op == "RND":
            ok = g.step("RND", mode, s=rnd.choice([0, 1, 1, 2, 3, 4, 7, 8, 15, 16, 31, rnd.randint(0, 31)]))
        else:
            ok = g.step(op, mode, a, b)
        if not ok:  # overflow: start the lane over
            g.step("CLR", mode)
        done += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir"); ap.add_argument("--seed", type=int, default=1); ap.add_argument("--random", type=int, default=1500)
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    g = Gen()
    directed(g)
    random_section(g, random.Random(a.seed), a.random)
    with open(os.path.join(a.outdir, "vectors.txt"), "w") as f:
        for valid, opcode, mode, value, A, B, *_ in g.rows:
            f.write(f"{valid:x} {opcode:x} {mode:x} {value:x} {A:08x} {B:08x}\n")
    with open(os.path.join(a.outdir, "expected.txt"), "w") as f:
        for *_, out, acc, _l in g.rows:
            f.write(f"{out:08x} {acc:016x}\n")
    with open(os.path.join(a.outdir, "labels.txt"), "w") as f:
        for row in g.rows:
            f.write(row[-1] + "\n")
    print(f"{len(g.rows)} steps written to {a.outdir}")


if __name__ == "__main__":
    main()
