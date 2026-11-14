# Part 3: the figure of merit and the optimizations

### What is the figure of merit, and where does each number in it come from?
- **Tags:** part3, fom
- **Level:** core
- **Answer:** FoM = (T_INT8 + T_INT16 + T_INT32)^2.3 × Area(µm²) × Power(mW) × 10^-15, and lower is better. Each T is the cycle count the testbench prints (`Computation took N clock cycles`) times the clock period in ns. Area is `Total cell area` and power is total power from the DC run at that same period; `dc_synth.tcl` copies both into `results.txt`. The design must meet timing at that period (worst slack ≥ 0) and stay under 1,000,000 µm².
- **Our design:** Give your final P, period, the three cycle counts, area, power and FoM.
- **See:** docs/part3-ppa.html#fom/fom-where

### Why is cycle count worth more than area in this FoM?
- **Tags:** part3, fom
- **Level:** core
- **Answer:** Time is raised to the power 2.3, area and power to the power 1. Taking logs, ln FoM = 2.3·ln T + ln A + ln P + constant, so the FoM's sensitivity to time is 2.3 times its sensitivity to area. A 10% time cut multiplies the FoM by 0.9^2.3 = 0.785 (−21.5%), while a 10% area cut gives 0.9 (−10%).
- **See:** docs/part3-ppa.html#fom/fom-sens

### If an optimization cuts time by 5%, how much more area × power can you afford?
- **Tags:** part3, fom
- **Level:** deeper
- **Answer:** Break-even is when 0.95^2.3 × (A·P growth) = 1, so A·P may grow by (1/0.95)^2.3 − 1 = 12.5%. For a 10% time cut it's 27.4%. That's why a pipeline stage that costs a few percent of area can still be a big win if it shortens the period.
- **See:** docs/part3-ppa.html#whatif

### How do you compute "% improvement", and why don't two improvements add up?
- **Tags:** part3, fom, report
- **Level:** core
- **Answer:** Improvement = (FoM_reference − FoM_new) / FoM_reference × 100, so positive means the FoM went down. We use it against both the previous best and the baseline. Improvements multiply, not add: two 20% improvements give 1 − 0.8 × 0.8 = 36%.
- **Our design:** What's your total improvement over the Part 2 baseline, and which single optimization contributed most?
- **See:** docs/part3-ppa.html#plan/pl-pct

### Split your biggest FoM change into its time, area and power parts.
- **Tags:** part3, fom, report
- **Level:** deeper
- **Answer:** FoM_new/FoM_old = (T_new/T_old)^2.3 × (A_new/A_old) × (P_new/P_old), so the three factors multiply and their logs add. For example, "time ×0.80, area ×1.06, power ×1.12" multiplies to 0.95, a 5% improvement, and you can say the time term did the work and area and power gave some back. The calculator shows this split against a saved baseline.
- **Our design:** State the three factors for your best optimization and tie each to a report (timing, area, power).
- **See:** docs/part3-ppa.html#calc

### What happens to each term of the FoM when you shorten the clock period?
- **Tags:** part3, fom, timing, power
- **Level:** core
- **Answer:** Time shrinks in proportion to the period, through the 2.3 exponent. Dynamic power grows as 1/period, because each cycle costs about the same energy and there are more of them per second; leakage doesn't change. Area grows because DC upsizes cells and picks faster, bigger structures. With power proportional to area/period, FoM ∝ period^1.3 × A², so a 10% shorter period helps 12.8% unless area grows more than about 7%.
- **See:** docs/part3-ppa.html#fom/fom-period

### Why isn't the fastest period that passes timing automatically the best FoM?
- **Tags:** part3, fom, timing, synthesis
- **Level:** deeper
- **Answer:** Near the limit DC spends a lot of area to save the last picoseconds, and power follows area and frequency. In a Yosys estimate the same 32×32 multiplier goes from 4,928 to 8,563 µm² (+74%) for 11% less delay. DC is also not monotonic: a tighter target can pass where a looser one failed. So we computed the FoM at every passing period and kept the best.
- **Our design:** Show your period sweep: which periods passed, their FoM, and the one you chose.
- **See:** docs/part3-ppa.html#opt/sizing

