# Part 1: the ISA, the Python model and our code

### Walk me through the fields of one instruction, from the most significant bit down.
- **Tags:** part1, isa, encoding
- **Level:** core
- **Answer:** In the tests (16-bit counter) one instruction is 63 bits: the memory instruction (36 bits: opcode 2, mode 2, MemAOffset 16, MemBOffset 16), then the PE instruction (9 bits: opcode 2, mode 2, value 5), then Count (16), MemAIncrement (1) and MemBIncrement (1). The first field is the most significant because `Instruction.get_instruction` joins the parts in that order and bitstring puts the first piece on the left. The offset and Count widths follow the controller counter width; the opcode, mode, value and increment widths are fixed by the ISA. In Part 2 the same layout is the packed struct `instruction_t` in the generated `defines.sv`.
- **See:** part1/src/instruction.py:294-302, part1/src/compiler.py:37-52, docs/walkthrough.html#controller/ctl-bits

### Why does an instruction whose Count field is 0 still run once?
- **Tags:** part1, isa, controller, count
- **Level:** core
- **Answer:** The Count field stores the number of repetitions minus one, so every instruction runs Count + 1 times (handout section 3.3). The assembler does the subtraction: the text `| 64 1 1` becomes a stored count of 63 through `set_count(value-1)`. That way all 2^16 field values are useful (1 to 65,536 repetitions) and no code is wasted on "run zero times". Writing a count of 0 in assembly is rejected: `set_count(-1)` can't build an unsigned field and raises `ValueError`.
- **See:** part1/src/assembler.py:40-42, part1/src/accelerator.py:88, docs/walkthrough.html#controller/ctl-traps

### Why do Count and the two increments exist at all?
- **Tags:** part1, isa, controller, count
- **Level:** core
- **Answer:** They are a loop built into the hardware. Without them the program would need one instruction per column per tile; with them it is 4 instructions per tile, however many columns there are. The INT16 public test (768 × 64 on 64 PEs) is 24 instructions that expand to 402 repetitions, and the INT32 one (13 PEs) is 240 instructions and 4,020 repetitions. A short program fits the small instruction memory (128 entries by default in Part 2), and the controller only needs a counter and two incrementers.
- **See:** docs/walkthrough.html#controller/ctl-why, part1/src/accelerator.py:88-92

### The PE opcode field is only 2 bits, but there are six PE instructions. How is that decoded, and what is the trap?
- **Tags:** part1, isa, pe, decode
- **Level:** deeper
- **Answer:** Opcode 0 (`PEI.NO_VALUE`) means the 5-bit value field names the instruction: MAC = 0, NOP = 1, OUT = 2, PASS = 3, CLR = 4. Opcode 1 is RND, and then the value field is the shift amount s, 0 to 31. The trap is that the same numbers mean different things in different fields: `PEI.MAC == PEI.NO_VALUE == 0` and `PEI.NOP == PEI.RND == 1`, so comparing the opcode against `PEI.NOP` is really a test for RND. Our decoder checks the opcode first and only looks at the value when the opcode is 0.
- **See:** part1/src/instruction.py:109-131, part1/src/processing_element.py:37-51, docs/walkthrough.html#processing-element/pe-decode

### What do the mode codes mean, and what happens with mode 3?
- **Tags:** part1, isa, modes, decode
- **Level:** deeper
- **Answer:** Mode is 2 bits: 0 = INT8, 1 = INT16, 2 = INT32, and `Mode.bitwidth(code)` computes 2^code × 8. Code 3 is not defined by the ISA, and `Mode.bitwidth(3)` gives 64. In our PE that makes the lane count 32 // 64 = 0, and the next line divides by it, so a MAC in mode 3 raises `ZeroDivisionError`. Undocumented behavior is not graded (Ed #238), but in RTL you have to decide anyway: the generated `vector_decoder` has a `case (mode)` with no default, which infers a latch in synthesis.
- **Our design:** What does your RTL do with mode 3: a default branch, a don't-care, or a latch? Check your DC log for latch warnings.
- **See:** part1/src/instruction.py:143-149, part1/src/processing_element.py:57-59

### Why are MemAIncrement and MemBIncrement only one bit each?
- **Tags:** part1, isa, controller, design-choice
- **Level:** deeper
- **Answer:** Every program this machine is built for either steps one entry (MEM0) or one element (MEM1) per repetition, or stays put, so 0 or 1 is all the compiler ever needs. In the `READ | MAC` instruction both are 1: MEM0 moves to the tile's next column and MEM1 to the next vector element. Every other instruction runs once and uses `0 0`. A wider increment would cost bits in every instruction and turn the offset incrementers into full adders, for a feature no program uses.
- **See:** part1/src/compiler.py:87-91, part1/src/compiler.py:37-40

