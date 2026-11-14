"""The "Read the code" tab's content: the given Part 2 files split into highlighted blocks, each with a note.

Each block is a dict:
  at      the start of the block's first line, exactly as in the file (indentation and tabs included).
  then    optional: the start of the line after it (for the testbench's identical comment banners)
  id      optional anchor (other parts of the page link to these)
  title, kind ('given' | 'yours' | 'host' | 'tool' | 'generated' | 'design'),
  color   ('m0' | 'm1' | 'm2' | 'pe' | 'ctl' | 'ink' | 'gray')
  what    what the block does, in plain words (HTML)
  vals    optional list of (name, value) pairs: real values from the recorded runs
  todo    for "Your Code Here" blocks: what has to go there, in words (never code)
  sv      notes on reading the SystemVerilog in this block
  see     extra buttons: (label, where)
Blocks run until the next block's first line, so together they cover the whole file.
build.py stops if any "at" line can't be found, so a staff update can't misplace a note.
"""

LV = "unoptimized_verilog/logical"

# ================================================================== instruction_memory.sv (given)
IMEM = [
    dict(at="", title="Ports: an instruction out, a valid, and the advance handshake", kind="given", color="ctl",
         what="The instruction memory hands the controller one instruction at a time. <code>inst</code> is the whole 63-bit "
              "<code>instruction_t</code>, <code>inst_valid</code> says whether it's a real one, and <code>advance_pointer</code> is how the "
              "controller says \"I've taken it, show me the next one\". In <code>top.sv</code> that input is wired to the controller's "
              "<code>inst_exec_begins</code>. <code>instruction_count</code> comes from the testbench (<code>+INST_COUNT</code>).",
         sv=["This file doesn't <code>`include \"defines.sv\"</code> itself. It still compiles because every other file includes it first, and the "
             "include guard (<code>`ifndef ACCEL_DEFINES_H</code>) makes the definitions global for everything compiled after.",
             "<code>output instruction_t inst</code>: a port can have a struct type. <code>inst.count</code>, <code>inst.buf_instruction.mema_offset</code> "
             "and so on are just names for bit ranges of the 63 bits.",
             "<code>input wire clk</code> vs <code>input logic</code>: for ports the difference doesn't matter here. <code>logic</code> is the "
             "SystemVerilog type you'll use for nearly everything."],
         see=[("The fetch handshake, cycle by cycle", "cycles/cy-fetch")]),
    dict(at="    // Internal Program Counter", title="The program counter and the address it actually uses", kind="given", color="ctl",
         what="<code>program_counter</code> is the index of the instruction the controller sees. <code>memory_address</code> is the address "
              "presented to the memory this cycle, which can run one ahead (next block). Both are <code>IMEM_ADDR_WIDTH</code> = 7 bits with the "
              "default depth of 128, so at most 127 instructions can ever be valid: <code>instruction_count</code> has the same 7 bits.",
         vals=[("program_counter", "0 during reset, 1 after the edge that ends cycle 5,\n... 9 = instruction_count after cycle 17"),
               ("testbench", "dut.u_instruction_memory.program_counter\n(the testbench watches it to decide when you're done)")],
         vals_caption="Real values, worked example run (2 PEs, 9 instructions)"),
    dict(at="    // Internal Instruction Memory", title="The program lives in an SRAM, always reading", kind="given", color="ctl",
         what="A 63-bit wide, 128-deep <code>array</code> (the same SRAM model as the buffer's memories). <code>cen</code> is tied to 0, so it reads "
              "at every rising edge; <code>wen</code> and <code>gwen</code> are tied to 1, so it never writes. The testbench fills it before time "
              "starts, through the hierarchical name <code>dut.u_instruction_memory.u_instruction_memory</code> and its <code>loadmem</code> task. "
              "Because it's a synchronous SRAM, <code>inst</code> shows the word at the address presented in the <i>previous</i> cycle.",
         sv=["<code>'0</code> and <code>'1</code> fill every bit of whatever width the port has with 0 or 1. Handy for <code>wen</code>, "
             "which is 63 bits wide here.",
             "<code>#(.DW(...), .NW(...), .AW(...))</code> sets the module's parameters for this one instance, like keyword arguments."],
         see=[("The array model", "code/cmf-part2-unoptimized-verilog-logical-array-sv"), ("Why Verilator can disagree here", "verify/vd-race")]),
    dict(at="    // Assigning Inst Valid", id="cm-imem-prefetch", title="Valid, and the prefetch: the address runs one ahead when you advance", kind="given", color="ctl",
         what="<code>inst_valid</code> is 1 while <code>program_counter &lt; instruction_count</code> (and 0 in reset). <code>memory_address</code> is "
              "the trick: in a cycle where <code>advance_pointer</code> is 1, the memory is already given <code>program_counter + 1</code>, so the "
              "next instruction comes out of the SRAM at the same edge that increments the counter. The controller can take a new instruction "
              "every cycle with no gap. Every cycle that <code>inst_exec_begins</code> is high, the counter moves on by one, so raise it only in "
              "a cycle where you really take the instruction on <code>inst</code>.",
         vals=[("cycle 5", "inst_exec_begins = 1, program_counter = 0, memory_address = 1"),
               ("cycle 6", "program_counter = 1, inst = imem[1] (READ|MAC), inst_exec_begins = 1 again\n(the CLR has only one repetition)"),
               ("cycle 18", "program_counter = 9 = instruction_count, inst_valid = 0")],
         vals_caption="Real values, worked example run",
         sv=["<code>assign x = c ? a : b;</code> is a continuous assignment: <code>x</code> is a wire that always equals the expression. "
             "No clock involved.",
             "<code>(~rst_n) ? '0 : ...</code>: while reset is low the output is forced to 0."],
         see=[("See it in the waveform", "cycles/5")]),
    dict(at="    // Initializing Program Counter", title="The counter register (with an asynchronous reset)", kind="given", color="ctl",
         what="The standard register template you'll copy in every file: on a rising clock edge the counter takes its next value, and whenever "
              "<code>rst_n</code> goes low it resets to 0 at once, without waiting for the clock. It advances when <code>advance_pointer</code> "
              "is 1 and it hasn't reached <code>instruction_count</code>.",
         sv=["<code>always_ff @(posedge clk, negedge rst_n)</code>: a block of flip-flops. The <code>negedge rst_n</code> in the list makes the "
             "reset asynchronous. The first <code>if</code> must test the reset.",
             "<code>&lt;=</code> is a non-blocking assignment: the right side is read now, the register changes after every block has read "
             "its inputs for this edge. Use it for every register.",
             "<code>rst_n == '0</code> is the same as <code>!rst_n</code>. The <code>_n</code> suffix means active low."],
         see=[("Registers and reset, for Python programmers", "primer/pr-reg")]),
]

