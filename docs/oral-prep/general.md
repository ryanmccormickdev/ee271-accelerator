# General: the whole project, verification, teamwork, AI and HLS

### Tell me about your project in one minute.
- **Tags:** general, overview, architecture
- **Level:** core
- **Answer:** It's a programmable matrix-vector accelerator: an array of P processing elements that all execute the same instruction (SIMD), each multiply-accumulating its own rows of the matrix against a broadcast vector element, in 8-, 16- or 32-bit lanes. We wrote a Python model of its instruction set, then the SystemVerilog RTL, checked the RTL against the staff's Python reference on full-size test matrices, synthesized it to Nangate 45 nm gates with Design Compiler, and then optimized power, performance and area against a figure of merit. Finish with the part you're proudest of and one number.
- **Our design:** Your one number: cycles, clock period, area or final FoM.
- **See:** docs/walkthrough.html#big-picture

### Why build a SIMD accelerator for this at all?
- **Tags:** general, simd, architecture
- **Level:** core
- **Answer:** Matrix-vector multiply is nothing but multiply-accumulate, so instead of a general processor the chip is a row of identical MAC units plus just enough memory and control to keep them busy. The handout gives two reasons for SIMD in particular. Expandability: you can add or remove PEs without architectural changes; MEM0 and MEM2 just get wider. Routability: every PE receives the same instruction, so the instruction is one shared bus instead of per-PE routing, which reduces routing congestion. Lecture 8 puts accelerator gains down to parallelization plus specialization, and this design has both.
- **See:** handouts/Project_Part_1.pdf#page=8, docs/walkthrough.html#big-picture/bp-why

### What limits how far you can scale the number of PEs?
- **Tags:** general, simd, scaling, part3
- **Level:** deeper
- **Answer:** Cycles fall roughly as 1/P only while tiles have rows to fill: tiles = ceil(rows / (P × lanes)), so once P × lanes exceeds the row count, extra PEs only compute padding. Area grows about linearly with P, and Part 3 caps it at 1,000,000 µm². Wiring gets harder too: the MEM1 word and the PE instruction fan out to every PE, so those nets need buffer trees that add delay, and MEM0 and MEM2 are P × 32 bits wide. With the zero-bubble reference design, INT32 256 × 256 took 8,296, 4,152, 2,080 and 1,044 cycles for P = 8, 16, 32 and 64: almost exactly halving each time.
- **Our design:** Which PE count did you choose, and what stopped you going higher: the area cap, timing, power or the FoM?
- **See:** docs/part3-ppa.html#fom/fom-pe, docs/part3-ppa.html#opt/sizing, handouts/Project_Part_3.md

### What are the three parts of any accelerator, and where are they in your design?
- **Tags:** general, architecture
- **Level:** core
- **Answer:** Lecture 8's anatomy is memory, datapath and control. Memory is the main buffer (MEM0 for the matrix, MEM1 for the vector, MEM2 for the results) plus the instruction memory. The datapath is the PE array. Control is the controller stepping through instructions and expanding each one into Count + 1 repetitions. They map one to one onto the Part 1 files (main_buffer.py, processing_element.py, accelerator.py) and the Part 2 modules (buffer.sv, processing_element.sv, controller.sv, tied together in top.sv).
- **See:** docs/walkthrough.html#big-picture/bp-why

### What is the dataflow of this machine, and what is an alternative?
- **Tags:** general, dataflow, architecture
- **Level:** stretch
- **Answer:** Output-stationary: each accumulator lane keeps one output's partial sum for a whole tile while the matrix columns stream past, and the sum leaves the PE only once (OUT, then WRITE). Every matrix element is read once, and each vector element is broadcast to all lanes once per tile. A weight-stationary systolic array, like the TPU (the course links the TPU paper and a systolic-array explainer), instead holds matrix values fixed in a grid of PEs and passes inputs and partial sums between neighbours. That reuses each weight across many input vectors, which pays off for matrix-matrix products; for a single matrix-vector product each matrix element is used once anyway.
- **See:** docs/walkthrough.html#big-picture/bp-why, https://telesens.co/2018/07/30/systolic-architectures/

