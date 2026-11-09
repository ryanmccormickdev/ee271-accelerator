#!/usr/bin/env python3
"""A guided tour of what the accelerator is asked to do, on a problem small enough to read.

    make tour                                   # 6x3 matrix, INT16, 2 PEs
    make tour ARGS="--rows 8 --cols 5 --mode INT8 --pes 2 --seed 7"
    make tour ARGS="--trace"                    # also print every PE's state after each instruction

This file is NOT part of the submission. It only *uses* the starter code (compiler.py,
assembler.py, instruction.py) to show you the memory images and the program, then runs
YOUR Accelerator on the same tiny problem so you can debug on something readable instead
of the 768x64 public test.
"""
import argparse
import os
import sys
import traceback

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "part1"))

from bitstring import Bits  # noqa: E402
from src.accelerator import Accelerator  # noqa: E402
from src.assembler import Assembler  # noqa: E402
from src.compiler import (  # noqa: E402
    compile_matrix_vector_multiplication,
    extract_results_from_memory,
    generate_accelerator_and_instruction_configuration,
)
from src.instruction import MI, PEI, Mode  # noqa: E402

COUNTER_BITS = 8  # small memories (256 entries) so everything prints; the real tests use 16
BOLD, DIM, RESET = ("\033[1m", "\033[2m", "\033[0m") if sys.stdout.isatty() else ("", "", "")

MEM_OPS = {MI.READ: "READ", MI.WRITE: "WRITE", MI.NOP: "NOP"}
PE_SUBOPS = {PEI.MAC: "MAC", PEI.NOP: "NOP", PEI.OUT: "OUT", PEI.PASS: "PASS", PEI.CLR: "CLR"}


def header(title):
    print(f"\n{BOLD}{'=' * 78}\n{title}\n{'=' * 78}{RESET}")


def split_fields(bits, widths):
    """'1000000...' -> '10 00 00000000 00000000' using the given field widths."""
    out, i = [], 0
    for w in widths:
        out.append(bits[i:i + w])
        i += w
    return " ".join(out)