### Why does each instruction carry its own mode, instead of the machine having one global mode register?
- **Tags:** part1, isa, modes, design-choice
- **Level:** deeper
- **Answer:** Both the memory instruction and the PE instruction have a 2-bit mode, so precision belongs to each operation rather than to machine state. The buffer needs it to decode the MEM1 lane and the PE needs it to split its lanes; a program can switch precision between instructions without a separate "set mode" instruction, at a cost of 4 bits per instruction. The given compiler uses one mode for a whole program, and WRITE and NOP carry mode 0 because the assembler never sets it for them. In RTL the catch is that the mode has to travel with the instruction: data that comes back from a READ must be decoded with that READ's mode, not with whatever instruction is current when the data arrives.
- **Our design:** Which mode does your buffer use to pick the MEM1 lane when the data comes back: the READ's registered mode, or the current instruction's?
- **See:** part1/src/assembler.py:73-86, docs/part2-rtl.html

### What does an all-zero instruction word decode to, and why does that matter in Part 2?
- **Tags:** part1, part2, isa, equivalence
- **Level:** deeper
- **Answer:** Every zero field happens to be a valid encoding, so all-zero decodes as `READ INT8 0 0 | MAC INT8` with Count 0: READ = 0, INT8 = 0, and PE opcode 0 with value 0 is MAC. In Part 2, `ivd-as` pads the instruction file with zero words and the testbench runs (lines in `mat_mul.asm`) + 1 instructions, so the RTL executes one extra READ + MAC after the last WRITE. That is harmless because nothing writes MEM2 afterwards, and the staff's `ivd-sim` stops at the first all-zero word. Many ISAs make the all-zero word illegal (RISC-V does) so that running off the end of a program can't do real work.
- **See:** part1/src/instruction.py:15-18, part1/src/instruction.py:109-121, part2/equivalence_testing/Makefile

### How does the compiler split a matrix-vector product across the PEs?
- **Tags:** part1, compiler, mapping, tiling
- **Level:** core
- **Answer:** It cuts the matrix into row tiles of PE_COUNT × lanes rows, where lanes = 32 / w (4 in INT8, 2 in INT16, 1 in INT32), and pads the last tile with zero rows. Each accumulator lane owns one row of the tile for the whole tile, and the columns stream past one per repetition, so that lane adds up M[r][c] · v[c] for c = 0 … cols − 1. The number of tiles is ceil(rows / (P × lanes)); with 16 PEs every equivalence test has exactly 16 tiles (1024 / 64, 512 / 32 and 256 / 16).
- **See:** part1/src/compiler.py:67-85, docs/walkthrough.html#code-map/cm-rows-per-block

### What exactly is in one MEM0 entry?
- **Tags:** part1, compiler, mapping, mem0
- **Level:** core
- **Answer:** One column of one tile: entry `tile × cols + c` holds M[r][c] for the tile's P × lanes rows, packed with the tile's first row in the most significant bits. Cutting the entry into 32-bit slices gives PE i the rows i × lanes to i × lanes + lanes − 1. In a 6 × 3 INT16 example on 2 PEs, MEM0[0] = [1, 4, 7, 10] (column 0 of rows 0-3) and MEM0[3] = [13, 16, 0, 0] (column 0 of the second tile, padded with two zero rows). One READ hands every PE its next matrix operand at once, which is why MEM0 is P × 32 bits wide: 512 bits with 16 PEs.
- **See:** part1/src/compiler.py:71-85, docs/walkthrough.html#code-map/cm-pack-m

### Why is the vector packed into MEM1 in reverse order?
- **Tags:** part1, compiler, mem1, lanes
- **Level:** core
- **Answer:** So that vector element j sits in lane (j mod lanes) counted from the least significant end. Hardware numbers lanes from bit 0, so select value k naturally means bits [w·k +: w], and the reversal makes that natural indexing land on v[j]. Packing puts the first element in the most significant bits, so each group has to be reversed first. For v = [10, 20, 30, 40, 50] in INT8, MEM1[0] = 0x281e140a (40, 30, 20, 10 from the left) and MEM1[1] = 0x00000032, and `READ INT8 0 j` then returns v[j] in every byte: 0x0a0a0a0a, 0x14141414, 0x1e1e1e1e, 0x28282828, 0x32323232.
- **See:** part1/src/compiler.py:93-113, docs/walkthrough.html#main-buffer/mb-why

### MemBOffset counts vector elements, not MEM1 entries. Why design it that way?
- **Tags:** part1, buffer, mem1, controller
- **Level:** deeper
- **Answer:** Then the controller steps through the vector by adding 1 per repetition in every mode, and only the buffer has to know how many elements share an entry. The buffer drops the low log2(lanes) bits to get the entry (offset >> 2 in INT8, >> 1 in INT16) and uses those low bits to choose the lane. The same program shape works for all three modes; only the mode field changes. It also lets MEM1 be a quarter as deep as MEM0: 2^(16 − 2) = 16,384 entries.
- **See:** part1/src/compiler.py:29, docs/walkthrough.html#main-buffer/mb-offbits

