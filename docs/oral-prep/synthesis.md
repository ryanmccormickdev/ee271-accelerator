# From RTL to gates: synthesis with Design Compiler

### Walk me through what happens when you run `make synthesize`.
- **Tags:** part2, synthesis, flow, overview
- **Level:** core
- **Answer:** Two commands. `ivd-gv --out defines.sv` regenerates the defines file with every default (16 PEs, 32/64/32-bit PE widths, 16-bit counter, 128-deep instruction memory). Then `dc_shell-t -64bit -x "set ...; source -echo -verbose dc_synth.tcl" 2>&1 | tee -i compile.log` runs the DC script: read the RTL (analyze, elaborate, link), set constraints (2 ns clock, wire-load model, input delays, drive, area goal), `compile_ultra -retime`, then write the reports, the netlist `netlist/top.mapped.v` and the summary `results.txt`.
- **Our design:** How long did your first run take (see "Overall Compile Wall Clock Time" in `reports/qor_report`)?
- **See:** docs/synthesis.html#script, part2/unoptimized_verilog/synth/Makefile:19-22

### Make reports success. Does that mean your synthesis is clean?
- **Tags:** part2, synthesis, compile-log
- **Level:** deeper
- **Answer:** No. The recipe pipes DC into `tee`, so make sees tee's exit status, not DC's. You have to read `compile.log`: no lines starting with `Error`, no `Unable to resolve reference (LINK-5)`, and the log should end with DC's exit statistics. A plain `grep -i error` is useless because the log echoes the script, which contains `check_error` and `error_checking_report`.
- **See:** docs/synthesis.html#cl-grep

### Why is `defines.sv` regenerated on every run, and what goes wrong if you change the PE count in Part 3?
- **Tags:** part3, synthesis, defines
- **Level:** deeper
- **Answer:** Every RTL file `include`s `defines.sv`, and the Makefile calls `ivd-gv` with no options, so it always produces the 16-PE defaults. If your equivalence tests use another `--pe_count`, you have to pass the same flag on this line too, or you'd synthesize a different machine than the one you simulated, and your FoM would mix the cycles of one design with the area and power of another.
- **Our design:** Which PE count do you synthesize, and where did you set it?
- **See:** part2/unoptimized_verilog/synth/Makefile:21