### Is this matrix-vector product limited by compute or by memory bandwidth?
- **Tags:** general, memory, performance, architecture
- **Level:** stretch
- **Answer:** Each matrix element is used in exactly one multiply, so the machine needs one new matrix element per MAC: about one MAC per element loaded, which is low arithmetic intensity. The design matches bandwidth to compute by construction: MEM0 is P × 32 bits wide, so one READ per cycle delivers exactly one operand per lane, while the vector element is reused by all P × lanes lanes through the broadcast. More PEs without a wider MEM0 would just sit idle, which is why `validate()` ties the PE count to the MEM0 width.
- **See:** part1/src/accelerator.py:20-33, https://docs.nersc.gov/tools/performance/roofline/

### Your project exists at three levels: Python, RTL and gates. What does each level capture that the one above it doesn't?
- **Tags:** general, abstraction, verification
- **Level:** core
- **Answer:** The Python model is functional and instruction-level: it defines what each instruction does to every register and memory, with no clock. The RTL adds time: registers, a clock and reset, the SRAM's one-cycle read latency and the exact cycle in which everything happens, and it has to be synthesizable. The gate-level netlist from Design Compiler replaces the RTL operators with real Nangate 45 nm cells that have area, delay and power, so only there do you get timing slack, µm² and mW. The RTL is checked against Python by equivalence tests; the netlist is trusted to match the RTL because DC produced it, since the course flow does not simulate it.
- **See:** docs/part2-rtl.html, docs/synthesis.html

### How do you know your RTL does the same thing as the Python model?
- **Tags:** general, verification, equivalence, part2
- **Level:** core
- **Answer:** Equivalence testing: the same random program and data (from ivd-mg, ivd-cc and ivd-as) run through the staff's Python reference (ivd-sim) and through our RTL in a simulator, and `check_results.sh` diffs the RTL's complete MEM2 dump (65,536 words of 512 bits) against the Python output. Three tests cover the three modes: INT8 1024 × 1024, INT16 512 × 512 and INT32 256 × 256, with values −5 … 4. Before that, each module gets its own staff testbench (tb_pe and the others), where you have to judge the waveforms yourself.
- **Our design:** What did your module-level checks look like before the equivalence tests passed?
- **See:** part2/equivalence_testing/Makefile, docs/part2-rtl.html

### When `make int16_test` finishes without an error, has your design passed?
- **Tags:** general, verification, equivalence, part2
- **Level:** deeper
- **Answer:** Not necessarily. `check_results.sh` is an `if diff ... then echo PASSED else echo FAILED` with nothing after it, so it exits with status 0 either way, and make reports success even when MEM2 differs. You have to read the "Test PASSED!" or "Test FAILED!" line (and diff prints the differing lines above it). Any script that runs the tests for you should grep for that line rather than trust the exit status.
- **See:** part2/equivalence_testing/check_results.sh

### Walk me through what happens, end to end, when you run int8_test.
- **Tags:** general, part2, equivalence, flow
- **Level:** core
- **Answer:** ivd-mg makes a random 1024 × 1024 matrix (seed 0) and a 1024-element vector (seed 12345); ivd-cc compiles them into MEM0 and MEM1 images and an assembly program; ivd-as assembles it into instruction bits; ivd-gv generates defines.sv for 16 PEs. Then VCS compiles our RTL with the testbench, ivd-sim runs the staff's Python on the same files, and simv runs our RTL: it loads the memories, runs until the program counter reaches the instruction count and both valid signals are low, prints the cycle count and dumps MEM2. Finally check_results.sh diffs the two MEM2 files.
- **See:** part2/equivalence_testing/Makefile, part2/equivalence_testing/testbench/tb_top.sv, docs/part2-rtl.html