### Your run at 2.0 ns met timing with 0.3 ns of slack. Can you report the FoM at 1.7 ns?
- **Tags:** part3, timing, fom
- **Level:** core
- **Answer:** No. The handout says you must be able to synthesize the design at the period you use without violations, and the area and power must come from that run. You'd synthesize at 1.7 ns and check that the worst slack is still ≥ 0. At a tighter target DC will also change area and power, so the 2.0 ns numbers don't carry over.
- **See:** docs/part3-ppa.html#fom/fom-where

### Why does adding PEs help the FoM, and by how much in the ideal case?
- **Tags:** part3, fom, sizing
- **Level:** core
- **Answer:** Cycles scale like 1/P because the tile count is ceil(256/P), while area and power scale like P. So FoM ∝ P^-2.3 × P × P = P^-0.3, and doubling P multiplies the FoM by 0.81 (19% better). Fixed costs (controller, buffer) make bigger arrays look even better, until the 1,000,000 µm² cap stops you.
- **See:** docs/part3-ppa.html#fom/fom-pe

### Why is 43 PEs better than 48 PEs for this FoM?
- **Tags:** part3, sizing, cycles
- **Level:** deeper
- **Answer:** Both need ceil(256/P) = 6 tiles, so they take exactly the same cycles: we measured 6,170 / 3,098 / 1,562 for both. The extra 5 PEs at 48 only compute zero-padding rows, adding area and power for nothing. The efficient counts are P = ceil(256/t): 16, 18, 19, 20, 22, 24, 26, 29, 32, 37, 43, 52, 64, 86, 128.
- **See:** docs/part3-ppa.html#cycles/cy-check

### Where does the "FoM ∝ P^-0.3" model break down?
- **Tags:** part3, sizing, timing
- **Level:** stretch
- **Answer:** Tile rounding makes the FoM a sawtooth, not a smooth curve. The period isn't constant: the vector word and PE instruction are broadcast to every PE, and with `set_max_fanout 4` DC builds buffer trees whose depth grows with P on the multiplier path. Power isn't exactly proportional to area. Per-test overhead (3 cycles per tile, 8 per test) becomes visible at large P, about 1.2% at 128 PEs. And the cap cuts the curve off.
- **See:** docs/part3-ppa.html#fom/fom-pe

### Derive your INT8 cycle count.
- **Tags:** part3, cycles, controller, testbench
- **Level:** core
- **Answer:** Rows per tile = P × 4 lanes, so with 16 PEs that's 64 rows and 1024/64 = 16 tiles. Each tile is CLR (1) + READ/MAC (1024) + OUT (1) + WRITE (1) = 1,027 repetitions, and the all-zero padding word adds 1 more, so R = 16,433. The testbench adds 5 reset cycles, 1 for the PE op that trails the last memory op, and 1 for its wait before the dump: 16,440. In general cycles = tiles × (cols + 3) + 8.
- **Our design:** Your P and your measured INT8/INT16/INT32 counts; do they equal the formula? If not, by how much, and why?
- **See:** docs/part3-ppa.html#cycles/cy-tb

### What exactly is the "+8" in the cycle formula?
- **Tags:** part3, cycles, testbench
- **Level:** deeper
- **Answer:** 5 reset cycles (rst_n is low for 5 clock periods), 1 repetition for the all-zero instruction that INST_COUNT = lines + 1 includes, 1 cycle for the PE stage to drain after the last memory op, and 1 cycle the testbench waits after simulation_complete before dumping MEM2. The first clock edge after reset comes half a period late, and the integer division in `$time / CLK_PERIOD` drops that half again.
- **See:** docs/part3-ppa.html#cycles/cy-tb

### Why do all three official tests have the same number of tiles?
- **Tags:** part3, cycles
- **Level:** core
- **Answer:** The tests are INT8 1024×1024, INT16 512×512 and INT32 256×256, with 4, 2 and 1 lanes per PE. Tiles = rows / (P × lanes) = 1024/(4P) = 512/(2P) = 256/P. So every test has ceil(256/P) tiles, and the total is 1,801 × ceil(256/P) + 24 cycles.
- **See:** docs/part3-ppa.html#cycles/cy-tiles