### What do analyze, elaborate and link each do? What is GTECH?
- **Tags:** part2, synthesis, flow
- **Level:** core
- **Answer:** `analyze` parses each SystemVerilog file and checks syntax, storing the result in the work library (`FreePDK_45nm/`). `elaborate top` builds the hierarchy: it fixes parameters, unrolls generate loops, infers flip-flops and latches, and turns logic into GTECH (Synopsys's technology-independent generic gates) and arithmetic into synthetic operators. `link` resolves every instance to a design or library cell; a missing module becomes an empty black box with a LINK-5 warning.
- **See:** docs/synthesis.html#big-picture

### What is in a .db / Liberty file, and what are the link, target and synthetic libraries?
- **Tags:** part2, synthesis, library
- **Level:** core
- **Answer:** A Liberty library describes every cell: logic function, area, pin capacitances, delay and transition tables indexed by input slope and output load (NLDM), power tables, and design rules like max transition. The .db is its compiled binary form. The target library is what compile may map to (only Nangate here). The link library is what `link` resolves references against (Nangate plus DesignWare). The synthetic library `dw_foundation.sldb` holds DesignWare's implementations of operators like `+` and `*`.
- **See:** docs/synthesis.html#script

### What does DesignWare give you, and why can the same `a + b` turn into very different hardware?
- **Tags:** part2, synthesis, designware, arithmetic
- **Level:** deeper
- **Answer:** DesignWare is Synopsys's library of operator implementations, each in several architectures (ripple or parallel-prefix adders; Booth or non-Booth multipliers). compile picks one per operator based on the timing constraint. In Yosys, one 64-bit adder ranged from 371 µm² and about 2,180 ps (a ripple-like chain) to 852 µm² and about 460 ps (Kogge-Stone). So a tighter clock can make the same RTL bigger.
- **See:** docs/synthesis.html#cu-hlo

### What does `create_clock clk -period 2.0` mean for your design? What is an ideal clock?
- **Tags:** part2, timing, constraints
- **Level:** core
- **Answer:** Every register-to-register path must settle within 2.0 ns (500 MHz) minus the capturing flop's setup time. The clock is ideal in synthesis: no clock tree, zero skew and zero clock delay, which is why the report shows `clock network delay (ideal) 0.0000`. The same period sets f in DC's dynamic power estimate. 2 ns is about 90 FO4 inverter delays in this library (FO4 ≈ 22 ps), a relaxed clock.
- **See:** docs/synthesis.html#rp-timing

### What is slack, and how do you read it off your timing report?
- **Tags:** part2, timing, sta
- **Level:** core
- **Answer:** Slack = required time − arrival time. Arrival is the launch edge plus clock-to-Q plus every gate and net on the path; required is the capture edge (one period later) minus the capturing flop's library setup time. The report's last line, `slack (MET) x` or `slack (VIOLATED) −x`, gives it in ns. STA computes arrival and required at every node without simulating data (lecture 06 p37–41).
- **Our design:** What is your worst slack at 2.0 ns, and between which startpoint and endpoint?
- **See:** docs/synthesis.html#reports

### Your slack is +0.35 ns at 2.0 ns. Can you claim 1.65 ns in your Part 3 FoM?
- **Tags:** part3, timing, fom
- **Level:** deeper
- **Answer:** Not without rerunning. DC re-optimizes at every period: different DesignWare architectures, gate sizes and retiming, so the critical path and its slack at 1.65 ns are different, and area and power change too. The rule is that synthesis at the claimed period shows no violation, so rerun with `make synthesize CLK_PERIOD=1.65` (after `make clean`) and read the new slack.
- **See:** docs/synthesis.html#rp-paste

### What is the critical path in your design, and why that one?
- **Tags:** part2, timing, pe
- **Level:** core
- **Answer:** Read the startpoint and endpoint, then explain the chain between them. Likely candidates are the accumulator feedback (accumulator register → the carry-propagate adder of the multiply-accumulate → mode/opcode muxes → accumulator register), the RND/OUT logic on the accumulator, or the PE-instruction fan-out from the controller to every PE. The multiplier's data paths are often not timed, because the operands come from untimed SRAM outputs, but a lane- or mode-select register steering the operand mux can still put the multiplier on a timed path.
- **Our design:** Your report's startpoint, endpoint, levels of logic and the two biggest steps on the path.
- **See:** docs/synthesis.html#rp-critical

### What does a wire-load model approximate, and is the course's optimistic or pessimistic?
- **Tags:** part2, timing, wires
- **Level:** deeper
- **Answer:** Before placement nobody knows wire lengths, so DC estimates each net's capacitance and resistance from its fanout using a library table. `1K_hvratio_1_4` gives a fanout-4 net 7.66 length units, which is 1.36 fF and about 27 Ω: less than one X1 inverter input (1.70 fF). Real routed wires on a block this size would be longer, so it's likely optimistic, but it's a consistent yardstick for comparing designs.
- **See:** docs/synthesis.html#si-wlm

### Why does the script set a 3/4-period input delay, and why does it barely matter here?
- **Tags:** part2, constraints, timing
- **Level:** stretch
- **Answer:** An input delay models logic outside the block using part of the cycle: a 1.5 ns input delay leaves 0.5 ns for internal logic from that input. But `top`'s only inputs are `clk`, `rst_n` and `instruction_count`; clk and rst_n are excluded, and the next line sets `instruction_count` back to 0. A later `set_input_delay` on the same port and clock replaces the earlier one, so in this design the 3/4-period line has no lasting effect.
- **See:** part2/unoptimized_verilog/synth/dc_synth.tcl:55-58

### What do `set_drive 0` and `set_dont_touch_network` on `rst_n` do, and why?
- **Tags:** part2, constraints, reset
- **Level:** deeper
- **Answer:** They make `rst_n` an ideal driver and forbid DC from buffering, resizing or rewiring the reset net and everything it fans out to, up to the flops' reset pins. The reset reaches every flop, potentially thousands of pins; a real flow builds that tree later, like the clock tree, so this stops DC from spending area on it. The cost is that the net isn't fixed for transition or fanout, and paths from `rst_n` aren't timed.
- **See:** part2/unoptimized_verilog/synth/dc_synth.tcl:60-62

### What does `set_max_area 150000` do if your design comes out bigger?
- **Tags:** part2, area, constraints
- **Level:** deeper
- **Answer:** It's a goal, not a limit. DC optimizes design rules first, then timing, then area, and if the result is above 150,000 µm² you get a max_area violation in `report_qor`/`report_constraint`, not an error. The Part 3 cap of 1,000,000 µm² comes from the handout, and DC knows nothing about it.
- **See:** docs/synthesis.html#cu-size

### Why do you not see the SRAMs in your area report?
- **Tags:** part2, area, memory, black-box
- **Level:** core
- **Answer:** The script reads `synth/macros/array.sv`, an empty module with the same ports as the simulation model, instead of `logical/array.sv`. An empty module has no cells, so the memories add 0 area, 0 internal power and 0 leakage. Real SRAMs are dense custom macros (lecture 07); built from flops, MEM0 alone would be about 152 mm² of DFF_X1. So the FoM compares logic only.
- **See:** docs/synthesis.html#black-boxes

### Which timing paths in your design does report_timing not check because of the black boxes?
- **Tags:** part2, timing, black-box
- **Level:** deeper
- **Answer:** Anything that starts at an SRAM `q` pin (no driver, so no launching clock), including the instruction memory's `inst`, and anything that ends at an SRAM input (`a`, `d`, `wen`, `cen`, `gwen`), because an empty module's pins have no setup check. So if the PE multiplies operands the cycle they leave the memory, the data paths through the multiplier aren't timed and are optimized only for area. Register-to-register paths are timed: the accumulator feedback, the controller-to-PE instruction paths, and any register that steers the operands (a lane-select or mode register driving the operand mux) through the multiplier, unless a latch like the `vector_decoder`'s sits in between.
- **Our design:** Do your PE operands come straight from `q`, or through a register? Which multiplier paths are timed?
- **See:** docs/synthesis.html#bb-see

### What would happen if DC decided the memories' empty input pins don't count as loads? How do you check?
- **Tags:** part2, black-box, area
- **Level:** stretch
- **Answer:** `top` has no outputs, so every result ends at a memory's `d` pin. If those pins didn't count, the PE logic would look unused and could be removed. In Yosys exactly that happens (0 cells) unless the memory is a kept black box. Whether DC does it is unverified. The check: in `reports/area_report_hier` every PE instance should have thousands of µm² (the 96 accumulator and output flops alone are about 511 µm² of DFFR_X1), the flop count in the netlist should be at least 16 × 96, and total area should be around 10^5 µm². If not, ask staff with the report.
- **See:** docs/synthesis.html#bb-check

### What does `compile_ultra -retime` do, and what does it need from your RTL?
- **Tags:** part3, retiming, timing, pipelining
- **Level:** core
- **Answer:** It moves flip-flops across combinational logic to balance stage delays (with `set_optimize_registers true` it may do so anywhere in `top`); the script already has it, although the Part 3 handout says to add it. It never adds pipeline stages, so the RTL must already contain the extra registers, on the same clock with compatible reset and enable, and the controller must already account for the latency they add (valid signals stay high until the last WRITE commits). Retimed flops get generated names.
- **Our design:** Did you add a pipeline register for retiming to move? What latency does it add, and where does the controller handle it?
- **See:** docs/synthesis.html#cu-retime

### What is gate sizing, and what does it have to do with logical effort?
- **Tags:** part2, logical-effort, timing
- **Level:** deeper
- **Answer:** Each Nangate cell comes in drive strengths (X1, X2, X4 ...): lower output resistance, more input capacitance, more area. DC upsizes drivers on critical paths and buffers big fanouts, trading a gate's drive against the load it puts on the previous stage, which is lecture 05's logical-effort problem done automatically. From the .lib, INV_X4 has 0.56 kΩ drive vs 1.82 kΩ for INV_X1 but 3.7× the input capacitance. In Yosys, sizing and buffering cut a fanout-heavy 64-bit Sklansky adder from 848 to 476 ps.
- **See:** docs/synthesis.html#cu-size

### What are resource sharing and datapath extraction, and how do they affect a MAC?
- **Tags:** part2, part3, hls, arithmetic, mac
- **Level:** deeper
- **Answer:** Resource sharing maps several operations that never happen in the same cycle onto one unit, with muxes on its inputs. Yosys built two 16×16 multipliers (3,362 µm²) for `sel ? a*b : a*c` but one (1,661 µm²) for `a * (sel ? b : c)`. Datapath extraction merges connected arithmetic into one carry-save tree with a single final adder, so `acc + a*b` adds the accumulator as one more row of the multiplier's partial products instead of paying for a separate 64-bit adder.
- **See:** docs/synthesis.html#cu-hlo

### Why would a latch appear in your netlist?
- **Tags:** part2, rtl, latch
- **Level:** core
- **Answer:** A combinational block didn't assign some output on some path (an `if` without `else`, a `case` without `default`), so the hardware has to remember the old value: a level-sensitive latch. DC reports it as ELAB-974 for an `always_comb` and lists the register as type Latch in the "Inferred memory devices" table. Fix it with a default assignment at the top of the block or a `default` arm (lecture 09 p21).
- **See:** docs/synthesis.html#cl-rules

### The staff `vector_decoder` infers a latch. Is that a problem for Part 2? For timing?
- **Tags:** part2, latch, timing, vector-decoder, buffer
- **Level:** stretch
- **Answer:** For Part 2 it's a warning in staff code (`case (mode)` has no arm for mode 3), and the handout says warnings are fine; you can't edit it because `defines.sv` is regenerated each run. In Yosys the latch version has 46 DLL_X1 latches and 326 µm² vs 196 µm² with a default arm. For timing, a latch's enable is a clock pin, and here it's driven by logic from `mode`, not by `clk`, so STA likely treats it as unclocked and doesn't time through it (unverified). Its data comes from an untimed SRAM output anyway.
- **See:** docs/synthesis.html#see-it/ex-vd_star

### What's the difference between an error and a warning in `compile.log`? Name an error you'd have to fix.
- **Tags:** part2, compile-log, rtl
- **Level:** core
- **Answer:** Errors stop a step or mean DC couldn't build what you wrote; Part 2 requires zero. Examples: a syntax error from analyze, and `ELAB-366` (a net driven by more than one source, typically one variable assigned in two always blocks). Warnings are allowed but worth reading: `LINK-5` (unresolved reference: a missing module silently becomes an empty box), ELAB-974 latches in your own files, and "timing loop" messages from combinational loops are real bugs even though DC only warns.
- **See:** docs/synthesis.html#cl-errors

### What sets dynamic power, and how does DC estimate activity?
- **Tags:** part3, power, activity
- **Level:** core
- **Answer:** Switched capacitance, voltage squared, frequency and activity: P = ½ α C V² f per net, plus the cells' internal power, plus leakage (lecture 03; Review Session 2 p26). The course flow gives DC no simulation activity (no SAIF), so DC applies default activity (by default 0.1 toggles per cycle and probability 0.5) to primary inputs and black-box outputs and propagates it through the logic. The clock toggles every cycle, so flop clock pins are modeled well and data activity only roughly.
- **See:** docs/synthesis.html#rp-power

### Why does the register group usually dominate DC's power report, and what would clock gating change?
- **Tags:** part3, power, clockgating
- **Level:** deeper
- **Answer:** Every flop's clock pin switches every cycle whether its data changes or not; from the .lib, one DFFR_X1 clock pin costs about 9.6 fJ per cycle, so 1,536 PE flops at 2 ns already burn about 7 mW. Clock gating stops the clock to registers that hold their value, replacing a mux in front of every flop with one gating cell (CLKGATETST_X1), so both the clock-pin power and the muxes go away. DC can insert it automatically (Part 3 handout §2.2.4).
- **Our design:** What fraction of your power is the register group, and which registers hold their value most of the time?
- **See:** docs/synthesis.html#si-pe

### What is leakage power, and why does cutting area also cut power?
- **Tags:** part3, power, leakage, area
- **Level:** deeper
- **Answer:** Leakage is static current through transistors that are off; every cell leaks whether it switches or not. DC sums each cell's `cell_leakage_power` from the .lib (INV_X1 about 14 nW, DFFR_X1 about 86 nW at the typical corner). So leakage scales roughly with cell count and area, and an area reduction pays twice in the FoM: once in the area term and again in the power term.
- **See:** docs/synthesis.html#rp-power

### In report_area, what are combinational, buf/inv, noncombinational and net interconnect area?
- **Tags:** part2, area, reports
- **Level:** core
- **Answer:** Combinational is all logic gates, including buffers and inverters. Buf/inv is the part of that made of buffers and inverters, a subset, not extra. Noncombinational is flip-flops and latches. Macro/black box is 0 because the memories are empty. Net interconnect is "undefined (Wire load has zero net area)" because the wire-load table has no area field. Total cell area, which `results.txt` copies, is the FoM's area.
- **See:** docs/synthesis.html#rp-area

### Async reset vs sync reset: what cells do you get, and what does each cost?
- **Tags:** part2, rtl, reset, area
- **Level:** deeper
- **Answer:** An async reset (`always_ff @(posedge clk or negedge rst_n)`) maps to `DFFR_X1`, with the reset built into the cell: 5.32 µm² vs 4.52 µm² for a plain `DFF_X1`, and no extra gates. A sync reset is logic in front of a plain flop: in Yosys, 32 DFF_X1 plus 32 AND2_X1, with the AND on the timed D path. A load enable becomes a MUX2_X1 feeding each flop its own output, and the flop still clocks every cycle.
- **Our design:** Which reset style do your PE registers use, and how many flops does `grep -c DFFR_X1 netlist/top.mapped.v` count?
- **See:** docs/synthesis.html#si-regs

### Why does an if / else-if chain synthesize differently from a case, and when does it matter?
- **Tags:** part2, rtl, logic
- **Level:** deeper
- **Answer:** Each `else if` matters only if every earlier condition was false, so the hardware is a priority chain with roughly one gate level per condition. If you know the conditions are mutually exclusive (one-hot), an AND-OR or a case on one select signal says so. In Yosys an 8-way priority chain took 166 cells and 276 ps vs 80 cells and 67 ps for the one-hot AND-OR. The tool can't use facts it doesn't know (lecture 05 p47).
- **See:** docs/synthesis.html#see-it/ex-prio_chain

### Why must a `for` loop have constant bounds in synthesizable RTL? What does it become?
- **Tags:** part2, rtl, elaboration
- **Level:** core
- **Answer:** Loops are unrolled at elaboration: a loop over 4 lanes becomes four copies of the hardware. The bound must be known then, from a constant, parameter or `define; a bound that depends on a signal would mean hardware that changes size at run time. Generate loops follow the same rule: genvars disappear after static elaboration (lecture 09 p34).
- **See:** docs/synthesis.html#cl-rules

### Why is `logical/array.sv` allowed to use `initial` blocks and tasks? What race does it have?
- **Tags:** part2, simulation, memory
- **Level:** stretch
- **Answer:** Synthesis never reads it; the script reads the empty `macros/array.sv`, so its `initial`, `loadmem` and `dumpmem` only have to simulate. The model updates `read_data` with a blocking assignment in a clocked block and drives `q` from a separate latch block, which races with any flop sampling `q` on the same edge. Icarus (and very likely VCS) gives normal synchronous-SRAM behavior; Verilator at default optimization skips the first instruction unless built with `-fno-inline`. Blocking assignments in clocked blocks are exactly the style that creates such races, so use `<=` in `always_ff`.
- **See:** docs/synthesis.html#cl-sim

### How do you compute your FoM from `results.txt`, and which input doesn't come from DC?
- **Tags:** part3, fom, reports
- **Level:** core
- **Answer:** FoM = (T_int8 + T_int16 + T_int32)^2.3 × total cell area (µm²) × power (mW) × 10^-15, with each T = cycles × clock period in ns. Area is the "Total cell area" line and power the last number of the power report's Total row (we assume total including leakage; confirm with staff), and the slack line must say MET at that period. The cycle counts come from simulation (`make eq` prints "Computation took N clock cycles"), not from DC.
- **Our design:** Your three cycle counts, period, area, power, and the resulting FoM.
- **See:** docs/synthesis.html#bp-fom

### If you halve the clock period, what happens to each term of the FoM?
- **Tags:** part3, fom, timing, power
- **Level:** stretch
- **Answer:** Time halves if the cycle counts stay the same, which divides the FoM by 2^2.3 ≈ 4.9. But DC must now meet a tighter constraint, so it picks faster architectures and upsizes gates (more area, more leakage), and dynamic power roughly doubles with frequency for the same switched capacitance. Whether the FoM improves depends on how much area and power grow, and the period is only legal if the slack is still MET.
- **See:** docs/synthesis.html#bp-fom

### Why does the 32×32 multiplier dominate a PE's area, and what would DC choose for it?
- **Tags:** part3, arithmetic, area, multiplier
- **Level:** stretch
- **Answer:** An n×n multiplier adds n² partial-product bits, so its area grows roughly with the square of the width. In Yosys a signed 32×32 multiply was 4,880–7,760 µm² depending on architecture, vs about 340–500 µm² for 8×8, and ABC estimated 1.7–3.1 ns through it. DC would typically pick a Booth-encoded, Wallace-tree style DesignWare multiplier with a fast final adder when timing matters, or a smaller, slower one when the path is untimed or relaxed. That's why Part 3's hardware reuse (fewer, shared multipliers) is a big lever.
- **See:** docs/synthesis.html#si-mult

### What do boundary optimization and auto-ungrouping do, and why might a module vanish from `area_report_hier`?
- **Tags:** part2, synthesis, hierarchy
- **Level:** deeper
- **Answer:** Boundary optimization pushes constants, unconnected pins and inversions across module boundaries, so logic that depends on a tied-off port or drives an unused output can be simplified away. Auto-ungrouping dissolves small modules (or ones on critical paths) into their parent so DC can optimize across the boundary. A small module like a `vector_decoder` instance can therefore disappear from the hierarchical report, which is expected. Whole PEs disappearing is not.
- **See:** docs/synthesis.html#cu-boundary
