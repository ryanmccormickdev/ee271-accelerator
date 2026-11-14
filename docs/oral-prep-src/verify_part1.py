"""Re-check every number quoted in docs/oral-prep/part1.md by running the real Python.

Run from the repo root with the Part 1 environment (it has bitstring and numpy):

    part1/ee271-conda-env/bin/python docs/oral-prep-src/verify_part1.py

It imports OUR Part 1 code (part1/src) and the staff's reference simulator (part2/simulator/src,
loaded under the package name "staff" so the two `src` packages don't collide). It only reads
files. Each check names the question it backs. Exit status = number of failed checks, so a change
to part1/src that alters a quoted value shows up here. Takes about half a minute (most of it is
compiling the 1024 x 1024 INT8 equivalence-test program).
"""
import importlib
import importlib.util
import os
import sys

sys.dont_write_bytecode = True      # read-only: never leave __pycache__ files in part1/ or part2/

import numpy as np
from bitstring import Bits

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, "part1"))

from src.accelerator import Accelerator  # noqa: E402  (ours)
from src.assembler import Assembler  # noqa: E402
from src.compiler import (compile_matrix_vector_multiplication, extract_results_from_memory,  # noqa: E402
                          generate_accelerator_and_instruction_configuration)
from src.instruction import Instruction, ProcessingElementInstruction  # noqa: E402
from src.main_buffer import MainBuffer, MainBufferConfiguration  # noqa: E402
from src.processing_element import ProcessingElement, ProcessingElementConfiguration  # noqa: E402


def load_staff():
    d = os.path.join(REPO, "part2", "simulator", "src")
    spec = importlib.util.spec_from_file_location("staff", os.path.join(d, "__init__.py"), submodule_search_locations=[d])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules["staff"] = pkg
    spec.loader.exec_module(pkg)
    return {n: importlib.import_module("staff." + n) for n in ("processing_element", "main_buffer", "accelerator")}


STAFF = load_staff()
StaffPE = STAFF["processing_element"].ProcessingElement
StaffBuffer = STAFF["main_buffer"].MainBuffer
StaffAccel = STAFF["accelerator"].Accelerator

FAILS = []