### What would one bubble per instruction cost? What about two cycles per repetition?
- **Tags:** part3, cycles, controller
- **Level:** deeper
- **Answer:** We measured both with deliberately slowed copies of a zero-bubble controller. One idle cycle per instruction costs 4 cycles per tile, tiles × (cols + 7) + 8, which is about +1.5% FoM at 16 PEs. Two cycles per repetition (read, then compute, no overlap) doubles every count, 2 × tiles × (cols + 3) + 8, which multiplies the FoM by 2^2.3 ≈ 4.9.
- **Our design:** Is your controller zero-bubble across instruction boundaries? Point to the waveform that shows it.
- **See:** docs/part3-ppa.html#cycles/cy-bubbles

### Why can't you reduce the cycle count except by adding PEs?
- **Tags:** part3, cycles
- **Level:** core
- **Answer:** The program is fixed by the staff compiler: cols + 3 repetitions per tile. The memories are single-port and deliver one matrix column per cycle, so one repetition per cycle is the ceiling. Fewer tiles needs more PEs. Overlapping CLR, OUT and WRITE with neighbors could save at most 3 cycles per tile, about 1% of the FoM at 16 PEs. So for a zero-bubble design, T moves only through P and the clock period.
- **See:** docs/part3-ppa.html#fom/fom-t

### What happens if you run the INT8 test with 8 PEs and forget to change the instruction memory depth?
- **Tags:** part3, cycles, sizing, testbench
- **Level:** deeper
- **Answer:** 8 PEs give 32 tiles = 128 instructions, which fills the default depth of 128 with no room for the zero word. INST_COUNT = 129 doesn't fit the 7-bit `instruction_count` and wraps to 1, so only the first CLR runs: we measured 7 cycles and zero MEM2 rows, a MISMATCH. With 6 PEs, `ivd-as` silently drops 44 of 172 instructions and INST_COUNT 173 wraps to 45. The fix is to pass the same `--controller_imem_depth` (256 for 5–8 PEs) to ivd-gv, ivd-as and ivd-sim.
- **See:** docs/part3-ppa.html#cycles/cy-imem

### You changed the tests to 32 PEs, but area_report_hier shows 16 PE instances. What happened?
- **Tags:** part3, synthesis, sizing
- **Level:** core
- **Answer:** `part2/unoptimized_verilog/synth/Makefile` generates its own defines.sv with `ivd-gv --out defines.sv` and no `--pe_count`, so it defaults to 16. The PE count has to be changed for synthesis too, not just in the equivalence Makefile (ivd-gv, ivd-cc, ivd-sim). Otherwise the cycles come from 32 PEs and the area and power from 16, and the FoM is meaningless.
- **See:** docs/part3-ppa.html#cycles/cy-imem

### Why can't the INT8 test run with only 4 PEs?
- **Tags:** part3, cycles, testing
- **Level:** stretch
- **Answer:** With 4 PEs the INT8 test has 64 tiles × 1024 columns = 65,536 MEM0 entries, exactly the 16-bit address space. The staff reference simulator increments MemAOffset after the last repetition too, and 63 × 1024 + 1024 = 65,536 doesn't fit the 16-bit field, so `ivd-sim` raises a ValueError (accelerator.py:113) and there's no reference output to compare. The INT8 test needs at least 5 PEs.
- **See:** docs/part3-ppa.html#cycles/cy-imem

### Why is a PE with four 8×8, two 16×16 and one 32×32 multipliers wasteful?
- **Tags:** part3, multiplier, area, power
- **Level:** core
- **Answer:** A PE runs one mode at a time, but all seven multipliers sit on the same input wires and compute every cycle, and the mode mux throws six results away. They cost area, about 9,000 µm² per PE in a Yosys estimate, and they toggle, which costs power. Sharing replaces all seven with four 17×17 multipliers, about 6,400 µm².
- **Our design:** What did report_resources show before and after: how many multipliers per PE?
- **See:** docs/part3-ppa.html#reuse/re-why