# ================================================================== array.sv (given)
ARRAY = [
    dict(at="module array", id="cm-array-ports", title="An SRAM: parameters and ports", kind="given", color="m0",
         what="The behavioral model of one SRAM macro. <code>DW</code> is the word width, <code>NW</code> the number of words, <code>AW</code> the "
              "address width. All three control inputs are <b>active low</b>: <code>cen</code> = 0 enables the chip, <code>gwen</code> = 0 enables "
              "writing, and <code>wen</code> is a per-bit write mask (bit i is written only where <code>wen[i]</code> = 0).",
         vals=[("u_matrix_mem (16 PEs)", "DW = 512, NW = 65536, AW = 16"),
               ("u_vector_mem", "DW = 32, NW = 16384, AW = 14"),
               ("u_output_mem", "DW = 512, NW = 65536, AW = 16, INITIALIZE_MEMORY = 1"),
               ("u_instruction_memory", "DW = 63, NW = 128, AW = 7")],
         vals_caption="The four instances (default defines.sv)",
         sv=["<code>parameter AW=$clog2(NW)</code>: a parameter can default to an expression of an earlier one. <code>$clog2</code> is ceil(log2)."]),
    dict(at="logic     [DW-1:0]  data", title="The storage", kind="given", color="m0",
         what="<code>data</code> is an unpacked array of <code>NW</code> words. In simulation it's just memory in the simulator. In synthesis this "
              "file is replaced by <code>synth/macros/array.sv</code>, an empty module of the same name, so the memories are black boxes: they "
              "add no area, and nothing inside them is timed.",
         sv=["<code>logic [DW-1:0] data [0:NW-1]</code>: the range before the name is the width of one element (packed), the range after is "
             "how many elements (unpacked). Like a Python list of fixed-width ints.",
             "<code>integer i</code> at module level is the loop variable of the <code>initial</code> block below. The <code>loadaddr</code> task "
             "uses it too, by mistake."]),
    dict(at="// optionally initialize RAM", title="Optional zero fill at time 0", kind="given", color="m2",
         what="With <code>INITIALIZE_MEMORY = 1</code> every word starts at 0. The buffer skeleton sets it only for MEM2. That matters: the "
              "testbench dumps all 65,536 MEM2 words and diffs them against Python, where every word starts at 0. Without it the unwritten words "
              "would be X in a 4-state simulator.",
         sv=["<code>initial begin #0 ... end</code>: runs once at the start of simulation. <code>#0</code> waits zero time (lets other "
             "time-0 code go first). <code>initial</code> and <code>#</code> delays are simulation-only; synthesis ignores or rejects them."]),
    dict(at="// write", title="Write: on the rising edge, if enabled and write-enabled", kind="given", color="m2",
         what="When <code>cen</code> = 0 and <code>gwen</code> = 0 at a rising edge, word <code>a</code> is updated: bits where <code>wen</code> is 0 "
              "take <code>d</code>, bits where <code>wen</code> is 1 keep their old value. (The expression simplifies to exactly that.) MEM2's "
              "<code>wen</code> is tied to <code>'0</code>, so a write stores all 512 bits.",
         vals=[("wen[i] = 1", "(old & 1) | (0 & (1 | d)) = old: bit kept"),
               ("wen[i] = 0", "(old & 0) | (1 & (0 | d)) = d: bit written")],
         vals_caption="The write expression, one bit at a time",
         sv=["<code>always @(posedge clk)</code> is the plain-Verilog form of <code>always_ff</code>.",
             "This block uses <code>=</code> (blocking) inside a clocked block. That's fine in a memory model but it's the root of the race "
             "described in the Verify tab."],
         see=[("The race", "verify/vd-race")]),
    dict(at="// read", id="cm-array-read", title="Read: sample the word at the rising edge", kind="given", color="m0",
         what="At every rising edge with <code>cen</code> = 0, <code>read_data</code> becomes <code>data[a]</code>, using the address presented "
              "<i>before</i> the edge. So data for an address you present in cycle t is available in cycle t + 1: one cycle of read latency. "
              "Python's <code>_handle_read</code> had none.",
         vals=[("cycle 7", "MEM0 a = 0, cen = 0 (the first READ)"),
               ("cycle 8", "MEM0 q = MEM0[0] = 0x0001_0003_fffe_0000\n= lanes [1 3 | -2 0]")],
         vals_caption="Real values, worked example run",
         see=[("SRAM latency in the waveform", "cycles/cy-sram")]),
    dict(at="// latch output", title="The output latch: q follows read_data while enabled", kind="given", color="m0",
         what="<code>q</code> copies <code>read_data</code> whenever <code>cen</code> is 0 and holds it when <code>cen</code> is 1. So if you disable "
              "the SRAM on non-READ cycles, <code>q</code> keeps showing the last word read. In an event-driven simulator this extra block also "
              "delays <code>q</code> by one delta step, which is why flops sampling <code>q</code> at the same edge see the old value.",
         sv=["<code>always @(read_data or cen or gwen)</code>: runs whenever one of those changes. With an <code>if</code> and no "
             "<code>else</code>, <code>q</code> keeps its value: that's a latch, on purpose here."]),
    dict(at="task loadmem;", title="loadmem: how the testbench fills a memory", kind="host", color="ink",
         what="Reads a text file with one binary word per line (<code>$readmemb</code>) and copies it into <code>data</code>. The testbench calls it "
              "as <code>dut.u_buffer.u_matrix_mem.loadmem(\"mem0.bits\")</code>, which is why your instance names must match.",
         sv=["A <code>task</code> is a procedure. Called through a hierarchical name it runs inside that instance.",
             "<code>assign word = memld[i];</code> inside a task is a procedural continuous assignment, an old Verilog feature. Don't copy it."]),
    dict(at="task dumpmem;", title="dumpmem: how the testbench reads MEM2 back", kind="host", color="ink",
         what="Writes every word, one per line in binary (<code>%b</code>), to a file. The equivalence testbench calls it on "
              "<code>dut.u_buffer.u_output_mem</code> and diffs the result against <code>ivd-sim</code>'s file. An X bit prints as <code>x</code>.",
         vals=[("result.bits", "65,536 lines of 512 characters (33,619,968 bytes)")],
         vals_caption="Real values, official INT8 run"),
    dict(at="task loadaddr;", title="loadaddr (unused, and buggy)", kind="given", color="gray",
         what="Meant to write one word at <code>load_addr</code>, but it writes <code>data[i]</code>, the module-level loop variable. No testbench "
              "calls it, so it does no harm. Don't use it.",
         sv=["Spotting this is a nice exercise in reading Verilog: <code>load_addr</code> is never used."]),
    dict(at="task dumpaddr;", title="dumpaddr (unused)", kind="given", color="gray",
         what="Reads one word out through a task output. Only works while <code>cen</code> is 1. No testbench calls it."),
]

