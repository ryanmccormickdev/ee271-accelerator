(function () {
  'use strict';
  const R = window.RTL;
  const D = JSON.parse(document.getElementById('data').textContent);
  const WV = D.waves, F = D.facts;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const MINUS = '−';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (x) => { const n = BigInt(x); return n < 0n ? MINUS + (-n).toString() : n.toString(); };
  const comma = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('en-US'));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ee271rtl:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ee271rtl:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  const B = BigInt;
  const hexB = (h) => B('0x' + h);
  const hexw = (v, bits) => R.toU(v, bits).toString(16).padStart(Math.ceil(bits / 4), '0');
  const lanesTxt = (v, bits, w, sep) => { const n = bits / w, out = []; for (let k = n - 1; k >= 0; k--) out.push(num(R.getLane(v, w, k))); return out.join(sep || ' '); };
  const hexLanes = (v, bits, w) => { const h = hexw(v, bits), d = w / 4, out = []; for (let i = 0; i < h.length; i += d) out.push(h.slice(i, i + d)); return out.join('_'); };

  // ------------------------------------------------------------------ theme
  const root = document.documentElement;
  const savedTheme = store.get('theme', null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $('#themebtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  // ------------------------------------------------------------------ router
  const views = {};
  let current = null;
  function showView(name) {
    if (!views[name]) name = 'big-picture';
    if (current === name) return;
    if (current && views[current].hide) views[current].hide();
    Object.keys(views).forEach((n) => { $('#view-' + n).hidden = n !== name; });
    $$('nav.tabs a').forEach((a) => { if (a.dataset.view === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    current = name;
    if (views[name].show) views[name].show();
    window.scrollTo(0, 0);
  }
  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    const det = el.closest('details'); if (det) det.open = true;
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    flash(el);
    return true;
  }
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const i = h.indexOf('/');
    const name = (i < 0 ? h : h.slice(0, i)) || 'big-picture';
    const rest = i < 0 ? '' : h.slice(i + 1);
    showView(name);
    if (rest) setTimeout(() => { const v = views[current]; if (!(v.go && v.go(rest))) scrollToId(rest); }, 40);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    e.preventDefault();
    const t = '#' + b.dataset.goto;
    if (location.hash === t) route(); else location.hash = t;
  });

  // ------------------------------------------------------------------ shared: the recorded designs
  const DESIGNS = [
    ['ref', 'Reference design (correct)'],
    ['pe_not_delayed', 'Bug 1: PE instruction not delayed'],
    ['write_not_delayed', 'Bug 2: WRITE not delayed'],
    ['live_offset', 'Bug 3: lane select from the live offset'],
    ['live_mode', 'Bug 4: MEM1 decoded with the live mode'],
    ['slices_reversed', 'Bug 5: outputs in reversed slice order'],
    ['bubble', 'Bug 6: one bubble per instruction'],
    ['race', 'Correct design, Verilator default flags'],
  ];
  const DLABEL = Object.fromEntries(DESIGNS);
  const sig = (d, k) => (WV.designs[d].signals[k] || null);
  const val = (d, k, c) => { const s = sig(d, k); return s && c < s.v.length ? s.v[c] : null; };
  const gold = WV.designs.ref.gold;
  const runKey = (d, t, seed, sim) => `${d}|${t}|${seed || 'official'}|${sim || 'verilator'}`;
  const run = (d, t, seed, sim) => F.runs[runKey(d, t, seed, sim)] || null;

  // ------------------------------------------------------------------ quiz
  const QUIZ = {
    big: [
      ['Why can\'t the PE do its MAC in the same cycle as the READ that fetches its operands?', 'The SRAMs are synchronous: the address is sampled at the rising edge that ends the READ\'s cycle, and the word appears on <code>q</code> in the next cycle. So the data a READ asks for in cycle t exists only in cycle t + 1, and that\'s when the MAC must happen. Python had no such delay.'],
      ['Which names must exist in your design for the testbenches to compile?', '<code>dut.u_buffer</code> (with the skeleton\'s <code>u_matrix_mem</code>, <code>u_vector_mem</code>, <code>u_output_mem</code> inside), <code>dut.u_instruction_memory</code> (given), and the signals <code>dut.pe_inst_valid</code> and <code>dut.buf_inst_valid</code>. The testbench loads and dumps the memories and evaluates its end condition through these hierarchical names.'],
      ['Python\'s _handle_read computes offset // 4 and offset % 4. What does that cost in hardware?', 'Nothing: dividing by a power of two is choosing bits. The word address is <code>memb_offset[15:2]</code> and the lane is <code>memb_offset[1:0]</code> in INT8: wires into the SRAM address and a multiplexer select.'],
      ['What replaces Accelerator.execute_instructions(list)?', 'The instruction memory: the program in a 63-bit × 128 SRAM, a program counter, and a handshake. The controller raises <code>inst_exec_begins</code> for one cycle to take the instruction on <code>inst</code>; the memory has already started fetching the next one.'],
    ],
    cycles: [
      ['In which cycle is READ 1 1 on buf_inst, when is its data on matrix_data, and when does the accumulator show the product?', 'READ 1 1 is issued in cycle 8. Its data (MEM0[1] = [2 0 | 1 −3], v[1] = −1) is on the buses in cycle 9, where <code>pe_inst</code> = MAC. The accumulators show the sum after that edge, in cycle 10 (PE 0 = [0 6]).'],
      ['Why does the WRITE commit one cycle after it is issued?', 'Because the OUT before it runs on the PEs one cycle late (the PE half is delayed), in the same cycle the WRITE is on <code>buf_inst</code>. The output registers only change at the end of that cycle. Writing in the issue cycle would store the outputs from before the OUT (zeros after the CLR).'],
      ['The testbench says 20 cycles. Account for every one.', 'Cycles 0–4: reset. Cycle 5: the controller takes the first instruction. Cycles 6–18: 13 repetitions, one per cycle (2 tiles × (CLR + 3 READ|MAC + OUT + WRITE) + 1 padding). Cycle 19: the padding\'s PE instruction drains. At the edge ending cycle 19 the valids drop; the testbench waits a period and dumps at 205 ns: 205 / 10 = 20.'],
      ['What would going through IDLE between instructions cost?', 'One cycle per instruction after the first: +8 cycles on the example, +64 on each official test (measured: 16,504 / 8,312 / 4,216 instead of 16,440 / 8,248 / 4,152). With area, power and the clock fixed, the FoM grows by (29,032 / 28,840)<sup>2.3</sup> ≈ 1.015, so about 1.5% worse. A bubble per repetition would nearly double the time: about 4.9× the FoM.'],
      ['Which two timing bugs pass all three official tests, and why?', 'Bug 4 (MEM1 decoded with the live mode) passes everywhere, and Bug 1 (PE op not delayed) passes int16 under Verilator. Both corrupt only the last column\'s product of a tile: the int16 vector ends in 0, and the int32 vector ends in −1 = 0xFFFFFFFF, whose bytes are all equal. Another vector seed exposes both.'],
    ],
    pe: [
      ['Why does acc[15:0] + $signed(a) * $signed(b) give the wrong answer for a = −2?', '<code>acc[15:0]</code> is a part-select, so it\'s unsigned, which makes the whole expression unsigned. Then every operand is zero-extended to the 16-bit context, including the <code>$signed</code> ones: a = 0xFE becomes 254 instead of −2. 10 + 254 × 3 = 772, not 4. Make every operand signed.'],
      ['How can the hardware tell that an accumulator lane needs clamping for OUT?', 'Compare it with the limits (two comparators and a 3-way select), or check whether all bits above bit w − 1 are copies of bit w − 1: if they are, the low w bits are the value; if not, the sign bit says whether it\'s the upper or lower limit.'],
      ['Walk through RND with s = 1 on the lane value −3.', '−3 is …11101. q = −3 &gt;&gt;&gt; 1 = −2 (…1110, the floor). The remainder is the shifted-out bit, 1, so the guard bit is 1 and there are no sticky bits: exactly half. The lsb of q is 0 (even), so don\'t round up: the result is −2, which is −1.5 rounded to even.'],
      ['What does pe_inst_valid = 0 do, and why does it matter?', 'It turns any instruction into a NOP: both registers hold. It matters because <code>pe_inst</code> holds stale bits whenever nothing is running (during reset it reads as MAC INT8), and a PE that ignored the valid would keep executing them.'],
    ],
    buffer: [
      ['Why does vector_decoder have two address inputs?', 'The two jobs happen in different cycles: the SRAM word address is needed in the READ\'s own cycle (from the live offset), but the lane select is needed one cycle later, when the word comes back (from an offset kept in a register).'],
      ['What goes wrong if the lane select uses this cycle\'s mode, and why do the official tests miss it?', 'In the cycle after the last READ of a run the controller already shows <code>NOP | OUT</code>, whose mode field is 0 (INT8) because the assembler only sets the mode for READ. So the last column\'s vector element is decoded as a byte. The int16 vector ends in 0 and the int32 vector in −1 (all bytes equal), so the official tests can\'t see it; vector seed 7 fails 16 of 16 rows.'],
      ['What are cen, gwen and wen, and how are they set for MEM2?', 'All active low. <code>cen</code> enables the SRAM, <code>gwen</code> enables writing, and <code>wen</code> is a per-bit write mask. MEM2 has <code>cen = 0</code> and <code>wen = \'0</code> tied, so it writes all 512 bits whenever <code>gwen</code> (your <code>write_control_n</code>) is 0 at a rising edge.'],
      ['Why is MEM2 instantiated with INITIALIZE_MEMORY(1)?', 'The testbench dumps all 65,536 MEM2 words and diffs them with ivd-sim, whose MEM2 starts at zero. Unwritten words must be 0 too; without the zero fill they would be X in a 4-state simulator.'],
    ],
    controller: [
      ['Walk me through NOP|CLR, then READ|MAC with count 3, cycle by cycle.', 'In the reference timing, the controller takes the CLR in cycle 5, issues its NOP in cycle 6 and takes READ|MAC in the same cycle (last repetition). Cycles 7, 8, 9: buf_inst = READ 0 0, READ 1 1, READ 2 2; pe_inst = CLR, MAC, MAC (each one cycle behind its partner). Cycle 10: buf_inst = NOP (the OUT\'s), pe_inst = the third MAC, with the data of READ 2 2. Use the schedule table to check yourself.'],
      ['When exactly is inst_exec_begins high?', 'In every cycle where the controller takes <code>inst</code>: when <code>inst_valid</code> is 1 and the controller is IDLE, or on its last repetition. One cycle per instruction. Each high cycle advances the program counter.'],
      ['Why does a stored count of 0 mean one repetition?', 'The assembler stores the written count minus one, and the hardware runs count + 1 repetitions. So CLR, OUT and WRITE (written count 1) have count 0, and are on their last repetition in their first cycle.'],
      ['How does the testbench know you\'re done?', 'It waits until <code>program_counter == instruction_count</code> and both <code>pe_inst_valid</code> and <code>buf_inst_valid</code> are 0, then waits one more clock period and dumps MEM2. So the controller must drop its valids after the last instruction, and not before the last write is safely on its way.'],
    ],
    top: [
      ['With 16 PEs, which bits of matrix_data does PE 3 get, and where does its output go?', 'PE i gets <code>matrix_data[32·(15 − i) +: 32]</code>, so PE 3 gets bits [415:384], and drives the same bits of <code>output_data</code>. That matches Python\'s <code>cut()</code> order: PE 0 is the most significant slice.'],
      ['Why must the slice order be the same on both buses?', 'The compiler packs a tile\'s rows left to right into MEM0, and <code>extract_results_from_memory</code> reads MEM2 left to right. If PE i reads the rows of one position and writes another, every MEM2 row has its results in the wrong places (Bug 5: 16 of 16 rows wrong in each test).'],
      ['Why does the generate loop need a genvar and a named block?', 'A generate loop runs at elaboration, building copies of hardware; its index must be a <code>genvar</code> (a constant per copy). The block name (<code>g_pe</code>) gives each copy a hierarchical name, <code>g_pe[3].u_pe</code>, which is how you find it in the waveform.'],
    ],
    verify: [
      ['How can a design pass int16_test and int32_test but fail int8_test?', 'Only the INT8 test clamps: 801 of its 1,024 outputs are outside [−128, 127]. INT16 and INT32 results never leave their range. So a PE that truncates instead of clamping, or has a bug only in 8-bit lanes, passes the other two.'],
      ['The diff says line 3 differs (INT16, 16 PEs). Which rows of M are affected?', 'Line 3 is MEM2[2], the third tile. A tile is 16 PEs × 2 lanes = 32 rows, so rows 64 to 95. Within the line, PE i\'s 32 bits hold rows 64 + 2i (upper lane) and 65 + 2i (lower lane).'],
      ['Why does the repo use Icarus for pass/fail?', 'Icarus is event-driven and 4-state, like VCS. Verilator is 2-state (X becomes 0, so it passed Bug 1 on int16 where Icarus shows X) and, with default flags, races on the instruction memory output and skips the first instruction. Verilator with <code>-fno-inline</code> agrees with Icarus, and <code>make eq-both</code> flags disagreements.'],
      ['What should tb_pe show for a working design?', 'MAC INT8 with A = [−2 0 3 2] and B = [−4 −4 −4 −4] gives acc = 0x0008_0000_fff4_fff8 ([8 0 −12 −8]); OUT then gives out = 0x0800f4f8; the padding MAC doubles the accumulator to 0x0010_0000_ffe8_fff0.'],
    ],
    primer: [
      ['= or <= in always_ff, and why?', '<code>&lt;=</code>. Non-blocking assignments read all right-hand sides first and update together, like flip-flops at an edge. With <code>=</code>, later lines see new values in the same cycle (a two-stage delay line collapses into one stage) and other blocks can race with it.'],
      ['Why does an incomplete case in always_comb describe a latch?', 'If some input value leaves an output unassigned, the output must keep its previous value for that value, and remembering without a clock is a latch. Assign defaults first or add a <code>default</code>. Verilator\'s lint and Yosys both flag it.'],
      ['What does x[8*k +: 8] mean, and why not x[8*k+7:8*k]?', '"8 bits of x starting at bit 8k, going up." With a variable k the range form isn\'t allowed, because a part-select\'s width must be a constant; <code>+:</code> makes the width explicit and constant.'],
    ],
  };
  $$('.quiz[data-quiz]').forEach((q) => {
    const items = QUIZ[q.dataset.quiz] || [];
    q.innerHTML = '<h3>Quiz yourself</h3>' + items.map(([qq, a]) => `<details><summary>${qq}</summary><div class="ans"><p>${a}</p></div></details>`).join('');
  });

  // ================================================================== BIG PICTURE
  views['big-picture'] = (function () {
    const P = (rows) => '<table class="ports"><tr><th>Port</th><th>Dir</th><th>Bits</th><th>What</th></tr>' + rows.map((r) => `<tr><td><code>${r[0]}</code></td><td>${r[1]}</td><td class="num">${r[2]}</td><td>${r[3]}</td></tr>`).join('') + '</table>';
    const MODS = {
      top: ['top · top.sv (yours)', '<p>The whole accelerator. Its only ports come from the testbench; it declares the wires between the blocks and instantiates them: the given instruction memory, your controller, your buffer, and <code>PE_COUNT</code> copies of your PE.</p>' +
        P([['clk', 'in', 1, 'the 10 ns clock'], ['rst_n', 'in', 1, 'reset, active low, for the first 50 ns'], ['instruction_count', 'in', 7, '<code>+INST_COUNT</code>: how many instructions to run']]) +
        '<p>The testbench also reads <code>dut.pe_inst_valid</code> and <code>dut.buf_inst_valid</code>, so those two names must exist in <code>top</code>.</p><p><button class="small" data-goto="top">Top tab</button></p>'],
      imem: ['instruction_memory (given)', '<p>The program, in a 63-bit × 128 SRAM loaded by the testbench, plus <code>program_counter</code>. It always shows <code>inst = imem[program_counter]</code>, and when the controller raises <code>advance_pointer</code> it already fetches the next word, so instructions can start back to back.</p>' +
        P([['inst', 'out', 63, 'instruction_t: buf_instruction, pe_instruction, count, mema_inc, memb_inc'], ['inst_valid', 'out', 1, 'program_counter &lt; instruction_count'], ['advance_pointer', 'in', 1, 'your inst_exec_begins'], ['instruction_count', 'in', 7, 'from top']]) +
        '<p><button class="small" data-goto="code/cmf-part2-unoptimized-verilog-logical-instruction-memory-sv">Read the code</button> <button class="small" data-goto="cycles/cy-fetch">The handshake, cycle by cycle</button></p>'],
      ctl: ['controller (yours)', '<p>Turns one instruction into count + 1 repetitions, one per cycle, each with stepped offsets, and sends each repetition\'s memory half to the buffer and its PE half to every PE. In the reference timing the PE half is one cycle later.</p>' +
        P([['inst, inst_valid', 'in', '63, 1', 'the instruction at program_counter'], ['inst_exec_begins', 'out', 1, '"taken": one cycle per instruction'], ['buf_inst, buf_inst_valid', 'out', '36, 1', 'memory instruction with this repetition\'s offsets'], ['pe_inst, pe_inst_valid', 'out', '9, 1', 'PE instruction, same for every PE']]) +
        '<p><button class="small" data-goto="controller">Controller tab</button></p>'],
      buf: ['buffer (yours)', '<p>The three memories and the logic around them: drive the SRAM addresses for a READ, select the MEM1 lane when the word comes back a cycle later, and write <code>output_data</code> into MEM2 for a WRITE, at a cycle when it holds the new outputs.</p>' +
        P([['buf_inst, buf_inst_valid', 'in', '36, 1', 'from the controller'], ['matrix_data', 'out', 512, 'MEM0\'s word: one 32-bit slice per PE'], ['vector_data', 'out', 32, 'the decoded MEM1 word, the same for every PE'], ['output_data', 'in', 512, 'every PE\'s output, side by side']]) +
        '<p><button class="small" data-goto="buffer">Main buffer tab</button></p>'],
      array: ['array (given): the SRAM model', '<p>One synchronous SRAM. At a rising edge with <code>cen</code> = 0 it reads <code>data[a]</code> onto <code>q</code> (visible the next cycle), and writes <code>d</code> where <code>wen</code> is 0 if <code>gwen</code> is also 0. All controls are active low. In synthesis it\'s an empty black box.</p>' +
        P([['cen', 'in', 1, 'chip enable, active low'], ['gwen', 'in', 1, 'write enable, active low'], ['wen', 'in', 'DW', 'per-bit write mask, active low'], ['a', 'in', 'AW', 'address'], ['d', 'in', 'DW', 'write data'], ['q', 'out', 'DW', 'read data, one cycle after the address']]) +
        '<p>The testbench loads MEM0/MEM1 and dumps MEM2 through these instances\' <code>loadmem</code> and <code>dumpmem</code> tasks.</p><p><button class="small" data-goto="buffer/mb-array">The SRAM model</button></p>'],
      vdec: ['vector_decoder (generated, in defines.sv)', '<p>A combinational helper for MEM1: turns an element offset into a word address (<code>addr_to_mem</code>), and picks and repeats one lane of the word that came back (<code>data_to_pe</code>). The address and the lane select are needed in different cycles, hence two offset inputs; but it has only one <code>mode</code> input.</p>' +
        P([['data_from_mem', 'in', 32, 'MEM1\'s q'], ['addr_from_controller', 'in', 16, 'offset → addr_to_mem'], ['addr_from_controller_reg', 'in', 16, 'offset → lane select'], ['mode', 'in', 2, 'INT8 / INT16 / INT32'], ['data_to_pe', 'out', 32, 'the lane, repeated'], ['addr_to_mem', 'out', 14, 'MEM1 address']]) +
        '<p><button class="small" data-goto="buffer/mb-dec">The decoder in detail</button></p>'],
      pe: ['processing_element (yours) × PE_COUNT', '<p>One MAC unit with a 64-bit accumulator and a 32-bit output register. <code>top</code> makes <code>PE_COUNT</code> copies with a generate loop. All copies get the same instruction and the same <code>vector_data</code>; each gets its own 32-bit slice of <code>matrix_data</code> and drives its own slice of <code>output_data</code>.</p>' +
        P([['pe_inst, pe_inst_valid', 'in', '9, 1', 'opcode, mode, value'], ['vector_input', 'in', 32, 'A (Data0): the MEM1 word'], ['matrix_input', 'in', 32, 'B: this PE\'s MEM0 slice'], ['vector_output', 'out', 32, 'the output register']]) +
        '<p><button class="small" data-goto="pe">Processing element tab</button></p>'],
    };
    function sel(m) {
      $$('#hier-svg .mod').forEach((g) => g.classList.toggle('on', g.dataset.mod === m));
      $('#hier-title').textContent = MODS[m][0];
      $('#hier-body').innerHTML = MODS[m][1];
    }
    $$('#hier-svg .mod').forEach((g) => {
      g.addEventListener('click', (e) => { e.stopPropagation(); sel(g.dataset.mod); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(g.dataset.mod); } });
    });
    $('#hier-body').innerHTML = '<p>Seven kinds of blocks, four of which you write. Click any block on the diagram for its ports and its job. The thin dashed lines are the testbench reaching into your design by name: that\'s how it loads the program and the matrices and reads the results.</p><p>The run behind every waveform on this page is the Part 1 walkthrough\'s 6 × 3 example, built for 2 PEs.</p>';
    return { el: $('#view-big-picture') };
  })();

  // ================================================================== WAVEFORM RENDERER (shared)
  const ROWS = [
    { g: 'Clock and reset' },
    { k: 'clk', l: 'clk', t: 'clk' },
    { k: 'rst_n', l: 'rst_n', t: 'bit', key: 1 },
    { g: 'Instruction memory' },
    { k: 'pc', l: 'program_counter', t: 'dec', c: 'ctl', key: 1 },
    { k: 'imem_a', l: 'memory_address', t: 'dec', c: 'ctl' },
    { k: 'inst', l: 'inst', t: 'inst', c: 'ctl', key: 1 },
    { k: 'inst_valid', l: 'inst_valid', t: 'bit', c: 'ctl' },
    { g: 'Controller' },
    { k: 'begins', l: 'inst_exec_begins', t: 'bit', c: 'ctl', key: 1 },
    { k: 'state', l: 'state', t: 'state', c: 'ctl', key: 1 },
    { k: 'remaining', l: 'remaining', t: 'dec', c: 'ctl', int: 1 },
    { k: 'buf_inst', l: 'buf_inst', t: 'buf', c: 'm0', key: 1 },
    { k: 'buf_valid', l: 'buf_inst_valid', t: 'bit', c: 'm0', key: 1 },
    { k: 'pe_inst', l: 'pe_inst', t: 'pe', c: 'pe', key: 1 },
    { k: 'pe_valid', l: 'pe_inst_valid', t: 'bit', c: 'pe', key: 1 },
    { g: 'Buffer' },
    { k: 'm0_cen', l: 'MEM0 cen', t: 'bit', c: 'm0' },
    { k: 'm0_a', l: 'MEM0 a', t: 'dec', c: 'm0' },
    { k: 'matrix_data', l: 'matrix_data = MEM0 q', t: 'l16', c: 'm0', key: 1 },
    { k: 'm1_a', l: 'MEM1 a', t: 'dec', c: 'm1' },
    { k: 'm1_q', l: 'MEM1 q', t: 'l16', c: 'm1' },
    { k: 'memb_q', l: 'registered offset', t: 'dec', c: 'm1', int: 1 },
    { k: 'mode_q', l: 'registered mode', t: 'mode', c: 'm1', int: 1 },
    { k: 'vector_data', l: 'vector_data', t: 'l16', c: 'm1', key: 1 },
    { g: 'PE 0 and PE 1' },
    { k: 'acc0', l: 'PE 0 acc', t: 'l32', c: 'pe', key: 1 },
    { k: 'out0', l: 'PE 0 out', t: 'l16', c: 'pe', key: 1 },
    { k: 'acc1', l: 'PE 1 acc', t: 'l32', c: 'pe', key: 1 },
    { k: 'out1', l: 'PE 1 out', t: 'l16', c: 'pe', key: 1 },
    { g: 'MEM2 write' },
    { k: 'm2_gwen', l: 'MEM2 gwen', t: 'bit', c: 'm2', key: 1 },
    { k: 'm2_a', l: 'MEM2 a', t: 'dec', c: 'm2', key: 1 },
    { k: 'm2_d', l: 'MEM2 d = output_data', t: 'l16', c: 'm2', key: 1 },
    { g: 'Testbench' },
    { k: 'done', l: 'simulation_complete', t: 'bit', key: 1 },
  ];
  const ROWBY = Object.fromEntries(ROWS.filter((r) => r.k).map((r) => [r.k, r]));
  const STATE = { 0: 'IDLE', 1: 'EXECUTING' };
  function fmt(r, h, hex, full) {
    if (h === null || h === undefined) return { s: '', f: '' };
    const v = hexB(h);
    switch (r.t) {
      case 'bit': return { s: h, f: h };
      case 'dec': return { s: v.toString(), f: v.toString() };
      case 'state': return { s: Number(v) ? 'EXEC' : 'IDLE', f: STATE[Number(v)] || h };
      case 'mode': return { s: R.MODES[Number(v)], f: R.MODES[Number(v)] };
      case 'inst': { const i = R.decInst(v); return { s: R.instShort(i), f: i.zero ? 'all zeros: READ INT8 0 0 | MAC INT8 | 1 0 0' : R.instText(i) }; }
      case 'buf': { const b = R.decBuf(v); const s = R.BUF_OPS[b.op] + (b.op === 0 ? ` ${b.a} ${b.b}` : b.op === 1 ? ` ${b.a}` : ''); return { s, f: R.bufText(b) + (b.op !== 0 ? ` (mode ${R.MODES[b.mode]})` : '') }; }
      case 'pe': { const p = R.decPe(v); return { s: R.peName(p) + (p.mode === 1 ? '' : p.mode === 0 ? ' ·8' : ' ·32'), f: R.peText(p) }; }
      case 'l16': case 'l32': {
        const w = r.t === 'l16' ? 16 : 32, bits = h.length * 4;
        if (hex) { const t = bits === 64 ? hexLanes(v >> 32n, 32, w) + ' | ' + hexLanes(v & 0xffffffffn, 32, w) : hexLanes(v, bits, w); return { s: t, f: '0x' + t }; }
        const t = bits === 64 && r.t === 'l16' ? lanesTxt(v >> 32n, 32, 16) + ' | ' + lanesTxt(v & 0xffffffffn, 32, 16) : lanesTxt(v, bits, w);
        return { s: t, f: '[' + t + ']' };
      }
      default: return { s: h, f: h };
    }
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  // opts: { design, rows (keys) or null for all, from, to, cur, compare, hex, cw, onPick, names: true }
  function renderWave(box, o) {
    const d = WV.designs[o.design];
    const from = o.from || 0, to = Math.min(o.to === undefined ? d.cycles - 1 : o.to, d.cycles - 1);
    const cw = o.cw || 78, rh = 22, gh = 18, ah = 22;
    const rows = ROWS.filter((r) => (r.g ? !o.rows || o.groups : !o.rows || o.rows.includes(r.k)))
      .filter((r, i, a) => !r.g || (a[i + 1] && !a[i + 1].g));
    const n = to - from + 1, width = n * cw + 2;
    const rstC = Math.round((d.rst_release_ps - d.first_rise_ps) / d.period_ps) + 1;      // the cycle reset is released in
    const xOf = (c) => (c - from) * cw + 1;
    const xRst = xOf(rstC) + cw * ((d.rst_release_ps - (d.first_rise_ps + (rstC - 1) * d.period_ps)) / d.period_ps);
    let y = ah, parts = [], diffs = [], texts = [], names = ['<div class="axis"><span>cycle</span><span class="cv"></span></div>'];
    // axis
    for (let c = from; c <= to; c++) parts.push(`<text class="ax${c === o.cur ? ' on' : ''}" x="${xOf(c) + cw / 2}" y="15" text-anchor="middle">${c}</text>`);
    for (const r of rows) {
      if (r.g) {
        parts.push(`<rect class="grow" x="0" y="${y}" width="${width}" height="${gh}"/>`);
        names.push(`<div class="grp">${esc(r.g)}</div>`);
        y += gh; continue;
      }
      const s = r.k === 'clk' ? null : sig(o.design, r.k);
      const cv = o.cur !== null && o.cur !== undefined && s ? fmt(r, s.v[o.cur], o.hex, true).f : '';
      names.push(`<div data-k="${r.k}"><span class="nm${r.int ? ' int' : ''}">${esc(r.l)}</span><span class="cv" title="${esc(cv)}">${esc(cv)}</span></div>`);
      const top = y + 4, bot = y + rh - 4, mid = y + rh / 2;
      if (r.t === 'clk') {
        let p = `M ${xOf(from)} ${bot}`;
        for (let c = from; c <= to; c++) {
          const x0 = xOf(c), xm = x0 + cw / 2, x1 = x0 + cw;
          if (c === 0) p += ` H ${x1}`; else p += ` V ${top} H ${xm} V ${bot} H ${x1}`;
        }
        parts.push(`<path class="clkw" d="${p}"/>`);
      } else if (s && r.t === 'bit') {
        let p = '', fill = '';
        for (let c = from; c <= to; c++) {
          const v = s.v[c] === '1', x0 = (c === rstC && c > from && s.v[c] !== s.v[c - 1]) ? xRst : xOf(c), x1 = xOf(c + 1);
          const yy = v ? top : bot;
          p += (c === from ? `M ${xOf(c)} ${yy}` : ` H ${x0} V ${yy}`);
          if (c === to) p += ` H ${x1}`;
          if (v) fill += `<rect class="bitfill" x="${x0}" y="${top}" width="${x1 - x0}" height="${bot - top}"/>`;
        }
        parts.push(fill + `<path class="bitw${r.c ? ' c-' + r.c : ''}" d="${p}"/>`);
      } else if (s) {
        let c = from;
        while (c <= to) {
          let e = c; while (e + 1 <= to && s.v[e + 1] === s.v[c]) e++;
          const x0 = (c === rstC && c > from && s.v[c] !== s.v[c - 1]) ? xRst : xOf(c), x1 = xOf(e + 1), sl = 3;
          parts.push(`<polygon class="seg${r.c ? ' c-' + r.c : ''}" points="${x0},${mid} ${x0 + sl},${top} ${x1 - sl},${top} ${x1},${mid} ${x1 - sl},${bot} ${x0 + sl},${bot}"/>`);
          const t = fmt(r, s.v[c], o.hex).s, room = Math.floor((x1 - x0 - 8) / 6.35);
          if (room > 0) texts.push(`<text x="${(x0 + x1) / 2}" y="${mid + 3.6}" text-anchor="middle">${esc(t.length > room ? t.slice(0, Math.max(1, room - 1)) + '…' : t)}</text>`);
          c = e + 1;
        }
      }
      // differences from another design, cell by cell
      if (o.compare && s) {
        const cs = sig(o.compare, r.k);
        if (cs) for (let c = from; c <= to; c++) if (c < cs.v.length && cs.v[c] !== s.v[c]) diffs.push(`<rect class="diff" x="${xOf(c) + 1}" y="${top - 2}" width="${cw - 2}" height="${bot - top + 4}" rx="3"/>`);
      }
      parts.push(`<line class="grid" x1="0" x2="${width}" y1="${y + rh}" y2="${y + rh}"/>`);
      y += rh;
    }
    const H = y + 2;
    const under = []; let edge = '';
    for (let c = from; c <= to + 1; c++) under.push(`<line class="grid" x1="${xOf(c)}" x2="${xOf(c)}" y1="${ah - 4}" y2="${H}"/>`);
    if (o.cur !== null && o.cur !== undefined && o.cur >= from && o.cur <= to) {
      under.push(`<rect class="cur" x="${xOf(o.cur)}" y="0" width="${cw}" height="${H}"/>`);
      edge = `<line class="edge" x1="${xOf(o.cur + 1)}" x2="${xOf(o.cur + 1)}" y1="0" y2="${H}"/>`;
    }
    const hits = [];
    if (o.onPick) for (let c = from; c <= to; c++) hits.push(`<rect class="hit" data-c="${c}" x="${xOf(c)}" y="0" width="${cw}" height="${H}"><title>cycle ${c}</title></rect>`);
    box.innerHTML = `<div class="wv"><div class="wv-names">${names.join('')}</div><div class="wv-scroll"><svg xmlns="${SVGNS}" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Waveform of ${esc(DLABEL[o.design])}, cycles ${from} to ${to}">${under.join('')}${parts.join('')}${diffs.join('')}${texts.join('')}${edge}${hits.join('')}</svg></div></div>`;
    if (o.onPick) $$('.hit', box).forEach((h) => h.addEventListener('click', () => o.onPick(+h.dataset.c)));
  }
  // the small waveforms embedded in the text
  const MINIS = {
    sram: { rows: ['buf_inst', 'buf_valid', 'm0_cen', 'm0_a', 'matrix_data', 'm1_a', 'm1_q', 'vector_data'], from: 6, to: 11 },
    fetch: { rows: ['rst_n', 'pc', 'imem_a', 'inst', 'inst_valid', 'begins', 'state', 'buf_inst'], from: 3, to: 9 },
    write: { rows: ['buf_inst', 'pe_inst', 'acc0', 'out0', 'm2_d', 'm2_gwen', 'm2_a'], from: 9, to: 13 },
  };
  function renderMinis(scope) {
    $$('.miniwave[data-mini]', scope).forEach((b) => { const m = MINIS[b.dataset.mini]; renderWave(b, Object.assign({ design: 'ref', cw: 92, groups: false, cur: null }, m)); });
  }

  // ================================================================== CYCLES
  views.cycles = (function () {
    const el = $('#view-cycles');
    let design = store.get('cy-design', 'ref'); if (!WV.designs[design]) design = 'ref';
    let hex = store.get('cy-hex', false), rowsMode = store.get('cy-rows', 'all');
    let cur = 7, playing = false, timer = 0;
    const NARR = {
      0: ['Reset', '<p><code>rst_n</code> is low, so every register with an asynchronous reset holds 0: <code>program_counter</code> = 0, the controller is IDLE, every valid is 0, the PE registers are 0. <code>inst</code> is still 0 because the instruction memory hasn\'t sampled an address yet: the first rising edge is at the end of this cycle.</p>'],
      1: ['Reset, and the memory already reads', '<p>The instruction memory\'s SRAM is always enabled (<code>cen</code> tied to 0), so it read <code>imem[0]</code> at the first rising edge: <code>inst</code> now shows the first instruction, <code>NOP | CLR</code>. <code>inst_valid</code> is forced to 0 while reset is low, so nobody takes it yet. Note <code>pe_inst</code> reads as MAC INT8 (all zeros) with valid 0: a reason the PE must respect its valid.</p>'],
      2: ['Reset', '<p>Nothing changes during reset. Cycles 0 to 4 are the testbench\'s 5 reset cycles, and they count in the final cycle number.</p>'],
      3: ['Reset', '<p>Still reset. The memories were filled before time started (the testbench\'s <code>loadmem</code> calls run at time 0).</p>'],
      4: ['Last reset cycle', '<p>The testbench releases reset at 50 ns, which is halfway through the next cycle.</p>'],
      5: ['Reset released: take the first instruction', '<p>At 50 ns <code>rst_n</code> goes high. <code>inst_valid</code> = (0 &lt; 9) becomes 1 immediately (it\'s combinational), and because the controller is IDLE it raises <code>inst_exec_begins</code>: "I\'m taking <code>inst</code>". At the edge that ends this cycle, the controller copies <code>NOP | CLR</code> into its registers and <code>program_counter</code> becomes 1.</p><p>The prefetch: because <code>inst_exec_begins</code> is high, <code>memory_address</code> is already <code>program_counter + 1</code> = 1, so the same edge fetches instruction 1.</p>'],
      6: ['The CLR\'s one repetition', '<p>The controller is EXECUTING the CLR: <code>buf_inst</code> = NOP with valid 1, and <code>remaining</code> = 0, so this is also its last repetition. Last repetition + a valid instruction waiting means <code>inst_exec_begins</code> is high again: <code>READ|MAC ×3</code>, already on <code>inst</code> thanks to the prefetch, is taken at the end of this cycle. No idle cycle between instructions.</p><p><code>pe_inst_valid</code> is still 0: the CLR reaches the PEs one cycle later, in cycle 7.</p>'],
      7: ['First READ: addresses go to the SRAMs', '<p><code>buf_inst</code> = <code>READ 0 0</code>, the first of three repetitions (<code>remaining</code> = 2). The buffer turns it into SRAM requests now: MEM0 <code>a</code> = 0, MEM1 <code>a</code> = 0 &gt;&gt; 1 = 0 (INT16: two elements per word), with <code>cen</code> = 0. The words won\'t be on <code>q</code> until the next cycle.</p><p>Meanwhile the PEs run the CLR that the controller issued last cycle (<code>pe_inst</code> = CLR, valid).</p>'],
      8: ['The first data arrives; the first MAC', '<p><code>buf_inst</code> = <code>READ 1 1</code>: the offsets stepped by 1. The data for <code>READ 0 0</code> is here: <code>matrix_data</code> = MEM0[0] = [1 3 | −2 0], column 0 of rows 0 to 3 (PE 0 gets rows 0 and 1, PE 1 rows 2 and 3), and <code>vector_data</code> = lane 0 of MEM1[0] = 0xffff0002, repeated: [2 2] (v[0] = 2).</p><p><code>pe_inst</code> = MAC: at the end of this cycle every PE adds A × B into its lanes. The MAC uses this cycle\'s buses, which hold the READ issued last cycle. That pairing is why the PE half is one cycle behind.</p>'],
      9: ['Last repetition of READ|MAC', '<p><code>buf_inst</code> = <code>READ 2 2</code>; MEM1 <code>a</code> = 2 &gt;&gt; 1 = 1. The first MAC has landed: PE 0 acc = [2 6] (1·2, 3·2), PE 1 acc = [−4 0].</p><p>Data for <code>READ 1 1</code>: MEM0[1] = [2 0 | 1 −3], and <code>vector_data</code> = lane 1 of MEM1[0] = [−1 −1]. The lane comes from the <i>registered</i> offset (1, saved when <code>READ 1 1</code> went out), not from this cycle\'s offset (2). <code>remaining</code> = 0, so <code>inst_exec_begins</code>: <code>NOP | OUT</code> is taken at the end of this cycle.</p>'],
      10: ['The OUT\'s memory half; the last MAC', '<p><code>buf_inst</code> = NOP, the memory half of <code>NOP | OUT</code>. Its mode field is 0 (INT8): the assembler only fills in the mode for READ.</p><p>The PEs do the last MAC, with the data for <code>READ 2 2</code>: MEM0[2] = [−1 2 | 4 1] and lane 0 of MEM1[1] = [3 3]. That\'s why the buffer must decode this word with the mode it registered from the READ (INT16), not this cycle\'s INT8: decoded as INT8, byte 2 of 0x00000003 is 0 (Bug 4). Accumulators after the second MAC: PE 0 [0 6], PE 1 [−5 3].</p>'],
      11: ['WRITE issued, OUT on the PEs', '<p><code>buf_inst</code> = <code>WRITE 0</code>, <code>pe_inst</code> = OUT. The accumulators now hold the finished sums: PE 0 [−3 12], PE 1 [7 6], which are y[0..3]. OUT copies them, clamped to 16 bits, into the output registers at the end of this cycle.</p><p>The WRITE can\'t store <code>output_data</code> now: it still shows the old outputs (0 since the CLR). So the buffer only remembers the WRITE and its address in this cycle.</p>'],
      12: ['MEM2[0] is written', '<p>MEM2 <code>gwen</code> = 0, <code>a</code> = 0, <code>d</code> = <code>output_data</code> = [−3 12 | 7 6]: the SRAM stores tile 0\'s results at the end of this cycle. In parallel the controller has moved on: <code>buf_inst</code> = NOP (tile 1\'s CLR), and <code>pe_inst</code> = NOP, the PE half of the WRITE instruction.</p>'],
      13: ['Tile 1 starts', '<p><code>buf_inst</code> = <code>READ 3 0</code>: tile 1\'s columns are MEM0 entries 3 to 5 (base = tile × columns). <code>pe_inst</code> = CLR: accumulators and outputs go to 0 at the end of this cycle. Cycles 13 to 18 repeat cycles 7 to 12, six cycles later.</p>'],
      14: ['Tile 1, first data', '<p><code>buf_inst</code> = <code>READ 4 1</code>. Data for <code>READ 3 0</code>: MEM0[3] = [2 −1 | 0 0]: rows 4 and 5 for PE 0, and two padding rows of zeros for PE 1 (6 rows don\'t fill two tiles of 4). <code>vector_data</code> = [2 2]. MAC.</p>'],
      15: ['Tile 1, last READ', '<p><code>buf_inst</code> = <code>READ 5 2</code>, the last repetition; PE 0 acc = [4 −2]. <code>vector_data</code> = [−1 −1]. MAC. <code>NOP | OUT</code> is taken at the end of this cycle.</p>'],
      16: ['Tile 1, last MAC', '<p><code>buf_inst</code> = NOP (OUT\'s half). The last MAC uses MEM0[5] = [2 0 | 0 0] and [3 3]. PE 0 acc = [2 −6].</p>'],
      17: ['WRITE 1 issued, OUT on the PEs', '<p><code>buf_inst</code> = <code>WRITE 1</code>, <code>pe_inst</code> = OUT. PE 0 acc = [8 −6] = y[4], y[5]; PE 1 acc = [0 0] (padding rows). The controller takes the last instruction in the program: index 8, the all-zero padding word.</p>'],
      18: ['MEM2[1] is written; the padding READ', '<p>MEM2 <code>gwen</code> = 0, <code>a</code> = 1, <code>d</code> = [8 −6 | 0 0]. The padding word decodes as <code>READ INT8 0 0 | MAC INT8</code> with count 0, so its READ goes out now. <code>program_counter</code> = 9 = <code>instruction_count</code>, so <code>inst_valid</code> has dropped: nothing more will start.</p>'],
      19: ['Draining: the padding\'s MAC', '<p>The controller is IDLE again (its last repetition is done and nothing is valid), so <code>buf_inst_valid</code> = 0. <code>pe_inst_valid</code> is still 1: the padding MAC INT8 runs now, on MEM0[0] and lane 0 of MEM1[0] read as INT8 (0x02, repeated: 0x02020202). It changes the accumulators after the last WRITE, so it doesn\'t matter. In INT16 view its lanes look odd: it\'s an INT8 operation on four 16-bit lanes.</p>'],
      20: ['The testbench sees the end', '<p>Every valid is 0 and <code>program_counter</code> = <code>instruction_count</code>, so <code>simulation_complete</code> rose at 195 ns. The testbench waits one clock period, dumps MEM2 at 205 ns and prints "Computation took 20 clock cycles" (205 / 10). MEM2 matched <code>ivd-sim</code>: [−3 12 7 6] and [8 −6 0 0].</p>'],
    };
    const VNOTE = {
      pe_not_delayed: {
        intro: 'The controller drives <code>pe_inst</code> and <code>pe_inst_valid</code> from the same registers as <code>buf_inst</code>, in the same cycle. Every PE operation runs one cycle early, while its READ is still on its way to the SRAM.',
        6: 'The CLR\'s PE half runs already, in the same cycle as its NOP.',
        7: 'The first MAC runs with <code>READ 0 0</code>, but the buses still show the SRAM outputs from before (0 here: nothing has been read yet). This MAC adds 0 × 0.',
        8: 'This MAC gets the data of <code>READ 0 0</code>, the previous repetition. From now on every MAC is paired with the data one repetition back.',
        10: '<code>pe_inst</code> = OUT. The last repetition\'s data (MEM0[2], v[2] = 3) is on the buses right now and nothing uses it: the last column is lost. OUT captures PE 0 = [0 6], PE 1 = [−5 3].',
        13: 'Tile 1\'s first MAC uses what the SRAMs still show: tile 0\'s last column with v[2] = 3. That puts 12 and 3 into the padding rows.',
        19: 'Done one cycle earlier than the reference: with nothing delayed, there\'s no PE instruction left to drain.',
        sum: 'MEM2 = [0 6 −5 3], [−1 0 12 3]. Official tests: int8 and int32 fail (16 of 16 rows); int16 passes under Verilator because its vector ends in 0, and fails under Icarus, where the very first MAC reads X.',
      },
      write_not_delayed: {
        intro: 'The buffer pulls MEM2\'s <code>gwen</code> low in the WRITE\'s own cycle, with that cycle\'s address and <code>output_data</code>.',
        11: '<code>gwen</code> = 0 now, with <code>a</code> = 0 and <code>d</code> = <code>output_data</code> = 0. The OUT is on the PEs in this same cycle, but the output registers only change at the edge that ends it. So the SRAM stores the old outputs: zeros from the CLR.',
        12: 'The OUT\'s results are on <code>output_data</code> now, [−3 12 | 7 6], one cycle too late: nothing writes them.',
        17: 'The same for tile 1: <code>gwen</code> = 0 with <code>d</code> = 0.',
        sum: 'Every MEM2 row is 0. All three official tests fail, 16 of 16 rows.',
      },
      live_offset: {
        intro: 'The data-side <code>vector_decoder</code> gets this cycle\'s <code>memb_offset</code> as its lane select, instead of the offset registered when the READ went out.',
        8: '<code>vector_data</code> = [−1 −1], but this word belongs to <code>READ 0 0</code>, which needs v[0] = 2. The live offset is already 1 (the next repetition\'s), so the decoder picks lane 1: v[1].',
        9: '[2 2]: the live offset is 2, so lane 0 of MEM1[0] is picked, v[0] instead of v[1].',
        10: '[3 3] is right, by luck: the live offset is the NOP\'s 0, and the word, MEM1[1], has v[2] in lane 0.',
        sum: 'MEM2 = [0 3 16 −3], [8 9 0 0]. Official tests: int8 and int16 fail (16 of 16 rows); int32 passes (one lane per word, nothing to select).',
      },
      live_mode: {
        intro: 'The data-side decoder gets this cycle\'s mode instead of the READ\'s. That only matters in the cycle after the last READ of a run, when <code>buf_inst</code> already shows the OUT\'s NOP, whose mode field is 0 (INT8).',
        10: '<code>vector_data</code> = [0 0] instead of [3 3]: the last READ\'s word, MEM1[1] = 0x00000003, decoded as INT8 with lane select 2 (offset 2, bits [1:0]) gives byte 2 = 0x00, repeated.',
        16: 'The same in tile 1: the last MAC gets 0 instead of v[2] = 3.',
        sum: 'MEM2 = [0 6 −5 3], [2 −6 0 0]. Official tests: all three pass. With vector seed 7, int16 and int32 fail, 16 of 16 rows.',
      },
      slices_reversed: {
        intro: 'PE i reads <code>matrix_data[32·(P−1−i) +: 32]</code> as in the reference, but drives <code>output_data[32·i +: 32]</code>: the opposite end.',
        12: '<code>d</code> = [7 6 | −3 12]: PE 1\'s results are in the left half. The numbers are right, their places aren\'t.',
        18: 'Row 1: [0 0 | 8 −6] instead of [8 −6 | 0 0].',
        sum: 'All three official tests fail, 16 of 16 rows: every row has its 16 slices reversed.',
      },
      bubble: {
        intro: 'The controller only takes an instruction from IDLE, so after each instruction it spends a cycle in IDLE before it can take the next. The results are right; it\'s just slower: 28 cycles instead of 20 here, and 64 more on each official test.',
        sum: 'MEM2 correct. 16,504 / 8,312 / 4,216 cycles instead of 16,440 / 8,248 / 4,152. (Icarus counts one cycle fewer, 27 here and 16,503 for INT8, because of a glitch in the testbench\'s end detector at the edge after cycle 26: <code>buf_inst_valid</code> falls exactly when <code>pe_inst_valid</code> rises.)',
      },
      race: {
        intro: 'The same correct design, simulated by Verilator with its default optimizations. The controller loads <code>inst</code> at the same edge the instruction memory fetches the next word, and Verilator lets it see the new word. So it always takes the instruction one ahead of <code>program_counter</code>.',
        5: 'The controller takes what it sees on <code>inst</code> at the end of this cycle, but under this optimization that\'s already <code>imem[1]</code>: the READ|MAC.',
        6: '<code>buf_inst</code> = <code>READ 0 0</code> already: the CLR (<code>imem[0]</code>) never runs. Harmless here, because the accumulators are 0 after reset anyway.',
        17: 'The controller runs <code>imem[8]</code> (all zeros)...',
        18: '...and then <code>imem[9]</code>, also all zeros. It ran instructions 1 to 9 instead of 0 to 8.',
        sum: 'MEM2 and the cycle count are the same as the correct run, so the equivalence tests can\'t see it. Small hand-written programs can: under these flags the staff tb_pe never runs its MAC.',
      },
    };
    const GROUPS = {
      default: [['Reset', 0, 4], ['Start', 5, 5], ['Tile 0', 6, 11], ['Tile 1', 12, 17], ['End', 18, 99]],
      bubble: [['Reset', 0, 4], ['Start', 5, 5], ['Tile 0', 6, 15], ['Tile 1', 16, 25], ['End', 26, 99]],
    };
    function designSel() {
      const s = $('#cy-design');
      s.innerHTML = DESIGNS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
      s.value = design;
    }
    function nCycles() { return WV.designs[design].cycles; }
    function events() {
      const d = design, n = nCycles(), ev = [];
      const first = (f) => { for (let c = 0; c < n; c++) if (f(c)) return c; return null; };
      const add = (lab, c) => { if (c !== null) ev.push([lab, c]); };
      add('Reset released', first((c) => val(d, 'rst_n', c) === '1'));
      add('First READ goes out', first((c) => val(d, 'buf_valid', c) === '1' && R.decBuf(val(d, 'buf_inst', c)).op === 0));
      add('First MAC on the PEs', first((c) => val(d, 'pe_valid', c) === '1' && R.decPe(val(d, 'pe_inst', c)).value === 0 && R.decPe(val(d, 'pe_inst', c)).op === 0 && c > 6));
      add('First OUT', first((c) => val(d, 'pe_valid', c) === '1' && R.decPe(val(d, 'pe_inst', c)).value === 2));
      add('First MEM2 write', first((c) => val(d, 'm2_gwen', c) === '0'));
      add('Testbench sees the end', first((c) => val(d, 'done', c) === '1'));
      return ev;
    }
    function renderJump() {
      $('#cy-jump').innerHTML = '<option value="">…</option>' + events().map(([l, c]) => `<option value="${c}">${esc(l)} (cycle ${c})</option>`).join('');
    }
    function renderTrack() {
      const gs = GROUPS[design] || GROUPS.default, n = nCycles();
      $('#cy-track').innerHTML = gs.map(([name, a, b]) => {
        const dots = []; for (let c = a; c <= Math.min(b, n - 1); c++) dots.push(`<button class="dot" data-c="${c}" aria-label="cycle ${c}">${c}</button>`);
        return dots.length ? `<div class="grp"><span class="name">${name}</span><div class="dots">${dots.join('')}</div></div>` : '';
      }).join('');
      $$('#cy-track .dot').forEach((b) => b.addEventListener('click', () => go(+b.dataset.c)));
    }
    function markTrack() {
      $$('#cy-track .dot').forEach((b) => { const c = +b.dataset.c; b.classList.toggle('done', c < cur); if (c === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      $$('#cy-track .grp').forEach((g) => g.classList.toggle('on', !!g.querySelector('[aria-current]')));
    }
    function narrate() {
      const c = cur, d = design;
      const tns = c === 0 ? '0 to 5 ns' : `${10 * c - 5} to ${10 * c + 5} ns`;
      let title, body = '';
      const vn = VNOTE[d];
      if (d === 'ref' || (!vn[c] && d !== 'bubble' && NARR[c] && !diffsAt(c).length)) {
        title = NARR[c] ? NARR[c][0] : 'Cycle ' + c;
        body = NARR[c] ? NARR[c][1] : '';
        if (d !== 'ref') body = `<p class="cap" style="margin-top:0">Same as the reference design in this cycle.</p>` + body;
      } else {
        title = d === 'bubble' ? bubbleTitle(c) : (vn[c] ? DLABEL[d].split(':')[0] + ': what differs here' : 'Cycle ' + c);
        body = `<p>${vn[c] || (d === 'bubble' ? bubbleText(c) : 'The values marked in the waveform differ from the reference design; see the list below.')}</p>`;
      }
      if (d !== 'ref') body = `<div class="note warn" style="margin-top:0"><b>${esc(DLABEL[d])}.</b> ${vn.intro}</div>` + body + (c >= nCycles() - 2 ? `<p><b>Outcome:</b> ${vn.sum}</p>` : '');
      $('#cy-title').textContent = `Cycle ${c} · ${title}`;
      $('#cy-body').innerHTML = `<p class="cap" style="margin-top:0">${tns}: the values shown are what the flip-flops capture at the rising edge at ${10 * c + 5} ns.</p>` + body;
      const df = diffsAt(c);
      $('#cy-diff').innerHTML = d === 'ref' || d === 'bubble' || !df.length ? '' :
        `<div class="difflist"><b>Different from the reference in this cycle:</b><ul>${df.map((x) => `<li><code>${esc(x.l)}</code> = ${esc(x.v)} (reference ${esc(x.r)})</li>`).join('')}</ul></div>`;
    }
    function bubbleTitle(c) {
      if (val('bubble', 'rst_n', c) === '0') return 'Reset';
      if (val('bubble', 'done', c) === '1') return 'The testbench sees the end';
      if (val('bubble', 'state', c) === '00000000' && c > 5) return 'IDLE: a bubble';
      return val('bubble', 'buf_valid', c) === '1' ? 'buf_inst = ' + fmt(ROWBY.buf_inst, val('bubble', 'buf_inst', c)).s : 'Cycle ' + c;
    }
    function bubbleText(c) {
      const d = 'bubble';
      if (val(d, 'rst_n', c) === '0') return 'Reset, as in the reference.';
      const parts = [];
      const idle = val(d, 'state', c) === '00000000';
      if (idle && c > 5 && val(d, 'done', c) !== '1') parts.push('The controller is IDLE: no buffer instruction this cycle, so in the next cycle the PEs get nothing either. That\'s the bubble.');
      if (val(d, 'begins', c) === '1') parts.push(`<code>inst_exec_begins</code> = 1: it takes <code>${esc(fmt(ROWBY.inst, val(d, 'inst', c)).f)}</code> now, so that instruction starts next cycle. In the reference, it would have been taken in the previous cycle, together with the last repetition.`);
      if (!idle) parts.push(`EXECUTING: <code>buf_inst</code> = ${esc(fmt(ROWBY.buf_inst, val(d, 'buf_inst', c)).f)}, <code>remaining</code> = ${parseInt(val(d, 'remaining', c), 16)}. On the last repetition (remaining 0) the controller goes back to IDLE instead of taking the next instruction.`);
      if (val(d, 'pe_valid', c) === '1') parts.push(`The PEs run <code>${esc(fmt(ROWBY.pe_inst, val(d, 'pe_inst', c)).f)}</code>, one cycle after its memory half.`);
      if (val(d, 'm2_gwen', c) === '0') parts.push(`MEM2[${parseInt(val(d, 'm2_a', c), 16)}] is written with ${esc(fmt(ROWBY.m2_d, val(d, 'm2_d', c)).f)}.`);
      if (val(d, 'done', c) === '1') parts.push('Every valid is 0 and the program counter is at the end: the testbench waits one period and dumps MEM2.');
      return parts.join(' ');
    }
    function diffsAt(c) {
      if (design === 'ref' || design === 'bubble') return [];
      const out = [];
      for (const r of ROWS) {
        if (!r.k || r.k === 'clk' || r.k === 'inst') continue;
        const a = val(design, r.k, c), b = val('ref', r.k, c);
        if (a !== null && b !== null && a !== b) out.push({ l: r.l, v: fmt(r, a, hex, true).f, r: fmt(r, b, hex, true).f });
      }
      return out;
    }
    function renderMem2() {
      const d = WV.designs[design];
      const rowTxt = (h) => lanesTxt(hexB(h), 64, 16);
      const cells = [0, 1].map((i) => {
        const got = d.mem2 ? d.mem2[i] : null, want = gold[i];
        const okk = got === want;
        return `<tr><td>MEM2[${i}]</td><td class="num ${okk ? 'good' : 'bad'}">${got ? esc(hex ? hexLanes(hexB(got), 64, 16) : '[' + rowTxt(got) + ']') : '—'}</td><td class="num">${esc(hex ? hexLanes(hexB(want), 64, 16) : '[' + rowTxt(want) + ']')}</td><td>${okk ? 'match' : 'wrong'}</td></tr>`;
      }).join('');
      $('#cy-mem2').innerHTML = `<h4>After the run: MEM2 vs ivd-sim · ${d.took} cycles (reference: ${WV.designs.ref.took})</h4><div class="tscroll"><table class="ref mem2t"><tr><th></th><th>this design</th><th>expected (ivd-sim)</th><th></th></tr>${cells}</table></div>` +
        '<p class="cap">y = [−3 12 7 6 8 −6]: MEM2[0] holds rows 0 to 3, MEM2[1] rows 4 and 5 and two padding rows.</p>';
    }
    function rowsFilter() { return rowsMode === 'key' ? ROWS.filter((r) => r.key).map((r) => r.k) : null; }
    function render() {
      renderWave($('#wv'), { design, rows: rowsFilter(), groups: true, cur, hex, compare: design === 'ref' || design === 'bubble' ? null : 'ref', onPick: (c) => go(c) });
      narrate(); markTrack();
      $$('#cy-fmt button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.fmt === 'hex') === hex)));
      $$('#cy-rows button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rows === rowsMode)));
      // keep the cursor column in view
      const sc = $('#wv .wv-scroll'); if (sc) { const x = cur * 78; if (x < sc.scrollLeft || x + 78 > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = Math.max(0, x - sc.clientWidth / 2); }
    }
    function go(c) { cur = Math.max(0, Math.min(nCycles() - 1, c)); render(); }
    function setDesign(d) { design = d; store.set('cy-design', d); $('#cy-design').value = d; cur = Math.min(cur, nCycles() - 1); renderJump(); renderTrack(); renderMem2(); render(); }
    function setPlaying(p) { playing = p; const b = $('#cy-play'); b.setAttribute('aria-pressed', String(p)); b.textContent = p ? 'Pause' : 'Auto-play'; clearTimeout(timer); if (p) tick(); }
    function tick() { if (!playing) return; if (cur >= nCycles() - 1) { setPlaying(false); return; } timer = setTimeout(() => { if (playing && current === 'cycles') { go(cur + 1); tick(); } }, 2400); }
    $('#cy-design').addEventListener('change', (e) => setDesign(e.target.value));
    $$('#cy-fmt button').forEach((b) => b.addEventListener('click', () => { hex = b.dataset.fmt === 'hex'; store.set('cy-hex', hex); renderMem2(); render(); }));
    $$('#cy-rows button').forEach((b) => b.addEventListener('click', () => { rowsMode = b.dataset.rows; store.set('cy-rows', rowsMode); render(); }));
    $('#cy-prev').addEventListener('click', () => { setPlaying(false); go(cur - 1); });
    $('#cy-next').addEventListener('click', () => go(cur + 1));
    $('#cy-play').addEventListener('click', () => setPlaying(!playing));
    $('#cy-jump').addEventListener('change', (e) => { if (e.target.value !== '') go(+e.target.value); e.target.value = ''; });
    document.addEventListener('keydown', (e) => {
      if (current !== 'cycles' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); go(cur - 1); }
    });

    // ---------------------------------------------------------------- the calculators and tables below
    const LANES = { 8: 4, 16: 2, 32: 1 };
    function model(rows, cols, P, w) {
      const lanes = LANES[w], tiles = Math.ceil(rows / (P * lanes));
      const lines = 4 * tiles, instCount = lines + 1;
      let depth = 128; while (depth <= instCount) depth *= 2;
      return { lanes, tiles, lines, instCount, depth, reps: tiles * (cols + 3) + 1, cycles: tiles * (cols + 3) + 8 };
    }
    function cycCalc() {
      const box = $('#cyc-calc');
      box.innerHTML = `<label>Matrix rows <input type="number" id="cc-rows" min="1" max="100000" value="1024"></label>
        <label>Columns <input type="number" id="cc-cols" min="1" max="65536" value="1024"></label>
        <label>PEs <input type="number" id="cc-p" min="1" max="1024" value="16"></label>
        <label>Mode <select id="cc-w"><option value="8">INT8</option><option value="16">INT16</option><option value="32">INT32</option></select></label>`;
      const upd = () => {
        const rows = Math.max(1, +$('#cc-rows').value | 0), cols = Math.max(1, +$('#cc-cols').value | 0), P = Math.max(1, +$('#cc-p').value | 0), w = +$('#cc-w').value;
        const m = model(rows, cols, P, w);
        $('#cyc-out').innerHTML = [['Lanes per PE', m.lanes], ['Rows per tile', comma(P * m.lanes)], ['Tiles', comma(m.tiles)], ['Program', `${comma(m.lines)} lines, INST_COUNT ${comma(m.instCount)}`],
          ['Repetitions', comma(m.reps)], ['Cycles (zero bubbles)', comma(m.cycles)]].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
        const warn = [];
        if (m.depth > 128) warn.push(`The program needs an instruction memory deeper than 128: pass <code>--controller_imem_depth ${m.depth}</code> to <code>ivd-as</code> and <code>ivd-gv</code> (otherwise <code>ivd-as</code> silently drops the extra lines).`);
        if (m.tiles * cols > 65535) warn.push(`${comma(m.tiles)} tiles × ${comma(cols)} columns = ${comma(m.tiles * cols)} MEM0 entries: the staff <code>ivd-sim</code> steps <code>mema_offset</code> to that value after the last READ, and it doesn't fit 16 bits (it stops with a ValueError). Use more PEs.`);
        if (Math.ceil(cols / m.lanes) > 16384) warn.push('The vector needs more than 16,384 MEM1 words.');
        $('#cyc-warn').innerHTML = warn.map((x) => `<span class="c-warn">${x}</span>`).join('<br>');
      };
      $$('#cyc-calc input, #cyc-calc select').forEach((x) => x.addEventListener('input', upd));
      upd();
      // measured vs model
      const rowsM = [['Worked example (6 × 3, INT16)', 2, 6, 3, 16, WV.designs.ref.took, 'Verilator, waveform run']];
      [['int8', 8, 1024], ['int16', 16, 512], ['int32', 32, 256]].forEach(([t, w, n]) => {
        const r = run('ref', t);
        const ic = run('ref', t, 'official', 'icarus');
        if (r) rowsM.push([`Official ${t}_test (${n} × ${n})`, 16, n, n, w, r.took, 'Verilator' + (ic ? `; Icarus: ${comma(ic.took)}` : '')]);
      });
      (F.sweep || []).forEach((s) => rowsM.push([`${s.test} with ${s.P} PEs (${s.n} × ${s.n})`, s.P, s.n, s.n, s.w, s.took, s.note || 'Verilator']));
      $('#cyc-measured').innerHTML = '<tr><th>Run</th><th class="num">PEs</th><th class="num">Model</th><th class="num">Measured</th><th></th></tr>' +
        rowsM.map(([l, P, rows, cols, w, took, note]) => { const m = model(rows, cols, P, w); const st = took === null || took === undefined ? note : (m.cycles === took ? 'match' : '<b class="c-warn">differs</b>') + ' · ' + note; return `<tr><td>${l}</td><td class="num">${P}</td><td class="num">${comma(m.cycles)}</td><td class="num">${comma(took)}</td><td>${st}</td></tr>`; }).join('');
    }
    function fomCalc() {
      const base = ['int8', 'int16', 'int32'].map((t) => (run('ref', t) || {}).took);
      const dims = [[1024, 8], [512, 16], [256, 32]].map(([n, w]) => model(n, n, 16, w));
      $('#fom-calc').innerHTML = `<label>Extra cycles per instruction <span class="v" id="fc-i-v"></span><input type="range" id="fc-i" min="0" max="3" value="1"></label>
        <label>Extra cycles per repetition <span class="v" id="fc-r-v"></span><input type="range" id="fc-r" min="0" max="2" value="0"></label>`;
      const upd = () => {
        const ei = +$('#fc-i').value, er = +$('#fc-r').value;
        $('#fc-i-v').textContent = ei; $('#fc-r-v').textContent = er;
        const nw = dims.map((m, i) => base[i] + ei * (m.instCount - 1) + er * m.reps);
        const t0 = base.reduce((a, b) => a + b, 0), t1 = nw.reduce((a, b) => a + b, 0);
        const ratio = Math.pow(t1 / t0, 2.3);
        $('#fom-out').innerHTML = [['int8 / int16 / int32 cycles', nw.map(comma).join(' / ')], ['Total, vs zero bubbles', `${comma(t1)} vs ${comma(t0)}`],
          ['FoM multiplier', `× ${ratio.toFixed(ratio < 1.1 ? 4 : 2)}`]].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
      };
      $$('#fom-calc input').forEach((x) => x.addEventListener('input', upd));
      upd();
    }
    function bugTable() {
      const RES = (d, t, seed, sim) => { const r = run(d, t, seed, sim); if (!r) return '—'; return r.bad_rows === 0 ? '<span class="c-ok">pass</span>' : `<b class="c-warn">fail</b> (${r.bad_rows} of 16 rows)`; };
      const CH = {
        pe_not_delayed: 'the controller issues <code>pe_inst</code> in the same cycle as <code>buf_inst</code>',
        write_not_delayed: 'the buffer writes MEM2 in the WRITE\'s own cycle',
        live_offset: 'MEM1 lane select from this cycle\'s <code>memb_offset</code>',
        live_mode: 'MEM1 data decoded with this cycle\'s mode',
        slices_reversed: 'PE i drives <code>output_data[32i +: 32]</code> but reads <code>matrix_data[32(P−1−i) +: 32]</code>',
        bubble: 'the controller takes instructions only from IDLE',
      };
      const rows = Object.keys(CH).map((d) => {
        const ex = WV.designs[d];
        const exTxt = ex.mem2 ? ex.mem2.slice(0, 2).map((h) => '[' + lanesTxt(hexB(h), 64, 16) + ']').join(' ') : '—';
        const v7 = ['int8', 'int16', 'int32'].map((t) => run(d, t, 'v7') ? `${t}: ${RES(d, t, 'v7')}` : '').filter(Boolean).join('<br>');
        const cyc = ['int8', 'int16', 'int32'].map((t) => comma((run(d, t) || {}).took)).join(' / ');
        const ic = d === 'pe_not_delayed' && run(d, 'int16', 'official', 'icarus') ? `<br>int16 under Icarus: ${RES(d, 'int16', 'official', 'icarus')}` : '';
        return `<tr><td><b>${esc(DLABEL[d].split(':')[0])}</b><br><button class="small" data-goto="cycles/${d}">waveform</button></td><td>${CH[d]}</td><td class="num">${exTxt}<br><small>${ex.took} cycles</small></td>` +
          `<td>${RES(d, 'int8')}</td><td>${RES(d, 'int16')}${ic}</td><td>${RES(d, 'int32')}</td><td>${v7 || '—'}</td><td class="num">${cyc}</td></tr>`;
      });
      const ref = WV.designs.ref;
      $('#bug-table').innerHTML = '<tr><th>Design</th><th>The one change</th><th>Worked example MEM2[0], MEM2[1]</th><th>int8</th><th>int16</th><th>int32</th><th>Vector seed 7</th><th>Cycles int8 / int16 / int32</th></tr>' +
        `<tr><td><b>Reference</b></td><td>(correct)</td><td class="num">${ref.mem2.slice(0, 2).map((h) => '[' + lanesTxt(hexB(h), 64, 16) + ']').join(' ')}<br><small>${ref.took} cycles</small></td><td>${RES('ref', 'int8')}</td><td>${RES('ref', 'int16')}</td><td>${RES('ref', 'int32')}</td><td>${['int8', 'int16', 'int32'].map((t) => `${t}: ${RES('ref', t, 'v7')}`).join('<br>')}</td><td class="num">${['int8', 'int16', 'int32'].map((t) => comma((run('ref', t) || {}).took)).join(' / ')}</td></tr>` + rows.join('');
    }
    designSel(); renderJump(); renderTrack(); renderMem2(); render(); renderMinis(el); cycCalc(); fomCalc(); bugTable();
    return {
      el,
      show() { render(); },
      hide() { setPlaying(false); },
      go(rest) {
        if (/^\d+$/.test(rest)) { go(+rest); $('#wv').scrollIntoView({ block: 'center' }); return true; }
        if (WV.designs[rest]) { setDesign(rest); el.scrollIntoView({ block: 'start' }); return true; }
        return false;
      },
    };
  })();

  // ================================================================== PROCESSING ELEMENT
  views.pe = (function () {
    const el = $('#view-pe');
    let w = 16, regs = { acc: 0n, out: 0n, A: 0n, B: 0n }, hist = [], last = null;
    const PRESETS = [
      ['MAC, then OUT clamps (INT16)', 16, [-20000, 20000], [2, 2], [['MAC'], ['OUT']]],
      ['The staff tb_pe program (INT8)', 8, [-2, 0, 3, 2], [-4, -4, -4, -4], [['MAC'], ['OUT'], ['MAC']]],
      ['RND ties to even (INT8): 5, −5, 3, −3 then s = 1', 8, [5, -5, 3, -3], [1, 1, 1, 1], [['MAC'], ['RND', 1]]],
      ['PASS sign-extends A (INT16)', 16, [-15, 7], [0, 0], [['PASS'], ['OUT']]],
      ['OUT leaves the accumulator alone', 32, [1000000], [3000], [['MAC'], ['OUT'], ['MAC']]],
      ['A MAC that wraps an INT8 lane', 8, [-128, 127, 100, -100], [-128, 127, 100, 100], [['MAC'], ['MAC'], ['MAC']]],
    ];
    function lanesOf(v, bits, lw) { const n = bits / lw, out = []; for (let k = n - 1; k >= 0; k--) out.push(R.getLane(v, lw, k)); return out; }
    function render(changed) {
      const n = 32 / w, aw = 64 / n;
      const inp = (name, v) => `<span class="lanecol">${lanesOf(v, 32, w).map((x, i) => `<input type="number" data-in="${name}" data-k="${n - 1 - i}" value="${x}" aria-label="${name} lane ${n - 1 - i}">`).join('')}</span>`;
      const show = (cls, v, bits, lw, ch) => `<span class="lanecol">${lanesOf(v, bits, lw).map((x) => `<span class="lane ${cls}${ch ? ' mod' : ''}">${num(x)}</span>`).join('')}</span>`;
      const hdr = (cnt) => `<span class="lanecol hdr">${Array.from({ length: cnt }, (_, i) => `<span>lane ${cnt - 1 - i}</span>`).join('')}</span>`;
      $('#lab-grid').innerHTML = `<span></span>${hdr(n)}<span></span>` +
        `<span class="rl">A <small>vector_input</small></span>${inp('A', regs.A)}<span class="hexw">0x${hexLanes(regs.A, 32, w)}</span>` +
        `<span class="rl">B <small>matrix_input</small></span>${inp('B', regs.B)}<span class="hexw">0x${hexLanes(regs.B, 32, w)}</span>` +
        `<span class="rl">acc <small>64-bit register</small></span>${show('acc', regs.acc, 64, aw, changed && changed.acc)}<span class="hexw">0x${hexLanes(regs.acc, 64, aw)}</span>` +
        `<span class="rl">out <small>32-bit register</small></span>${show('out', regs.out, 32, w, changed && changed.out)}<span class="hexw">0x${hexLanes(regs.out, 32, w)}</span>`;
      $$('#lab-grid input').forEach((x) => x.addEventListener('change', () => {
        const lo = -(2 ** (w - 1)), hi = 2 ** (w - 1) - 1;
        let v = Math.round(+x.value); if (!Number.isFinite(v)) v = 0; v = Math.max(lo, Math.min(hi, v));
        regs[x.dataset.in] = R.setLane(regs[x.dataset.in], w, +x.dataset.k, v); render();
      }));
      $$('#lab-mode button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === w)));
      $('#lab-hist').textContent = hist.length ? hist.join(', ') : 'none yet';
    }
    function explain(op, s, valid, res) {
      const n = 32 / w, aw = 64 / n, mode = R.MODE_OF_W[w];
      const opc = op === 'RND' ? 1 : 0, value = op === 'RND' ? s : { MAC: 0, NOP: 1, OUT: 2, PASS: 3, CLR: 4 }[op];
      const bits = (v, k) => v.toString(2).padStart(k, '0');
      const instHex = ((opc << 7) | (mode << 5) | value).toString(16).padStart(3, '0');
      const fld = (b, nm) => `<span class="fld"><span class="b">${b}</span><span class="n">${nm}</span></span>`;
      let h = `<p><code>pe_inst</code> = 9'h${instHex}:</p><div class="hwbits">${fld(bits(opc, 2), 'opcode [8:7]')}${fld(bits(mode, 2), 'mode [6:5] ' + R.MODES[mode])}${fld(bits(value, 5), op === 'RND' ? 'value [4:0] = s' : 'value [4:0] ' + op)}</div>`;
      if (!valid) h += '<p><code>pe_inst_valid</code> = 0, so whatever the bits say, both registers hold.</p>';
      const srcA = { hold: 'hold', mac: 'MAC', pass: 'PASS', rnd: 'RND', zero: '0' }, srcO = { hold: 'hold', clamp: 'OUT clamp', zero: '0' };
      const mux = (sel, map) => Object.keys(map).map((k) => `<span class="${k === sel ? 'on' : ''}">${map[k]}</span>`).join(' ');
      h += `<div class="muxes"><b>acc_d</b><span class="src">${mux(res.accSrc, srcA)}</span><b>out_d</b><span class="src">${mux(res.outSrc, srcO)}</span></div>`;
      const eq = [];
      res.lanes.forEach((L) => {
        const ar = `[${(L.k + 1) * w - 1}:${L.k * w}]`, cr = `[${(L.k + 1) * aw - 1}:${L.k * aw}]`;
        if (op === 'MAC') eq.push(`lane ${L.k}: acc${cr} + A${ar} × B${ar}   (${w}×${w} signed → ${2 * w}-bit product, ${aw}-bit add)\n        ${num(L.c)} + ${num(L.a)} × ${num(L.b)} = ${num(L.exact)}${L.wrapped ? `   wraps to ${num(L.r)}` : ''}`);
        if (op === 'OUT') eq.push(`lane ${L.k}: acc${cr} = ${num(L.c)} → out${ar} = ${num(L.r)}   (${L.how === 'fits' ? 'fits in ' + w + ' bits: low bits' : 'clamped to the ' + (L.how === 'high' ? 'upper' : 'lower') + ' limit'})`);
        if (op === 'PASS') eq.push(`lane ${L.k}: acc${cr} = sign-extend(A${ar}) = ${num(L.r)}`);
        if (op === 'RND') eq.push(`lane ${L.k}: acc${cr} = ${num(L.c)} >>> ${s} = ${num(L.q)}; guard ${L.g}, sticky ${L.st}, lsb ${L.lsb} → ${L.up ? 'round up' : 'keep'} = ${num(L.r)}`);
      });
      if (op === 'CLR') eq.push('acc_d = 0 (64 bits), out_d = 0 (32 bits)');
      if (op === 'NOP') eq.push('acc_d = acc, out_d = out: both registers hold');
      $('#lab-eq').textContent = eq.join('\n');
      $('#lab-title').textContent = `${op}${op === 'RND' ? ' s = ' + s : ''} ${R.MODES[mode]}${valid ? '' : ' (not valid)'}`;
      $('#lab-body').innerHTML = h + '<p class="cap">The new values appear in the registers after the rising edge; on the left they\'re highlighted.</p>';
    }
    function exec(op, s) {
      const valid = $('#lab-valid').checked;
      const res = R.peStep(regs, op, w, s, valid);
      const changed = { acc: res.acc !== regs.acc, out: res.out !== regs.out };
      regs = Object.assign({}, regs, { acc: res.acc, out: res.out });
      hist.push(op + (op === 'RND' ? ' ' + s : '') + (valid ? '' : ' (invalid)'));
      render(changed); explain(op, s, valid, res);
    }
    function loadPreset(i) {
      const [, pw, A, Bv, prog] = PRESETS[i];
      w = pw; const n = 32 / w;
      regs = { acc: 0n, out: 0n, A: 0n, B: 0n }; hist = [];
      for (let k = 0; k < n; k++) { regs.A = R.setLane(regs.A, w, k, A[n - 1 - k]); regs.B = R.setLane(regs.B, w, k, Bv[n - 1 - k]); }
      render();
      $('#lab-title').textContent = PRESETS[i][0];
      $('#lab-body').innerHTML = `<p>Loaded. Its program: ${prog.map((p) => '<code>' + p.join(' ') + '</code>').join(', then ')}. Press the buttons in that order.</p>`;
      $('#lab-eq').textContent = '';
    }
    $('#lab-preset').innerHTML = '<option value="">…</option>' + PRESETS.map((p, i) => `<option value="${i}">${esc(p[0])}</option>`).join('');
    $('#lab-preset').addEventListener('change', (e) => { if (e.target.value !== '') loadPreset(+e.target.value); });
    $$('#lab-mode button').forEach((b) => b.addEventListener('click', () => { w = +b.dataset.w; render(); }));
    $('#lab-reset').addEventListener('click', () => { regs.acc = 0n; regs.out = 0n; hist = []; render(); $('#lab-eq').textContent = ''; $('#lab-title').textContent = 'Reset'; $('#lab-body').innerHTML = '<p><code>rst_n</code> low: both registers go to 0 immediately (asynchronous reset), without waiting for a clock edge.</p>'; });
    $$('#lab .oprow button[data-op]').forEach((b) => b.addEventListener('click', () => {
      let s = Math.round(+$('#lab-s').value); if (!Number.isFinite(s)) s = 0; s = Math.max(0, Math.min(31, s)); $('#lab-s').value = s;
      exec(b.dataset.op, s);
    }));
    loadPreset(1);

    // ---------------------------------------------------------------- the lane ruler
    function ruler(wr) {
      const n = 32 / wr, aw = 64 / n;
      const bitRow = (bits, lw, cls) => { const cells = []; for (let b = bits - 1; b >= 0; b--) { const k = Math.floor(b / lw); cells.push(`<span class="l${k % 4}${b % lw === lw - 1 ? ' edge' : ''}${b === 0 ? ' last' : ''}">${b % lw === 0 || b % lw === lw - 1 ? b : ''}</span>`); } return `<div class="rrow lanesr">${cells.join('')}</div>`; };
      const names = (bits, lw, pre) => { const out = []; for (let k = bits / lw - 1; k >= 0; k--) out.push(`<span style="width:${lw * 1.55}em">${pre}[${lw * k} +: ${lw}]</span>`); return `<div class="lanenames">${out.join('')}</div>`; };
      $('#pe-ruler').innerHTML = `<div class="ruler"><div class="cap" style="margin:0 0 4px">vector_input / matrix_input (32 bits), ${n} lane${n > 1 ? 's' : ''} of ${wr}</div>${names(32, wr, 'in')}${bitRow(32, wr)}</div>` +
        `<div class="ruler"><div class="cap" style="margin:0 0 4px">the accumulator (64 bits), ${n} lane${n > 1 ? 's' : ''} of ${aw}</div>${names(64, aw, 'acc')}${bitRow(64, aw)}</div>`;
      $$('#ruler-mode button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === wr)));
    }
    $$('#ruler-mode button').forEach((b) => b.addEventListener('click', () => ruler(+b.dataset.w)));
    ruler(8);

    // ---------------------------------------------------------------- signedness explorer
    const sx = { sAcc: false, sA: true, sB: true, acc: 10, a: -2, b: 3 };
    function sxRender() {
      const r = R.sxEval(sx);
      const w = (nm, on) => (on ? `<span class="on">$signed(${nm})</span>` : nm);
      const h16 = (v) => '0x' + v.toString(16).padStart(4, '0');
      $('#sx').innerHTML = `<div class="sxctl"><label><input type="checkbox" data-s="sAcc" ${sx.sAcc ? 'checked' : ''}> <code>$signed(acc)</code></label><label><input type="checkbox" data-s="sA" ${sx.sA ? 'checked' : ''}> <code>$signed(a)</code></label><label><input type="checkbox" data-s="sB" ${sx.sB ? 'checked' : ''}> <code>$signed(b)</code></label>
        <label>acc <input type="number" data-v="acc" min="-32768" max="32767" value="${sx.acc}"></label><label>a <input type="number" data-v="a" min="-128" max="127" value="${sx.a}"></label><label>b <input type="number" data-v="b" min="-128" max="127" value="${sx.b}"></label></div>
        <div class="sxexpr">acc_n[15:0] = ${w('acc[15:0]', sx.sAcc)} + ${w('a[7:0]', sx.sA)} * ${w('b[7:0]', sx.sB)};</div>
        <ol class="prose">
          <li>Width: the widest of the left side (16) and the operands (16, 8, 8) = <b>16 bits</b>.</li>
          <li>Signedness: ${r.signedExpr ? '<b>signed</b>: every operand is signed.' : '<b>unsigned</b>: at least one operand is unsigned' + (sx.sAcc ? '' : ' (the part-select <code>acc[15:0]</code>)') + ', so the whole expression is.'}</li>
          <li>Each operand is ${r.signedExpr ? 'sign' : 'zero'}-extended to 16 bits: a = ${h16(r.ea)} (${r.signedExpr ? num(R.toS(r.ea, 16)) : r.ea}), b = ${h16(r.eb)} (${r.signedExpr ? num(R.toS(r.eb, 16)) : r.eb}).</li>
          <li>a × b, kept to 16 bits = ${h16(r.prod)}; plus acc = <b>${h16(r.sum)}</b>, which reads as ${num(R.toS(r.sum, 16))} signed.</li>
        </ol>
        <p class="verdictline ${r.ok ? 'good' : 'bad'}">${r.ok ? 'Correct' : 'Wrong'}: acc + a × b = ${num(B(sx.acc) + B(sx.a) * B(sx.b))}, which is ${h16(r.want)} in 16 bits.</p>`;
      $$('#sx input[data-s]').forEach((x) => x.addEventListener('change', () => { sx[x.dataset.s] = x.checked; sxRender(); }));
      $$('#sx input[data-v]').forEach((x) => x.addEventListener('change', () => { let v = Math.round(+x.value); if (!Number.isFinite(v)) v = 0; v = Math.max(+x.min, Math.min(+x.max, v)); sx[x.dataset.v] = v; sxRender(); }));
    }
    sxRender();

    // ---------------------------------------------------------------- RND bits
    const rd = { lw: 16, x: '-45', s: 3 };
    function rndRender() {
      let x; try { x = B(rd.x.trim().replace(MINUS, '-')); } catch (e) { x = 0n; }
      x = R.toS(x, rd.lw);
      const s = rd.s, res = R.rndLane(x, rd.lw, s);
      const nb = Math.max(rd.lw, s + 1), u = R.toU(x, nb);
      const cells = [];
      for (let b = nb - 1; b >= 0; b--) {
        const bit = Number((u >> B(b)) & 1n);
        let cls = b >= s ? 'kept' : b === s - 1 ? 'guard' : 'sticky';
        if (b >= rd.lw) cls += ' ext';
        if (b === s && s < nb) cls += ' lsb';
        cells.push(`<span class="${cls}" title="bit ${b}">${bit}</span>`);
        if (b === s && s > 0) cells.push('<span class="gap"></span>');
      }
      const exact = (() => { if (s === 0) return num(x); const den = 1n << B(s), neg = x < 0n, a = neg ? -x : x; let rem = a % den, frac = ''; for (let i = 0; i < 8 && rem; i++) { rem *= 10n; frac += (rem / den).toString(); rem %= den; } return (neg ? MINUS : '') + (a / den).toString() + (frac ? '.' + frac + (rem ? '…' : '') : ''); })();
      $('#rnd').innerHTML = `<div class="rndctl"><label>Lane <select id="rd-lw"><option value="16">16-bit (INT8 acc lane)</option><option value="32">32-bit (INT16)</option><option value="64">64-bit (INT32)</option></select></label>
        <label>value <input type="text" id="rd-x" value="${esc(rd.x)}" inputmode="numeric"></label><label>s = <span id="rd-sv">${s}</span> <input type="range" id="rd-s" min="0" max="31" value="${s}"></label>
        <span class="seg"><button data-ex="-45,3">−45, s 3</button><button data-ex="-3,1">−3, s 1</button><button data-ex="5,1">5, s 1</button><button data-ex="-12,3">−12, s 3</button><button data-ex="-1,20">−1, s 20</button></span></div>
        <div class="bitrow" aria-label="bits of the lane">${cells.join('')}</div>
        <div class="bitlab"><span><b>blue</b>: q = x &gt;&gt;&gt; s = ${num(res.q)}</span>${s ? `<span><b>yellow</b>: guard bit = ${res.g}</span><span><b>purple</b>: sticky = OR of ${Math.max(0, s - 1)} bit${s - 1 === 1 ? '' : 's'} = ${res.st}</span><span><b>outlined</b>: lsb of q = ${res.lsb}</span>` : '<span>s = 0: nothing is shifted out</span>'}</div>
        <pre class="eq">x / 2^${s} = ${num(x)} / ${(1n << B(s)).toString()} = ${exact}
remainder r = x − q·2^${s} = ${s ? res.r.toString() : '0'}${s ? `   (half = ${res.half.toString()}: ${res.r > res.half ? 'more than half' : res.r === res.half ? 'exactly half, a tie' : 'less than half'})` : ''}
round up = guard AND (sticky OR lsb) = ${res.g} AND (${res.st} OR ${res.lsb}) = ${res.up ? 1 : 0}
result = q + ${res.up ? 1 : 0} = ${num(res.result)}</pre>`;
      $('#rd-lw').value = String(rd.lw);
      $('#rd-lw').addEventListener('change', (e) => { rd.lw = +e.target.value; rndRender(); });
      $('#rd-x').addEventListener('change', (e) => { rd.x = e.target.value; rndRender(); });
      $('#rd-s').addEventListener('input', (e) => { rd.s = +e.target.value; rndRender(); });
      $$('#rnd button[data-ex]').forEach((b) => b.addEventListener('click', () => { const [a, c] = b.dataset.ex.split(','); rd.x = a; rd.s = +c; rndRender(); }));
    }
    rndRender();
    return { el };
  })();

  // ================================================================== MAIN BUFFER
  views.buffer = (function () {
    const el = $('#view-buffer');
    let w = 16, off = 5, bug = false;
    const v = Array.from({ length: 16 }, (_, j) => 10 + j);
    function render() {
      const n = 32 / w, sh = { 8: 2, 16: 1, 32: 0 }[w];
      const words = R.packMem1(v, w);
      const offN = Math.min(off + 1, 15);
      const good = R.vdec(words[off >> sh], off, off, w);
      const live = R.vdec(words[off >> sh], offN, offN, w);
      const used = bug ? live : good;
      const b16 = off.toString(2).padStart(16, '0');
      const drop = { 8: 0, 16: 1, 32: 2 }[w];                     // address bits above the 14 MEM1 needs are dropped
      const split = `<span class="x">${b16.slice(0, drop)}</span><span class="e">${b16.slice(drop, 16 - sh)}</span><span class="s">${b16.slice(16 - sh)}</span>`;
      const wd = (x, i) => `<span class="wd${i === off >> sh ? ' on' : ''}"><span class="ix">${i}</span>${Array.from({ length: n }, (_, q) => { const k = n - 1 - q; const cls = i === off >> sh && k === used.lane ? (bug && used.lane !== good.lane ? 'badsel' : 'sel') : ''; return `<span class="ln ${cls}">${num(R.getLane(x, w, k))}</span>`; }).join(' ')}</span>`;
      $('#dec-out').innerHTML = `<div class="offbits2">MemBOffset = ${off} = ${split}</div>
        <p class="cap" style="margin-top:0">${w === 32 ? 'INT32: bits [13:0] (purple) are the word address; bits [15:14] (struck out) are dropped, because MEM1 has 2<sup>14</sup> words.' : w === 16 ? 'INT16: bits [14:1] (purple) are the word address, bit [0] (yellow) the lane; bit 15 (struck out) is dropped.' : 'INT8: bits [15:2] (purple) are the word address, bits [1:0] (yellow) the lane.'}</p>
        <div class="words">${words.map(wd).join('')}</div>
        <div class="twocyc"><div><h5>Cycle t: the READ goes out</h5><code>addr_from_controller</code> = ${off} → <code>addr_to_mem</code> = ${off} &gt;&gt; ${sh} = <b>${good.addr}</b><br>The SRAM samples it at the end of this cycle.</div>
        <div><h5>Cycle t + 1: the word comes back</h5><code>q</code> = MEM1[${good.addr}]; the next READ (offset ${offN}) is now on <code>buf_inst</code>.<br><code>addr_from_controller_reg</code> = ${bug ? offN + ' (this cycle\'s offset: the bug)' : off + ' (registered in cycle t)'} → lane ${used.lane} → <code>data_to_pe</code> = <b class="${bug && used.value !== good.value ? 'c-warn' : ''}">{${n}{${num(used.value)}}}</b>${bug && used.value !== good.value ? `<br><span class="c-warn">The MAC wanted v[${off}] = ${num(good.value)}.</span>` : ''}</div></div>`;
      $('#dec-off-v').textContent = off;
      $$('#dec-mode button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === w)));
      $('#dec-title').textContent = `READ with MemBOffset ${off}, INT${w}`;
      $('#dec-body').innerHTML = `<p>Element ${off} of v lives in word ${good.addr}, lane ${good.lane}: ${num(good.value)}. ${n > 1 ? `The decoder repeats it ${n} times so every lane of every PE gets the same v[${off}].` : 'In INT32 the word is the element; nothing to select.'}</p>` +
        (bug ? (used.value !== good.value ? `<p class="c-warn"><b>With the bug</b>, the lane is chosen from the offset on <code>buf_inst</code> in cycle t + 1, which already belongs to the next READ (${offN}): lane ${live.lane}, value ${num(live.value)}.</p>` : `<p>With the bug the lane happens to be the same here${w === 32 ? ' (INT32 has one lane: that\'s why Bug 3 passes int32_test)' : ''}. Try another offset.</p>`) :
        '<p>Tick the box to see what happens when the lane select uses the live offset (Bug 3).</p>');
    }
    $$('#dec-mode button').forEach((b) => b.addEventListener('click', () => { w = +b.dataset.w; render(); }));
    $('#dec-off').addEventListener('input', (e) => { off = +e.target.value; render(); });
    $('#dec-bug').addEventListener('change', (e) => { bug = e.target.checked; render(); });
    render(); renderMinis(el);
    return { el };
  })();

  // ================================================================== CONTROLLER
  views.controller = (function () {
    const el = $('#view-controller');
    const PROGS = {
      tile: ['One tile, compiler style', (n) => ['NOP | CLR INT16 | 1 0 0', `READ INT16 0 0 | MAC INT16 | ${n} 1 1`, 'NOP | OUT INT16 | 1 0 0', 'WRITE 0 | NOP INT16 | 1 0 0']],
      example: ['The worked example (2 tiles)', () => WV.designs.ref.asm],
      pe: ['pe_test.asm (tb_pe)', () => ['NOP | MAC INT8 | 1 0 0', 'NOP | OUT INT8 | 1 0 0']],
      wb: ['buffer_wb_test.asm (tb_buffer_wb)', () => ['WRITE 3 | NOP INT8 | 1 0 0']],
    };
    let prog = 'tile', N = 3, hide = false, sel = null, revealed = new Set();
    let S = null;
    function build() {
      const lines = PROGS[prog][1](N);
      const p = lines.map(R.assemble);
      S = { lines, sch: R.schedule(p, p.length + 1) };
    }
    function render() {
      const H = (key, txt, cls) => (hide && !revealed.has(key) ? `<td class="hid" data-r="${key}">?</td>` : `<td class="${cls || ''}">${txt}</td>`);
      const rows = S.sch.rows.map((r) => {
        const c = r.c;
        const bufT = r.bufValid ? esc(R.bufText(r.buf)) : '—', peT = r.peValid ? esc(R.peText(r.pe)) : '—';
        return `<tr data-c="${c}" class="${r.rst ? 'rst' : ''}${sel === c ? ' on' : ''}"><td>${c}</td><td>${r.rst ? 'reset' : r.pc}</td><td>${r.rst ? '' : esc(R.instShort(r.inst))}</td><td class="${r.instValid ? '' : 'v0'}">${+r.instValid}</td>` +
          H(c + 'b', +r.begins, r.begins ? '' : 'v0') + H(c + 's', r.st === 'EXEC' ? 'EXECUTING' : 'IDLE') + H(c + 'r', r.st === 'EXEC' ? r.rem : '') + H(c + 'f', bufT, r.bufValid ? '' : 'v0') + H(c + 'p', peT, r.peValid ? '' : 'v0') +
          H(c + 'w', r.write ? `MEM2[${r.write.a}]` : '', '') + `<td>${r.done ? 'done' : ''}</td></tr>`;
      }).join('');
      $('#sch-table').innerHTML = '<tr><th>cycle</th><th>program_counter</th><th>inst</th><th>inst_valid</th><th>inst_exec_begins</th><th>state</th><th>remaining</th><th>buf_inst (valid)</th><th>pe_inst (valid)</th><th>MEM2 write commits</th><th>testbench</th></tr>' + rows;
      $('#sch-nlab').hidden = prog !== 'tile';
      $$('#sch-table tr[data-c]').forEach((tr) => tr.addEventListener('click', (e) => {
        const td = e.target.closest('td.hid');
        if (td) { revealed.add(td.dataset.r); render(); return; }
        pick(+tr.dataset.c);
      }));
    }
    function pick(c) {
      sel = c; render();
      const r = S.sch.rows[c];
      $$('#fsm g, #fsm path.tr').forEach((x) => x.classList.remove('on'));
      if (!r) return;
      $(r.st === 'EXEC' ? '#fsm-exec' : '#fsm-idle').classList.add('on');
      let t = null, why = '';
      if (r.rst) why = 'Reset: all registers are held at their reset values; the state is IDLE.';
      else if (r.st === 'IDLE') { if (r.begins) { t = '#fsm-t1'; why = `IDLE with <code>inst_valid</code> = 1: take <code>${esc(R.instText(r.inst))}</code> (raise <code>inst_exec_begins</code>), load the counter with its count (${r.inst.count}) and the offsets with its base offsets, and go to EXECUTING.`; } else { t = '#fsm-t0'; why = r.done ? 'IDLE, and nothing left: the program is over.' : 'IDLE, nothing valid: wait.'; } }
      else if (!r.last) { t = '#fsm-t3'; why = `EXECUTING with ${r.rem} more repetition${r.rem === 1 ? '' : 's'} after this one: count down, add the increments to the offsets, stay.`; }
      else if (r.begins) { t = '#fsm-t4'; why = `Last repetition, and <code>inst_valid</code> = 1: take <code>${esc(R.instText(r.inst))}</code> in this same cycle, so its first repetition goes out next cycle. No bubble.`; }
      else { t = '#fsm-t2'; why = 'Last repetition and nothing valid: go back to IDLE.'; }
      if (t) $(t).classList.add('on');
      const extra = [];
      if (r.bufValid) extra.push(`The buffer gets <code>${esc(R.bufText(r.buf))}</code> this cycle.`);
      if (r.peValid) extra.push(`The PEs get <code>${esc(R.peText(r.pe))}</code>: the PE half of the repetition issued in cycle ${c - 1}.`);
      if (r.write) extra.push(`The WRITE issued in cycle ${c - 1} commits to MEM2[${r.write.a}] at the end of this cycle.`);
      $('#ctl-title').textContent = `Cycle ${c}`;
      $('#ctl-body').innerHTML = `<p>${why}</p>${extra.length ? '<p>' + extra.join(' ') + '</p>' : ''}<p class="cap">Program: ${S.lines.map((l) => '<code>' + esc(l) + '</code>').join(', ')}, then the padding word. INST_COUNT = ${S.lines.length + 1}.</p>`;
    }
    $('#sch-prog').innerHTML = Object.keys(PROGS).map((k) => `<option value="${k}">${esc(PROGS[k][0])}</option>`).join('');
    $('#sch-prog').addEventListener('change', (e) => { prog = e.target.value; revealed.clear(); sel = null; build(); render(); });
    $('#sch-n').addEventListener('change', (e) => { N = Math.max(1, Math.min(8, Math.round(+e.target.value) || 1)); e.target.value = N; revealed.clear(); build(); render(); });
    $('#sch-hide').addEventListener('change', (e) => { hide = e.target.checked; revealed.clear(); render(); });
    build(); render(); pick(7);
    return { el };
  })();

  // ================================================================== TOP
  views.top = (function () {
    const el = $('#view-top');
    let P = 16, w = 16, pe = 0;
    function render() {
      const n = 32 / w;
      const bar = (cls) => `<div class="slbar ${cls}">${Array.from({ length: P }, (_, i) => `<div data-i="${i}" class="${i === pe ? 'on' : ''}" title="PE ${i}">${P <= 16 ? i : ''}</div>`).join('')}</div>`;
      const hi = 32 * (P - 1 - pe) + 31, lo = 32 * (P - 1 - pe);
      $('#sl-out').innerHTML = `<div class="cap" style="margin:0">matrix_data (MEM0 q), ${32 * P} bits, PE 0 on the left</div>${bar('m0')}<div class="slbits"><span>${32 * P - 1}</span><span>0</span></div>` +
        `<div class="cap">output_data (MEM2 d), the same order</div>${bar('m2')}<div class="slbits"><span>${32 * P - 1}</span><span>0</span></div>`;
      $$('#sl-out .slbar div').forEach((d) => { d.addEventListener('mouseenter', () => { pe = +d.dataset.i; render(); }); d.addEventListener('click', () => { pe = +d.dataset.i; render(); }); });
      const rowsOf = (t) => Array.from({ length: n }, (_, q) => { const k = n - 1 - q; return `row ${t * P * n + pe * n + (n - 1 - k)} (lane ${k})`; }).join(', ');
      $('#sl-title').textContent = `PE ${pe} of ${P}`;
      $('#sl-body').innerHTML = `<p><code>matrix_input</code> = <code>matrix_data[${hi}:${lo}]</code>, written <code>matrix_data[32*(${P}-1-${pe}) +: 32]</code>.</p><p><code>vector_output</code> drives <code>output_data[${hi}:${lo}]</code>, the same position.</p>` +
        `<p>Python equivalent: <code>read_mem0_output().cut(32)[${pe}]</code> in, <code>Bits().join(outputs)</code> out, with this PE's output at index ${pe}.</p><p>In INT${w} (${n} lane${n > 1 ? 's' : ''} per PE, ${P * n} rows per tile), this PE works on ${rowsOf(0)} in tile 0, and on those rows + ${P * n}·t in tile t.</p>`;
      $$('#sl-mode button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === w)));
    }
    $('#sl-p').addEventListener('change', (e) => { P = +e.target.value; pe = Math.min(pe, P - 1); render(); });
    $$('#sl-mode button').forEach((b) => b.addEventListener('click', () => { w = +b.dataset.w; render(); }));
    render();
    return { el };
  })();

  // ================================================================== VERIFY
  views.verify = (function () {
    const el = $('#view-verify');
    // what the official tests contain
    const st = F.stats;
    $('#vd-stats').innerHTML = '<tr><th>Test</th><th>Size</th><th>y = M·v range</th><th class="num">Outputs OUT clamps</th><th>Last 4 vector elements</th></tr>' +
      [['int8', 'INT8'], ['int16', 'INT16'], ['int32', 'INT32'], ['int8_v7', 'INT8, vector seed 7'], ['int16_v7', 'INT16, vector seed 7'], ['int32_v7', 'INT32, vector seed 7']].filter(([k]) => st[k]).map(([k, l]) => {
        const s = st[k];
        return `<tr><td>${l}</td><td>${s.rows} × ${s.cols}</td><td>${num(s.y_min)} … ${num(s.y_max)}</td><td class="num">${comma(s.clamped)} of ${comma(s.rows)} (${(100 * s.clamped / s.rows).toFixed(1)}%)</td><td>${s.v_last.map(num).join(', ')}</td></tr>`;
      }).join('');
    // the mismatch decoder
    const ex = (F.mismatch_examples.live_mode || {}).int16_v7;
    $('#mm').innerHTML = `<div class="cfgbar"><label>Mode <select id="mm-w"><option value="8">INT8</option><option value="16" selected>INT16</option><option value="32">INT32</option></select></label>
      <label>PEs <input type="number" id="mm-p" min="1" max="64" value="16"></label><label>diff line number <input type="number" id="mm-line" min="1" max="65536" value="${ex ? ex.row + 1 : 1}"></label></div>
      <div class="mmin"><label>Your line (result.bits, after <code>&lt;</code>)<textarea id="mm-got">${ex ? ex.got : ''}</textarea></label><label>Expected line (out.bits, after <code>&gt;</code>)<textarea id="mm-want">${ex ? ex.want : ''}</textarea></label></div>
      <div class="tscroll" id="mm-res"></div>`;
    function mm() {
      const w = +$('#mm-w').value, P = Math.max(1, +$('#mm-p').value | 0), line = Math.max(1, +$('#mm-line').value | 0), n = 32 / w;
      const clean = (s) => s.replace(/[^01xX]/g, '');
      const g = clean($('#mm-got').value), wv = clean($('#mm-want').value);
      if (g.length !== 32 * P || wv.length !== 32 * P) { $('#mm-res').innerHTML = `<p class="c-warn">Each line should be ${32 * P} bits for ${P} PEs (got ${g.length} and ${wv.length}).</p>`; return; }
      const tile = line - 1, rows = [];
      let bad = 0;
      for (let i = 0; i < P; i++) for (let q = 0; q < n; q++) {
        const k = n - 1 - q, off = 32 * i + q * w;
        const gs = g.slice(off, off + w), ws = wv.slice(off, off + w);
        const dec = (b) => (/x/i.test(b) ? 'x' : num(R.toS(B('0b' + b), w)));
        const okk = gs === ws; if (!okk) bad++;
        rows.push(`<tr><td>PE ${i}</td><td>lane ${k}</td><td class="num">${tile * P * n + i * n + (n - 1 - k)}</td><td class="num ${okk ? '' : 'bad'}">${dec(gs)}</td><td class="num">${dec(ws)}</td></tr>`);
      }
      $('#mm-res').innerHTML = `<p><b>MEM2[${tile}]</b> = tile ${tile}: matrix rows ${tile * P * n} to ${(tile + 1) * P * n - 1}. ${bad} of ${P * n} lanes differ.</p><table class="ref mmt"><tr><th>PE</th><th>lane</th><th class="num">row of M</th><th class="num">yours</th><th class="num">expected</th></tr>${rows.join('')}</table>`;
    }
    $$('#mm select, #mm input, #mm textarea').forEach((x) => x.addEventListener('input', mm));
    mm();
    return { el };
  })();

  // ================================================================== READ THE CODE
  views.code = (function () {
    const el = $('#view-code');
    function showFile(fid) {
      const sec = document.getElementById(fid);
      if (!sec || !sec.classList.contains('rfile')) return false;
      $$('.rfile', el).forEach((s) => { s.hidden = s !== sec; });
      $$('.rfbtn', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.file === fid)));
      store.set('code-file', fid);
      return true;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.rfbtn, .rfjump');
      if (!b) return;
      showFile(b.dataset.file);
      if (b.classList.contains('rfjump')) $('.rfbar', el).scrollIntoView({ block: 'start' });
    });
    const saved = store.get('code-file', null);
    const first = $('.rfile', el);
    if (first) showFile(saved && document.getElementById(saved) ? saved : first.id);
    return {
      el,
      go(id) {
        const target = document.getElementById(id);
        if (!target) return false;
        const sec = target.classList.contains('rfile') ? target : target.closest('.rfile');
        if (sec) showFile(sec.id);
        setTimeout(() => { target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); flash(target); }, 30);
        return true;
      },
    };
  })();

  views.primer = { el: $('#view-primer') };

  window.addEventListener('hashchange', route);
  route();
  window.__rtl = { R, D };
})();
