# Part 1 spec checklist and clarifications

`handouts/Project_Part_1.pdf` is the authority. This file condenses it into checkboxes per source
file and collects what staff have said since. **Private staff tests use other values and
instruction sequences**, so passing the public tests isn't enough. Each line below is a behavior
someone could test.

## Processing element (`src/processing_element.py`), handout section 3.1

Inputs: **A = Data0** = the broadcast word from MEM1. **B** = this PE's own word from MEM0.
All values are signed two's complement. Every lane is computed independently.

| Mode | input lanes | accumulator lanes (64-bit acc) | output lanes (32-bit out) |
|---|---|---|---|
| INT8  | 4 × 8 bits  | 4 × 16 bits | 4 × 8 bits  |
| INT16 | 2 × 16 bits | 2 × 32 bits | 2 × 16 bits |
| INT32 | 1 × 32 bits | 1 × 64 bits | 1 × 32 bits |

The least significant input lane goes with the least significant accumulator lane and output lane.
The other lanes follow in the same order.

- [ ] **Decode:** PE opcode field `0` (NO_VALUE) means the Value field picks MAC/NOP/OUT/PASS/CLR.
      Opcode field `1` means RND, and the Value field is the shift `s` (see `PEI` in `instruction.py`).
- [ ] **MAC:** each acc lane += (A lane × B lane), using the full signed product. No saturation.
      Carries must never spill into the neighboring lane.
- [ ] **NOP:** nothing changes.
- [ ] **OUT:** output lane = acc lane clamped to [−2^(w−1), 2^(w−1)−1], narrowed to w bits, lanes kept in order.
      The **accumulator is unchanged.**
- [ ] **PASS:** each acc lane = the matching **A** lane, **sign-extended**. The output register is unchanged.
- [ ] **CLR:** accumulator = 0 **and** output register = 0.
- [ ] **RND:** each acc lane = acc lane / 2^s, rounded to nearest, **ties to even**. s is unsigned, 0..31.
      Written back to the same wide lane. The output register is unchanged.
- [ ] Only **OUT and CLR** change the output register.

## Main buffer (`src/main_buffer.py`), handout section 3.2

Memory opcodes are `MI.READ = 0`, `MI.WRITE = 1`, `MI.NOP = 2`.

- [ ] **READ:** MEM0 output port = `mem0[MemAOffset]` in every mode.
- [ ] READ, INT32: MEM1 output port = `mem1[MemBOffset]`.
- [ ] READ, INT16: word `mem1[MemBOffset[MSB:1]]`. `MemBOffset[0]` picks the upper or lower 16 bits,
      and that half is repeated twice to fill 32 bits.
- [ ] READ, INT8: word `mem1[MemBOffset[MSB:2]]`. `MemBOffset[1:0]` picks one of the four bytes,
      and that byte is repeated four times.
- [ ] **WRITE:** `mem2[MemAOffset]` = the MEM2 input port (the PEs' outputs).
- [ ] **NOP:** nothing.

`x[MSB:1]` is Verilog-style notation: bit 0 is the least significant bit, so `[MSB:1]` means
"every bit except the lowest". The tutorial explains why bitstring indexing runs the opposite way.

## Accelerator (`src/accelerator.py`), handout section 3.3

- [ ] Each `Instruction` runs **Count + 1** times. The assembler already stores "written count − 1".
- [ ] On each repetition, MemAOffset and MemBOffset grow by MemAIncrement and MemBIncrement.
- [ ] Every PE gets the **same** PE instruction (that's the SIMD part) but its **own** slice of the MEM0 word.
      All PEs get the same MEM1 word.
- [ ] The PE outputs, concatenated, form the MEM2 input port.
- [ ] Our decisions (argue them from the compiler's packing, `make tour`):
  - which PE reads which 32-bit slice of the MEM0 word, and where each PE's output lands in the MEM2 word;
  - the order inside one repetition (look at `READ … | MAC …` in the compiler's program).

## Edge cases worth our own tests

Negative lanes everywhere. OUT exactly at and just past the clamp limits. RND ties, both positive and
negative (e.g. 2.5 and −2.5 in the scaled value). RND with s = 0. PASS of a negative lane. A MAC that
would overflow a 16-bit INT8 accumulator lane. OUT followed by more MACs (the accumulator must survive).
RND or PASS between two OUTs (the output must survive). Switching modes between instructions.

## What staff have said (Ed, as of Nov 8)

- **#219 Farmshare is down.** Part 1 is Python only, so do it locally in a conda environment.
- **#220 Clone "Permission denied (publickey)":** add your SSH key at code.stanford.edu → Preferences → SSH Keys.
  (This repo pulls the starter over HTTPS instead, which needs no key.)
- **#207 AI policy:** any AI use is allowed. The report needs a one-page reflection. Everyone must be able to explain the code in a 15-min oral quiz.
- **#204** Part 2 requires a working part 1, so there are **no extensions for part 1**. A project review session is on Fri Nov 13.
- **#210** Pairs can submit as a group (individual submissions are also OK).
- **#208** Oral exam format is still being decided.
- **Open, no staff answer yet (#212):** (1) In one instruction with both `WRITE` and `OUT` (e.g. `WRITE 3 | OUT INT16 | 1 0 0`),
  does WRITE store the output from before the OUT or after? (2) Can READ's MemBOffset go past MEM1's depth in INT32 mode?
  Check back before submitting.