# ================================================================== generated defines.sv
DEFINES = [
    dict(at="`ifndef ACCEL_DEFINES_H", title="Include guard and top-level numbers", kind="generated", color="ink",
         what="<code>ivd-gv</code> writes this file. The guard makes repeated <code>`include</code>s harmless. <code>PE_COUNT</code> is the one "
              "number Part 3 changes (<code>ivd-gv --pe_count N</code>); everything else follows from it.",
         sv=["<code>`define NAME value</code> is a text macro; use it as <code>`NAME</code>. It's global and has no type, unlike a "
             "<code>parameter</code>."]),
    dict(at="// Buffer Parameters", title="Memory sizes", kind="generated", color="m0",
         what="MEM0 and MEM2 are <code>PE_COUNT</code> × 32 bits wide (one 32-bit slice per PE) and 2<sup>16</sup> deep (the 16-bit counter). "
              "MEM1 is 32 bits wide and a quarter as deep (2<sup>14</sup>), because it holds up to four INT8 elements per word.",
         vals=[("MEM0 / MEM2", "512 bits × 65,536 (16 PEs); 64 bits with --pe_count 2"),
               ("MEM1", "32 bits × 16,384, address 14 bits")],
         vals_caption="Values"),
    dict(at="// Mode Parameters", title="Mode codes", kind="generated", color="ink",
         what="INT8 = 0, INT16 = 1, INT32 = 2, two bits wide. Code 3 has no meaning, and nothing handles it (see the decoder below)."),
    dict(at="//Processing Element Parameters", title="PE widths and the PE opcodes", kind="generated", color="pe",
         what="Inputs and output are 32 bits, the accumulator 64. Then the PE instruction encoding: opcode 0 means \"the value field says which "
              "instruction\" (MAC = 0, NOP = 1, OUT = 2, PASS = 3, CLR = 4); opcode 1 is RND, and its value field is the shift s. That's why "
              "<code>PE_MAC_OPCODE</code>, <code>PE_NOP_OPCODE</code> ... are all <code>2'd0</code> and only RND has no <code>_VALUE</code>.",
         sv=["<code>2'd0</code>: a 2-bit decimal 0. <code>5'd4</code>: a 5-bit 4. Sized literals matter in comparisons and concatenations."]),
    dict(at="// Buffer Instruction Parameters", title="Buffer opcodes", kind="generated", color="m0",
         what="READ = 0, WRITE = 1, NOP = 2, with offsets 16 bits wide. These three are written without a width (<code>`define BUF_READ 0</code>), "
              "so they're 32-bit integers when you compare against them; harmless, since a 2-bit opcode is extended to compare."),
    dict(at="// Controller Instruction Parameters", title="Instruction-level fields", kind="generated", color="ctl",
         what="Count is 16 bits, the increments 1 bit each, the whole instruction 63 bits, and the instruction memory 128 deep (7 address bits)."),
    dict(at="// Helpful Structs for Packing Instructions", title="pe_inst_t: 9 bits", kind="generated", color="pe",
         what="A packed struct is a bit vector with names for its fields. The <b>first field is the most significant</b>: "
              "<code>opcode</code> is bits [8:7], <code>mode</code> [6:5], <code>value</code> [4:0], the same order as the Python "
              "<code>Bits().join</code> in <code>instruction.py</code>.",
         vals=[("MAC INT16", "9'b00_01_00000 = 0x020"), ("OUT INT16", "9'b00_01_00010 = 0x022"), ("CLR INT16", "9'b00_01_00100 = 0x024")],
         vals_caption="Real encodings (worked example)"),
    dict(at="typedef struct packed {", then="    logic [`BUF_OPCODE_BITWIDTH", title="buf_inst_t: 36 bits", kind="generated", color="m0",
         what="opcode [35:34], mode [33:32], mema_offset [31:16], memb_offset [15:0].",
         vals=[("READ INT16 3 0", "0x1_0003_0000"), ("WRITE 1 (mode 0!)", "0x4_0001_0000"), ("NOP (mode 0)", "0x8_0000_0000")],
         vals_caption="Real encodings (worked example)"),
    dict(at="typedef struct packed {", then="    buf_inst_t buf_instruction", id="cm-inst-t", title="instruction_t: 63 bits, and the stored count", kind="generated", color="ctl",
         what="buf_instruction [62:27], pe_instruction [26:18], count [17:2], mema_inc [1], memb_inc [0]. The assembler stores the "
              "<b>written count minus one</b>: <code>READ ... | MAC INT16 | 3 1 1</code> has <code>count = 2</code> and runs 3 times.",
         vals=[("READ INT16 0 0 | MAC INT16 | 3 1 1", "000100000000000000000000000000000000000100000000000000000001011\ncount field = 2, mema_inc = 1, memb_inc = 1"),
               ("the padding word", "all 63 bits 0 = READ INT8 0 0 | MAC INT8, count 0 (one repetition)")],
         vals_caption="Real words from inst.bits"),
    dict(at="module vector_decoder (", id="cm-vdec", title="vector_decoder: two address inputs, one mode", kind="generated", color="m1",
         what="A combinational helper for MEM1. From <code>addr_from_controller</code> (an element offset) it computes the SRAM word address "
              "<code>addr_to_mem</code>. From <code>data_from_mem</code> (the 32-bit word that came back) and <code>addr_from_controller_reg</code> "
              "it picks one lane and repeats it. Two address inputs because those two jobs happen in <b>different cycles</b>: the address now, the "
              "lane select one cycle later, when the data arrives. But there's only one <code>mode</code> input, and the mode matters in both cycles.",
         see=[("Main buffer: the decoder", "buffer/mb-dec")]),
    dict(at="    always_comb begin", title="The case: wires, not arithmetic", kind="generated", color="m1",
         what="INT8: the word address is offset bits [15:2] and the lane is bits [1:0]. INT16: bits [14:1] and bit 0. INT32: bits [13:0], whole word. "
              "Python's <code>offset // 4</code> and <code>offset % 4</code> become plain wire selections: no divider, no logic. Note the missing "
              "<code>default</code>: for mode 3 nothing is assigned, which describes a latch. Yosys refuses it outright "
              "(\"Latch inferred ... from always_comb process\"); Verilator's lint flags <code>CASEINCOMPLETE</code>. We couldn't check what Design "
              "Compiler reports.",
         sv=["<code>{4{data_from_mem[7:0]}}</code> is replication: the byte four times, 32 bits. Same as Python's <code>bits * 4</code>.",
             "<code>case (x) ... endcase</code> with no <code>default</code>: any value not listed leaves the outputs unassigned."],
         see=[("Latches from incomplete case", "primer/pr-latch")]),
    dict(at="`endif", title="End of the include guard", kind="generated", color="gray", what="Closes the <code>`ifndef</code> at the top."),
]