def show_lanes(word, lane_bits, labels=None):
    """Print a word as its lanes, written the way the bits are written: most significant
    lane on the LEFT, lane 0 (least significant) on the RIGHT."""
    pieces = word.cut(lane_bits)            # bitstring cuts from the left (MSB) end
    pieces = list(pieces)
    n = len(pieces)
    out = []
    for i, p in enumerate(pieces):
        lane = n - 1 - i
        tag = f"{labels[i]}=" if labels and labels[i] else ""
        out.append(f"lane{lane}: {tag}{p.int}")
    return "[ " + " | ".join(out) + " ]"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rows", type=int, default=6)
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--mode", choices=["INT8", "INT16", "INT32"], default="INT16")
    ap.add_argument("--pes", type=int, default=2, help="number of processing elements")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--trace", action="store_true", help="print PE state after every instruction")
    args = ap.parse_args()

    width = Mode.STR_TO_BITWIDTH_DICT[args.mode][0]
    lanes_per_word = 32 // width
    rows_per_pass = args.pes * lanes_per_word
    passes = -(-args.rows // rows_per_pass)
    if args.cols > 2 ** COUNTER_BITS - 1 or passes * args.cols > 2 ** COUNTER_BITS:
        sys.exit("Problem too big for the tour's small memories; use fewer rows/cols.")

    # ------------------------------------------------------------------ 1. the math
    rng = np.random.RandomState(args.seed)
    matrix = rng.randint(-5, 5, size=(args.rows, args.cols))
    vector = rng.randint(-5, 5, size=(args.cols, 1))
    gold = (matrix @ vector).flatten()

    header("1. The math problem: y = M @ v")
    print("M =\n" + "\n".join("   " + " ".join(f"{x:3d}" for x in row) for row in matrix))
    print("v = " + " ".join(f"{x:3d}" for x in vector.flatten()))
    print("y = " + " ".join(f"{x:3d}" for x in gold) + f"   {DIM}(numpy's answer; your accelerator must match it){RESET}")

    # ------------------------------------------------------------------ 2. the machine
    accel_cfg, inst_cfg = generate_accelerator_and_instruction_configuration(
        processing_element_count=args.pes,
        processing_element_accumulation_bitwidth=64,
        controller_counter_bitwidth=COUNTER_BITS,
    )
    pe, buf = accel_cfg.PE_CONFIG, accel_cfg.BUFFER_CONFIG
    header("2. The machine these tests build (AcceleratorConfiguration)")
    print(f"PE_COUNT = {accel_cfg.PE_COUNT} processing elements")
    print(f"each PE: inputs {pe.INPUT_BITWIDTH} bits, accumulator {pe.ACCUMULATION_BITWIDTH} bits, output {pe.OUTPUT_BITWIDTH} bits")
    print(f"MEM0: {buf.MEM0_DEPTH} entries x {buf.MEM0_BITWIDTH} bits  (one {pe.INPUT_BITWIDTH}-bit word per PE)")
    print(f"MEM1: {buf.MEM1_DEPTH} entries x {buf.MEM1_BITWIDTH} bits  (one word, the same for every PE)")
    print(f"MEM2: {buf.MEM2_DEPTH} entries x {buf.MEM2_BITWIDTH} bits  (one {pe.OUTPUT_BITWIDTH}-bit output word per PE)")
    print(f"\nIn {args.mode} mode a 32-bit word holds {lanes_per_word} lane(s) of {width} bits,")
    print(f"so one pass covers {args.pes} PEs x {lanes_per_word} lanes = {rows_per_pass} rows of M. "
          f"{args.rows} rows -> {passes} pass(es), extra rows padded with 0.")

    # ------------------------------------------------------------------ 3. memory images
    mem0, mem1, program, n_out = compile_matrix_vector_multiplication(matrix, vector, accel_cfg, width)

    header("3. What compiler.py loads into memory before the program runs")
    print(f"{DIM}Words are printed MSB-first, like the bits are written: word 0 = leftmost 32 bits of the")
    print(f"entry, and inside a word lane 0 is the RIGHTMOST (least significant) lane.{RESET}\n")
    print("MEM0 (matrix columns, packed across PEs):")
    for p in range(passes):
        for c in range(args.cols):
            addr = p * args.cols + c
            words = mem0[addr].cut(pe.INPUT_BITWIDTH)
            row = p * rows_per_pass
            parts = []
            for k, w in enumerate(words):
                labels = [f"M[{r}][{c}]" if r < args.rows else "pad"
                          for r in range(row + k * lanes_per_word, row + (k + 1) * lanes_per_word)]
                parts.append(f"word{k} {show_lanes(w, width, labels)}")
            print(f"  addr {addr:3d}: " + "   ".join(parts))
    print("\nMEM1 (the vector):")
    for a in range(-(-args.cols // lanes_per_word)):
        labels = []
        for lane in reversed(range(lanes_per_word)):
            j = a * lanes_per_word + lane
            labels.append(f"v[{j}]" if j < args.cols else "pad")
        print(f"  addr {a:3d}: {show_lanes(mem1[a], width, labels)}")
    print(f"\n{DIM}Question to answer for main_buffer.py: in the program below, MAC step c uses MemBOffset = c.")
    print(f"Find v[c] above. Which address and which lane is it in? That's what READ's offset bits must select.{RESET}")

    # ------------------------------------------------------------------ 4. the program
    header("4. The program (assembly from compiler.py, decoded by assembler.py)")
    asm = Assembler(inst_cfg)
    insts = asm.assemble_instructions(program)
    for i, (text, inst) in enumerate(zip(program, insts)):
        m, p_ = inst.get_mem_instruction(), inst.get_pe_instruction()
        m_op = MEM_OPS.get(m.get_opcode().uint, "?")
        p_op_field, p_val = p_.get_opcode().uint, p_.get_value().uint
        if p_op_field == PEI.NO_VALUE:
            p_desc = f"opcode=0 -> the Value field ({p_val}) picks the op: {PE_SUBOPS.get(p_val, '?')}"
        else:
            p_desc = f"opcode={p_op_field} -> RND, Value field = shift s = {p_val}"
        count = inst.get_count().uint
        a_inc, b_inc = inst.get_mema_inc().uint, inst.get_memb_inc().uint
        bits = inst.get_instruction().bin
        mw, pw = m.get_width(), p_.get_width()
        cb = inst_cfg.COUNT_BITWIDTH
        print(f"\n[{i}] {BOLD}{text}{RESET}")
        m_mode = f"mode={Mode.bitwidth(m.get_mode().uint)}-bit" if m_op == "READ" else "(mode unused)"
        print(f"    memory : {m_op:5s} {m_mode}  "
              f"MemAOffset={m.get_mema_offset().uint}  MemBOffset={m.get_memb_offset().uint}")
        print(f"    PE     : {p_desc}  (mode {Mode.bitwidth(p_.get_mode().uint)}-bit)")
        print(f"    control: Count={count} (so it runs Count+1 = {count + 1} time(s)), "
              f"MemAIncrement={a_inc}, MemBIncrement={b_inc}")
        mc, pc = inst_cfg.MEMORY_INST_CONFIG, inst_cfg.PE_INST_CONFIG
        mem_bits = split_fields(bits[:mw], [mc.OPCODE_BITWIDTH, mc.MODE_BITWIDTH,
                                            mc.MEMA_OFFSET_BITWIDTH, mc.MEMB_OFFSET_BITWIDTH])
        pe_bits = split_fields(bits[mw:mw + pw], [pc.OPCODE_BITWIDTH, pc.MODE_BITWIDTH, pc.VALUE_BITWIDTH])
        print(f"    {DIM}raw bits: {mem_bits} | {pe_bits} | {bits[mw + pw:mw + pw + cb]} | "
              f"{bits[mw + pw + cb]} | {bits[mw + pw + cb + 1]}")
        print(f"              (mem: op mode A B | PE: op mode value | count | incA | incB){RESET}")
        if count > 0:
            steps = ", ".join(f"(A={m.get_mema_offset().uint + s * a_inc}, B={m.get_memb_offset().uint + s * b_inc})"
                              for s in range(min(count + 1, 6)))
            more = " ..." if count + 1 > 6 else ""
            print(f"    repeats: {steps}{more}")

    # ------------------------------------------------------------------ 5. expected result
    header("5. What MEM2 should hold when the program finishes")
    out_lanes = pe.OUTPUT_BITWIDTH // width
    per_entry = args.pes * out_lanes
    n_entries = -(-n_out // per_entry)
    for e in range(n_entries):
        vals = []
        for r in range(e * per_entry, (e + 1) * per_entry):
            vals.append(f"y[{r}]={gold[r]}" if r < n_out else "pad")
        print(f"  addr {e:3d}: " + "  ".join(vals) + f"   {DIM}(MSB-first){RESET}")
    print(f"{DIM}extract_results_from_memory() reads these entries left to right to rebuild y.{RESET}")

    # ------------------------------------------------------------------ 6. run YOUR accelerator
    header("6. Running YOUR Accelerator (src/accelerator.py) on this program")
    accel = Accelerator(accel_cfg)
    accel.set_memory(mem0, mem1)
    try:
        for i, inst in enumerate(insts):
            accel.execute_instruction(inst)
            if args.trace:
                print(f"\nafter [{i}] {program[i]}")
                acc_lane = pe.ACCUMULATION_BITWIDTH // lanes_per_word
                for k, unit in enumerate(accel._pe_array):
                    print(f"   PE{k}: acc {show_lanes(unit.get_accumulation(), acc_lane)}   "
                          f"out {show_lanes(unit.get_output(), width)}")
    except Exception:
        print("Your accelerator raised an error (this is normal before you've written it):\n")
        traceback.print_exc()
        return 1

    got = extract_results_from_memory(accel.get_mem2(), n_out, accel_cfg, width)
    print("expected y = " + " ".join(f"{x:3d}" for x in gold))
    print("your     y = " + " ".join(f"{x:3d}" for x in got))
    if np.array_equal(got, gold):
        print(f"{BOLD}MATCH{RESET}. Try other sizes/modes, then run: make test")
        return 0
    print("Not matching yet. Unimplemented code leaves MEM2 all zeros. Use --trace to watch each step.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
