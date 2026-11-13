"""Run the real starter code on small examples and record what its variables hold at chosen
lines, so the code reader can show real values next to the code.
Usage: <conda python> trace_values.py <part1-dir> <out.json>        (or: make walkthrough)

Only the given files (compiler.py, assembler.py, instruction.py and the tests' setup) are
run. Nothing here implements, or calls, the three files you write."""
import json
import os
import sys
from collections import defaultdict

P1 = os.path.realpath(sys.argv[1])
sys.path.insert(0, P1)
sys.path.insert(0, os.path.join(P1, "test"))

import numpy as np  # noqa: E402
from bitstring import Bits  # noqa: E402
from src.assembler import Assembler  # noqa: E402
from src.compiler import (  # noqa: E402
    compile_matrix_vector_multiplication, extract_results_from_memory,
    generate_accelerator_and_instruction_configuration)
from src.instruction import (MI, PEI, Instruction, MemoryInstruction,  # noqa: E402
                             MemoryInstructionConfiguration, Mode)
from test_accelerator import generate_test_matrix_vector_computation  # noqa: E402
import test_main_buffer  # noqa: E402
import test_processing_element  # noqa: E402

EX_M = [[1, 2, -1], [3, 0, 2], [-2, 1, 4], [0, -3, 1], [2, 2, 2], [-1, 4, 0]]
EX_V = [2, -1, 3]
OUT = {}


# ------------------------------------------------------------------ formatting
def plain(x):
    """numpy scalars/arrays -> plain Python values, so they print the way you'd type them."""
    if isinstance(x, np.ndarray):
        return x.tolist()
    if isinstance(x, np.generic):
        return x.item()
    if isinstance(x, (list, tuple)):
        return type(x)(plain(v) for v in x)
    return x