### How do you know your design is correct beyond passing the provided tests?
- **Tags:** general, verification, testing, equivalence
- **Level:** core
- **Answer:** Three tests with one seed each are evidence, not proof, and these have known blind spots. The INT16 test vector ends in 0 and the INT32 vector ends in −1, so a buffer bug that mis-decodes the last MAC operand of every tile passes all three official tests but fails with another random seed. The INT16 and INT32 results never reach the clamp limits, and the compiler never emits PASS or RND. So a good answer names the extra checks and what each one catches: `make eq-stress` (other seeds, INT16 and INT32 values that clamp, one column, partial tiles), `make eq-both` (a second simulator), and module checks against the staff's Python such as `make pe-unit` (every op in every mode, including RND and PASS) and `make buf-unit` (READs from every MEM1 lane).
- **Our design:** List the extra checks you actually ran and what each one would catch.
- **See:** docs/spec-notes.md, docs/oral-prep-src/verify_part1.py

### Why does a vector that ends in −1 hide that buffer bug?
- **Tags:** general, verification, testing, buffer
- **Level:** deeper
- **Answer:** The bug decodes the data that comes back from a READ with the current instruction's mode instead of the mode of the READ that fetched it. When the data for a tile's last READ comes back, the controller has moved on to `NOP | OUT` (in a design without bubbles), whose memory mode field is 0 (INT8), so the last column's vector element is decoded as a byte. −1 is all ones, and any byte of 0xFFFFFFFF repeated four times is 0xFFFFFFFF again, so the INT32 test gets the right value; the INT16 test's last element is 0, which survives any decoding too. The INT8 test can't see this bug at all, because there the wrong mode and the right mode are both INT8. Random data can hide a bug when the values that would expose it happen to be special, so vary the seeds and test the corner values on purpose.
- **See:** docs/oral-prep-src/verify_part1.py, part2/equivalence_testing/Makefile

### What do the equivalence tests not exercise at all?
- **Tags:** general, verification, testing, equivalence
- **Level:** deeper
- **Answer:** The compiler only emits CLR, MAC, OUT and NOP on the PE side and READ, WRITE and NOP on the buffer side, so PASS and RND never run. Clamping only happens in INT8. Overflow can't happen: with values −5 … 4 even 1,024 INT8 products stay within ±25,600, and the staff reference would raise on an overflow anyway. Every program starts with a `NOP | CLR` that is redundant right after reset, so a design that skips its first instruction still passes. Only 16 PEs, one size per mode and one seed per test are used, and pairings like `WRITE | OUT` are excluded by the staff (Ed #221). Each of those needs its own test, most easily at module level.
- **See:** part1/src/compiler.py:87-91, docs/oral-prep-src/verify_part1.py

### Your design passes the equivalence tests in one simulator. Why run them in a second one?
- **Tags:** general, verification, simulation, part2
- **Level:** deeper
- **Answer:** Because simulators can legally disagree when the code has a race, and the given SRAM model has one: `array.sv` updates `read_data` with a blocking assignment in a clocked block and drives `q` from a separate latch block. Event-driven simulators such as Icarus (and very likely VCS) run every posedge block before the latch updates `q`, so it behaves as a normal synchronous SRAM. Verilator at its default optimization turns `q` into an alias of `read_data`, so a controller that latches `inst` at the clock edge skips the first instruction of every program. The official tests can't see that, because each program starts with a `NOP | CLR` that changes nothing right after reset; the staff's `pe_test.asm` does show it. The repo's flow uses Icarus for pass/fail, Verilator agrees with Icarus once you add `-fno-inline`, and `make eq-both` runs both and flags any disagreement.
- **See:** part2/unoptimized_verilog/logical/array.sv, part2/unoptimized_verilog/validation/testbenches/pe_test.asm, docs/part2-rtl.html

### What is a race in a Verilog simulation, and how do you keep your own RTL free of them?
- **Tags:** general, verification, simulation, part2, rtl
- **Level:** stretch
- **Answer:** A race is when the result depends on the order in which the simulator happens to run processes woken by the same event; both orders are legal, so two simulators, or two versions of one, can differ. The classic cause is a blocking assignment (`=`) to a register inside a clocked block: another `always @(posedge clk)` block may read that variable before or after it changes. The rule that avoids it: nonblocking assignments (`<=`) for every flip-flop in `always_ff`, blocking ones only in `always_comb`, and never drive one variable from two blocks. Then every flop samples the values from before the edge, whatever the order. The given array.sv breaks the first rule, and that is where the Icarus and Verilator disagreement comes from.
- **Our design:** Point to one `always_ff` block in your RTL and say why its assignments are nonblocking.
- **See:** part2/unoptimized_verilog/logical/array.sv, docs/part2-rtl.html

