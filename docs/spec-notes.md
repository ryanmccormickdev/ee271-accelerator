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

---

# Parts 2 and 3: spec, rulings, and what we found in the starter

`handouts/Project_Part_2.pdf` / `Project_Part_3.pdf` (text copies `.md` next to them) are the authority; `docs/PLAN.md`
has our design and schedule. Everything below marked *measured* was checked on Nov 14 by running the staff tools,
a throwaway reference RTL (kept outside the repo) and deliberately broken copies of it.

## Part 2 grading criteria (handout 2.4)

1. The RTL satisfies the **updated Part 1 arithmetic specification** and passes `int8_test`, `int16_test`, `int32_test`.
   "Updated" = the Part 1 handout as revised on Canvas (Nov 12). Our `handouts/Project_Part_1.pdf` already has that
   text (checked word for word against the Canvas version): signed clamping on OUT, ties-to-even RND, sign-extending
   PASS, full-width MAC without saturation. The equivalence tests only exercise CLR, MAC, OUT and NOP, so PASS and RND
   correctness rests on us (`make pe-unit` covers them).
2. `compile.log` has no errors (warnings are fine).

## Ed rulings that carry over from Part 1 (as of Nov 14; no Part 2/3 posts yet)

- **#226** MAC overflow is not tested; OUT must use signed per-lane **clamping**, not truncation.
- **#248** Clamping is graded at the instruction level; the end-to-end tests also expect clamped outputs.
- **#221** READ feeds its paired PE op; WRITE is paired with a PE NOP; WRITE+OUT in one instruction is not graded; no out-of-range addresses.
- **#238** All instructions valid, addresses in range, intermediate arithmetic fits the lanes; undocumented behavior isn't graded.
- **#249** Grading uses 32-bit inputs, 64-bit accumulator, 32-bit outputs only.
- **#7** Design Compiler for Parts 2–3, Siemens Catapult for Part 4 (HLS). **#224** EDA tools on caddy over ssh.
- **#207** One-page AI reflection in the final report "due on 12/1". **#217** Deliverables 25%, oral exam 25%.
- **#208** Oral exam format (individual or pair) still being decided.

## The starter, facts that matter