def fmt(v, how):
    if how.startswith("bits:"):                       # hex grouped by lane, plus the lanes as numbers
        w = int(how[5:])
        h = v.hex
        d = max(1, w // 4)
        lanes = [p.int for p in v.cut(w)]
        return f"Bits 0x{'_'.join(h[i:i + d] for i in range(0, len(h), d))}   (lanes, left to right: {lanes})"
    if how.startswith("bin:"):                        # binary grouped by field widths
        s, out, i = v.bin, [], 0
        for wd in (int(x) for x in how[4:].split(",")):
            out.append(s[i:i + wd])
            i += wd
        return " ".join(out) + (" " + s[i:] if i < len(s) else "")
    if how == "lines":                                # a list shown one item per line
        return "[\n" + "\n".join(f"  {plain(x)!r}," for x in v) + "\n]"
    if how == "arr":
        a = np.asarray(v)
        return f"{a.tolist()}   (a numpy array, shape {a.shape})"
    if how == "hexlist":
        return "[" + ", ".join(f"Bits 0x{b.hex}" for b in v) + "]"
    return repr(plain(v))


def put(name, caption, rows):
    OUT[name] = {"caption": caption, "rows": [[k, v] for k, v in rows]}


# ------------------------------------------------------------------ line probes via sys.settrace
class Probe:
    def __init__(self, name, file, func, line, exprs, hit=0, anchor=None, caption=None):
        self.name, self.file, self.func, self.exprs, self.hit, self.caption = name, file, func, exprs, hit, caption
        path = os.path.realpath(os.path.join(P1, file))
        lines = open(path).read().split("\n")
        start = 0
        if anchor:
            start = next(i for i, l in enumerate(lines) if l.strip().startswith(anchor))
        idx = next((i for i in range(start, len(lines)) if lines[i].strip().startswith(line)), None)
        if idx is None:
            raise SystemExit(f"{file}: probe line not found: {line!r}")
        self.path, self.lineno = path, idx + 1


PROBES, BY_LOC, COUNT = [], defaultdict(list), defaultdict(int)


def probe(*a, **k):
    p = Probe(*a, **k)
    PROBES.append(p)
    BY_LOC[(p.path, p.lineno)].append(p)


def _local(frame, event, arg):
    if event == "line":
        for p in BY_LOC.get((os.path.realpath(frame.f_code.co_filename), frame.f_lineno), ()):
            if p.func != frame.f_code.co_name:
                continue
            n = COUNT[p.name]
            COUNT[p.name] += 1
            if p.hit == "last" or n == p.hit:
                env = dict(frame.f_globals)
                env.update(frame.f_locals)
                put(p.name, p.caption, [(label, fmt(eval(expr, env), how)) for label, expr, how in p.exprs])
    return _local


TRACED = {os.path.realpath(os.path.join(P1, f)) for f in ("src/compiler.py", "src/assembler.py")}


def _global(frame, event, arg):
    return _local if os.path.realpath(frame.f_code.co_filename) in TRACED else None


EXC = "From running the starter code on the 6×3 example (INT16, 2 PEs):"

# compiler.generate_accelerator_and_instruction_configuration
probe("cfg_accel", "src/compiler.py", "generate_accelerator_and_instruction_configuration", "return accel_config, inst_config", [
    ("accel_config.PE_COUNT", "accel_config.PE_COUNT", ""),
    ("accel_config.PE_CONFIG", "accel_config.PE_CONFIG", ""),
    ("accel_config.BUFFER_CONFIG", "accel_config.BUFFER_CONFIG", ""),
], caption=EXC)
probe("cfg_inst", "src/compiler.py", "generate_accelerator_and_instruction_configuration", "return accel_config, inst_config", [
    ("inst_config.MEMORY_INST_CONFIG", "inst_config.MEMORY_INST_CONFIG", ""),
    ("inst_config.PE_INST_CONFIG", "inst_config.PE_INST_CONFIG", ""),
    ("inst_config.COUNT_BITWIDTH", "inst_config.COUNT_BITWIDTH", ""),
    ("total bits per instruction", "inst_config.get_width() + inst_config.MEMORY_INST_CONFIG.get_width() + inst_config.PE_INST_CONFIG.get_width()", ""),
], caption=EXC)

# compiler.compile_matrix_vector_multiplication
F = "compile_matrix_vector_multiplication"
probe("c_rows", "src/compiler.py", F, "for sub_matrix_row in range(row_sub_comp_count):", [
    ("matrix.shape", "matrix.shape", ""), ("number_of_rows", "number_of_rows", ""), ("row_sub_comp_count", "row_sub_comp_count", ""),
], caption=EXC)
probe("c_slice_b0", "src/compiler.py", F, "if elem_count < number_of_rows:", [
    ("sub_matrix_row, sub_matrix_col", "(sub_matrix_row, sub_matrix_col)", ""), ("sub_matrix", "sub_matrix", "arr"), ("elem_count", "elem_count", ""),
], hit=0, caption="Block 0, column 0 (a full block, so no padding):")
probe("c_slice_b1", "src/compiler.py", F, "if elem_count < number_of_rows:", [
    ("sub_matrix_row, sub_matrix_col", "(sub_matrix_row, sub_matrix_col)", ""), ("sub_matrix", "sub_matrix", "arr"), ("elem_count", "elem_count", ""),
], hit=3, caption="Block 1, column 0, before padding (only rows 4 and 5 exist):")
# (probe on a plain statement: a line holding a list comprehension reports a 'line' event twice in Python 3.12+)
probe("c_pad_b1", "src/compiler.py", F, "mem0_configs = mem0_configs + [mem_entry]", [
    ("sub_matrix", "sub_matrix", "arr"), ("mem_entry", "mem_entry", "bits:16"),
], hit=3, caption="Block 1, column 0, after padding:")
probe("c_col0", "src/compiler.py", F, "mem0_configs = mem0_configs + [mem_entry]", [
    ("sub_matrix_row, sub_matrix_col", "(sub_matrix_row, sub_matrix_col)", ""), ("sub_matrix", "sub_matrix", "arr"),
    ("mem_entry", "mem_entry", "bits:16"), ("len(mem_entry)", "len(mem_entry)", ""),
], hit=0, caption="The first pass (block 0, column 0):")
probe("c_insts", "src/compiler.py", F, "number_of_cols         = int(", [
    ("len(mem0_configs)", "len(mem0_configs)", ""), ("instruction_list", "instruction_list", "lines"),
], caption="After both loops finish:")
probe("c_vcols", "src/compiler.py", F, "for sub_vector_col in range(col_sub_comp_count):", [
    ("vector.shape", "vector.shape", ""), ("number_of_cols", "number_of_cols", ""), ("col_sub_comp_count", "col_sub_comp_count", ""),
], caption=EXC)
probe("c_vslice0", "src/compiler.py", F, "sub_vector = sub_vector.flatten()", [
    ("sub_vector_col", "sub_vector_col", ""), ("sub_vector", "sub_vector", "arr"),
], hit=0, caption="Entry 0 (v[0] and v[1]):")
probe("c_vslice1", "src/compiler.py", F, "sub_vector = sub_vector.flatten()", [
    ("sub_vector_col", "sub_vector_col", ""), ("sub_vector", "sub_vector", "arr"),
], hit=1, caption="Entry 1 (v[2], plus one zero of padding):")
probe("c_vrev0", "src/compiler.py", F, "mem_entry = Bits().join([", [
    ("sub_vector", "sub_vector", ""),
], hit=0, anchor="# Organizing MEM1", caption="Entry 0 after flatten and reverse (v[1] first, v[0] last):")
probe("c_vword0", "src/compiler.py", F, "mem1_configs = mem1_configs + [mem_entry]", [
    ("mem_entry", "mem_entry", "bits:16"),
], hit=0, caption="MEM1 entry 0:")
probe("c_vword1", "src/compiler.py", F, "mem1_configs = mem1_configs + [mem_entry]", [
    ("mem_entry", "mem_entry", "bits:16"),
], hit=1, caption="MEM1 entry 1:")
probe("c_ret", "src/compiler.py", F, "return mem0_configs, mem1_configs, instruction_list, len(matrix)", [
    ("len(mem0_configs)", "len(mem0_configs)", ""), ("len(mem1_configs)", "len(mem1_configs)", ""),
    ("mem0_configs[6]  (the first padding entry)", "mem0_configs[6]", "bits:16"), ("len(matrix)", "len(matrix)", ""),
], caption=EXC)

# compiler.extract_results_from_memory
F = "extract_results_from_memory"
EXX = "With MEM2 as a correct accelerator leaves it for the 6×3 example:"
probe("e_params", "src/compiler.py", F, "output = []", [
    ("elems_per_entry", "elems_per_entry", ""), ("entries_to_read", "entries_to_read", ""),
], caption=EXX)
probe("e_loop0", "src/compiler.py", F, "output = output + [elem.int for elem in value.cut(computation_bitwidth)]", [
    ("mem_idx", "mem_idx", ""), ("value", "value", "bits:16"), ("list(value.cut(16))", "list(value.cut(computation_bitwidth))", "hexlist"),
], hit=0, caption="First pass of the loop:")
probe("e_ret", "src/compiler.py", F, "return np.array(list(output[:num_elems_to_extract]))", [
    ("output", "output", ""), ("output[:num_elems_to_extract]", "output[:num_elems_to_extract]", ""),
], caption="At the end:")

# assembler (the program has 8 lines; line 1 is the READ | MAC)
EXA = "From assembling the example program; this is line 1, READ INT16 0 0 | MAC INT16 | 3 1 1:"
probe("a_split", "src/assembler.py", "convert_instruction", "if len(params) != 3:", [
    ("inst_str", "inst_str", ""), ("params", "params", ""),
], hit=1, caption=EXA)
probe("a_sub", "src/assembler.py", "convert_instruction", "inst.set_mem_instruction(mem_inst)", [
    ("mem_inst.get_instruction()", "mem_inst.get_instruction()", "bin:2,2,16,16"),
    ("pe_inst.get_instruction()", "pe_inst.get_instruction()", "bin:2,2,5"),
], hit=1, caption=EXA)
probe("a_ctl", "src/assembler.py", "convert_instruction", "try:     value = int(params[0])", [
    ("params", "params", ""),
], hit=1, anchor="# Parsing the Controller Instruction", caption=EXA)
probe("a_ret", "src/assembler.py", "convert_instruction", "return inst", [
    ("inst.get_count().uint", "inst.get_count().uint", ""), ("inst.get_mema_inc().uint", "inst.get_mema_inc().uint", ""),
    ("inst.get_memb_inc().uint", "inst.get_memb_inc().uint", ""),
    ("inst.get_instruction()", "inst.get_instruction()", "bin:2,2,16,16,2,2,5,16,1,1"),
], hit=1, anchor="def convert_instruction", caption=EXA)
probe("a_mem_parse", "src/assembler.py", "convert_mem_instruction", "if not (len(params) in [1, 2, 4]):", [
    ("mem_inst_str", "mem_inst_str", ""), ("params", "params", ""),
], hit=1, caption="The memory part of line 1:")
probe("a_mem_op", "src/assembler.py", "convert_mem_instruction", "if opcode is None:", [
    ("params[0]", "params[0]", ""), ("opcode", "opcode", ""),
], hit=1, anchor="def convert_mem_instruction", caption="The memory part of line 1:")
probe("a_mem_nop", "src/assembler.py", "convert_mem_instruction", "if not (len(params) in [1]):", [
    ("params", "params", ""), ("opcode", "opcode", ""), ("inst.get_instruction()", "inst.get_instruction()", "bin:2,2,16,16"),
], hit=0, caption="Line 0's memory part, NOP:")
probe("a_mem_write", "src/assembler.py", "convert_mem_instruction", "inst.set_memb_offset(0)", [
    ("params", "params", ""), ("inst.get_instruction()  (before MemBOffset is set)", "inst.get_instruction()", "bin:2,2,16,16"),
], hit=0, anchor="# Handling Write", caption="Line 3's memory part, WRITE 0:")
probe("a_mem_read", "src/assembler.py", "convert_mem_instruction", "inst.set_memb_offset(value)", [
    ("params", "params", ""), ("datatype", "datatype", ""), ("Mode.opcode(datatype[0])", "Mode.opcode(datatype[0])", ""),
], hit=0, anchor="# Handling Read", caption="The memory part of line 1, READ INT16 0 0:")
probe("a_mem_ret", "src/assembler.py", "convert_mem_instruction", "return inst", [
    ("inst.get_instruction()", "inst.get_instruction()", "bin:2,2,16,16"),
], hit=0, anchor="# Returning the Instruction", caption="READ INT16 0 0, finished (opcode | mode | MemAOffset | MemBOffset):")
probe("a_pe_parse", "src/assembler.py", "convert_pe_instruction", "if not (len(params) in [2, 3]):", [
    ("pe_inst_str", "pe_inst_str", ""), ("params", "params", ""),
], hit=1, caption="The PE part of line 1:")
probe("a_pe_op0", "src/assembler.py", "convert_pe_instruction", "if opcode is None:", [
    ("params[0]", "params[0]", ""), ("opcode", "opcode", ""),
], hit=0, anchor="def convert_pe_instruction", caption="Line 0's PE part, CLR INT16:")
probe("a_pe_op1", "src/assembler.py", "convert_pe_instruction", "if opcode is None:", [
    ("params[0]", "params[0]", ""), ("opcode", "opcode", ""),
], hit=1, anchor="def convert_pe_instruction", caption="Line 1's PE part, MAC INT16:")
probe("a_pe_mode", "src/assembler.py", "convert_pe_instruction", "if opcode[0] == PEI.RND:", [
    ("datatype", "datatype", ""), ("inst.get_instruction()", "inst.get_instruction()", "bin:2,2,5"),
], hit=1, anchor="# If the Opcode is Round", caption="MAC INT16 (opcode | mode | value):")
probe("a_pe_rnd", "src/assembler.py", "convert_pe_instruction", "inst.set_value(value)", [
    ("params", "params", ""), ("value", "value", ""),
], hit="last", anchor="# If the Opcode is Round", caption="An extra line, RND INT16 8 (the example program has no RND):")
probe("a_pe_ret", "src/assembler.py", "convert_pe_instruction", "return inst", [
    ("inst.get_instruction()", "inst.get_instruction()", "bin:2,2,5"),
], hit="last", anchor="# Returning the Converted Instruction", caption="RND INT16 8, finished (opcode | mode | value):")

# ------------------------------------------------------------------ run the given code on the example
sys.settrace(_global)
accel_config, inst_config = generate_accelerator_and_instruction_configuration(
    processing_element_accumulation_bitwidth=64, processing_element_count=2, controller_counter_bitwidth=16)
M, V = np.array(EX_M), np.array(EX_V).reshape(-1, 1)
mem0, mem1, insts, n = compile_matrix_vector_multiplication(M, V, accel_config, Mode.INT16)
asm = Assembler(inst_config)
program = asm.assemble_instructions(insts)
rnd = asm.convert_pe_instruction("RND INT16 8")
y = (M @ V).flatten().tolist()
R = 4                                                 # rows per block: what a correct run leaves in MEM2
mem2 = [Bits().join([Bits(int=(y[b * R + e] if b * R + e < len(y) else 0), length=16) for e in range(R)]) for b in range(2)]
mem2 += [Bits(int=0, length=64) for _ in range(accel_config.BUFFER_CONFIG.MEM2_DEPTH - 2)]
extract_results_from_memory(mem2, n, accel_config, Mode.INT16)
sys.settrace(None)
missing = [p.name for p in PROBES if p.name not in OUT]
if missing:
    raise SystemExit("probes never fired: " + ", ".join(missing))

# ------------------------------------------------------------------ instruction.py, by inspecting the objects
ins1 = program[1]
mi, pi = ins1.get_mem_instruction(), ins1.get_pe_instruction()
put("i_memcfg", "The memory part's config in the tests (N = 16):", [
    ("inst_config.MEMORY_INST_CONFIG", repr(inst_config.MEMORY_INST_CONFIG)),
    ("inst_config.MEMORY_INST_CONFIG.get_width()", repr(inst_config.MEMORY_INST_CONFIG.get_width()))])
put("i_mem_starts", "Inside the memory part of line 1, READ INT16 0 0:", [
    ("_opcode_start, _mode_start", repr((mi._opcode_start, mi._mode_start))),
    ("_mema_offset_start, _memb_offset_start", repr((mi._mema_offset_start, mi._memb_offset_start))),
    ("_instruction_value", fmt(mi.get_instruction(), "bin:2,2,16,16"))])
demo = MemoryInstruction(MemoryInstructionConfiguration(OPCODE_BITWIDTH=2, MODE_BITWIDTH=2, MEMA_OFFSET_BITWIDTH=16, MEMB_OFFSET_BITWIDTH=16))
rows = [("m = MemoryInstruction(cfg)", fmt(demo.get_instruction(), "bin:2,2,16,16"))]
demo.set_opcode(MI.WRITE)
rows.append(("m.set_opcode(MI.WRITE)", fmt(demo.get_instruction(), "bin:2,2,16,16")))
demo.set_mema_offset(5)
rows.append(("m.set_mema_offset(5)", fmt(demo.get_instruction(), "bin:2,2,16,16")))
put("i_set", "Each setter call builds a new 36-bit word (opcode | mode | MemAOffset | MemBOffset):", rows)
put("i_get", "Getters on the memory part of line 1, READ INT16 0 0:", [
    ("mi.get_opcode()", repr(mi.get_opcode())), ("mi.get_opcode().uint", repr(mi.get_opcode().uint)),
    ("mi.get_mode().uint", repr(mi.get_mode().uint)), ("mi.get_mema_offset().uint", repr(mi.get_mema_offset().uint)),
    ("mi.get_memb_offset().uint", repr(mi.get_memb_offset().uint))])
put("i_mode", "Mode's conversions:", [
    ("Mode.INT8, Mode.INT16, Mode.INT32", repr((Mode.INT8, Mode.INT16, Mode.INT32))),
    ("Mode.opcode(8), Mode.opcode(16), Mode.opcode(32)", repr((Mode.opcode(8), Mode.opcode(16), Mode.opcode(32)))),
    ("Mode.bitwidth(0), Mode.bitwidth(1), Mode.bitwidth(2)", repr((Mode.bitwidth(0), Mode.bitwidth(1), Mode.bitwidth(2))))])
put("i_pe_starts", "Inside the PE part of line 1, MAC INT16:", [
    ("_opcode_start, _mode_start, _value_start", repr((pi._opcode_start, pi._mode_start, pi._value_start))),
    ("_instruction_value", fmt(pi.get_instruction(), "bin:2,2,5"))])
put("i_pe_get", "What a PE decoder reads, for two different instructions:", [
    ("MAC INT16: get_opcode().uint, get_value().uint", repr((pi.get_opcode().uint, pi.get_value().uint))),
    ("MAC INT16: get_mode_bitwidth()", repr(pi.get_mode_bitwidth())),
    ("RND INT16 8: get_opcode().uint, get_value().uint", repr((rnd.get_opcode().uint, rnd.get_value().uint))),
    ("PEI.NO_VALUE, PEI.MAC, PEI.RND, PEI.NOP", repr((PEI.NO_VALUE, PEI.MAC, PEI.RND, PEI.NOP)))])
put("i_inst_starts", "Inside line 1, READ INT16 0 0 | MAC INT16 | 3 1 1:", [
    ("_mem_inst_start, _pe_inst_start", repr((ins1._mem_inst_start, ins1._pe_inst_start))),
    ("_count_start, _mema_inc_start, _memb_inc_start", repr((ins1._count_start, ins1._mema_inc_start, ins1._memb_inc_start))),
    ("get_width()", repr(ins1.get_width()))])
put("i_inst_get", "What a controller reads from line 1:", [
    ("instruction.get_count().uint", repr(ins1.get_count().uint)),
    ("instruction.get_mema_inc().uint, get_memb_inc().uint", repr((ins1.get_mema_inc().uint, ins1.get_memb_inc().uint))),
    ("instruction.get_mem_instruction().get_mema_offset().uint", repr(mi.get_mema_offset().uint)),
    ("instruction.get_pe_instruction().get_value().uint", repr(pi.get_value().uint))])
put("i_inst_bits", "Line 1's full 63-bit word (memory 2|2|16|16, PE 2|2|5, Count 16, increments 1|1):", [
    ("get_instruction()", fmt(ins1.get_instruction(), "bin:2,2,16,16,2,2,5,16,1,1"))])

# ------------------------------------------------------------------ test_accelerator.py's first test, step by step
ac, ic = generate_accelerator_and_instruction_configuration(processing_element_accumulation_bitwidth=64, processing_element_count=64, controller_counter_bitwidth=16)
mat, vec, gold = generate_test_matrix_vector_computation(768, 64, 12345)
m0, m1, ins, ne = compile_matrix_vector_multiplication(mat, vec, ac, Mode.INT16)
asm64 = Assembler(ic).assemble_instructions(ins)
T1 = "In the first public test, run_test(768, 64, 12345, Mode.INT16, 64):"
put("ta_cfg", T1, [("accel_config.PE_COUNT", repr(ac.PE_COUNT)), ("accel_config.BUFFER_CONFIG", repr(ac.BUFFER_CONFIG))])
put("ta_data", T1, [("matrix.shape", repr(mat.shape)), ("vector.shape", repr(vec.shape)), ("matrix[0][:8]", repr(plain(mat[0][:8]))),
                    ("gold_result.shape", repr(gold.shape)), ("gold_result[:6]", repr(plain(gold[:6])))])
put("ta_compile", T1, [("len(mem0), len(mem0[0])", repr((len(m0), len(m0[0])))), ("len(mem1), len(mem1[0])", repr((len(m1), len(m1[0])))),
                       ("num_elements", repr(ne)), ("len(instructions)", repr(len(ins))), ("instructions[:4]", fmt(ins[:4], "lines"))])
put("ta_asm", T1, [("len(assembled)", repr(len(asm64))), ("instructions[1]", repr(ins[1])),
                   ("assembled[1].get_count().uint", repr(asm64[1].get_count().uint)),
                   ("assembled[1].get_instruction()", fmt(asm64[1].get_instruction(), "bin:2,2,16,16,2,2,5,16,1,1"))])

# ------------------------------------------------------------------ the unit tests' inputs
pe_asm = test_processing_element.assemble_test_instruction
put("t_pe_inputs", "In test_mac_int32:", [("a_value", fmt(Bits(int=1073741824, length=32), "bits:32")), ("b_value", fmt(Bits(int=2, length=32), "bits:32"))])
put("t_pe_insts", "In test_mac_int32 (opcode | mode | value):", [
    ("insts[0]  (MAC INT32)", fmt(pe_asm("MAC INT32").get_instruction(), "bin:2,2,5")),
    ("insts[1]  (OUT INT32)", fmt(pe_asm("OUT INT32").get_instruction(), "bin:2,2,5"))])
put("t_pe_expect", "In test_mac_int32:", [("Bits(hex=\"0x7fffffff\", length=32)", fmt(Bits(hex="0x7fffffff", length=32), "bits:32"))])
put("t_pe16_inputs", "In test_mac_int16:", [
    ("a_value", fmt(Bits().join([Bits(int=-20000, length=16), Bits(int=20000, length=16)]), "bits:16")),
    ("b_value", fmt(Bits().join([Bits(int=2, length=16), Bits(int=2, length=16)]), "bits:16")),
    ("expected output", fmt(Bits(hex="0x80007fff", length=32), "bits:16"))])
put("t_mb_expect", "In test_read_int16:", [("correct_mem1_value", fmt(Bits().join([Bits(int=13, length=16), Bits(int=13, length=16)]), "bits:16")),
                                          ("correct_mem1_value.uint", repr(Bits().join([Bits(int=13, length=16), Bits(int=13, length=16)]).uint))])
put("t_mb_inst", "In test_read_int16 (opcode | mode | MemAOffset | MemBOffset, with the tests' 10-bit offsets):", [
    ("insts[0]  (READ INT16 130 26)", fmt(test_main_buffer.assemble_test_instruction("READ INT16 130 26").get_instruction(), "bin:2,2,10,10"))])

json.dump(OUT, open(sys.argv[2], "w"), indent=1, ensure_ascii=False)
print(f"wrote {sys.argv[2]}: {len(OUT)} value tables")