# ================================================================== equivalence_testing/testbench/tb_top.sv
TB_TOP = [
    dict(at="`timescale 1ns / 1ps", title="Time units, the clock period, and where the memories are", kind="host", color="ink",
         what="Delays in this file are in ns. The clock period is 10 (ns) and reset lasts 5 periods. The <code>`define</code>s are the "
              "hierarchical paths the testbench uses to reach into your design: they fix the instance names <code>u_buffer</code>, "
              "<code>u_matrix_mem</code>, <code>u_vector_mem</code>, <code>u_output_mem</code>.",
         see=[("Names the testbench needs", "top/tp-names")]),
    dict(at="`define READ_LOAD_FILE", title="Three macros for command-line arguments", kind="host", color="ink",
         what="Each macro expands to an <code>initial</code> block that reads a <code>+NAME=value</code> argument (a plusarg), prints it, and for files "
              "calls <code>loadmem</code> on a memory. A missing argument stops the run with <code>$fatal</code>. (Icarus wants "
              "<code>$fatal(1, ...)</code>; our local scripts patch that. Verilator prints these banner lines as long numbers, which is cosmetic.)"),
    dict(at="module tb_top;", title="The testbench's own signals", kind="host", color="ink",
         what="A testbench is a module with no ports. It owns the clock, the reset and <code>instruction_count</code>, and instantiates your "
              "<code>top</code> as <code>dut</code>.",
         sv=["<code>reg</code> is the old name for <code>logic</code> in a testbench. <code>string</code> is a simulation-only type."]),
    dict(at="    // ====", then="    // DUT Instantiation", title="Your design, as dut", kind="host", color="ink",
         what="Only three ports: <code>clk</code>, <code>rst_n</code>, <code>instruction_count</code>. Everything else the testbench does goes "
              "through hierarchical names."),
    dict(at="    //----", then="    // Tasks", title="Helper tasks", kind="host", color="gray",
         what="Checks a file exists before loading it, and a task to end the simulation. <code>$assertkill</code> is VCS-only (our local scripts "
              "delete it)."),
    dict(at="    // ====", then="    // Clock Generation", title="The clock: 10 ns, first rising edge at 5 ns", kind="host", color="ink",
         what="<code>clk</code> starts at 0 and flips every 5 ns, so it rises at 5, 15, 25, ... ns. On this page, cycle n is the period that ends "
              "with the rising edge at 10n + 5 ns.",
         see=[("How to read the waveform", "cycles/cy-read")]),
    dict(at="    // ====", then="    // Reset Generation", title="Reset: low for 50 ns", kind="host", color="ink",
         what="<code>rst_n</code> is 0 from time 0 and goes to 1 at 50 ns, which is a falling clock edge (halfway through cycle 5). Cycles 0 to 4 "
              "are reset cycles."),
    dict(at="    // ====", then="    // Run-Time Flags", title="Waveform dump and the plusargs", kind="host", color="ink",
         what="Unless you pass <code>+NODUMP</code>, it turns on VCS's waveform dump (<code>$vcdpluson</code>, VPD format, for DVE). Our local "
              "scripts swap that for <code>$dumpfile/$dumpvars</code> (VCD, for Surfer). Then it reads <code>+INST_COUNT</code> and "
              "<code>+OUTPUT_FILE</code> and loads the instruction memory, MEM0 and MEM1 at time 0.",
         vals=[("+INST_COUNT", "lines in mat_mul.asm + 1 (65 in every official test with 16 PEs)"),
               ("+INST_FILE / +MEM0_FILE / +MEM1_FILE", "inst.bits (128 lines), mem0.bits (65,536), mem1.bits (16,384)")],
         vals_caption="Real values, official runs"),
    dict(at="    // ====", then="    // Determining Whether to End the Simulation", id="cm-tb-end", title="When you're done: the end condition and the cycle count", kind="host", color="m2",
         what="The run is over when <code>program_counter == instruction_count</code> <b>and</b> <code>dut.pe_inst_valid</code> and "
              "<code>dut.buf_inst_valid</code> are both 0. The testbench then waits one more clock period, prints the cycle count as "
              "<code>$time / 10</code> (so it includes the 5 reset cycles), and dumps MEM2. Your design must keep a valid high until its last WRITE "
              "is safely in MEM2, at most one cycle before the dump.",
         vals=[("worked example", "simulation_complete rises at 195 ns; dump at 205 ns; \"took 20 clock cycles\""),
               ("official, 16 PEs", "INT8 16,440, INT16 8,248, INT32 4,152 cycles (reference design)")],
         vals_caption="Real values",
         sv=["<code>always @(posedge simulation_complete)</code>: wait for that wire to go from 0 to 1. <code>#(`CLK_PERIOD)</code> waits 10 ns."],
         see=[("How the run ends", "cycles/cy-end")]),
    dict(at="    // Timeout to help debug", title="A timeout, so a hung design still ends", kind="host", color="gray",
         what="With <code>+TIMEOUT=10000000</code> (the Makefile's value) a design that never finishes is stopped after 10,000,000 ns = 1,000,000 "
              "cycles, with <code>ERROR: Timeout!</code> and no MEM2 dump."),
    dict(at="    // ====", then="    // Starting Test", title="A start banner", kind="host", color="gray",
         what="Prints a line two cycles after reset is released. Nothing else."),
]