- **Staff reference = a full Part 1 solution** in `part2/simulator/src`; the equivalence tests compare our RTL with it.
  Two differences from our Part 1: its controller executes a WRITE *after* the PE op in a repetition (ours: memory
  first; both are legal under #221), and its MAC raises an exception on accumulator overflow (ours wraps).
- **Equivalence tests** (`part2/equivalence_testing/Makefile`): INT8 1024×1024, INT16 512×512, INT32 256×256, values
  −5…4 (`ivd-mg … -5 5`), matrix seed 0, vector seed 12345, **16 PEs** (tool defaults), 16-bit counters, 128-entry IMEM.
  The whole MEM2 (65,536 words) is dumped and diffed. `INST_COUNT` = program lines + 1. The extra word is all zeros,
  which decodes as `READ INT8 0 0 | MAC INT8` count 0, so the RTL runs one harmless extra READ+MAC (the Python stops
  at the first zero word).
- **The testbench decides when we're done:** `program_counter == INST_COUNT && !pe_inst_valid && !buf_inst_valid`.
  It then waits one cycle and dumps MEM2, and prints `Computation took N clock cycles` (= time / 10 ns, including 5
  reset cycles). This is the cycle count for the Part 3 FoM. It's an `always @(posedge …)` on a combinational
  signal, so a zero-width glitch can end the test (measured: a one-bubble variant reads 16,503 in Icarus, 16,504 in
  Verilator).
- **Names the testbenches require:** `dut.u_buffer.u_matrix_mem / u_vector_mem / u_output_mem`,
  `dut.u_instruction_memory.program_counter`, `dut.pe_inst_valid`, `dut.buf_inst_valid`.
- **SRAM model** (`array.sv`): synchronous read (data the cycle after the address), active-low `cen`/`gwen`, `wen` is a
  per-bit write mask (active low). Synthesis replaces it with `synth/macros/array.sv`, an **empty black box**, so the
  memories add no area and their pins aren't timed. Also, `top` has no output ports. Unverified risk: check
  `reports/area_report_hier` after the first DC run to confirm every PE instance kept its logic.
- **`vector_decoder`** (generated into `defines.sv`) has no `default` in `case (mode)` (a latch warning in synthesis). It
  computes the MEM1 address from `addr_from_controller` (this cycle) and selects the lane with
  `addr_from_controller_reg` (last cycle), using a single `mode` input. Feed it last cycle's mode for the data side
  (see the trap below).
- **Assembler:** NOP and WRITE leave the memory **mode field at 0 (INT8)**; only READ sets it.
- **Synthesis script quirks** (from reading it; confirm on the first run): `make synthesize` pipes DC through `tee`, so its
  exit status says nothing; `results.txt` is appended to (our `make synth` clears it first); the staff Makefile runs
  `ivd-gv` with 16 PEs whatever you want (ours passes `PE_COUNT`); DesignWare is looked up under an older install path
  (`M-2016.12-SP2`) than the loaded DC (S-2021.06-SP5-4); `set_max_fanout` and the 3/4-period input delay only
  touch input ports, effectively just `instruction_count`.
- **Synthesis defaults:** 2.0 ns clock, `TARGET_AREA=150000`, `compile_ultra -retime -timing_high_effort_script` with
  `set_optimize_registers true` already in `dc_synth.tcl`, Nangate 45 nm + DesignWare. Part 3 area cap: 1,000,000 µm².

## Staff-tool problems (measured)

- **bitstring 5.0 breaks `ivd-as`** (`Bits.length` was removed): `AttributeError: 'Bits' object has no attribute 'length'`.
  `requirements.yml` doesn't pin it, so a fresh env (on caddy too) gets 5.0.0. Fix: `pip install "bitstring<5"`
  (`make setup PART=part2` does it). Our Part 1 code works with either version. Worth reporting on Ed.
- **`check_results.sh` always exits 0**, so `make int8_test` "succeeds" even when MEM2 differs: read the printed
  `Test PASSED!` / `Test FAILED!` line, not the exit status (our `make vcs-eq` greps for it). It also uses `echo -e`
  without a shebang, so under a plain POSIX `sh` it prints `-e \e[31m...` literally.
- **The staff controller mutates the instruction it runs** (`simulator/src/accelerator.py`): it steps the offsets in place
  and once more after the last repetition, which is why INT8 can't run below 5 PEs (next bullet but one).
- **`ivd-as` silently truncates** programs longer than `--controller_imem_depth` (default 128). Below 16 PEs the INT8
  program is longer than that. Our scripts size the IMEM automatically. If you edit the staff Makefiles for Part 3,
  pass `--controller_imem_depth` to `ivd-gv` and `ivd-as` too, not only `--pe_count` to `ivd-gv`/`ivd-cc`/`ivd-sim`.
- **INT8 1024×1024 can't run below 5 PEs:** `ivd-sim` increments MemAOffset past 16 bits after the last repetition
  (`ValueError`, accelerator.py:113).
- **Simulation race in the SRAM model:** `read_data` is updated with a blocking `=` in `always @(posedge clk)`, and `q`
  comes from a separate latch block. Event-driven simulators (Icarus, and VCS, which grades us) let every posedge
  block run first, so `q` acts like a normal synchronous SRAM. **Verilator at default optimization doesn't:** it
  inlines the instruction memory, so a controller that latches `inst` at the edge gets the *next* instruction. It
  then **skips the first instruction of every program** and runs one extra zero word at the end. The official tests
  can't see it (the first instruction is a redundant CLR after reset). The staff's `pe_test.asm` can: Verilator gives
  `vector_output` 0, Icarus `0x0800f4f8`. `-fno-inline` fixes it in every case we tried. Our flow uses Icarus by default,
  `-fno-inline` for `SIM=verilator`, and `make eq-both` to compare.

## Smaller gotchas (measured)

- **Verilator reads comments as pragmas** if they *begin* with the word "verilator" (any case, `//` or `/* */`):
  `// Verilator is ...` fails the build with `BADVLTPRAGMA`; `// we use verilator` is fine.
- **Yosys rejects the generated `vector_decoder`** (latch inferred in `always_comb`, since mode 3 has no default), so a
  Yosys flow over the whole design needs a patched copy. Design Compiler only warns.
- `instruction_count` is `IMEM_ADDR_WIDTH` = 7 bits with the default 128-entry IMEM: at most 127 instructions run.
- The skeleton's FSM enum is `int`-based (2-state), so `state` starts at IDLE even before reset.
- `array.sv`'s `loadaddr` task writes `data[i]` instead of `data[load_addr]` (no testbench calls it).
- On the empty skeleton, `tb_pe` prints "Computation Complete": the undriven signals go to X and fire its `posedge` check.

## Blind spots of the official tests (measured)

- **Clamping in 16/32-bit lanes is never exercised:** INT16 results span −475…761 and INT32 −232…450. INT8 clamps
  **78%** of its outputs (801/1024), so a truncating OUT fails int8_test immediately.
- **The last MAC operand of every run is invisible in INT16 and INT32:** the INT16 vector ends in 0 and the INT32 vector
  ends in −1 (0xFFFFFFFF, which byte replication reproduces). A buffer that selects MEM1 lanes with the live mode
  passes all three tests and fails with another seed (`make eq-stress`).
- **The first instruction is a redundant CLR:** a controller that skips it passes.
- **Only CLR/MAC/OUT/NOP are used.** PASS, RND, mode switches and `pe_inst_valid` low are untested (`make pe-unit` covers them).