### How does the testbench decide your design has finished, and how could a pipelined design fool it?
- **Tags:** general, verification, testbench, part3
- **Level:** deeper
- **Answer:** It waits for `simulation_complete`, which is true when the program counter equals the instruction count and both `pe_inst_valid` and `buf_inst_valid` are low; then it waits one clock period, prints the cycle count and dumps MEM2. It triggers on `posedge simulation_complete`, so even a zero-width glitch counts: if one valid falls in the same time step in which the other rises while the counter is at the end, the dump can start too early. A deeper Part 3 pipeline must therefore keep a valid signal high until its last WRITE has committed, and never let both drop, even for a delta. A glitch like that once made two simulators report cycle counts one apart (16,503 against 16,504) for the same design.
- **Our design:** Which signal stays high in your design until the last WRITE commits?
- **See:** part2/equivalence_testing/testbench/tb_top.sv:128-134, docs/part3-ppa.html#cycles/cy-glitch

### Why compare against the staff's Python simulator and not your own Part 1?
- **Tags:** general, verification, equivalence, staff-reference
- **Level:** deeper
- **Answer:** The equivalence tests you have to pass compare against it, so it defines "correct" for Part 2, and our Part 1 might have bugs the private tests didn't catch. The two also differ in behavior nobody grades: ours wraps on MAC overflow where the staff's raises, ours treats undefined opcodes as RND or NOP where the staff's raises, and ours runs WRITE before the PEs inside a repetition where the staff's runs it after. Running both on the same programs is still a cheap extra check of Part 1, and the places they disagree show where the spec is silent.
- **See:** part2/simulator/src/accelerator.py:77-119, part1/src/accelerator.py:77-104

### How will you know a Part 3 optimization didn't break anything?
- **Tags:** general, part3, verification
- **Level:** deeper
- **Answer:** Re-run the checks after every change (`make check` and `make eq-stress` in this repo), because a change that shifts timing can synthesize cleanly and still compute wrong answers. Check that the testbench's end condition still fits your design: a deeper pipeline must keep a valid signal high until its last WRITE has committed, or MEM2 is dumped too early. Then re-synthesize, confirm timing is met at the clock period you use in the FoM, and check that every PE still has real area in the hierarchical area report.
- **Our design:** Which checks do you run after each optimization, and where do you record the before-and-after FoM?
- **See:** docs/PLAN.md, docs/part3-ppa.html#cycles/cy-glitch, docs/synthesis.html

### What is the riskiest thing about your results that you haven't verified?
- **Tags:** general, verification, synthesis, part2
- **Level:** stretch
- **Answer:** Be honest and specific. Two strong candidates in this flow: the memories are empty black boxes in synthesis, so they add no area, their pins aren't timed, and the only logic DC has to keep is what drives their inputs (top has no output ports), so you should confirm in the hierarchical area report that every PE instance still has real area. And nothing in the course flow simulates the gate-level netlist, so the equivalence tests prove the RTL, not the gates. Naming a risk together with the check that would retire it is a strong answer.
- **Our design:** What does your area_report_hier show per PE instance?
- **See:** docs/synthesis.html, part2/unoptimized_verilog/synth/dc_synth.tcl