# ================================================================== validation top_pe.sv (one wrapper)
TOP_PE = [
    dict(at="`include \"defines.sv\"", title="A wrapper with the same ports as top", kind="host", color="ink",
         what="The module testbenches don't use your <code>top.sv</code>. Each has a wrapper like this one that builds only part of the design. "
              "<code>tb_pe</code> instantiates <code>top_pe</code>: instruction memory, your controller, and one PE."),
    dict(at="    // Top Level Signals", title="Fixed inputs instead of a buffer", kind="host", color="pe",
         what="There's no buffer here: the PE's inputs are constants. As INT8 lanes (lane 3 first): <code>matrix_input = 0xfcfcfcfc</code> is "
              "[-4 -4 -4 -4] and <code>vector_input = 0xfe000302</code> is [-2 0 3 2].",
         vals=[("after the MAC", "acc = 0x0008_0000_fff4_fff8 = [8 0 -12 -8]"),
               ("after the OUT", "out = 0x0800f4f8 = [8 0 -12 -8]"),
               ("after the padding MAC", "acc = 0x0010_0000_ffe8_fff0 (one extra MAC from the all-zero word)")],
         vals_caption="Real values, reference design under Icarus (pe_test.asm, INST_COUNT = 3)"),
    dict(at="    // Instruction Memory", title="The real instruction memory", kind="host", color="ctl",
         what="Same instance name as in <code>top.sv</code>, so <code>tb_pe</code> can load the program into it."),
    dict(at="    controller u_controller", title="Your controller", kind="host", color="ctl",
         what="Exactly the ports your controller has. The buffer outputs go nowhere in this wrapper."),
    dict(at="    processing_element u_processing_element", title="Your PE", kind="host", color="pe",
         what="One PE. <code>tb_pe</code> runs 100 cycles past the end condition, then stops. It checks nothing: you read the waveform.",
         see=[("What each testbench shows", "verify/vd-tbs")]),
]