### How do four multipliers compute a 32×32 product?
- **Tags:** part3, multiplier
- **Level:** core
- **Answer:** Split each operand into a signed high half and an unsigned low half: a = a_H·2^16 + a_L. Then a·b = a_H·b_H·2^32 + (a_H·b_L + a_L·b_H)·2^16 + a_L·b_L, four 16×16 products. Each runs on a 17×17 signed multiplier whose 17th operand bit is a sign copy for a signed half and 0 for an unsigned half. The outer two products drop into place by concatenation, and only the shifted cross terms need adding.
- **See:** docs/part3-ppa.html#reuse/re-math

### Why 17×17 multipliers and not 16×16?
- **Tags:** part3, multiplier
- **Level:** deeper
- **Answer:** The low half of a 32-bit operand is unsigned (0 to 65,535), which doesn't fit a 16-bit signed input. With a 17th bit, one signed multiplier handles signed×signed, signed×unsigned and unsigned×unsigned products. The alternative is 16×16 unsigned multipliers plus correction terms that subtract the shifted other operand when a sign bit is set.
- **See:** docs/part3-ppa.html#reuse/re-math

### How do the same four multipliers serve the INT16 and INT8 modes?
- **Tags:** part3, multiplier
- **Level:** deeper
- **Answer:** In INT16, lane 1 is exactly a_H·b_H, and lane 0 uses the low multiplier with sign-extended (not zero-extended) operands, because lane 0 is signed. The two cross multipliers idle with their inputs held at 0. In INT8 each multiplier computes one 8×8 lane with operands sign-extended to 17 bits. The products are concatenated into the accumulator lanes, and carries are killed at the lane boundaries (bit 32 in INT16; bits 16, 32, 48 in INT8).
- **See:** docs/part3-ppa.html#mdemo

### Why is the concatenation {a_H·b_H, a_L·b_L} exact, with no addition?
- **Tags:** part3, multiplier
- **Level:** stretch
- **Answer:** a_L·b_L is at most 65,535² = 4,294,836,225 < 2^32, so it fits entirely in the low 32 bits. a_H·b_H·2^32 has only zeros there. The two can't overlap, so placing the 32-bit two's-complement a_H·b_H above the 32-bit a_L·b_L gives a_H·b_H·2^32 + a_L·b_L modulo 2^64. Only the cross terms need a real add (each fits in 32 signed bits, their sum needs 33), which with the accumulator makes a three-input addition: one carry-save row plus one adder.
- **See:** docs/part3-ppa.html#reuse/re-math

### Why might the official tests not catch a multiplier-sharing bug, and how did you test it?
- **Tags:** part3, multiplier, testing, verification
- **Level:** deeper
- **Answer:** The test values are −5…4, so products are tiny and the high bits carry nothing but sign. A cross-term sum truncated to 32 bits or a carry leaking into a neighboring lane near bit 48 can pass. Negative values do exercise the halves, since a_H = −1. We tested the PE with random full-range operands in all three modes against `$signed(a) * $signed(b)`, and ran `make eq-stress`.
- **Our design:** Describe your randomized PE test and how many vectors it ran.
- **See:** docs/part3-ppa.html#reuse/re-plan

### What does register retiming do, and what can't it do?
- **Tags:** part3, retiming, timing, synthesis
- **Level:** core
- **Answer:** Retiming moves existing registers across combinational logic so the stages on either side are balanced, without changing behavior at the boundaries. The staff script already enables it (`set_optimize_registers true` and `compile_ultra -retime`). It can't add registers, change latency, or shorten a feedback loop. It can't pull a register through a black-box memory either. To get more stages you add registers in RTL, and retiming then places them well.
- **See:** docs/part3-ppa.html#opt/retime

### What did retiming or your pipeline stage change in your timing report?
- **Tags:** part3, retiming, timing
- **Level:** deeper
- **Answer:** A good answer names the worst path before and after: startpoint, endpoint, data arrival time and slack. For example, "before, the path ran from the lane-select register through the multiplier and adder into acc at 2.4 ns; after adding the product register, the worst path is the 64-bit accumulate loop at 1.3 ns." Say which period that let you reach, and what the next worst path is now.
- **Our design:** Fill in your real before/after startpoint, endpoint, arrival time and the period you reached.
- **See:** docs/part3-ppa.html#opt/timing

