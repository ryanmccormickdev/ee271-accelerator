"""Dump compiler/assembler outputs from the real starter code so the JS model can be checked
against them. Usage: python dump_fixtures.py <part1-dir> <out.json>"""
import json
import sys

import numpy as np

sys.path.insert(0, sys.argv[1])
sys.path.insert(0, sys.argv[1] + "/test")
from src.assembler import Assembler  # noqa: E402
from src.compiler import (  # noqa: E402
    compile_matrix_vector_multiplication,
    generate_accelerator_and_instruction_configuration,
)
from src.instruction import Mode  # noqa: E402
from test_accelerator import generate_test_matrix_vector_computation  # noqa: E402

EXAMPLE_M = [[1, 2, -1], [3, 0, 2], [-2, 1, 4], [0, -3, 1], [2, 2, 2], [-1, 4, 0]]
EXAMPLE_V = [2, -1, 3]

cases = [
    dict(name="public INT16", rows=768, cols=64, seed=12345, mode=Mode.INT16, pes=64),
    dict(name="public INT32", rows=768, cols=64, seed=12345, mode=Mode.INT32, pes=13),
    dict(name="public INT8", rows=64, cols=3, seed=0, mode=Mode.INT8, pes=9),
    dict(name="example INT16", matrix=EXAMPLE_M, vector=EXAMPLE_V, mode=Mode.INT16, pes=2),
    dict(name="example INT8", matrix=EXAMPLE_M, vector=EXAMPLE_V, mode=Mode.INT8, pes=2),
    dict(name="example INT32", matrix=EXAMPLE_M, vector=EXAMPLE_V, mode=Mode.INT32, pes=2),
    dict(name="small INT8 3PE", rows=11, cols=5, seed=7, mode=Mode.INT8, pes=3),
    dict(name="small INT16 1PE", rows=5, cols=4, seed=3, mode=Mode.INT16, pes=1),
]

out = []
for c in cases:
    accel_config, inst_config = generate_accelerator_and_instruction_configuration(
        processing_element_accumulation_bitwidth=64,
        processing_element_count=c["pes"],
        controller_counter_bitwidth=16,
    )
    if "matrix" in c:
        matrix = np.array(c["matrix"])
        vector = np.array(c["vector"]).reshape(-1, 1)
        gold = (matrix @ vector).flatten()
    else:
        matrix, vector, gold = generate_test_matrix_vector_computation(c["rows"], c["cols"], c["seed"])
    mem0, mem1, insts, n = compile_matrix_vector_multiplication(matrix, vector, accel_config, c["mode"])
    rows, cols = matrix.shape
    lanes = 32 // c["mode"]
    blocks = -(-rows // (c["pes"] * lanes))
    used0 = blocks * cols
    used1 = -(-cols // lanes)
    assert all(w.uint == 0 for w in mem0[used0:used0 + 50]), "MEM0 beyond the used entries should be zero"
    asm = Assembler(inst_config).assemble_instructions(insts)
    out.append(dict(
        name=c["name"], pes=c["pes"], mode=c["mode"],
        matrix=matrix.tolist(), vector=vector.flatten().tolist(), gold=gold.tolist(),
        mem0=[w.hex for w in mem0[:used0]], mem1=[w.hex for w in mem1[:used1]],
        mem0_depth=len(mem0), mem1_depth=len(mem1),
        mem0_width=len(mem0[0]), mem1_width=len(mem1[0]),
        program=insts, machine=[i.get_instruction().bin for i in asm],
    ))
    print(f"{c['name']}: rows={rows} cols={cols} MEM0 used={used0}/{len(mem0)} x{len(mem0[0])}b "
          f"MEM1 used={used1}/{len(mem1)} program={len(insts)} instr width={len(asm[0].get_instruction())}")

json.dump(out, open(sys.argv[2], "w"))