# ================================================================== equivalence_testing/Makefile
EQ_MK = [
    dict(at=".PHONY:", title="Targets and defaults", kind="tool", color="ink",
         what="Three tests, <code>int8_test</code>, <code>int16_test</code>, <code>int32_test</code>, plus <code>debug</code> (opens DVE) and "
              "<code>clean</code>. <code>VERILOG_DIR</code> picks which design folder is tested."),
    dict(at="# Compiler Defines", title="The staff tools", kind="tool", color="ink",
         what="<code>ivd-cc</code> compiles a matrix-vector problem, <code>ivd-mg</code> makes a random matrix, <code>ivd-as</code> assembles, "
              "<code>ivd-gv</code> writes <code>defines.sv</code>, <code>ivd-sim</code> runs the Python reference simulator. They're on your PATH "
              "on caddy; locally, run them with the Part 2 conda Python."),
    dict(at="# VCS Compile Options", title="VCS flags", kind="tool", color="ink",
         what="<code>-sverilog</code> turns on SystemVerilog, <code>-debug</code> keeps signal visibility for DVE. VCS exists only on caddy."),
    dict(at="# Directories/Files", title="File names", kind="tool", color="gray", what="Where each generated file goes."),
    dict(at="int8_test:", title="int8_test: a 1024 × 1024 problem", kind="tool", color="m0",
         what="The recipe has five steps, the same for all three tests. Only the sizes and the mode differ: INT8 1024 × 1024, INT16 512 × 512, "
              "INT32 256 × 256, each 16 tiles of output rows with 16 PEs."),
    dict(at="\t@# Compiling Software", title="1. Software: random data, compile, assemble", kind="tool", color="m0",
         what="A random matrix with values −5 … 4 (seed 0) and a vector (seed 12345), compiled for INT8 into <code>mem0.bits</code>, "
              "<code>mem1.bits</code> and a 64-line <code>mat_mul.asm</code>, then assembled into the 128-word <code>inst.bits</code> (padded with zeros).",
         vals=[("mat_mul.asm", "64 lines: 16 tiles × (CLR, READ|MAC ×1024, OUT, WRITE)"),
               ("mem0.bits", "65,536 lines × 512 bits = 33,619,968 bytes")],
         vals_caption="Real values, official INT8 run"),
    dict(at="\t@# Compiling Hardware", title="2. Hardware: defines.sv, then VCS", kind="tool", color="pe",
         what="Generates <code>defines.sv</code> with the default 16 PEs and compiles your design plus the testbench into <code>simv</code>. "
              "Part 3: to change the PE count, pass <code>--pe_count</code> to <code>ivd-gv</code>, <code>ivd-cc</code> and <code>ivd-sim</code> "
              "(handout section 2.2.5), and to <code>ivd-as</code> too if it needs a deeper instruction memory."),
    dict(at="\t@# Running Software Sim", title="3. The Python reference", kind="tool", color="ctl",
         what="<code>ivd-sim</code> runs the staff's Python simulator on the same bits and writes <code>out.bits</code>. It stops at the first "
              "all-zero instruction word, so it never runs the padding."),
    dict(at="\t@# Running Hardware Sim", title="4. Your RTL, with INST_COUNT = lines + 1", kind="tool", color="pe",
         what="Counts the assembly lines and adds one, so the RTL also executes one all-zero padding instruction "
              "(<code>READ INT8 0 0 | MAC INT8</code>, one repetition). It's harmless: it comes after the last WRITE. It does cost a cycle.",
         sv=["<code>$$</code> is a literal <code>$</code> in a Makefile, so <code>$$(( ... ))</code> is shell arithmetic."]),
    dict(at="\t@# Checking if the test passed", title="5. diff the two MEM2 dumps", kind="tool", color="m2",
         what="<code>check_results.sh</code> runs <code>diff result.bits out.bits</code> and prints PASSED or FAILED. It always exits 0, so "
              "<code>make</code> reports success either way: read the last line."),
    dict(at="int16_test:", title="int16_test: 512 × 512", kind="tool", color="m0",
         what="Same five steps in INT16. Its vector ends in 0, so a bug that only spoils the last column's product can pass this test."),
    dict(at="int32_test:", title="int32_test: 256 × 256", kind="tool", color="m0",
         what="Same five steps in INT32. Its vector ends in −1 = 0xFFFFFFFF, whose four bytes are identical, so a lane-select bug on the last "
              "column can pass this test."),
    dict(at="debug:", title="debug: open the waveform in DVE", kind="tool", color="gray",
         what="Opens <code>vcdplus.vpd</code> in Synopsys DVE (caddy only). Locally, use Surfer on the VCD."),
    dict(at="clean:", title="clean", kind="tool", color="gray", what="Deletes the build products and generated files."),
]

# ================================================================== equivalence_testing/check_results.sh
CHECK = [
    dict(at="if diff", title="The whole checker", kind="tool", color="m2",
         what="A plain line-by-line <code>diff</code> of the two dumps. Line n of each file is MEM2 word n − 1. Any difference prints both lines "
              "and \"Test FAILED!\". No exit code is set, so scripts can't rely on it.",
         see=[("Reading a MEM2 mismatch", "verify/vd-mismatch")]),
]

# ================================================================== validation/Makefile
VAL_MK = [
    dict(at=".PHONY:", title="Module testbenches: defaults", kind="tool", color="ink",
         what="<code>TB_NAME</code> picks the testbench (default <code>top</code>), <code>INST_COUNT</code> defaults to <b>3</b>. That's right for "
              "<code>pe_test.asm</code> (2 lines) and <code>buffer_wb_test.asm</code> (1 line), but the 10 × 5 INT8 program used by the other "
              "testbenches has 4 lines, so pass <code>INST_COUNT=5</code> there."),
    dict(at="# Bash Functions", title="A check that TB_NAME is set", kind="tool", color="gray", what="Make plumbing."),
    dict(at="compile: compile_hw compile_sw", title="compile = hardware + software", kind="tool", color="ink",
         what="<code>make compile TB_NAME=pe</code> builds <code>defines.sv</code> and <code>simv</code> for <code>tb_pe</code>, then the program."),
    dict(at="ifeq ($(TB_NAME),pe)", title="Which program each testbench runs", kind="tool", color="ctl",
         what="<code>pe</code>: <code>pe_test.asm</code> (MAC INT8 once, OUT INT8 once). <code>buffer_wb</code>: <code>buffer_wb_test.asm</code> "
              "(WRITE 3 once). Everything else: a random 10 × 5 INT8 problem (4 instructions).",
         see=[("What each testbench shows", "verify/vd-tbs")]),
    dict(at="run_sim:", title="run_sim and debug", kind="tool", color="ink",
         what="Runs <code>simv</code> with the plusargs. <code>make debug</code> opens the waveform in DVE."),
    dict(at="clean:", title="clean", kind="tool", color="gray", what="Deletes the build products."),
]

