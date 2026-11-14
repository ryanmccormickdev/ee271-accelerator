#!/usr/bin/env python3
"""Vectors for the buffer unit test (4 PEs, so MEM0 and MEM2 words are 128 bits).

  gen.py OUTDIR [--seed 1] [--random 300]

Writes mem0.bits / mem1.bits (memory images), vectors.txt (one cycle per line, hex:
  valid opcode mode mema_offset memb_offset output_data) and expected.txt (for every valid READ: step, the expected
matrix_data and vector_data, computed by the staff's MainBuffer model). WRITE checking happens in check.py.
Directed part: every lane of every mode, back-to-back reads, mode changes between reads, a READ followed by a NOP or
WRITE (whose mode field is 0 = INT8: the lane select must use the mode/offset registered from the READ cycle),
back-to-back WRITEs, two WRITEs to one address, and valid low. Then random traffic.
"""
import argparse
import os
import random
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "part2", "simulator"))
from bitstring import Bits  # noqa: E402
from src.instruction import MemoryInstruction, MemoryInstructionConfiguration  # noqa: E402
from src.main_buffer import MainBuffer, MainBufferConfiguration  # noqa: E402

P = 4
W0, W1, W2 = 32 * P, 32, 32 * P
D0, D1, D2 = 1 << 16, 1 << 14, 1 << 16
READ, WRITE, NOP = 0, 1, 2
MCFG = MemoryInstructionConfiguration(OPCODE_BITWIDTH=2, MODE_BITWIDTH=2, MEMA_OFFSET_BITWIDTH=16, MEMB_OFFSET_BITWIDTH=16)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir"); ap.add_argument("--seed", type=int, default=1); ap.add_argument("--random", type=int, default=300)
    a = ap.parse_args()
    rnd = random.Random(a.seed)
    os.makedirs(a.outdir, exist_ok=True)
    used = 512
    mem0 = [rnd.getrandbits(W0) if i < used else 0 for i in range(D0)]
    mem1 = [rnd.getrandbits(W1) if i < used else 0 for i in range(D1)]
    with open(os.path.join(a.outdir, "mem0.bits"), "w") as f:
        f.writelines(f"{x:0{W0}b}\n" for x in mem0)
    with open(os.path.join(a.outdir, "mem1.bits"), "w") as f:
        f.writelines(f"{x:0{W1}b}\n" for x in mem1)

    steps = []   # (valid, op, mode, a, b)
    def s(op, mode=0, ma=0, mb=0, valid=1):
        steps.append((valid, op, mode, ma, mb))
    # directed
    s(NOP); s(READ, 2, 3, 5); s(READ, 2, 4, 6)                                  # INT32, back to back
    for b in (10, 11, 12, 13): s(READ, 1, 20 + b, b)                            # INT16, both halves
    for b in (20, 21, 22, 23, 24): s(READ, 0, 40 + b, b)                        # INT8, all four bytes
    s(READ, 1, 7, 31); s(NOP)                                                   # INT16 READ then NOP (mode field 0)
    s(READ, 2, 8, 9); s(WRITE, 0, 5); s(NOP)                                    # READ then WRITE
    s(READ, 0, 1, 43); s(READ, 1, 2, 41); s(READ, 2, 3, 42); s(READ, 0, 4, 40)  # mode changes back to back
    s(READ, 1, 9, 33); s(READ, 1, 9, 33)                                        # same address twice
    s(WRITE, 0, 1); s(NOP); s(WRITE, 0, 2); s(WRITE, 0, 3)                      # spaced and back-to-back writes
    s(WRITE, 0, 6); s(WRITE, 0, 6)                                              # same address twice: last one wins
    s(READ, 2, 11, 12, valid=0); s(WRITE, 0, 7, valid=0); s(NOP)                # valid low: nothing happens
    s(READ, 0, 12, 50); s(WRITE, 0, 8); s(READ, 1, 13, 51); s(WRITE, 0, 9)      # interleaved
    # random
    for _ in range(a.random):
        r = rnd.random()
        if r < 0.6:
            # any MemBOffset < used keeps the MEM1 word address (offset >> 0, 1 or 2) inside the initialised region
            s(READ, rnd.choice([0, 1, 2]), rnd.randrange(used), rnd.randrange(used))
        elif r < 0.8:
            s(WRITE, 0, rnd.randrange(used))
        else:
            s(NOP)
    for _ in range(4):
        s(NOP)

    outdata = [rnd.getrandbits(W2) for _ in range(len(steps) + 8)]
    buf = MainBuffer(MainBufferConfiguration(W0, D0, W1, D1, W2, D2))
    buf.set_mem0_bits([Bits(uint=x, length=W0) for x in mem0])
    buf.set_mem1_bits([Bits(uint=x, length=W1) for x in mem1])
    with open(os.path.join(a.outdir, "vectors.txt"), "w") as fv, open(os.path.join(a.outdir, "expected.txt"), "w") as fe:
        for i, (valid, op, mode, ma, mb) in enumerate(steps):
            fv.write(f"{valid:x} {op:x} {mode:x} {ma:x} {mb:x} {outdata[i]:032x}\n")
            if valid and op == READ:
                mi = MemoryInstruction(MCFG)
                mi.set_opcode(READ); mi.set_mode(mode); mi.set_mema_offset(ma); mi.set_memb_offset(mb)
                buf.execute_instruction(mi)
                fe.write(f"{i} {buf.read_mem0_output().uint:032x} {buf.read_mem1_output().uint:08x}\n")
    print(f"{len(steps)} cycles of buffer traffic written to {a.outdir}")


if __name__ == "__main__":
    main()
