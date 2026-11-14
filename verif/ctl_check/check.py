#!/usr/bin/env python3
"""Check a controller trace against the program, repetition by repetition.

  check.py PROGRAM.asm INST.bits INST_COUNT TRACE.txt

Every instruction runs count+1 times (the assembler stores written count - 1). Repetition r of an instruction must
show up on the buffer port as (opcode, mode, MemAOffset + r*incA, MemBOffset + r*incB), in program order, and its PE
instruction on the PE port, also in order. Fields that don't matter are not compared (offsets and mode of a memory
NOP, MemBOffset and mode of a WRITE). The PE port may lag the buffer port by any constant number of cycles; the check
reports the lag it sees, plus any idle cycles between repetitions ("bubbles"), which cost Part 3 FoM.
INST_COUNT includes the all-zero padding word, which decodes as READ INT8 0 0 | MAC INT8 with count 0.
"""
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "part2", "simulator"))
from bitstring import Bits  # noqa: E402
from src.compiler import generate_accelerator_and_instruction_configuration  # noqa: E402
from src.instruction import Instruction  # noqa: E402

MEMOP = {0: "READ", 1: "WRITE", 2: "NOP"}
MODE = {0: "INT8", 1: "INT16", 2: "INT32"}
PEOP = {(0, 0): "MAC", (0, 1): "NOP", (0, 2): "OUT", (0, 3): "PASS", (0, 4): "CLR"}


def pe_name(op, mode, val):
    n = f"RND {MODE.get(mode, mode)} {val}" if op == 1 else f"{PEOP.get((op, val), f'op{op}/v{val}')} {MODE.get(mode, mode)}"
    return n


def mem_name(op, mode, a, b):
    o = MEMOP.get(op, f"op{op}")
    return {"READ": f"READ {MODE.get(mode, mode)} {a} {b}", "WRITE": f"WRITE {a}"}.get(o, o)


def main():
    asm, bits, n_inst, trace = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
    _, icfg = generate_accelerator_and_instruction_configuration(processing_element_count=16, controller_counter_bitwidth=16)
    src = [l.strip() for l in open(asm) if l.strip()] + ["(all-zero padding word)"] * 8
    words = [l.strip() for l in open(bits)][:n_inst]
    exp_mem, exp_pe, where = [], [], []
    for i, wbits in enumerate(words):
        inst = Instruction(icfg); inst.set_instruction(Bits(bin=wbits))
        mi, pi = inst.get_mem_instruction(), inst.get_pe_instruction()
        for r in range(inst.get_count().uint + 1):
            a = (mi.get_mema_offset().uint + r * inst.get_mema_inc().uint) & 0xFFFF
            b = (mi.get_memb_offset().uint + r * inst.get_memb_inc().uint) & 0xFFFF
            exp_mem.append((mi.get_opcode().uint, mi.get_mode().uint, a, b))
            exp_pe.append((pi.get_opcode().uint, pi.get_mode().uint, pi.get_value().uint))
            where.append(f"instruction {i} '{src[i]}', repetition {r}")

    rows = []
    for line in open(trace):
        if line.startswith("#") or not line.strip():
            continue
        f = line.split()
        rows.append([int(x) if x.lstrip("-").isdigit() else None for x in f])
    if any(None in r[1:2] + r[6:7] for r in rows):
        print("  x/z on buf_inst_valid or pe_inst_valid: reset them (and the FSM state) in the reset branch.")
    got_mem = [(r[0], tuple(r[2:6])) for r in rows if r[1] == 1]
    got_pe = [(r[0], tuple(r[7:10])) for r in rows if r[6] == 1]
    begins = sum(1 for r in rows if r[10] == 1)

    ok = True
    def same_mem(e, g):
        if None in g: return False
        if e[0] != g[0]: return False
        if e[0] == 0: return e == g                      # READ: everything matters
        if e[0] == 1: return e[2] == g[2]                # WRITE: MemAOffset only
        return True                                      # NOP
    for k, e in enumerate(exp_mem):
        if k >= len(got_mem):
            print(f"  MISSING buffer instructions: only {len(got_mem)} of {len(exp_mem)} issued; next expected: "
                  f"{mem_name(*e)} ({where[k]})"); ok = False; break
        if not same_mem(e, got_mem[k][1]):
            print(f"  WRONG buffer instruction #{k} at cycle {got_mem[k][0]}: expected {mem_name(*e)}, got "
                  f"{mem_name(*got_mem[k][1]) if None not in got_mem[k][1] else got_mem[k][1]}   ({where[k]})"); ok = False; break
    if ok and len(got_mem) > len(exp_mem):
        print(f"  EXTRA buffer instructions: {len(got_mem) - len(exp_mem)} more than the program has "
              f"(first extra at cycle {got_mem[len(exp_mem)][0]}: {got_mem[len(exp_mem)][1]})"); ok = False
    pe_ok = True
    for k, e in enumerate(exp_pe):
        if k >= len(got_pe):
            print(f"  MISSING PE instructions: only {len(got_pe)} of {len(exp_pe)} issued; next expected {pe_name(*e)} ({where[k]})")
            pe_ok = False; break
        if got_pe[k][1] != e:
            print(f"  WRONG PE instruction #{k} at cycle {got_pe[k][0]}: expected {pe_name(*e)}, got "
                  f"{pe_name(*got_pe[k][1]) if None not in got_pe[k][1] else got_pe[k][1]}   ({where[k]})"); pe_ok = False; break
    if pe_ok and len(got_pe) > len(exp_pe):
        print(f"  EXTRA PE instructions: {len(got_pe) - len(exp_pe)} more than the program has"); pe_ok = False
    ok = ok and pe_ok

    n = min(len(got_mem), len(got_pe), len(exp_mem))
    lags = sorted({got_pe[k][0] - got_mem[k][0] for k in range(n)})
    if got_mem:
        span = got_mem[-1][0] - got_mem[0][0] + 1
        bubbles = span - len(got_mem)
        first = got_mem[0][0]
    else:
        bubbles = first = None
    if begins != n_inst:
        print(f"  inst_exec_begins was high in {begins} cycle(s); expected exactly one per instruction ({n_inst}).")
        ok = False
    status = "PASS" if ok else "FAIL"
    lag = (f"PE port lags the buffer port by {lags[0]} cycle(s)" if len(lags) == 1 else
           f"PE-port lag VARIES ({lags}): a PE would see another repetition's data" if lags else "no lag measured")
    if len(lags) > 1:
        status = "FAIL"
    if not got_mem:
        print(f"{status}: nothing was ever issued (buf_inst_valid never 1) for {len(exp_mem)} expected repetitions.")
    else:
        print(f"{status}: {len(exp_mem)} repetitions from {n_inst} instruction words; {lag}; "
              f"{bubbles} bubble cycle(s); first issue {first} cycle(s) after reset.")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