### What program does the compiler emit for one tile, and why those four instructions?
- **Tags:** part1, compiler, program
- **Level:** core
- **Answer:** `NOP | CLR | 1 0 0` zeroes the accumulators and outputs. `READ <tile × cols> 0 | MAC | cols 1 1` streams all columns, one READ + MAC per repetition, with MEM1 starting at element 0. `NOP | OUT | 1 0 0` clamps the sums into the output registers, and `WRITE <tile> | NOP | 1 0 0` stores the PE outputs as MEM2 entry `tile`. OUT gets its own instruction before the WRITE because WRITE stores whatever is on the MEM2 input port (Ed #221). One tile costs cols + 3 repetitions, and the whole program is 4 × tiles instructions, whatever the column count.
- **See:** part1/src/compiler.py:87-91, docs/walkthrough.html#code-map/cm-program

### How many instructions and repetitions does the INT8 equivalence test take?
- **Tags:** part1, compiler, program, performance, equivalence
- **Level:** deeper
- **Answer:** 1024 × 1024 in INT8 with 16 PEs is 64 rows per tile, so 16 tiles: 64 instructions and 16 × (1024 + 3) = 16,432 repetitions. INT16 at 512 × 512 and INT32 at 256 × 256 are also 16 tiles each: 8,240 and 4,144 repetitions. In RTL a repetition can take one clock: the zero-bubble reference design measured 16,440, 8,248 and 4,152 cycles, the repetitions plus 8 cycles of fixed overhead that include the 5 reset cycles the testbench counts. The Python model has no clock, so the repetition count is the closest it gets to a performance number.
- **Our design:** Your cycle counts for the three tests, and where the cycles beyond the repetition count come from.
- **See:** part1/src/compiler.py:67-91, docs/oral-prep-src/verify_part1.py

### How do the results come back out, and what does that force on the PE order?
- **Tags:** part1, compiler, mem2, controller
- **Level:** deeper
- **Answer:** `extract_results_from_memory` reads MEM2 entries 0, 1, … and cuts each into w-bit pieces from the left, so entry t must hold tile t's rows in order, first row leftmost. The compiler put the tile's first row leftmost in MEM0 too, so the PE that reads the leftmost MEM0 slice must write the leftmost MEM2 slice. We get that for free by using `cut()` for the inputs and `Bits().join()` for the outputs over the same PE list; numbering PEs from the right would also work, as long as both sides do it. Mixing the two conventions reverses the PE order of every tile's results.
- **Our design:** In your top.sv, which MEM0 slice does PE 0 get, and which MEM2 slice does it drive?
- **See:** part1/src/compiler.py:122-140, part1/src/accelerator.py:95-102, docs/walkthrough.html#controller/ctl-slices

### Why is the accumulator 64 bits when the inputs are 32? Is that enough?
- **Tags:** part1, pe, arithmetic, overflow
- **Level:** stretch
- **Answer:** A product of two w-bit signed numbers needs 2w bits: the largest, (−2^(w−1))², is 2^(2w−2), which fits a signed 2w-bit lane. So a 2w-bit lane holds any single product exactly, but leaves no headroom for the sum: in INT8, two products of −128 × −128 make 32,768, one past the 16-bit maximum. The spec says MAC does not saturate and overflow is not tested (Ed #226), so the width is a cost trade-off, not a guarantee. For the equivalence data it is plenty: values are −5 … 4, so even 1,024 INT8 products stay within ±25,600.
- **See:** handouts/Project_Part_1.pdf#page=5, docs/oral-prep-src/verify_part1.py

### Walk me through a MAC in INT8 mode with real numbers.
- **Tags:** part1, pe, mac, lanes
- **Level:** core
- **Answer:** The 32-bit A and B words are cut into four signed 8-bit lanes and the 64-bit accumulator into four 16-bit lanes, and lane k of A times lane k of B is added into accumulator lane k, independently. With A = [3, −4, 5, −6], B = [7, 8, −9, 10] (most significant lane first) and a cleared accumulator, the lanes become [21, −32, −45, −60], so the accumulator reads 0x0015ffe0ffd3ffc4; a second MAC doubles every lane. Doing the arithmetic on the whole 64-bit word instead would let a carry or borrow spill from one lane into its neighbour, which is why the code loops over lanes.
- **See:** part1/src/processing_element.py:55-74, docs/walkthrough.html#processing-element/pe-lanes

### Your MAC comment says intermediate products can overflow. Is that accurate?
- **Tags:** part1, pe, mac, overflow, our-code
- **Level:** stretch
- **Answer:** Not quite: a single product of two w-bit lanes always fits the 2w-bit accumulator lane; it is the running sum that can overflow. With A = B = −128 in every INT8 lane, one MAC gives 16,384 and a second gives 32,768, one past the 16-bit maximum, which our `% (1 << acc_lane_w)` wraps to −32,768. The wrap is what makes the `Bits(uint=...)` on the next line safe, because `Bits(int=32768, length=16)` would raise. The staff MAC builds `Bits(int=...)` directly, so the same two MACs make the staff simulator raise `ValueError` instead of wrapping.
- **See:** part1/src/processing_element.py:69-70, part2/simulator/src/processing_element.py:65-66

### And if you run OUT after that overflow?
- **Tags:** part1, pe, mac, overflow, out
- **Level:** deeper
- **Answer:** The clamp sees the wrapped value. After two MACs of −128 × −128 our lanes hold −32,768, so OUT gives 0x80808080 (−128 in every lane), while the true sum, 32,768, should clamp to +127: 0x7f7f7f7f, which is what OUT gives after one MAC. That sign flip is allowed, because MAC does not saturate and overflow is not tested (Ed #226). It also means the equivalence tests can't contain overflowing sums, because the staff reference would raise instead of producing an answer.
- **See:** part1/src/processing_element.py:69, docs/oral-prep-src/verify_part1.py

### Which input is A and which is B, and does it matter?
- **Tags:** part1, pe, pass, controller
- **Level:** core
- **Answer:** A ("Data0") is the MEM1 output word: the same broadcast vector element for every PE. B is this PE's own 32-bit slice of the MEM0 word. For MAC the order doesn't matter, since multiplication commutes, but PASS copies A only. Our controller calls `pe.input_a(mem1_word)` and `pe.input_b(mem0_slice)`; swapped, every public test would still pass because the compiler never emits PASS, but a private PASS test would load a matrix element instead of the vector.
- **See:** part1/src/accelerator.py:97-100, handouts/Project_Part_1.pdf#page=6

### What does OUT do, and what does it leave alone?
- **Tags:** part1, pe, out, clamping
- **Level:** core
- **Answer:** For each lane it clamps the signed accumulator value to the output lane's range, [−2^(w−1), 2^(w−1) − 1], narrows it to w bits, and packs the lanes in their existing order into the 32-bit output register. The accumulator is unchanged, so more MACs can continue the same sums after an OUT. In INT8, accumulator lanes [300, −300, 127, −129] give output lanes [127, −128, 127, −128] = 0x7f807f80, and the accumulator still holds [300, −300, 127, −129]. Only OUT and CLR ever change the output register.
- **See:** part1/src/processing_element.py:76-97, docs/walkthrough.html#processing-element/pe-ops

### Why clamp at OUT instead of just keeping the low bits?
- **Tags:** part1, pe, out, clamping, testing
- **Level:** deeper
- **Answer:** The result has to fit a w-bit lane of MEM2, and clamping gives the closest value that fits, while wrapping can flip the sign: +40,000 kept to 16 bits is −25,536, but clamped it is 32,767. The public INT16 example shows it: accumulator [−40000, 40000] gives OUT = 0x80007fff, which is [−32768, 32767]. It matters on the real data too: in the INT8 equivalence test the true results run from −578 to 1198 and 801 of the 1,024 outputs (78.2%) are clamped, so a PE that truncates fails int8_test at once. The INT16 and INT32 tests never clamp, so they can't catch a clamping bug in 16- or 32-bit lanes.
- **See:** part1/src/processing_element.py:86-92, docs/oral-prep-src/verify_part1.py

### Why does MAC wrap but OUT clamp? Isn't that inconsistent?
- **Tags:** part1, pe, mac, out, overflow
- **Level:** deeper
- **Answer:** They do different jobs. The accumulator is wide scratch space, and a hardware adder simply drops the carry out of its top bit, which is wrapping; the spec says MAC does not saturate. OUT produces the narrow final result that leaves the PE, where the closest representable value is far more useful than a wrapped one. Saturating inside the MAC would also put overflow detection and a multiplexer on the adder path every cycle, while OUT runs once per tile.
- **See:** handouts/Project_Part_1.pdf#page=6, docs/walkthrough.html#processing-element/pe-ops

### What does PASS do, exactly?
- **Tags:** part1, pe, pass, sign-extension
- **Level:** core
- **Answer:** Each lane of A (Data0, the MEM1 word) is sign-extended into the matching accumulator lane; B and the output register are untouched. In INT16, A = [−15, 7] makes the accumulator 0xfffffff100000007, and a following OUT gives 0xfff10007. In INT8, A = 0x7f80fd03 makes it 0x007fff80fffd0003: each byte grows to 16 bits with copies of its own sign bit, so 0xfd (−3) becomes 0xfffd. The compiler never emits PASS; it lets a program start the accumulators from a value instead of zero, and the private tests can check it.
- **See:** part1/src/processing_element.py:99-113, docs/walkthrough.html#processing-element/pe-ops

### What does CLR clear, and why did the public CLR tests pass before you had written any code?
- **Tags:** part1, pe, clr, testing
- **Level:** core
- **Answer:** CLR sets both the accumulator and the output register to zero, each at its own width (64 and 32 bits). The public CLR tests run MAC, OUT, CLR and then check that both registers are zero, but on the empty starter skeleton MAC and OUT did nothing either, so the registers never left zero and all three CLR tests passed while every other PE test failed. They only test CLR once MAC and OUT work; then a CLR that cleared just the accumulator fails, because the output still holds the OUT value. In the compiled program CLR starts every tile, so a CLR that forgot the accumulator would also carry one tile's sums into the next, and the full accelerator test would catch it.
- **See:** part1/src/processing_element.py:115-120, docs/walkthrough.html#processing-element/pe-traps

### What happens to the output register during MAC, PASS, RND and NOP?
- **Tags:** part1, pe, out, controller
- **Level:** core
- **Answer:** Nothing: among PE instructions only OUT and CLR update it, and MAC, PASS, RND and NOP keep its previous value. In our code that holds because only `_handle_out` and `_handle_clr` assign `self._output_value`. It matters because the controller copies every PE's output register onto the MEM2 input port after every repetition, so a WRITE that comes later still stores the OUT result, as long as only those four instructions ran in between.
- **See:** part1/src/processing_element.py:95, part1/src/processing_element.py:117-118, part1/src/accelerator.py:102

### Explain RND with ties to even, using numbers.
- **Tags:** part1, pe, rnd, rounding
- **Level:** core
- **Answer:** RND divides each accumulator lane by 2^s and rounds to the nearest integer, and on an exact tie it picks the even neighbour. s is the 5-bit value field read as unsigned (0-31), the result goes back into the same lane, and the output register is untouched. INT8 lanes [5, −5, 3, −3] with s = 1 are 2.5, −2.5, 1.5 and −1.5, which round to [2, −2, 2, −2]; an OUT then gives 0x02fe02fe. Non-ties go to the nearest: [7, −7, 5, −5] with s = 2 is 1.75, −1.75, 1.25, −1.25, which becomes [2, −2, 1, −1]. With s = 0 nothing changes.
- **See:** part1/src/processing_element.py:122-155, docs/walkthrough.html#processing-element/pe-rnd

### Walk me through your RND code for a negative tie, line by line.
- **Tags:** part1, pe, rnd, rounding, our-code
- **Level:** deeper
- **Answer:** Take a lane holding −5 and s = 1. `halfway = 1 << (s-1)` is 1. `q = acc >> s` is −3, because Python's `>>` on a negative int rounds toward −∞ (it's a floor). `r = acc - (q << s)` is −5 − (−6) = 1; r is always between 0 and 2^s − 1. r equals halfway, so it's a tie, and q = −3 is odd, so the result is q + 1 = −2: −2.5 rounded to even. Because q is a floor and r is never negative, the same three comparisons work for positive and negative lanes.
- **See:** part1/src/processing_element.py:136-148

### Why is there an `if s != 0` in your RND?
- **Tags:** part1, pe, rnd, our-code
- **Level:** deeper
- **Answer:** For s = 0, `halfway = 1 << (s-1)` would be `1 << -1`, and Python raises `ValueError: negative shift count`. Dividing by 2^0 changes nothing, so the guard skips the rounding and writes the lane back unchanged. The staff version avoids the special case by using `divmod(x, 2**s)`: with a divisor of 1 the remainder is always 0, so it never rounds up.
- **See:** part1/src/processing_element.py:136-137, part2/simulator/src/processing_element.py:86-95

### Why not just write `round(acc / 2**s)`? Python's round already does ties to even.
- **Tags:** part1, pe, rnd, rounding, floating-point
- **Level:** stretch
- **Answer:** The division would happen in floating point first, and a double has a 53-bit mantissa while an accumulator lane can be 64 bits. Take an INT32 lane holding 2^62 + 3 and s = 1: the exact answer is 2^61 + 1.5, a tie, which rounds to the even 2^61 + 2 = 2305843009213693954. But `(2**62 + 3) / 2` loses the + 3 before any rounding happens, and `round()` returns 2^61 = 2305843009213693952. Integer shifts and comparisons are exact at any width, and they are what the hardware does anyway.
- **See:** part1/src/processing_element.py:136-148, docs/oral-prep-src/verify_part1.py

### Run through INT16 mode: what are the lanes, and give me a MAC, an OUT and a RND.
- **Tags:** part1, pe, lanes, mac, out, rnd
- **Level:** deeper
- **Answer:** Two 16-bit input lanes and two 32-bit accumulator lanes. The public MAC test has A = [−20000, 20000] and B = [2, 2], which gives [−40000, 40000]: that fits easily in 32 bits, and OUT clamps each lane to 16 bits, giving [−32768, 32767] = 0x80007fff. RND with s = 2 on lanes [−6, −10] computes −1.5 and −2.5, both ties, which go to the even neighbours [−2, −2]. On the buffer side, `READ INT16` picks the low or high half of a MEM1 word with MemBOffset[0] and repeats it twice.
- **See:** part1/src/processing_element.py:55-155, part1/test/test_processing_element.py, docs/oral-prep-src/verify_part1.py

### And in INT32 mode?
- **Tags:** part1, pe, lanes, mac, out, rnd
- **Level:** deeper
- **Answer:** One 32-bit lane and one 64-bit accumulator lane, so there is nothing to split and nothing to replicate. The public MAC test multiplies 2^30 by 2: the accumulator holds 2^31 = 2147483648, one past the 32-bit maximum, so OUT clamps it to 0x7fffffff. PASS of −1 sign-extends to 64 ones, 0xffffffffffffffff. RND with the largest shift, s = 31, turns 3 × 2^30 (1.5) into 2 and 2^30 (0.5) into 0, both ties going to the even neighbour. `READ INT32` returns MEM1[MemBOffset] unchanged.
- **See:** part1/test/test_processing_element.py, docs/oral-prep-src/verify_part1.py

### What does your PE do with an opcode or value the ISA doesn't define, and what does the staff's do?
- **Tags:** part1, pe, decode, our-code, staff-reference
- **Level:** stretch
- **Answer:** Ours treats any nonzero opcode as RND (the `else` on line 50), so opcode 2 behaves like RND with s = value, and a value of 5-31 under opcode 0 falls into `else: pass` and acts as a NOP. The staff reference raises `ValueError` for both, from the `case _` branches of its `match`. Neither is wrong for grading, since undocumented behavior is not graded (Ed #238), but raising is the better debugging aid in a model: a corrupted instruction fails loudly instead of quietly changing the accumulator. In RTL there is no "raise", so you choose: treat it as a NOP, as a don't-care, or set an error flag.
- **Our design:** What does your processing_element.sv do for undefined opcodes or values?
- **See:** part1/src/processing_element.py:37-51, part2/simulator/src/processing_element.py:36-54

### Your PE reads its widths from `self._config` instead of hard-coding 32 and 64. Why?
- **Tags:** part1, pe, parameters, our-code
- **Level:** core
- **Answer:** The handout says the design is meant to be expandable and that bit widths come "through a configuration object passed to the constructor". So the code derives everything from INPUT_BITWIDTH, ACCUMULATION_BITWIDTH and OUTPUT_BITWIDTH: lanes = input width / w, accumulator lane = accumulator width / lanes, output lane = output width / lanes. With the graded 32/64/32 configuration (Ed #249) that gives 16-, 32- and 64-bit accumulator lanes. The staff code computes the accumulator lane as w × (ACC // IN) and uses w for the output lane, which agrees whenever ACC is a multiple of IN and OUT equals IN. In Part 2 the same widths come from the `` `define `` macros in the generated defines.sv, such as `` `PE_ACCUMULATION_BITWIDTH ``.
- **See:** part1/src/processing_element.py:57-59, part1/src/processing_element.py:80-83, part2/simulator/src/processing_element.py:59-61, handouts/Project_Part_1.pdf#page=9

### Your PE handles the lanes in a Python loop. What does that become in hardware?
- **Tags:** part1, part2, pe, lanes, rtl-mapping
- **Level:** deeper
- **Answer:** The loop runs the lanes one after another, but in hardware they are parallel copies of a circuit: four 8 × 8 multipliers, two 16 × 16 or one 32 × 32 depending on the mode, each feeding its own adder on its own slice of the accumulator. `cut` and `join` become bit-slice wiring, and the mode selects which results are written into the accumulator register, through a multiplexer. A SystemVerilog `for` or `generate` loop over lanes is unrolled at elaboration into copies of the hardware; no loop variable exists in the circuit. Part 3's hardware-reuse hint is about sharing those multipliers across modes (the handout says 4 or fewer is possible).
- **Our design:** How many multipliers does your PE have, and do the modes share any?
- **See:** part1/src/processing_element.py:64-72, docs/part3-ppa.html#reuse/re-why, handouts/Project_Part_3.md

### What does READ do in each of the three modes?
- **Tags:** part1, buffer, read, lanes
- **Level:** core
- **Answer:** In every mode the MEM0 port gets the whole entry MEM0[MemAOffset]. The MEM1 port depends on the mode: INT32 gives MEM1[MemBOffset] as it is; INT16 reads entry MemBOffset[MSB:1] and uses MemBOffset[0] to pick the low (0) or high (1) half, repeated twice; INT8 reads entry MemBOffset[MSB:2] and uses MemBOffset[1:0] to pick one of four bytes, repeated four times. With MEM1[5] = 0x11223344: `READ INT32 3 5` gives 0x11223344, `READ INT16 3 10` gives 0x33443344 and `READ INT16 3 11` gives 0x11221122, and `READ INT8 3 20` to `3 23` give 0x44444444, 0x33333333, 0x22222222 and 0x11111111.
- **See:** part1/src/main_buffer.py:48-61, docs/walkthrough.html#main-buffer/mb-ops

### Why does READ copy the selected element into every lane?
- **Tags:** part1, buffer, read, broadcast, simd
- **Level:** core
- **Answer:** During a MAC every lane of every PE works on a different row but the same column c, so they all need the same v[c] at the same moment. Replicating the element across the 32-bit word lets each PE multiply lane by lane without knowing how the vector was packed, and the one MEM1 word is then broadcast to all PEs. In INT32 there is only one lane, so nothing is copied.
- **See:** docs/walkthrough.html#main-buffer/mb-why, part1/src/main_buffer.py:59

### Explain line 58 of your main_buffer.py: why `lanes_per_word - 1 - ...`?
- **Tags:** part1, buffer, read, lanes, our-code, bitstring
- **Level:** deeper
- **Answer:** Hardware numbers lanes from bit 0, so lane 0 is the least significant, but bitstring's `cut(w)` lists the pieces from the most significant end, so lane k is item lanes − 1 − k of that list. MemBOffset mod lanes is the hardware lane number, and the subtraction turns it into a list index: for offset 20 in INT8 the lane is 0 and the index is 3, the rightmost byte, 0x44 in the word 0x11223344. The staff code does the same with negative indexing, `output[-1 * (cut_index + 1)]`. Then `* lanes_per_word` on line 59 repeats that one w-bit piece to fill 32 bits.
- **See:** part1/src/main_buffer.py:56-59, part2/simulator/src/main_buffer.py:52-62

### You compute the entry with `//` and the lane with `%`, but the handout talks about bit slices. Same thing?
- **Tags:** part1, buffer, read, our-code, rtl-mapping
- **Level:** deeper
- **Answer:** Yes, because the lane count is a power of two: offset // 4 equals offset >> 2, which is MemBOffset[MSB:2], and offset % 4 equals offset & 3, which is MemBOffset[1:0]. The staff code writes it as a shift by ceil(log2(32 / w)). In RTL it's cheaper still: no divider at all, just wires that pick bit fields of the offset, plus a multiplexer that picks the lane.
- **See:** part1/src/main_buffer.py:56-58, part2/simulator/src/main_buffer.py:53-56, docs/spec-notes.md

### What do WRITE and NOP do in the buffer, and what happens to the output ports?
- **Tags:** part1, buffer, write
- **Level:** core
- **Answer:** WRITE stores the MEM2 input port at MEM2[MemAOffset]; MemBOffset is unused (the assembler sets it to 0, and the mode field is 0 too). NOP does nothing. In both cases the MEM0 and MEM1 ports keep the values from the last READ. Putting the PE outputs on the MEM2 input port is the controller's job, not the buffer's: WRITE stores whatever is on the port at that moment.
- **See:** part1/src/main_buffer.py:63-67, part1/src/assembler.py:79-86

### The public READ tests pass with a buffer that always takes lane 0. How would you have caught that bug?
- **Tags:** part1, buffer, read, testing, verification
- **Level:** deeper
- **Answer:** The public tests only use `READ INT16 130 26` and `READ INT8 130 24`, and 26 and 24 both have zero select bits, so only lane 0 is ever exercised. A direct test fills a MEM1 entry with distinct bytes such as 0x11223344 and reads offsets 4k to 4k + 3 in INT8 and 2k, 2k + 1 in INT16, expecting each byte or half replicated. The full accelerator test would also catch it, because every column whose element isn't in lane 0 would multiply by the wrong vector element.
- **See:** docs/spec-notes.md, part1/test/test_main_buffer.py:46, part1/test/test_main_buffer.py:93

### Walk me through one repetition in your controller, in order.
- **Tags:** part1, controller, ordering, our-code
- **Level:** core
- **Answer:** First the buffer runs this repetition's memory instruction: a fresh copy with offsets base + i × increment (lines 89-93). Then the controller cuts the MEM0 port into 32-bit slices, gives PE i slice i as B and the MEM1 port as A, and every PE executes the same PE instruction (lines 95-100). Last it joins all the PE outputs into one word and puts it on the MEM2 input port (line 102). Memory has to come first because READ supplies the operands to the PE operation it's paired with in the same repetition (Ed #221).
- **See:** part1/src/accelerator.py:88-102, docs/walkthrough.html#controller/ctl-order

### What would go wrong if the PEs ran before the memory instruction?
- **Tags:** part1, controller, ordering, testing
- **Level:** deeper
- **Answer:** Every MAC would use the previous repetition's port values. In each tile the first MAC would reuse the previous tile's last column (or zeros at the start), and the tile's own last column would never be multiplied. So every sum misses its own last-column product and gains the previous tile's last-column product for the same lane; both are multiplied by v[cols − 1]. If the vector ends in 0, both terms vanish and the test passes. We ran exactly that in Python: the PEs-first order matches M @ v when v ends in 0 and fails when it ends in 4.
- **See:** docs/walkthrough.html#controller/ctl-orderdemo, docs/spec-notes.md, docs/oral-prep-src/verify_part1.py

### The staff's reference controller orders a repetition differently from yours. How, and does it matter?
- **Tags:** part1, controller, ordering, staff-reference
- **Level:** deeper
- **Answer:** The staff version runs READ and NOP before the PEs but WRITE after them: it executes the PE instruction, puts the outputs on the MEM2 port, and only then performs a WRITE (lines 83-106). Ours runs every memory instruction first, so our WRITE stores the outputs collected at the end of the previous repetition. They differ only when WRITE is paired with a PE instruction that changes the output, i.e. `WRITE | OUT`. We ran `CLR; READ | MAC; WRITE 0 | OUT` through both: ours stored [0, 0, 0, 0] (the outputs before that OUT) and the staff's stored [6, 15, 24, 3]. Staff ruled that pairing is not graded (Ed #221), and the compiler always puts OUT in its own instruction before the WRITE, so both are correct.
- **See:** part1/src/accelerator.py:88-102, part2/simulator/src/accelerator.py:77-119, docs/oral-prep-src/verify_part1.py

### Which of the two Python orders behaves like your RTL?
- **Tags:** part1, part2, controller, ordering, timing
- **Level:** stretch
- **Answer:** It depends on when your WRITE samples the PE output register relative to the PE operation it's paired with. In RTL a synchronous SRAM returns read data a cycle after the address, so each PE operation runs at least a cycle after its memory operation, and the WRITE has to sample the output after the preceding OUT has updated it. If your WRITE commits on the same clock edge on which its own paired PE operation updates the output register, it stores the value from before that operation, which is our Python order. If it commits one cycle later, it stores the value after, which is the staff's order. Because WRITE is always paired with a PE NOP in graded programs, both choices pass. (Heads-up: this describes timing choices; derive your own before reading the Part 2 pages.)
- **Our design:** In which cycle does your WRITE commit, relative to the cycle the controller issues it, and why is the OUT result already in the output register by then?
- **See:** part2/simulator/src/accelerator.py:100-106, docs/part2-rtl.html

### Why does your controller build a new MemoryInstruction every repetition instead of incrementing the offsets?
- **Tags:** part1, controller, count, our-code, staff-reference
- **Level:** deeper
- **Answer:** So that the Instruction object we were handed stays exactly as the program says. The staff reference adds the increments into the instruction's own memory instruction (lines 108-114), so after one run of `READ INT16 0 0 | MAC INT16 | 4 1 1` its MemAOffset reads 4, and running the same object again would start at the wrong address; ours still reads 0. The staff loop also increments once more after the last repetition, and that has a real consequence: with 4 PEs the INT8 equivalence test ends with `READ INT8 64512 0 | MAC INT8 | 1024 1 1`, whose last offset is 65,535, so the staff controller raises `ValueError` trying to store 65,536 in the 16-bit field. So ivd-sim can't run the INT8 test with fewer than 5 PEs (4 PEs fit MEM0 exactly but trip this; fewer don't fit at all), a limit worth knowing when you size the design in Part 3. Ours never computes an offset it doesn't use.
- **See:** part1/src/accelerator.py:88-93, part2/simulator/src/accelerator.py:108-119, docs/walkthrough.html#controller/ctl-traps

### Line 89 reaches into `mi._memory_config`. Why, and is there a cleaner way?
- **Tags:** part1, controller, our-code, python
- **Level:** deeper
- **Answer:** The `MemoryInstruction` constructor needs the field-width configuration, and the only place the controller can get it is the original instruction's private attribute; the leading underscore is a naming convention, not enforced, so it works. Cleaner: `copy.copy(mi)`, which is safe here because the Bits inside are immutable and every setter builds a new one. What an examiner will care about is that you know why a copy is needed at all: so the program's instruction is never modified.
- **See:** part1/src/accelerator.py:89-92

### Why does your controller copy the PE outputs onto the MEM2 port after every repetition, not just before a WRITE?
- **Tags:** part1, controller, mem2, our-code
- **Level:** deeper
- **Answer:** It's simpler, and it matches the hardware picture: the PE output registers are wired to the MEM2 input port all the time, and a WRITE only decides when MEM2 captures it. In Python it costs one join of P words per repetition, which is cheap. The staff code also refreshes the port every repetition (lines 101-104); its special case is running a WRITE after that refresh instead of before.
- **See:** part1/src/accelerator.py:102, part2/simulator/src/accelerator.py:100-106

### What is SIMD about this machine, concretely?
- **Tags:** part1, simd, architecture, controller
- **Level:** core
- **Answer:** Single instruction, multiple data: on every repetition all PEs receive the identical PE instruction (in our code, the same `pi` object) and the same MEM1 word as A, and the only thing that differs is B, each PE's own 32-bit slice of the MEM0 word. So the PEs perform the same operation on different rows of the matrix in lockstep. There is a second level inside each PE: in INT8 and INT16 one 32-bit datapath does 4 or 2 independent lane operations at once.
- **See:** part1/src/accelerator.py:95-100, handouts/Project_Part_1.pdf#page=8, docs/walkthrough.html#big-picture/bp-why

### How many multiply-accumulates happen per repetition with 16 PEs, in each mode?
- **Tags:** part1, simd, lanes, performance
- **Level:** deeper
- **Answer:** PEs × lanes: 16 × 4 = 64 in INT8, 16 × 2 = 32 in INT16 and 16 × 1 = 16 in INT32, which is also the number of rows per tile. So the INT8 equivalence test has 16 times as many products as the INT32 one (1024² against 256²) but needs only 4 times the repetitions: 16,384 MAC repetitions against 4,096, plus 3 per tile. That's the handout's "smaller bit-widths" trend: narrower numbers buy more operations per cycle on the same wires.
- **See:** handouts/Project_Part_1.pdf#page=5, docs/oral-prep-src/verify_part1.py
