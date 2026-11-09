"""Our own tests, beyond the public ones. Run with:  make test-ours

The staff grade with private tests that use "additional input values and instruction
sequences", so every rule in docs/spec-notes.md deserves a small test here.
This file is not submitted (the zip only contains src/).
"""
import sys

from bitstring import Bits
from src.processing_element import ProcessingElement, ProcessingElementConfiguration
from test_processing_element import assemble_test_instruction  # reuse the staff's PE assembler setup


def pack(values, width):
    """Pack signed ints into one Bits word. values[0] lands in the MOST significant lane,
    the same convention the public tests use with Bits().join([...])."""
    return Bits().join([Bits(int=v, length=width) for v in values])


def run_pe(a, b, program):
    """Fresh PE (32-bit in/out, 64-bit accumulator, like the public tests), load inputs, run program."""
    pe = ProcessingElement(ProcessingElementConfiguration(
        INPUT_BITWIDTH=32, ACCUMULATION_BITWIDTH=64, OUTPUT_BITWIDTH=32))
    pe.input_a(a)
    pe.input_b(b)
    for line in program:
        pe.execute_instruction(assemble_test_instruction(line))
    return pe


def check(name, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + ("" if ok else f"\n      got  {got}\n      want {want}"))
    return 0 if ok else 1


# ---------------------------------------------------------------------------- examples
def test_out_keeps_accumulator_int16():
    # Spec: PASS sign-extends each A lane into its accumulator lane. OUT writes the clamped
    # value to the output and leaves the accumulator alone.
    pe = run_pe(a=pack([7, -2], 16), b=pack([0, 0], 16), program=["PASS INT16", "OUT INT16"])
    errors = check("OUT INT16: output lanes", pe.get_output(), pack([7, -2], 16))
    errors += check("OUT INT16: accumulator unchanged", pe.get_accumulation(), pack([7, -2], 32))
    return errors


# TODO (split these between us; see the edge-case list in docs/spec-notes.md):
#   clamp limits for OUT in each mode, RND ties (+ and -), RND with s = 0, MAC on negative lanes,
#   INT8 accumulator-lane overflow, CLR clearing the output, RND/PASS preserving the output,
#   main-buffer READ selecting each half/byte, accelerator runs on tiny matrices.


def main():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    errors = sum(t() for t in tests)
    print("All our tests passed!" if errors == 0 else f"{errors} of our checks failed.")
    sys.exit(errors)


if __name__ == "__main__":
    main()
