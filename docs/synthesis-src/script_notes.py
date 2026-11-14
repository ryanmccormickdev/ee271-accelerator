"""The "The script" tab: the course's synth/Makefile and synth/dc_synth.tcl split into blocks, one note
per block. build.py pastes the REAL files from part2/ and fails if a block's first line ("at") is gone,
so a staff change can't silently put a note next to the wrong line.

ev (evidence) tags:
  file  - what the line literally does (Make / Tcl / shell semantics, read straight from the files)
  local - checked on this laptop (for example with `make -n`)
  lib   - read out of the open Nangate45 Liberty file by lib_facts.py
  docs  - Design Compiler behavior as Synopsys documents it; NOT run here (nobody has run DC on this design yet)
affects: which output a line changes. Keys: log, timing, area, power, qor, results, netlist, files.
"""

AFFECTS = {
    'log': 'compile.log', 'timing': 'timing report', 'area': 'area reports', 'power': 'power report',
    'qor': 'QoR report', 'results': 'results.txt', 'netlist': 'netlist', 'files': 'files on disk',
}

FILES = [
    {
        'id': 'mk',
        'path': 'unoptimized_verilog/synth/Makefile',
        'intro': 'What <code>make synthesize</code> runs. The repo wraps it as <code>make synth</code>. Two commands: generate <code>defines.sv</code>, then start Design Compiler on <code>dc_synth.tcl</code>.',
        'blocks': [
            {'at': '# Tools', 'title': 'The defines generator', 'ev': ['file'], 'affects': ['files'],
             'what': '<code>ivd-gv</code> is the staff Python script in <code>part2/simulator/bin/</code>. Make finds it through your <code>PATH</code>, and <code>load_modules.sh</code> line 8 is what puts <code>simulator/bin</code> on it. If you see <code>ivd-gv: Command not found</code>, you haven\'t sourced <code>load_modules.sh</code> in this shell. It also needs a Python with numpy and bitstring (your Part 2 conda env).'},
            {'at': '# Parameters to Run Synthesis With', 'title': 'The three knobs', 'ev': ['file', 'local'], 'affects': ['timing', 'area', 'results'],
             'what': '<p><code>CLK_PERIOD=2.000</code> ns is the clock every timing path is checked against (2 ns = 500 MHz). <code>TARGET_AREA=150000</code> µm² becomes <code>set_max_area</code>. <code>DESIGN_TARGET=top</code> is the module DC builds from.</p>'
                     '<p>You can override them without editing the file: <code>make synthesize CLK_PERIOD=1.8</code>. We checked this with <code>make -n</code>: the command line becomes <code>set CLK_PERIOD 1.8;</code>. That\'s handy for a Part 3 period sweep.</p>'
                     '<p>The semicolons end up inside the values. Make keeps everything up to the <code>#</code>, so <code>CLK_PERIOD</code> is really <code>2.000;</code> plus spaces. In Tcl a <code>;</code> just ends a command, so <code>set CLK_PERIOD 2.000;   ;</code> is harmless.</p>'},
            {'at': 'SET_SYNTH_PARAMS', 'title': 'Hand the knobs to Tcl', 'ev': ['file'], 'affects': [],
             'what': 'Builds the Tcl text that defines <code>DESIGN_TARGET</code>, <code>CLK_PERIOD</code> and <code>TARGET_AREA</code> before the script runs. <code>dc_synth.tcl</code> reads them as <code>$CLK_PERIOD</code> and so on.'},
            {'at': 'DC_COMMAND_STRING', 'title': 'source -echo -verbose', 'ev': ['file', 'docs'], 'affects': ['log'],
             'what': '<p>After the three <code>set</code>s, DC runs <code>source -echo -verbose dc_synth.tcl</code>. <code>-echo</code> prints each command before it runs and <code>-verbose</code> prints what it returns. So <code>compile.log</code> holds the text of the whole script, with the output of each command after it.</p>'
                     '<p>That\'s a grep trap: the log always contains the words <code>check_error</code> and <code>error_checking_report</code>, so <code>grep -i error compile.log</code> always finds something. Search for real messages instead, for example <code>grep -n "^Error" compile.log</code>.</p>'},
            {'at': 'synthesize:', 'title': 'The two commands', 'ev': ['file', 'local'], 'affects': ['log', 'files'],
             'what': '<p><b>1.</b> <code>ivd-gv --out defines.sv</code> regenerates <code>defines.sv</code> with every default: 16 PEs, 32/64/32-bit PE widths, a 16-bit counter, a 128-deep instruction memory (the argparse defaults in <code>ivd-gv</code>). <b>Part 3:</b> if you change the PE count, this line needs the same <code>--pe_count</code> as your tests, or you\'ll synthesize a different machine than the one you simulated.</p>'
                     '<p><b>2.</b> <code>dc_shell-t</code> is DC\'s Tcl shell (an old name; <code>-64bit</code> is a legacy flag). <code>-x "..."</code> runs that text when it starts. <code>2&gt;&amp;1 | tee -i compile.log</code> copies everything DC prints, errors included, to your screen and to <code>compile.log</code>. Each run overwrites the log. <code>-i</code> makes tee ignore Ctrl-C, so the log keeps its last lines if you interrupt.</p>'
                     '<p><b>Exit status:</b> because of the pipe, make sees tee\'s exit status, not DC\'s. So make reports success even if DC hit errors. Read the log.</p>'
                     '<p>The exact command, from <code>make -n synthesize</code>:</p><pre class="code wrapme">dc_shell-t -64bit -x "set DESIGN_TARGET  top;  ; set CLK_PERIOD     2.000;   ; set TARGET_AREA    150000; ;	 source -echo -verbose dc_synth.tcl" 2&gt;&amp;1 | tee -i compile.log</pre>'},
            {'at': 'clean:', 'title': 'make clean', 'ev': ['file', 'local'], 'affects': ['files', 'results'],
             'what': '<p>Deletes every log (<b>including compile.log</b>), <code>reports/</code>, <code>netlist/</code>, <code>default.svf</code>, <code>results.txt</code>, <code>defines.sv</code>, the <code>FreePDK_45nm/</code> work library and the <code>alib-52/</code> cache.</p>'
                     '<p>Run it before a run you want to compare, because the script <b>appends</b> to <code>results.txt</code> (<code>&gt;&gt;</code>). Without it, a second run stacks a second block of results under the first. Copy <code>compile.log</code> somewhere first if you need it: Part 2 submits it.</p>'},
        ],
    },
    {
        'id': 'tcl',
        'path': 'unoptimized_verilog/synth/dc_synth.tcl',
        'intro': 'The script Design Compiler runs: read the design, set the constraints, compile, write the reports.',
        'blocks': [
            {'at': '# Simple synthesis script', 'title': 'FreePDK45 and Nangate', 'ev': ['file'], 'affects': [],
             'what': 'FreePDK45 is NC State\'s open 45 nm process design kit. The Nangate Open Cell Library, the cells this script maps to, was built on it. Here the name only survives as the name of the work library on line 5.'},
            {'at': 'file mkdir reports', 'title': 'Make the output folders', 'ev': ['file'], 'affects': ['files'],
             'what': 'Plain Tcl: create <code>reports/</code> and <code>netlist/</code>. It\'s fine if they already exist.'},
            {'at': 'remove_design -all', 'title': 'Start from an empty memory', 'ev': ['docs'], 'affects': [],
             'what': 'Removes any design already loaded in DC, so the run starts clean.'},
            {'at': 'define_design_lib', 'title': 'The work library', 'ev': ['docs'], 'affects': ['files'],
             'what': 'Names a design library <code>FreePDK_45nm</code> stored in the folder <code>FreePDK_45nm/</code>. <code>analyze</code> writes its parsed intermediate files there and <code>elaborate</code> reads them back. It\'s scratch space; <code>make clean</code> deletes it.'},
            {'at': 'set_host_options', 'title': 'Up to 16 cores', 'ev': ['docs'], 'affects': [],
             'what': 'Lets DC run the parallel parts of compile on up to 16 CPU cores, if the machine and the licenses allow. It\'s about run time, not about what gets built.'},
            {'at': '#####################\n# Config Variables', 'title': 'Library paths', 'ev': ['file'], 'affects': [],
             'what': '<p><code>SYN</code> points at the library folder of an <b>older</b> DC install (<code>M-2016.12-SP2</code>). It\'s only used to find DesignWare\'s <code>dw_foundation.sldb</code>. <code>load_modules.sh</code> loads <code>dc_shell/S-2021.06-SP5-4</code>, a newer version. We can\'t check from here whether that old folder still exists on caddy. If DC can\'t find <code>dw_foundation.sldb</code>, there will be a message about it near the top of <code>compile.log</code>; look once.</p>'
                     '<p><code>OPENCELL_45</code> is <code>./lib/</code>, the Nangate files shipped in <code>synth/lib/</code>.</p>'},
            {'at': '#####################\n# Set Design Library', 'title': 'link, target and synthetic libraries', 'ev': ['docs', 'file'], 'affects': ['area', 'timing', 'power'],
             'what': '<p>A <b>.db</b> file is a compiled, binary Liberty library: every cell\'s logic function, area, pin capacitances, delay and power tables, and design rules. This page reads the same library\'s text version (.lib) with Python.</p>'
                     '<ul><li><b>link_library</b>: where <code>link</code> looks to resolve every cell and instance: the Nangate cells plus DesignWare.</li>'
                     '<li><b>target_library</b>: the only cells <code>compile</code> may build your logic from. Here, only Nangate.</li>'
                     '<li><b>synthetic_library</b>: <code>dw_foundation.sldb</code>, DesignWare Foundation. It\'s Synopsys\'s catalog of ready-made implementations for operators like <code>+</code>, <code>-</code>, <code>*</code>, comparators and shifters, with several architectures each (ripple or prefix adders, array or Booth multipliers). compile picks among them for each operator in your RTL.</li></ul>'},
            {'at': 'set dw_lib', 'title': 'search_path', 'ev': ['docs', 'file'], 'affects': [],
             'what': 'The folders DC searches for any file named without a path: the <code>.db</code> files, and the <code>defines.sv</code> that every RTL file <code>`include</code>s. This line <b>replaces</b> DC\'s default list. <code>../rtl/</code> and <code>../params/</code> don\'t exist in this project (leftovers from an older one), which is harmless. <code>./lib/</code> is where <code>NangateOpenCellLibrary.db</code> is found.'},
            {'at': '###################\n# Read Design', 'title': 'What DC reads', 'ev': ['file'], 'affects': ['area', 'timing'],
             'what': '<p><code>defines.sv</code> (generated) first, then your four files, the given <code>instruction_memory.sv</code>, and <b><code>./macros/array.sv</code>: the empty memory</b>, not <code>logical/array.sv</code>. So every SRAM becomes a box with ports and nothing inside (see the Black boxes tab).</p>'
                     '<p>Nothing from <code>validation/</code> is read: testbenches never get synthesized.</p>'},
            {'at': 'analyze -library', 'title': 'analyze', 'ev': ['docs'], 'affects': ['log'],
             'what': 'Parses each file as SystemVerilog, checks the syntax and some semantics, and stores the result in <code>FreePDK_45nm/</code>. Syntax errors show up here as <code>Error:</code> lines with the file and line number.'},
            {'at': 'elaborate', 'title': 'elaborate', 'ev': ['docs'], 'affects': ['log'],
             'what': '<p>Builds the design starting at <code>top</code>. It fixes every parameter, so each <code>array #(...)</code> becomes its own design, typically named like <code>array_DW512_NW65536_AW16</code>. It unrolls generate loops and infers a flip-flop or latch for every register (and prints an "Inferred memory devices" table for each process).</p>'
                     '<p>The result is a generic netlist: <b>GTECH</b> gates (Synopsys\'s technology-independent AND, OR, MUX, flip-flop models, no area or delay yet) plus "synthetic operators" for arithmetic that DesignWare will implement later. Latch warnings (<code>ELAB-974</code>) and multiple-driver errors (<code>ELAB-366</code>) appear here.</p>'},
            {'at': 'link', 'title': 'link', 'ev': ['docs'], 'affects': ['log'],
             'what': 'Resolves every instance to a design in memory or a library cell. If an instance names a module DC never read (a typo, a missing file), you get <code>Unable to resolve reference ... (LINK-5)</code>, and that instance becomes a black box with no logic. Treat that message as an error even though DC calls it a warning.'},
            {'at': '##################################\n# Constraints File', 'title': 'Port names', 'ev': ['file'], 'affects': ['timing'],
             'what': 'The port names the constraints refer to. Your <code>top</code> must keep its ports named <code>clk</code> and <code>rst_n</code>.'},
            {'at': 'create_clock', 'title': 'The clock: 2 ns', 'ev': ['docs'], 'affects': ['timing', 'power', 'results'],
             'what': '<p>Defines a clock on port <code>clk</code> with a 2.000 ns period (500 MHz), 50% duty cycle by default. Every register-to-register path must fit inside one period minus the capturing flop\'s setup time.</p>'
                     '<p>The clock is <b>ideal</b>: DC builds no clock tree and assumes zero skew and zero delay. That\'s why the timing report says <code>clock network delay (ideal) 0.0000</code>. The same period sets <i>f</i> in the dynamic power estimate.</p>'},
            {'at': 'set_wire_load_model', 'title': 'Wire-load model', 'ev': ['docs', 'lib'], 'affects': ['timing', 'power'],
             'what': '<p>Before placement nobody knows how long a wire will be. So DC estimates each net\'s capacitance and resistance from its fanout, using a table from the library. <code>1K_hvratio_1_4</code> is one of nine tables in the Nangate library. In the open .lib, a net with fanout 4 is given 7.66 length units, which comes to 1.36 fF and 27 Ω.</p>'
                     '<p>That\'s less than one X1 inverter input (1.70 fF), so this model makes wires cheap. Real routed wires on a block this size are longer, so post-layout timing would be worse. The course uses it as a fixed yardstick. See the full table in "See it happen".</p>'},
            {'at': 'set_wire_load_mode', 'title': 'Wire-load mode: top', 'ev': ['docs'], 'affects': ['timing', 'power'],
             'what': 'Use the top design\'s wire-load model for every net, wherever it sits in the hierarchy. (Other modes pick a model per sub-block.)'},
            {'at': 'set_max_fanout', 'title': 'Max fanout 4 (input ports only)', 'ev': ['docs', 'lib'], 'affects': ['timing', 'area'],
             'what': '<p>The filter <code>@port_direction != out</code> selects every port that isn\'t an output: <code>clk</code>, <code>rst_n</code> and <code>instruction_count</code>. The limit applies to the nets those ports drive: at most 4 fanout-load units, and Nangate gives every input pin 1.0. <code>clk</code> is an ideal clock and <code>rst_n</code> is made <code>dont_touch</code> below. So in practice this rule only makes DC buffer the seven <code>instruction_count</code> bits.</p>'
                     '<p>Inside the design, the library\'s own design rules do this job instead: <code>default_max_transition</code> is 0.199 ns, and every output pin has a <code>max_capacitance</code>. DC fixes violations by sizing and buffering.</p>'},
            {'at': 'set all_inputs_wo_rst_clk', 'title': 'Every input except clk and rst_n', 'ev': ['file'], 'affects': [],
             'what': 'A collection of all input ports minus <code>clk</code> and <code>rst_n</code>. <code>top</code> has only three inputs, so this is just <code>instruction_count</code>.'},
            {'at': 'set_input_delay -clock $CLK [ expr', 'title': 'Input delay: 3/4 of a period', 'ev': ['docs'], 'affects': ['timing'],
             'what': 'Tells DC those inputs arrive 1.5 ns (3/4 × 2.0) after the clock edge, as if logic outside the chip used that much of the cycle. Only 0.5 ns would be left inside. But line 58 resets <code>instruction_count</code> to 0, and a later <code>set_input_delay</code> on the same port and clock replaces the earlier one. So in this design this line has no lasting effect.'},
            {'at': 'set_driving_cell', 'title': 'Inputs are driven by an INV_X1', 'ev': ['docs'], 'affects': ['timing'],
             'what': 'Models every input port as driven by a Nangate <code>INV_X1</code>, so input transitions get a realistic slope and drive strength instead of an ideal one.'},
            {'at': 'set_input_delay -clock $CLK 0', 'title': 'instruction_count: delay 0', 'ev': ['docs'], 'affects': ['timing'],
             'what': '<code>instruction_count</code> is a setting the testbench holds steady, so it arrives at the clock edge (0 delay). Paths from it get the whole period.'},
            {'at': 'set_max_area', 'title': 'Area goal: 150,000 µm²', 'ev': ['docs'], 'affects': ['area', 'qor'],
             'what': 'An area <b>goal</b>. DC works on area after it has done what it can for design rules and timing. If the result is bigger, that\'s a constraint violation in <code>report_qor</code>/<code>report_constraint</code>, not an error. (The Part 3 cap is 1,000,000 µm², from the handout, and DC knows nothing about it.)'},
            {'at': 'remove_driving_cell', 'title': 'Reset: ideal and untouched', 'ev': ['docs'], 'affects': ['timing', 'area'],
             'what': '<p><code>remove_driving_cell</code> plus <code>set_drive 0</code> make <code>rst_n</code> an ideal driver (zero resistance). <code>set_dont_touch_network</code> tells DC not to buffer, resize or rewire the reset net or anything it fans out to, through combinational cells, up to the register pins.</p>'
                     '<p>Why: the reset reaches every flop\'s reset pin, potentially thousands of them. A real flow builds that tree later, like the clock tree. Without these lines DC would spend area buffering it to obey max fanout. One more consequence: <code>rst_n</code> has no input delay, so paths that start at it aren\'t timed.</p>'},
            {'at': '##########################################\n# Synthesize Design', 'title': 'compile_ultra -retime', 'ev': ['docs'], 'affects': ['timing', 'area', 'power', 'qor', 'netlist'],
             'what': '<p><code>set_optimize_registers true -design top</code> allows <b>register retiming</b> anywhere in <code>top</code>: moving flip-flops across combinational logic to balance path delays.</p>'
                     '<p><code>compile_ultra</code> is DC\'s top-effort compile: high-level optimization, DesignWare selection, logic optimization, mapping to Nangate cells, sizing and buffering, area recovery. <code>-retime</code> adds adaptive retiming. <code>-timing_high_effort_script</code> runs a Synopsys-supplied, timing-focused recipe that spends more run time on timing.</p>'
                     '<p>Part 3\'s handout says to "pass the <code>-retime</code> flag": it\'s already here. See "Inside compile_ultra" for what each phase does.</p>'},
            {'at': '##########################\n# Generate Reports', 'title': 'report_design', 'ev': ['docs'], 'affects': ['files'],
             'what': 'Everything below runs <b>after</b> compile, so it describes the mapped design. <code>report_design</code> goes to <code>reports/design_report</code>: which libraries, operating conditions and wire-load settings DC actually used. Check it once to confirm the 1K_hvratio_1_4 model and which operating corner the .db uses.'},
            {'at': 'check_design', 'title': 'check_design (twice)', 'ev': ['docs'], 'affects': ['log'],
             'what': 'A structural lint of the mapped design: unconnected ports, constant inputs, multiply-driven nets, feedthroughs. The first call prints into <code>compile.log</code>, the second into <code>reports/design_check</code>. Most of the warnings you\'ll see come from here, and in this design many are expected (see "Clean log, clean RTL").'},
            {'at': 'report_area', 'title': 'report_area and report_area -hierarchy', 'ev': ['docs'], 'affects': ['area', 'results', 'log'],
             'what': '<p>Flat totals: combinational, buf/inv, noncombinational (flops and latches), macro/black box, net interconnect, total cell area. <code>reports/area_report</code> is where <code>results.txt</code> gets "Total cell area", the Area term of the FoM.</p>'
                     '<p><code>-hierarchy</code> adds one row per instance. <code>reports/area_report_hier</code> is your <b>black-box check</b>: every PE instance should have real area.</p>'},
            {'at': 'report_power', 'title': 'report_power (two different efforts)', 'ev': ['docs', 'file'], 'affects': ['power', 'results', 'log'],
             'what': 'The copy in <code>compile.log</code> uses the default analysis effort. The one saved to <code>reports/power_report</code> (and so to <code>results.txt</code>) uses <code>-analysis_effort hi</code>: a more careful propagation of switching activity. The two can differ a little. Quote the file, not the log.'},
            {'at': 'report_timing', 'title': 'report_timing -significant_digits 4', 'ev': ['docs'], 'affects': ['timing', 'results', 'log'],
             'what': 'With no options it reports the single worst setup (max-delay) path in each path group. Here there is one group, <code>clk</code>. The log copy prints 2 decimals and the file copy 4. <code>results.txt</code> takes its <code>slack</code> line, which must say <code>MET</code> at the period you claim in Part 3.'},
            {'at': 'report_qor', 'title': 'report_qor', 'ev': ['docs'], 'affects': ['qor', 'log'],
             'what': 'One-page "quality of results": worst negative slack (WNS), total negative slack (TNS), levels of logic, cell counts, areas, design-rule violations and compile CPU time. It\'s the fastest place to see how long your run took.'},
            {'at': 'check_error', 'title': 'check_error', 'ev': ['docs'], 'affects': ['results'],
             'what': 'Asks DC whether any earlier command raised an error, and its output becomes the start of <code>results.txt</code> after the period. We haven\'t seen a real one, so we don\'t know its exact text. Look at yours once on a clean run so you\'ll recognize a bad one.'},
            {'at': '###################################\n# Save the Design DataBase', 'title': 'The gate-level netlist', 'ev': ['docs'], 'affects': ['netlist'],
             'what': '<code>netlist/top.mapped.v</code>: your design as Verilog instances of Nangate cells (<code>DFFR_X1</code>, <code>FA_X1</code>, <code>AOI21_X2</code> ...) wired together, one module per hierarchy level that survived. You could simulate it with the Nangate cell models (not required here). <code>grep -c DFFR_X1 netlist/top.mapped.v</code> is a quick sanity count of async-reset flops.'},
            {'at': '#Concise Results', 'title': 'results.txt, line by line', 'ev': ['file', 'local'], 'affects': ['results'],
             'what': '<ol><li><code>echo $CLK_PERIOD</code>: the period, for example <code>2.000</code>.</li><li>the contents of <code>reports/error_checking_report</code>.</li>'
                     '<li><code>grep -i slack</code>: the slack line from the timing report.</li><li><code>grep Total</code> on the power report. This matches <b>three</b> lines: "Total Dynamic Power", the table\'s column-header line (its last word is "Total"), and the table\'s <code>Total</code> row, whose last number is internal + switching + leakage.</li>'
                     '<li><code>grep Cell | grep Leakage</code>: "Cell Leakage Power".</li><li><code>grep Total | grep cell</code> on the flat area report: "Total cell area".</li></ol>'
                     '<p>Every line uses <code>&gt;&gt;</code>: it <b>appends</b>. The "Reading reports" tab has an illustrative <code>results.txt</code> and a parser for yours.</p>'},
            {'at': 'exit', 'title': 'exit', 'ev': ['docs'], 'affects': ['log'],
             'what': 'Leaves dc_shell. DC prints its memory and CPU usage at the end of <code>compile.log</code>. If your log doesn\'t end that way, the run died early.'},
        ],
    },
]