# ================================================================== the four skeletons
PE_SK = [
    dict(at="`include \"defines.sv\"", title="The PE's ports", kind="given", color="pe",
         what="One instruction (9 bits) and its valid, two 32-bit operands, one 32-bit output. <code>vector_input</code> is A (Data0, the "
              "broadcast MEM1 word) and <code>matrix_input</code> is B (this PE's MEM0 slice). There's no port for the accumulator: the tests only "
              "see <code>vector_output</code>, and you see the accumulator in the waveform.",
         see=[("Processing element tab", "pe")]),
    dict(at="    // START IMPLEMENTATION", id="cm-pe-yours", title="Your Code Here: the PE", kind="yours", color="pe",
         what="Everything the PE does goes here.",
         todo="<ul><li>Two registers: a 64-bit accumulator and a 32-bit output register, both reset to 0 when <code>rst_n</code> is low "
              "(asynchronously, like the program counter).</li>"
              "<li>Work out each register's next value from <code>pe_inst</code>: if the opcode is RND, round the accumulator lanes by s = the "
              "value field; otherwise the value field selects MAC, NOP, OUT, PASS or CLR. When <code>pe_inst_valid</code> is 0, nothing changes.</li>"
              "<li>Do every operation per lane, in the lane layout the mode selects (4, 2 or 1 lanes), with signed arithmetic, so no carry or "
              "sign crosses a lane boundary.</li>"
              "<li>MAC adds the full signed product to the wide lane (wrapping). OUT clamps each accumulator lane into the output lane's range and "
              "leaves the accumulator alone. PASS sign-extends each <code>vector_input</code> lane into its accumulator lane. CLR zeroes both "
              "registers. RND divides each lane by 2<sup>s</sup>, nearest, ties to even. Only OUT and CLR change the output register.</li>"
              "<li>Drive <code>vector_output</code> from the output register.</li></ul>",
         see=[("How the hardware computes each one", "pe/pe-ops")]),
    dict(at="endmodule", title="End of the module", kind="given", color="gray", what="Closes <code>module processing_element</code>."),
]

BUF_SK = [
    dict(at="`include \"defines.sv\"", title="The buffer's ports", kind="given", color="m0",
         what="In: the buffer instruction and its valid from the controller, and <code>output_data</code> (all PE outputs). Out: "
              "<code>matrix_data</code> (MEM0's word, all PEs' slices) and <code>vector_data</code> (the decoded MEM1 word)."),
    dict(at="    // START IMPLEMENTATION", id="cm-buf-yours", title="Your Code Here: the buffer's logic", kind="yours", color="m0",
         what="The logic around the three memories goes here (and inside their port lists, below).",
         todo="<ul><li>On a valid READ: present MEM0's address (the low <code>MEM0_ADDR_WIDTH</code> bits of <code>mema_offset</code>) and MEM1's "
              "word address (from a <code>vector_decoder</code> fed with <code>memb_offset</code> and the mode). Decide whether the SRAMs are "
              "enabled only on READ or always (both work).</li>"
              "<li>The words come back on <code>q</code> one cycle later. <code>matrix_data</code> is MEM0's <code>q</code>. <code>vector_data</code> "
              "is MEM1's word with the lane chosen by the offset <b>and mode</b> that the READ had, one cycle earlier. So keep a copy of both.</li>"
              "<li>On a valid WRITE: store <code>output_data</code> at <code>mema_offset</code> in MEM2 by pulling <code>write_control_n</code> low for "
              "one cycle, at a cycle when <code>output_data</code> already holds the new outputs (after the OUT before it has updated the PEs).</li>"
              "<li>NOP, and anything while <code>buf_inst_valid</code> is 0, does nothing.</li></ul>",
         see=[("Main buffer tab", "buffer")]),
    dict(at="    array #(", title="MEM0: the matrix, read-only", kind="given", color="m0",
         what="512 bits × 65,536 with 16 PEs. Write is disabled (<code>wen</code> and <code>gwen</code> tied to 1). You connect <code>a</code> "
              "and <code>q</code>, and may replace the tied-low <code>cen</code>. Keep the instance name <code>u_matrix_mem</code>: the testbench "
              "loads it by that name."),
    dict(at="    array #(", title="MEM1: the vector, read-only", kind="given", color="m1",
         what="32 bits × 16,384. Same as MEM0: connect the address and the output, keep the name <code>u_vector_mem</code>."),
    dict(at="    logic write_control_n;", title="MEM2: the results, write-only", kind="given", color="m2",
         what="Always enabled (<code>cen</code> = 0), all bits writable (<code>wen</code> = '0), and written whenever <code>gwen</code> = "
              "<code>write_control_n</code> is 0 at a rising edge. Zero-filled at the start (<code>INITIALIZE_MEMORY(1)</code>), so unwritten words "
              "match Python's zeros. You drive <code>write_control_n</code>, <code>a</code> and <code>d</code>; <code>q</code> is unused."),
    dict(at="    // END IMPLEMENTATION", title="End", kind="given", color="gray", what="Closes the module."),
]

CTL_SK = [
    dict(at="`include \"defines.sv\"", title="The controller's ports", kind="given", color="ctl",
         what="In: the instruction and its valid. Out: the handshake <code>inst_exec_begins</code>, and two instruction streams, one for the "
              "PEs and one for the buffer, each with a valid."),
    dict(at="    typedef enum {IDLE, EXECUTING} fsm_t;", title="A two-state machine, given", kind="given", color="ctl",
         what="The state type is provided. It's an <code>enum</code> with no base type, which means <code>int</code>: 32 bits and 2-state, so "
              "<code>state</code> starts at IDLE (0) in every simulator even without a reset. Reset it anyway: real flip-flops don't start at 0.",
         sv=["<code>typedef enum {A, B} t;</code> gives the values names. <code>state == IDLE</code> reads better than <code>state == 0</code>."]),
    dict(at="    // START IMPLEMENTATION", id="cm-ctl-yours", title="Your Code Here: the controller", kind="yours", color="ctl",
         what="The state machine and the instruction streams go here.",
         todo="<ul><li>Registers for the instruction being executed: its memory half, its PE half, a repetition counter loaded from "
              "<code>count</code> (which runs count + 1 times), and the two offsets, loaded from the instruction and stepped by "
              "<code>mema_inc</code> / <code>memb_inc</code> once per repetition. All reset to 0, state to IDLE.</li>"
              "<li>Take <code>inst</code> when it's valid and you're idle or on your last repetition, and raise <code>inst_exec_begins</code> for "
              "exactly that one cycle (it advances the program counter).</li>"
              "<li><code>buf_inst</code>: the memory opcode and mode with this repetition's offsets; <code>buf_inst_valid</code> while executing.</li>"
              "<li><code>pe_inst</code> / <code>pe_inst_valid</code>: the PE half, timed so each PE operation happens in the cycle its READ's data "
              "is on the buffer outputs.</li>"
              "<li>When the program is done, all valids go to 0 (that's how the testbench knows you've finished).</li></ul>",
         see=[("Controller tab", "controller")]),
    dict(at="endmodule", title="End", kind="given", color="gray", what="Closes the module."),
]