### Who did what in your pair, and can you explain your partner's part?
- **Tags:** general, teamwork
- **Level:** core
- **Answer:** Name the split honestly, then show you can explain the other half at the same depth, because the examiner can ask either of you about any of it. For example: "I wrote the PE; my partner wrote the buffer, which turns MemBOffset into an entry and a lane like this; we wrote the controller together." Then say how you reviewed each other's work. Our plan gives every module an author and a defender, and the defender explains the pull request back without notes before it merges (the teach-back rule, using the PR template's "Explain it" box).
- **Our design:** Who actually wrote and defended each Python file, RTL module and optimization (compare with the tables in docs/PLAN.md), plus one thing you learned from your partner's code. Git history shows all three Part 1 files committed by one of you; if you worked on them together, say so.
- **See:** docs/PLAN.md, docs/WORKFLOW.md, .github/pull_request_template.md

### Which parts of the code were given, and which did you write?
- **Tags:** general, teamwork, scope
- **Level:** core
- **Answer:** Given: the compiler, assembler and instruction classes in Part 1; the staff tools (ivd-gv, ivd-cc, ivd-as, ivd-mg, ivd-sim) and the reference simulator; instruction_memory.sv and array.sv; the testbenches; and the synthesis script. Ours: processing_element.py, main_buffer.py and accelerator.py in Part 1; processing_element.sv, buffer.sv, controller.sv and top.sv in Part 2; and every Part 3 change. Being precise matters, because "the compiler does that" is only a good answer if you can also say what it does.
- **See:** handouts/Project_Part_1.pdf#page=9, handouts/Project_Part_2.md

### How did you use AI tools, and how did you check what they produced?
- **Tags:** general, ai
- **Level:** core
- **Answer:** AI use is allowed on everything, but the report needs a one-page reflection on it (Part 3 handout, item 5; Ed #207), and the staff expect you to explain any AI-assisted work in your own words. A strong answer is specific: what you asked for, what you got, how you verified it (tests, re-deriving a number by hand, reading every line) and what you changed. Our docs/ai-log.md records the entries so far: the repo setup, the Part 1 tutorial and walkthrough, and the Part 2 and 3 tooling, explainers and question banks. It also records what AI did not write: the three Part 1 source files and the four RTL modules.
- **Our design:** For each AI-assisted piece of Part 2 and Part 3, one line: what it was, how you checked it, and one thing you had to fix or understand better.
- **See:** docs/ai-log.md, handouts/Project_Part_3.md

### Give me one example where an AI tool was wrong or misleading, and how you caught it.
- **Tags:** general, ai, verification
- **Level:** deeper
- **Answer:** Examiners ask this to find out whether you checked the output or just accepted it, so have one concrete, true story ready: what the tool claimed, which test, simulation or calculation contradicted it, and what you changed. Our ai-log has one: the AI's first "fix" for the race in the staff SRAM model (a nonblocking copy of `array.sv`) broke designs that gate the SRAM enable, and it was caught by cross-checking two simulators and running the checks against deliberately broken designs. The lesson it taught: test the tests. Avoid general statements like "AI makes mistakes"; name the file, the number or the waveform.
- **Our design:** An example of your own from Parts 2 and 3, in one or two sentences, with the file or check that caught it.
- **See:** docs/ai-log.md

### Name one design decision you made, and an alternative you rejected.
- **Tags:** general, design-choice
- **Level:** core
- **Answer:** Pick a real one, and give the reason and what the alternative would have cost. From Part 1: we build a fresh memory instruction for each repetition instead of incrementing the program's instruction in place (the staff's way), so re-running an instruction is safe; and our MAC wraps on overflow where the staff's raises. From Parts 2 and 3 you will have timing decisions (when WRITE commits, whether to register SRAM outputs, whether the controller leaves bubbles between instructions) and sizing decisions (PE count, multiplier sharing). Examiners push on "why not the other way?", so know the cost of the alternative in cycles, area or complexity.
- **Our design:** Two decisions from your RTL and one from Part 3, each with the alternative you rejected and why.
- **See:** docs/decisions.md, part1/src/accelerator.py:88-93, docs/part2-rtl.html

