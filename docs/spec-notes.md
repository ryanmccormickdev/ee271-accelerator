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
- [ ] **Order inside one repetition:** the memory instruction first (READ fills the ports), then feed the PEs, then the
      PEs execute, then put the PE outputs on MEM2's input port. Staff confirmed that READ supplies the operands to its
      paired PE operation in the same repetition (Ed #221).
- [ ] Our decision: which PE reads which 32-bit slice of the MEM0 word. Whatever we pick, each PE's output has to land
      in the **same position** of the MEM2 word, because the compiler packs rows left to right and
      `extract_results_from_memory` reads them back left to right (walkthrough, Controller tab).

## Edge cases worth our own tests

Negative lanes everywhere. OUT exactly at and just past the clamp limits. RND ties, both positive and
negative (e.g. 2.5 and −2.5 in the scaled value). RND with s = 0. PASS of a negative lane. A MAC that
would overflow a 16-bit INT8 accumulator lane. OUT followed by more MACs (the accumulator must survive).
RND or PASS between two OUTs (the output must survive). Switching modes between instructions.

Two gaps in the public tests worth covering ourselves:

- The public READ tests only ever select **lane 0** of a MEM1 word (`READ INT16 130 26`: 26 is even; `READ INT8 130 24`:
  24 ends in binary 00). A buffer that always takes the low lane passes them. Test the high half and bytes 1–3.
- A wrong repetition order (PEs before memory) loses each block's last column. A test whose vector ends in 0 can't
  see that, because the lost product is zero.

The walkthrough's PE playground (`docs/walkthrough.html`, Processing element tab) has every public PE test plus these
edge cases as ready-made examples, with the expected register values.

## What staff have said (Ed, as of Nov 9)

- **#219 Farmshare is down.** Part 1 is Python only, so do it locally in a conda environment.
- **#220 Clone "Permission denied (publickey)":** add your SSH key at code.stanford.edu → Preferences → SSH Keys.
  (This repo pulls the starter over HTTPS instead, which needs no key.)
- **#207 AI policy:** any AI use is allowed. The report needs a one-page reflection. Everyone must be able to explain the code in a 15-min oral quiz.
- **#204** Part 2 requires a working part 1, so there are **no extensions for part 1**. A project review session is on Fri Nov 13.
- **#210** Pairs can submit as a group (individual submissions are also OK).
- **#208** Oral exam format is still being decided.
- **#221 (also answers #212), Nov 9:** "Please follow the provided compiler's convention: READ supplies the operands to
  its paired PE operation, while WRITE is paired with a PE NOP. To prepare the PE output before writing it to memory,
  issue the necessary PE instructions paired with a memory NOP first, then issue WRITE. Combined WRITE + OUT does not
  have required behavior and will not be graded. Similarly, out-of-range addresses will not be tested."
- **#224** The EDA tools for later parts are on the old caddy cluster (`caddyXX.stanford.edu`), reached over ssh. Staff
  recommend connecting from a Farmshare OnDemand desktop so the GUI tools work without X-forwarding.
- **#219** The Gradescope submission for part 1 isn't open yet; staff say it will open soon.