### Why must the accumulate step finish in one cycle even after you pipeline the multiplier?
- **Tags:** part3, pipelining, timing
- **Level:** core
- **Answer:** acc ← acc + product is a loop: each MAC needs the result of the previous one, and a new MAC arrives every cycle. If the add took two cycles, the next MAC would read an accumulator that doesn't yet include its predecessor. To get around it you change the representation (carry-save accumulation) or the schedule (stalls, which cost cycles and FoM).
- **See:** docs/part3-ppa.html#opt/retime

### What is carry-save accumulation, and what does it cost?
- **Tags:** part3, pipelining, area
- **Level:** stretch
- **Answer:** The accumulator is kept as two numbers, sum bits and carry bits. Each new product is added with a row of full adders that turns three numbers into two in one full-adder delay, because no carry ripples across the width. A real adder resolves S + C only when the value is needed (OUT, RND). It costs a second 64-bit register per PE, an adder on the OUT/RND path, and care with lane boundaries. It's only worth it if the accumulate loop is the critical path after the multiplier is pipelined.
- **See:** docs/part3-ppa.html#opt/retime

### You add one pipeline stage to the PE. What else in the system has to change?
- **Tags:** part3, pipelining, controller, buffer, testbench
- **Level:** deeper
- **Answer:** Every PE op must see the accumulator after the previous op's update, so OUT has to read acc in the same stage as (or after) MAC writes it. The program puts WRITE right after OUT, so the WRITE commit must move one cycle later to capture the new output register. The testbench dumps MEM2 one cycle after both `dut.pe_inst_valid` and `dut.buf_inst_valid` are low with pc == instruction_count, so a valid must stay high until the last WRITE commits. Handle all of this with matched delays, not stalls.
- **Our design:** Which cycle does your WRITE commit in, relative to its issue, and which valid covers the drain?
- **See:** docs/part3-ppa.html#opt/retime

### What would happen if your valid signals dropped one cycle too early?
- **Tags:** part3, testbench, pipelining
- **Level:** stretch
- **Answer:** The testbench waits one CLK_PERIOD after simulation_complete rises and then dumps MEM2, so the last WRITE would not have committed yet. The last tile's row would be missing or stale, a MISMATCH that only shows in that row. It also triggers on a zero-width glitch: we measured a variant where one valid fell and the other rose at the same edge, and the testbench reported one cycle less. So never let both valids drop, even for an instant, before the last WRITE.
- **See:** docs/part3-ppa.html#cycles/cy-bubbles

### Walk me through your critical path in the timing report.
- **Tags:** part3, timing, synthesis
- **Level:** core
- **Answer:** Startpoint and endpoint are the launching and capturing registers. Each line adds a cell delay (Incr) to the running total (Path), and the total is the data arrival time. Required time is the clock period minus the capture flop's setup time, and slack = required − arrival, negative meaning a violation. The cell names show whose logic dominates: a multiplier or adder instance, a mux chain, or a run of fanout buffers.
- **Our design:** Read your actual worst path aloud: start, end, the biggest contributors, and the slack.
- **See:** docs/part3-ppa.html#opt/timing

### Why can the RND logic limit your clock even though the tests never execute RND?
- **Tags:** part3, timing, pe
- **Level:** deeper
- **Answer:** DC times every path the hardware has, not just the paths the test exercises. RND is a loop through the accumulator: a shift by s, a rounding increment and the next-state mux, all in one cycle. Once the multiplier is pipelined, that loop can become the worst path. To speed it up without breaking the spec you'd restructure it or pipeline it with interlocks. Ask staff whether the full PE spec still has to hold in Part 3.
- **See:** docs/part3-ppa.html#opt/retime