### If you had one more week, what would you optimize next?
- **Tags:** general, part3, fom, optimization
- **Level:** core
- **Answer:** Answer from your own FoM table, not from a list of techniques: name the term that dominates and the change that attacks it. FoM = (T_int8 + T_int16 + T_int32)^2.3 × area × power, so time counts most: halving the total time divides the FoM by 2^2.3 ≈ 4.9, while halving area or power divides it by 2. Plausible next steps are more PEs (if area and timing allow), sharing multipliers across modes to cut area, clock gating to cut power, or a shorter clock period through retiming or pipelining, each with a measured before and after.
- **Our design:** Your current FoM, its biggest term, and the next experiment with its expected effect.
- **See:** docs/experiments.md, docs/part3-ppa.html#fom/fom-sens, handouts/Project_Part_3.md

### Doubling the PE count roughly halves the cycles. Why doesn't it divide the FoM by 4.9?
- **Tags:** general, part3, fom, scaling
- **Level:** stretch
- **Answer:** Because area and power grow too: if both roughly double, the FoM improves by about 4.9 / (2 × 2) ≈ 1.2, not 4.9, and wider broadcast and memory buses may force a longer clock period, which eats into the time saved. The cycle count doesn't halve exactly either: each tile has 3 fixed repetitions, the run has a fixed overhead, and once P × lanes exceeds the matrix rows the extra PEs only compute padding. The only way to know is to synthesize both design points and compute both FoMs.
- **See:** docs/part3-ppa.html#fom/fom-pe, handouts/Project_Part_3.md

### What is high-level synthesis, and how is it different from what you did in Part 2?
- **Tags:** general, hls, part4
- **Level:** core
- **Answer:** An HLS tool takes an untimed algorithmic description, usually C++ with bit-accurate integer types, and generates the RTL itself. It schedules each operation into a clock cycle, allocates hardware units (how many multipliers), binds operations to those units, and builds the controlling state machine and the memory interfaces. In Part 2 we made all of those decisions by hand: the cycle in which READ data arrives, when the PE uses it, when WRITE commits and how the controller sequences repetitions. Part 4 is optional (+5% of the project component, Ed #243, due with Part 3): port the accelerator to HLS with Siemens Catapult (Ed #7) and compare the results with your RTL.
- **See:** docs/PLAN.md, https://canvas.stanford.edu/courses/232707/assignments/syllabus

### Is your Python model "high-level synthesis"?
- **Tags:** general, hls, abstraction
- **Level:** deeper
- **Answer:** No. The Python model is a functional, instruction-level simulator: it describes what the machine does, but no tool turns it into hardware, and it relies on Python features with no hardware meaning, such as unbounded integers, lists and loops over lanes. HLS input is a constrained C++ description written so that a tool can synthesize it: fixed-width types, bounded loops and statically sized arrays. Our Python model played the role of the specification; we translated it into RTL by hand, and that translation is exactly what HLS automates.
- **See:** docs/part2-rtl.html

### If you wrote this accelerator in HLS C++, what would it look like, and what would you tell the tool?
- **Tags:** general, hls, part4
- **Level:** deeper
- **Answer:** You could port the instruction-driven machine (a function that decodes one instruction per call and keeps the PE registers and memories as state) or describe the matrix-vector product directly; the second is easier for the tool, but it no longer runs the ISA. Either way you'd use fixed-width signed types (8-, 16- and 64-bit), unroll the loop over PEs and lanes so they become parallel hardware, pipeline the column loop with an initiation interval of 1 so a new column starts every cycle, and map the arrays onto SRAM interfaces. The tool then chooses the schedule and register placement that your hand-written controller and buffer fix explicitly. In Catapult the types are the AC datatypes (ac_int) and the unrolling and pipelining are directives.
- **See:** handouts/Project_Part_3.md

### What would you compare between an HLS version and your hand-written RTL?
- **Tags:** general, hls, part4, ppa
- **Level:** deeper
- **Answer:** The same numbers as the FoM: cycles for the three tests, the clock period that meets timing, area and power, and the FoM itself, all from the same synthesis setup so the comparison is fair. Also design effort and how easy each version is to change: in HLS, trying another unroll factor or pipeline depth is a directive change, while a hand-written controller gives exact control over every cycle. Be ready to explain any gap you measure, for example extra handshake logic or a schedule with bubbles.
- **See:** handouts/Project_Part_3.md