def check(label, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'}  {label}: {got!r}" + ("" if ok else f"   (expected {want!r})"))
    if not ok:
        FAILS.append(label)


def raises(fn):
    """Run fn(); return the exception's class name, or None if nothing was raised. Any ValueError
    subclass counts as "ValueError": bitstring 4 calls it CreationError, bitstring 5 raises ValueError."""
    try:
        fn()
    except ValueError:
        return "ValueError"
    except Exception as e:  # noqa: BLE001  (we want to see whatever the code raises)
        return type(e).__name__
    return None


# ------------------------------------------------------------------ shared helpers
_, INST = generate_accelerator_and_instruction_configuration(processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
ASM = Assembler(INST)
PECFG = ProcessingElementConfiguration(INPUT_BITWIDTH=32, ACCUMULATION_BITWIDTH=64, OUTPUT_BITWIDTH=32)


def pack(vals, w):
    """vals[0] is the MOST significant lane, the convention the public tests use."""
    return Bits().join([Bits(int=v, length=w) for v in vals])


def lanes(bits, w):
    return [x.int for x in bits.cut(w)]


def run_pe(cls, steps):
    """steps: ("A", Bits) / ("B", Bits) / assembly text such as "MAC INT8" or "RND INT16 2"."""
    pe = cls(PECFG)
    for s in steps:
        if isinstance(s, tuple):
            (pe.input_a if s[0] == "A" else pe.input_b)(s[1])
        else:
            pe.execute_instruction(ASM.convert_pe_instruction(s))
    return pe


def raw_pe_inst(opcode, mode, value):
    i = ProcessingElementInstruction(INST.PE_INST_CONFIG)
    i.set_opcode(opcode)
    i.set_mode(mode)
    i.set_value(value)
    return i


print("== Processing element")
# Q: "Walk me through a MAC in INT8 mode"
for name, cls in (("ours", ProcessingElement), ("staff", StaffPE)):
    pe = run_pe(cls, [("A", pack([3, -4, 5, -6], 8)), ("B", pack([7, 8, -9, 10], 8)), "MAC INT8"])
    check(f"MAC INT8 acc lanes ({name})", lanes(pe.get_accumulation(), 16), [21, -32, -45, -60])
check("MAC INT8 acc hex", pe.get_accumulation().hex, "0015ffe0ffd3ffc4")
pe = run_pe(ProcessingElement, [("A", pack([3, -4, 5, -6], 8)), ("B", pack([7, 8, -9, 10], 8)), "MAC INT8", "MAC INT8"])
check("two MACs double it", lanes(pe.get_accumulation(), 16), [42, -64, -90, -120])

# Q: "Can a single product overflow the accumulator lane?"  max |product| of two w-bit signed values is 2^(2w-2)
for w in (8, 16, 32):
    check(f"(-2^{w-1})^2 fits a signed {2*w}-bit lane", (2 ** (w - 1)) ** 2 <= 2 ** (2 * w - 1) - 1, True)

# Q: "What does your MAC do when an INT8 accumulator lane overflows?"
m128 = pack([-128] * 4, 8)
pe = run_pe(ProcessingElement, [("A", m128), ("B", m128), "MAC INT8"])
check("one MAC of -128*-128", lanes(pe.get_accumulation(), 16), [16384] * 4)
pe = run_pe(ProcessingElement, [("A", m128), ("B", m128), "MAC INT8", "OUT INT8"])
check("OUT after one MAC", pe.get_output().hex, "7f7f7f7f")
pe = run_pe(ProcessingElement, [("A", m128), ("B", m128), "MAC INT8", "MAC INT8"])
check("ours: second MAC wraps 32768 to", lanes(pe.get_accumulation(), 16), [-32768] * 4)
pe.execute_instruction(ASM.convert_pe_instruction("OUT INT8"))
check("ours: OUT of the wrapped lane", pe.get_output().hex, "80808080")
check("staff: second MAC raises", raises(lambda: run_pe(StaffPE, [("A", m128), ("B", m128), "MAC INT8", "MAC INT8"])), "ValueError")
check("python % maps -60 into 0..65535", (-60) % (1 << 16), 65476)
check("...and Bits(uint=65476,16).int", Bits(uint=65476, length=16).int, -60)

# Q: "Show me OUT clamping in INT8"
pe = run_pe(ProcessingElement, [("A", pack([15, -15, 127, -3], 8)), ("B", pack([20, 20, 1, 43], 8)), "MAC INT8", "OUT INT8"])
check("acc before/after OUT", lanes(pe.get_accumulation(), 16), [300, -300, 127, -129])
check("OUT INT8 lanes", lanes(pe.get_output(), 8), [127, -128, 127, -128])
check("OUT INT8 hex", pe.get_output().hex, "7f807f80")

# Q: the public INT16 / INT32 OUT examples
pe = run_pe(ProcessingElement, [("A", pack([-20000, 20000], 16)), ("B", pack([2, 2], 16)), "MAC INT16", "OUT INT16"])
check("INT16 acc", lanes(pe.get_accumulation(), 32), [-40000, 40000])
check("INT16 OUT hex", pe.get_output().hex, "80007fff")
pe = run_pe(ProcessingElement, [("A", Bits(int=1073741824, length=32)), ("B", Bits(int=2, length=32)), "MAC INT32", "OUT INT32"])
check("INT32 acc", pe.get_accumulation().int, 2147483648)
check("INT32 OUT hex", pe.get_output().hex, "7fffffff")

# Q: "What does PASS do, exactly?"
pe = run_pe(ProcessingElement, [("A", pack([-15, 7], 16)), "PASS INT16"])
check("PASS INT16 acc hex", pe.get_accumulation().hex, "fffffff100000007")
check("PASS leaves out alone", pe.get_output().hex, "00000000")
pe.execute_instruction(ASM.convert_pe_instruction("OUT INT16"))
check("then OUT", pe.get_output().hex, "fff10007")
pe = run_pe(ProcessingElement, [("A", Bits(hex="7f80fd03")), ("B", Bits(hex="01010101")), "PASS INT8"])
check("PASS INT8 sign-extends each byte", pe.get_accumulation().hex, "007fff80fffd0003")
pe = run_pe(ProcessingElement, [("A", Bits(int=-1, length=32)), "PASS INT32"])
check("PASS INT32 of -1 fills 64 bits with ones", pe.get_accumulation().hex, "f" * 16)
pe = run_pe(ProcessingElement, [("A", pack([1, 2], 16)), ("B", pack([9, 9], 16)), "PASS INT16"])
check("PASS reads A, not B", lanes(pe.get_accumulation(), 32), [1, 2])

# Q: CLR
pe = run_pe(ProcessingElement, [("A", pack([5, 5], 16)), ("B", pack([5, 5], 16)), "MAC INT16", "OUT INT16", "CLR INT16"])
check("CLR zeroes acc", pe.get_accumulation().hex, "0" * 16)
check("CLR zeroes out", pe.get_output().hex, "0" * 8)

# Q: RND, ties to even
pe = run_pe(ProcessingElement, [("A", pack([5, -5, 3, -3], 8)), "PASS INT8", "RND INT8 1"])
check("RND INT8 s=1 on [5,-5,3,-3]", lanes(pe.get_accumulation(), 16), [2, -2, 2, -2])
check("RND leaves out alone", pe.get_output().hex, "00000000")
pe.execute_instruction(ASM.convert_pe_instruction("OUT INT8"))
check("then OUT", pe.get_output().hex, "02fe02fe")
pe = run_pe(ProcessingElement, [("A", pack([7, -7, 5, -5], 8)), "PASS INT8", "RND INT8 2"])
check("RND INT8 s=2 on [7,-7,5,-5]", lanes(pe.get_accumulation(), 16), [2, -2, 1, -1])
pe = run_pe(ProcessingElement, [("A", pack([-6, -10], 16)), "PASS INT16", "RND INT16 2"])
check("RND INT16 s=2 on [-6,-10]", lanes(pe.get_accumulation(), 32), [-2, -2])
pe = run_pe(ProcessingElement, [("A", pack([5, -5, 3, -3], 8)), "PASS INT8", "RND INT8 0"])
check("RND s=0 changes nothing", lanes(pe.get_accumulation(), 16), [5, -5, 3, -3])
for acc_in, want in ((3 * 2 ** 30, 2), (2 ** 30, 0)):
    pe = run_pe(ProcessingElement, [("A", Bits(int=acc_in // 2, length=32)), ("B", Bits(int=2, length=32)), "MAC INT32", "RND INT32 31"])
    check(f"RND INT32 s=31 on {acc_in}", pe.get_accumulation().int, want)
check("-5 >> 1 (floor)", -5 >> 1, -3)
check("remainder of -5 after floor-dividing by 2", -5 - ((-5 >> 1) << 1), 1)
check("our s != 0 guard: 1 << -1 raises", raises(lambda: 1 << (0 - 1)), "ValueError")

# Q: "Why integer arithmetic for RND, not round(x / 2**s)?"
big = 2 ** 62 + 3
for name, cls in (("ours", ProcessingElement), ("staff", StaffPE)):
    pe = run_pe(cls, [("A", Bits(int=-2 ** 31, length=32)), ("B", Bits(int=-2 ** 31, length=32)), "MAC INT32",
                      ("A", Bits(int=3, length=32)), ("B", Bits(int=1, length=32)), "MAC INT32"])
    check(f"acc = 2^62 + 3 ({name})", pe.get_accumulation().int, big)
    pe.execute_instruction(ASM.convert_pe_instruction("RND INT32 1"))
    check(f"exact RND s=1 ({name})", pe.get_accumulation().int, 2 ** 61 + 2)
check("float shortcut round(x / 2)", round(big / 2), 2 ** 61)
check("2^61 + 2", 2 ** 61 + 2, 2305843009213693954)

# Q: "What does your decoder do with an opcode or value the ISA doesn't define?"
pe = run_pe(ProcessingElement, [("A", pack([5, -5, 3, -3], 8)), "PASS INT8"])
pe.execute_instruction(raw_pe_inst(2, 0, 1))
check("ours: PE opcode 2 behaves as RND s=1", lanes(pe.get_accumulation(), 16), [2, -2, 2, -2])
pe = run_pe(ProcessingElement, [("A", pack([5, -5, 3, -3], 8)), "PASS INT8"])
pe.execute_instruction(raw_pe_inst(0, 0, 5))
check("ours: value 5 with opcode 0 is a NOP", lanes(pe.get_accumulation(), 16), [5, -5, 3, -3])
check("staff: PE opcode 2 raises", raises(lambda: StaffPE(PECFG).execute_instruction(raw_pe_inst(2, 0, 1))), "ValueError")
check("staff: value 5 raises", raises(lambda: StaffPE(PECFG).execute_instruction(raw_pe_inst(0, 0, 5))), "ValueError")
check("ours: mode 3 MAC crashes", raises(lambda: ProcessingElement(PECFG).execute_instruction(raw_pe_inst(0, 3, 0))), "ZeroDivisionError")

print("\n== Main buffer")
BCFG = MainBufferConfiguration(MEM0_BITWIDTH=64, MEM0_DEPTH=16, MEM1_BITWIDTH=32, MEM1_DEPTH=16, MEM2_BITWIDTH=64, MEM2_DEPTH=16)
mem0 = [Bits(uint=0x0101010101010101 * i, length=64) for i in range(16)]
mem1 = [Bits(uint=0, length=32) for _ in range(16)]
mem1[5] = Bits(hex="11223344")
for name, cls in (("ours", MainBuffer), ("staff", StaffBuffer)):
    mb = cls(BCFG)
    mb.set_mem0_bits(list(mem0))
    mb.set_mem1_bits(list(mem1))
    for text, want in (("READ INT32 3 5", "11223344"), ("READ INT16 3 10", "33443344"), ("READ INT16 3 11", "11221122"),
                       ("READ INT8 3 20", "44444444"), ("READ INT8 3 21", "33333333"), ("READ INT8 3 22", "22222222"),
                       ("READ INT8 3 23", "11111111")):
        mb.execute_instruction(ASM.convert_mem_instruction(text))
        check(f"{text} -> MEM1 port ({name})", mb.read_mem1_output().hex, want)
    check(f"MEM0 port = whole mem0[3] in INT8 ({name})", mb.read_mem0_output().hex, "0303030303030303")
mb = MainBuffer(BCFG)
mb.set_mem0_bits(list(mem0))
mb.set_mem1_bits(list(mem1))
mb.execute_instruction(ASM.convert_mem_instruction("READ INT16 7 11"))
mb.execute_instruction(ASM.convert_mem_instruction("NOP"))
check("NOP keeps both ports", (mb.read_mem0_output().hex, mb.read_mem1_output().hex), ("0707070707070707", "11221122"))
mb.write_mem2_input(Bits(hex="cafef00d12345678"))
mb.execute_instruction(ASM.convert_mem_instruction("WRITE 9"))
check("WRITE 9 stores the MEM2 input port", mb.read_mem2_bits()[9].hex, "cafef00d12345678")
check("WRITE carries mode 0 and MemBOffset 0", (ASM.convert_mem_instruction("WRITE 9").get_mode().uint,
                                                ASM.convert_mem_instruction("WRITE 9").get_memb_offset().uint), (0, 0))

print("\n== Compiler mapping")
cfg2, _ = generate_accelerator_and_instruction_configuration(processing_element_count=2, processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
vec = np.array([[10], [20], [30], [40], [50]])
mat = np.arange(1, 4 * 5 + 1).reshape(4, 5)
m0, m1, prog, n = compile_matrix_vector_multiplication(mat, vec, cfg2, 8)
check("MEM1[0] packs v[0..3] reversed", m1[0].hex, "281e140a")
check("MEM1[1] holds v[4] in lane 0", m1[1].hex, "00000032")
mb = MainBuffer(cfg2.BUFFER_CONFIG)
mb.set_mem0_bits(m0)
mb.set_mem1_bits(m1)
got = []
for j in range(5):
    mb.execute_instruction(ASM.convert_mem_instruction(f"READ INT8 0 {j}"))
    got.append(mb.read_mem1_output().hex)
check("READ INT8 offset j broadcasts v[j]", got, ["0a0a0a0a", "14141414", "1e1e1e1e", "28282828", "32323232"])

mat6 = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18]])
m0, m1, prog, n = compile_matrix_vector_multiplication(mat6, np.array([[1], [0], [2]]), cfg2, 16)
check("6x3 INT16 on 2 PEs: the program", prog, [
    "NOP | CLR INT16 | 1 0 0", "READ INT16 0 0 | MAC INT16 | 3 1 1", "NOP | OUT INT16 | 1 0 0", "WRITE 0 | NOP INT16 | 1 0 0",
    "NOP | CLR INT16 | 1 0 0", "READ INT16 3 0 | MAC INT16 | 3 1 1", "NOP | OUT INT16 | 1 0 0", "WRITE 1 | NOP INT16 | 1 0 0"])
check("MEM0[0] = column 0 of rows 0-3, row 0 leftmost", lanes(m0[0], 16), [1, 4, 7, 10])
check("MEM0[3] = column 0 of tile 1, padded", lanes(m0[3], 16), [13, 16, 0, 0])
check("MEM1 for INT16: [v1, v0], [pad, v2]", (lanes(m1[0], 16), lanes(m1[1], 16)), ([0, 1], [0, 2]))


def reps(program):
    return sum(i.get_count().uint + 1 for i in ASM.assemble_instructions(program))


for rows, cols, w, P, want_i, want_r in ((768, 64, 16, 64, 24, 402), (768, 64, 32, 13, 240, 4020), (64, 3, 8, 9, 8, 12),
                                         (1024, 1024, 8, 16, 64, 16432), (512, 512, 16, 16, 64, 8240), (256, 256, 32, 16, 64, 4144)):
    c, _ = generate_accelerator_and_instruction_configuration(processing_element_count=P, processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
    _, _, prog, _ = compile_matrix_vector_multiplication(np.zeros((rows, cols), dtype=np.int64), np.zeros((cols, 1), dtype=np.int64), c, w)
    check(f"{rows}x{cols} INT{w}, {P} PEs: instructions, repetitions", (len(prog), reps(prog)), (want_i, want_r))
c16, _ = generate_accelerator_and_instruction_configuration(processing_element_count=16, processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
check("16 PEs: MEM0 width/depth, MEM1 width/depth", (c16.BUFFER_CONFIG.MEM0_BITWIDTH, c16.BUFFER_CONFIG.MEM0_DEPTH,
                                                     c16.BUFFER_CONFIG.MEM1_BITWIDTH, c16.BUFFER_CONFIG.MEM1_DEPTH), (512, 65536, 32, 16384))
check("instruction width", Instruction(INST).get_width(), 63)
check("memory / PE part widths", (INST.MEMORY_INST_CONFIG.get_width(), INST.PE_INST_CONFIG.get_width()), (36, 9))
z = Instruction(INST)
z.set_instruction(Bits(uint=0, length=63))
check("all-zero word decodes as READ INT8 0 0 | MAC INT8 | count 0",
      (z.get_mem_instruction().get_opcode().uint, z.get_mem_instruction().get_mode().uint, z.get_pe_instruction().get_opcode().uint,
       z.get_pe_instruction().get_value().uint, z.get_count().uint), (0, 0, 0, 0, 0))
check("assembler: written count 0 is rejected", raises(lambda: ASM.convert_instruction("NOP | NOP INT8 | 0 0 0")), "ValueError")

print("\n== Controller")


def run_accel(cls, matrix, vector, w, P, program=None):
    c, _ = generate_accelerator_and_instruction_configuration(processing_element_count=P, processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
    m0, m1, prog, n = compile_matrix_vector_multiplication(matrix, vector, c, w)
    acc = cls(c)
    acc.set_memory(m0, m1)
    acc.execute_instructions(ASM.assemble_instructions(program or prog))
    return acc, extract_results_from_memory(acc.get_mem2(), n, c, w), c


rng = np.random.default_rng(7)
M = rng.integers(-100, 100, size=(10, 5))
v = rng.integers(-100, 100, size=(5, 1))
want = np.clip((M @ v).flatten(), -128, 127)
for name, cls in (("ours", Accelerator), ("staff", StaffAccel)):
    _, y, _ = run_accel(cls, M, v, 8, 2)
    check(f"10x5 INT8 on 2 PEs equals clamp(M @ v) ({name})", y.tolist(), want.tolist())


class PEsFirst(Accelerator):
    """The classic wrong order: the PEs run before this repetition's memory instruction."""

    def execute_instruction(self, instruction):
        from src.instruction import MemoryInstruction
        mi, pi = instruction.get_mem_instruction(), instruction.get_pe_instruction()
        for i in range(instruction.get_count().uint + 1):
            for pe, s in zip(self._pe_array, self._main_buffer.read_mem0_output().cut(32)):
                pe.input_a(self._main_buffer.read_mem1_output())
                pe.input_b(s)
                pe.execute_instruction(pi)
            self._main_buffer.write_mem2_input(Bits().join([pe.get_output() for pe in self._pe_array]))
            m = MemoryInstruction(mi._memory_config)
            m.set_instruction(mi.get_instruction())
            m.set_mema_offset(mi.get_mema_offset().uint + i * instruction.get_mema_inc().uint)
            m.set_memb_offset(mi.get_memb_offset().uint + i * instruction.get_memb_inc().uint)
            self._main_buffer.execute_instruction(m)


M8 = np.arange(1, 8 * 4 + 1).reshape(8, 4) % 7 - 3
for vv, hidden in (([[1], [2], [3], [4]], False), ([[1], [2], [3], [0]], True)):
    vv = np.array(vv)
    _, y, _ = run_accel(PEsFirst, M8, vv, 16, 2)
    check(f"PEs-before-memory with v[-1]={vv[-1][0]} matches M @ v", y.tolist() == (M8 @ vv).flatten().tolist(), hidden)

pair = ["NOP | CLR INT16 | 1 0 0", "READ INT16 0 0 | MAC INT16 | 3 1 1", "WRITE 0 | OUT INT16 | 1 0 0"]
M3, v3 = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 1, 1]]), np.array([[1], [1], [1]])
for name, cls, want_y in (("ours", Accelerator, [0, 0, 0, 0]), ("staff", StaffAccel, [6, 15, 24, 3])):
    _, y, _ = run_accel(cls, M3, v3, 16, 2, program=pair)
    check(f"WRITE paired with OUT (not graded) stores ({name})", y.tolist(), want_y)

for name, cls, want_off in (("ours", Accelerator, 0), ("staff", StaffAccel, 4)):
    c, _ = generate_accelerator_and_instruction_configuration(processing_element_count=2, processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
    a = cls(c)
    inst = ASM.convert_instruction("READ INT16 0 0 | MAC INT16 | 4 1 1")
    a.execute_instruction(inst)
    check(f"MemAOffset left in the Instruction object after one run ({name})", inst.get_mem_instruction().get_mema_offset().uint, want_off)
for name, cls, want_err in (("ours", Accelerator, None), ("staff", StaffAccel, "ValueError")):
    a = cls(c)
    check(f"READ at 65535 with one repetition ({name})",
          raises(lambda: a.execute_instruction(ASM.convert_instruction("READ INT32 65535 0 | NOP INT32 | 1 1 0"))), want_err)

# Q: the staff's extra increment is not just theory: with 4 PEs the INT8 equivalence test's last READ ends at 65535
c4, _ = generate_accelerator_and_instruction_configuration(processing_element_count=4, processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
_, _, prog4, _ = compile_matrix_vector_multiplication(np.zeros((1024, 1024), dtype=np.int64), np.zeros((1024, 1), dtype=np.int64), c4, 8)
check("4 PEs, INT8 1024x1024: last READ instruction", prog4[-3], "READ INT8 64512 0 | MAC INT8 | 1024 1 1")
for name, cls, want_err in (("ours", Accelerator, None), ("staff", StaffAccel, "ValueError")):
    a = cls(c4)
    check(f"...run through the {name} controller raises", raises(lambda: a.execute_instruction(ASM.convert_instruction(prog4[-3]))), want_err)
c5, _ = generate_accelerator_and_instruction_configuration(processing_element_count=5, processing_element_accumulation_bitwidth=64, controller_counter_bitwidth=16)
_, _, prog5, _ = compile_matrix_vector_multiplication(np.zeros((1024, 1024), dtype=np.int64), np.zeros((1024, 1), dtype=np.int64), c5, 8)
check("5 PEs: last READ starts at", prog5[-3].split("|")[0].strip(), "READ INT8 52224 0")
check("first instruction of every compiled program", prog5[0], "NOP | CLR INT8 | 1 0 0")

print("\n== Equivalence-test data (ivd-mg seeds: matrix 0, vector 12345, values -5..4)")
for rows, w, lo_hi, clamped in ((1024, 8, (-578, 1198), 801), (512, 16, (-475, 761), 0), (256, 32, (-232, 450), 0)):
    np.random.seed(0)
    A = np.random.randint(-5, 5, size=(rows, rows))
    np.random.seed(12345)
    x = np.random.randint(-5, 5, size=(rows, 1))
    y = (A @ x).flatten()
    lim = 2 ** (w - 1)
    check(f"INT{w}: range of M @ v, outputs that OUT clamps", ((int(y.min()), int(y.max())), int(((y < -lim) | (y > lim - 1)).sum())), (lo_hi, clamped))
    if w == 8:
        check("INT8: largest |partial sum| stays below 32767", int(np.abs(np.cumsum(A * x.T, axis=1)).max()) < 32767, True)
    check(f"INT{w}: last vector element", int(x[-1][0]), {8: -4, 16: 0, 32: -1}[w])
check("worst case |sum| for 1024 products of values in -5..4", 25 * 1024, 25600)

print(f"\n{len(FAILS)} failed" + (": " + ", ".join(FAILS) if FAILS else ""))
sys.exit(len(FAILS))