### What does clock gating do, and how does Design Compiler insert it?
- **Tags:** part3, clockgating, power, synthesis
- **Level:** core
- **Answer:** A register that loads only sometimes is a flop with a hold mux, and its clock pin still toggles every cycle. Clock gating replaces the hold mux with an integrated clock-gating cell that stops the clock to the whole register bank when the enable is 0 (Nangate's CLKGATETST_X1 is 3.99 µm²). DC inserts these on load-enable registers, which you expose by writing `else if (en) q <= d;` in the clocked block. The commonly used commands are `set_clock_gating_style` with `compile_ultra -gate_clock`, then `report_clock_gating`. Check them against the DC version on caddy.
- **Our design:** Which commands did you use, and how many registers did report_clock_gating say were gated?
- **See:** docs/part3-ppa.html#opt/gating

### Which registers in this design are worth clock gating?
- **Tags:** part3, clockgating, power
- **Level:** deeper
- **Answer:** The PE output register loads only on OUT and CLR, 2 of every cols + 3 repetitions: 0.19% of INT8 cycles. It's the best candidate, P × 32 flops. The controller's instruction register loads once per instruction. The accumulator loads on almost every cycle (MAC), 99.8% in INT8, so gating it saves almost nothing in the real workload.
- **See:** docs/part3-ppa.html#opt/gating

### Why did clock gating change your reported power by the amount it did?
- **Tags:** part3, clockgating, power
- **Level:** deeper
- **Answer:** Without simulation data, DC's power report uses vectorless activity: default toggle rates at inputs and black-box outputs, propagated through the logic. A gating enable is a decode of instruction bits, and DC has no idea that 99.7% of INT8 instructions are MACs. So the reported saving can differ a lot from the real one: gating the accumulator might look like a big saving although it loads almost every cycle. A good answer compares the register and clock_network power before and after, and explains the change from the real duty cycles.
- **Our design:** Your power before/after, the register group's share, and what report_switching_activity showed for the enables.
- **See:** docs/part3-ppa.html#opt/gating

### What is SAIF, and why could it change your power number?
- **Tags:** part3, power, synthesis
- **Level:** stretch
- **Answer:** SAIF (Switching Activity Interchange Format) records how often each net toggled, and its static probability, during a real simulation. VCS can write it directly, or `vcd2saif` converts a VCD. `read_saif` before `report_power` then uses the test's real activity instead of defaults, so gated and idle logic is credited correctly. Whether SAIF-annotated power is acceptable for the FoM is a question for staff on Ed.
- **See:** docs/part3-ppa.html#opt/gating

### How did you pick your PE count and clock period?
- **Tags:** part3, sizing, fom
- **Level:** core
- **Answer:** For the period: a binary search between a failing and a passing period, `make synthesize CLK_PERIOD=...` with `make clean` between runs, computing the FoM at every passing point. For the PE count: only tile-efficient values, synthesized at two or three points to fit area ≈ fixed + P × per-PE and the same for power, then the model's best feasible P confirmed with a real run. Both were redone after each RTL optimization, because the best point moves.
- **Our design:** Show both sweeps (P, period, area, power, slack, FoM) and why you stopped where you did.
- **See:** docs/part3-ppa.html#opt/sizing

### What is your correctness gate before you accept an optimization?
- **Tags:** part3, testing, verification, equivalence
- **Level:** core
- **Answer:** The three official tests and `make eq-stress` must all pass, the pass/fail verdict comes from Icarus (or VCS), and the FoM's cycle counts come from the official tests only. The official tests have blind spots: the INT16 vector ends in 0 and the INT32 one in −1, and a buffer bug that mis-decodes the last MAC operand passes all three. eq-stress uses other seeds and sizes that aren't tile multiples. Timing must be met, area under the cap, and every PE must have real area in area_report_hier.
- **See:** docs/part3-ppa.html#plan/pl-protocol

### Why do you check area_report_hier even when the FoM looks great?
- **Tags:** part3, synthesis, area
- **Level:** deeper
- **Answer:** In synthesis the memories are empty black boxes, so their outputs drive nothing real. If DC ever treated that logic as unused or constant, it could optimize away the datapath and report a tiny area and power. Checking that every PE instance has a substantial, similar area is a quick sanity check that the FoM describes the design you meant to build.
- **See:** docs/part3-ppa.html#opt/else