TOP_SK = [
    dict(at="`include \"defines.sv\"", title="top's ports", kind="given", color="ink",
         what="Just the clock, the reset and <code>instruction_count</code>. The testbench sees nothing else except through hierarchical names."),
    dict(at="    // Top Level Signals", title="Signals already declared", kind="given", color="ctl",
         what="The instruction, its valid, and the handshake wire. You declare the rest."),
    dict(at="    instruction_memory u_instruction_memory (", title="The instruction memory, already instantiated", kind="given", color="ctl",
         what="Keep this instance name: the testbench loads <code>dut.u_instruction_memory.u_instruction_memory</code> and reads "
              "<code>dut.u_instruction_memory.program_counter</code>."),
    dict(at="    // START IMPLEMENTATION", id="cm-top-yours", title="Your Code Here: the wiring", kind="yours", color="ink",
         what="Declarations and instances, no logic.",
         todo="<ul><li>Declare the controller-to-PE and controller-to-buffer signals. Two names are fixed by the testbench: "
              "<code>pe_inst_valid</code> and <code>buf_inst_valid</code>.</li>"
              "<li>Instantiate your controller and your buffer; the buffer must be named <code>u_buffer</code>.</li>"
              "<li>Instantiate <code>PE_COUNT</code> processing elements with a <code>generate</code> loop. Each gets the same instruction, the "
              "same <code>vector_data</code>, and its own 32-bit slice of <code>matrix_data</code>; its <code>vector_output</code> drives the "
              "<b>same slice position</b> of <code>output_data</code>, in the order the compiler packed the rows (PE 0 at the most significant "
              "end, like Python's <code>cut()</code>).</li></ul>",
         see=[("Top tab", "top")]),
    dict(at="endmodule", title="End", kind="given", color="gray", what="Closes the module."),
]

FILES = [
    dict(path=f"part2/{LV}/processing_element.sv", group="You finish these", kind="yours", blurb="the PE", regions=PE_SK,
         intro="The skeleton: ports only. The notes say what has to go in, in words; the PE tab shows how the hardware computes each instruction."),
    dict(path=f"part2/{LV}/buffer.sv", group="You finish these", kind="yours", blurb="three SRAMs + glue", regions=BUF_SK,
         intro="The three memories are already instantiated with their parameters; you connect them and write the logic around them."),
    dict(path=f"part2/{LV}/controller.sv", group="You finish these", kind="yours", blurb="the sequencer", regions=CTL_SK,
         intro="Ports and the state type are given."),
    dict(path=f"part2/{LV}/top.sv", group="You finish these", kind="yours", blurb="the wiring", regions=TOP_SK,
         intro="The instruction memory is instantiated; you add the controller, the buffer and the PE array."),
    dict(path=f"part2/{LV}/instruction_memory.sv", group="Given RTL", kind="given", blurb="program + PC + prefetch", regions=IMEM,
         intro="Holds the program and the program counter, and implements the fetch handshake. Read it closely: your controller has to fit it."),
    dict(path=f"part2/{LV}/array.sv", group="Given RTL", kind="given", blurb="the SRAM model", regions=ARRAY,
         intro="The behavioral SRAM used for all four memories. In synthesis it becomes an empty black box."),
    dict(path="GENERATED/defines.sv", shown="defines.sv (generated by ivd-gv, 16 PEs)", group="Given RTL", kind="generated",
         blurb="macros, structs, vector_decoder", regions=DEFINES,
         intro="Not in the repo: <code>ivd-gv --out defines.sv</code> writes it at build time. Shown here as generated with the default options "
               "(16 PEs, 16-bit counter, depth 128), freshly regenerated whenever this page is rebuilt with the Part 2 environment present."),
    dict(path="part2/equivalence_testing/testbench/tb_top.sv", group="Testbenches and flow", kind="given", blurb="the equivalence testbench", regions=TB_TOP,
         intro="The testbench behind <code>make int8_test</code> and friends: it loads the memories, runs your <code>top</code>, decides when "
               "you're done, counts cycles and dumps MEM2."),
    dict(path=f"part2/unoptimized_verilog/validation/testbenches/top_pe.sv", group="Testbenches and flow", kind="given", blurb="a module-test wrapper",
         regions=TOP_PE, intro="One of the four wrappers the module testbenches use (the others are <code>top_controller</code>, "
                               "<code>top_buffer</code>, <code>top_buffer_wb</code>)."),
    dict(path="part2/equivalence_testing/Makefile", group="Testbenches and flow", kind="given", blurb="the equivalence recipe", regions=EQ_MK, lang="mk",
         intro="What <code>make int8_test</code> actually runs, step by step."),
    dict(path="part2/equivalence_testing/check_results.sh", group="Testbenches and flow", kind="given", blurb="the pass/fail check", regions=CHECK, lang="mk",
         intro="Five lines."),
    dict(path="part2/unoptimized_verilog/validation/Makefile", group="Testbenches and flow", kind="given", blurb="module testbenches", regions=VAL_MK, lang="mk",
         intro="What <code>make compile TB_NAME=pe</code> and <code>make run_sim</code> run."),
]
