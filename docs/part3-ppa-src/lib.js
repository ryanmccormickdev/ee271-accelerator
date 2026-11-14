// lib.js: the page's arithmetic, with no DOM. In the browser it becomes window.PPA; test_lib.js runs it in Node.
// Everything here is either the FoM definition from handouts/Project_Part_3.md, the cycle model derived on the
// "Cycle model" tab (checked against every recorded run in data/cycles.json), a parser for the text lines
// dc_synth.tcl writes into results.txt, or the multiplier-sharing arithmetic shown on the "Multiplier sharing" tab.
(function (root) {
  'use strict';
  const TESTS = { INT8: { rows: 1024, cols: 1024, lanes: 4 }, INT16: { rows: 512, cols: 512, lanes: 2 }, INT32: { rows: 256, cols: 256, lanes: 1 } };
  const MODES = ['INT8', 'INT16', 'INT32'];
  const EXP = 2.3, SCALE = 1e-15, AREA_CAP = 1e6;

  // ------------------------------------------------------------------ cycle model
  function tiles(P, mode, t) { t = t || TESTS[mode]; return Math.ceil(t.rows / (P * t.lanes)); }
  // o.cyclesPerRep (1 = one repetition per cycle), o.bubblesPerInstr (idle cycles before each instruction but the first),
  // o.extraDrain (extra cycles at the end, e.g. one per added pipeline stage). Defaults give the zero-bubble model.
  function cycles(P, mode, o, t) {
    o = o || {}; t = t || TESTS[mode];
    const n = tiles(P, mode, t), cpr = o.cyclesPerRep || 1, b = o.bubblesPerInstr || 0;
    return n * ((t.cols + 3) * cpr + 4 * b) + 8 + (o.extraDrain || 0);
  }
  function sumCycles(P, o) { return MODES.reduce((s, m) => s + cycles(P, m, o), 0); }
  // the instruction memory has to hold the program plus the all-zero word, and INST_COUNT = lines + 1 has to fit in
  // instruction_count, which is IMEM_ADDR_WIDTH = ceil(log2(depth)) bits wide
  function imem(P) {
    const lines = 4 * tiles(P, 'INT8');             // the same for all three official tests
    const instCount = lines + 1;
    let depth = 128;
    while (depth < instCount + 1) depth *= 2;
    return { lines, instCount, depth, defaultOk: instCount + 1 <= 128 };
  }
  // smallest P that reaches t tiles on the official tests (tiles = ceil(256 / P) for all three)
  function efficientP(t) { return Math.ceil(256 / t); }

  // ------------------------------------------------------------------ figure of merit
  function fom(c8, c16, c32, period, area, powerMw) {
    const T8 = c8 * period, T16 = c16 * period, T32 = c32 * period, T = T8 + T16 + T32;
    const ok = [c8, c16, c32, period, area, powerMw].every((x) => Number.isFinite(x) && x > 0);
    return { T8, T16, T32, T, fom: ok ? Math.pow(T, EXP) * area * powerMw * SCALE : NaN };
  }
  // positive = better (FoM went down)
  function pctImprovement(ref, now) { return (ref - now) / ref * 100; }
  function factors(base, cur) {
    const rT = Math.pow(cur.T / base.T, EXP), rA = cur.area / base.area, rP = cur.power / base.power;
    return { rT, rA, rP, ratio: rT * rA * rP };
  }
  // FoM relative to P = 16, for a design whose area is aFixed + P * aPe and whose power is proportional to its area
  function relFomPE(P, o) {
    const A = o.aFixed + P * o.aPe, A0 = o.aFixed + 16 * o.aPe;
    return Math.pow(sumCycles(P, o) / sumCycles(16, o), EXP) * Math.pow(A / A0, 2);
  }
  // FoM relative to the reference period tau0: power = area * (d * tau0 / tau + (1 - d)) in units of the reference,
  // area grows by g (a fraction) for every 10% the period is cut below tau0 and stays put above it
  function relFomPeriod(tau, o) {
    const cut = Math.max(0, (o.tau0 - tau) / o.tau0), a = 1 + o.g * (cut / 0.1);
    return Math.pow(tau / o.tau0, EXP) * a * a * (o.d * o.tau0 / tau + (1 - o.d));
  }

  // ------------------------------------------------------------------ results.txt / testbench output parser
  const UNIT_MW = { W: 1e3, mW: 1, uW: 1e-3, 'µW': 1e-3, nW: 1e-6, pW: 1e-9 };
  const NUM = '([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?)';
  function toMw(v, u) { const k = UNIT_MW[u]; return k === undefined ? NaN : parseFloat(v) * k; }
  function detectMode(s) {
    let m = null;
    const re = /\b(?:int(8|16|32)_test|INT(8|16|32))\b/gi;
    let x;
    while ((x = re.exec(s))) m = 'INT' + (x[1] || x[2]);
    return m;
  }
  function parseText(text) {
    const r = { period: null, slacks: [], worstSlack: null, dynMw: null, leakMw: null, rowTotalMw: null, totalMw: null,
      area: null, cycles: {}, runs: 0, notes: [], unparsed: [], cycleLines: [] };
    let lines = String(text || '').replace(/\r/g, '').split('\n');
    const areaIdx = lines.map((l, i) => (/Total cell area/i.test(l) ? i : -1)).filter((i) => i >= 0);
    r.runs = areaIdx.length;
    let dcLines = lines;
    if (areaIdx.length > 1) {
      dcLines = lines.slice(areaIdx[areaIdx.length - 2] + 1);
      r.notes.push(`This text holds ${areaIdx.length} synthesis runs (dc_synth.tcl appends to results.txt with >>, so run make clean between runs). Only the last run is used.`);
    }
    let pending = [];
    // testbench lines, anywhere in the full text
    let sinceLast = '';
    for (const l of lines) {
      const m = l.match(/Computation took\s+(\d+)\s+clock cycles/i);
      if (m) {
        const mode = detectMode(sinceLast) || detectMode(l);
        r.cycleLines.push({ n: parseInt(m[1], 10), mode });
        sinceLast = '';
      } else sinceLast += '\n' + l;
    }
    const order = MODES.slice();
    for (const c of r.cycleLines) {
      if (c.mode && r.cycles[c.mode] === undefined) { r.cycles[c.mode] = c.n; continue; }
      if (c.mode && r.cycles[c.mode] !== undefined) { r.notes.push(`Two cycle counts for ${c.mode}; kept the first (${r.cycles[c.mode]}).`); continue; }
      pending.push(c);
    }
    for (const c of pending) {
      const m = order.find((x) => r.cycles[x] === undefined);
      if (m) { r.cycles[m] = c.n; r.notes.push(`A cycle count without a mode name (${c.n}) was taken as ${m}, by order. Check it.`); }
    }
    // DC lines
    for (const raw of dcLines) {
      const l = raw.trim();
      if (!l) continue;
      let m;
      if (r.period === null && (m = l.match(new RegExp('^' + NUM + '\\s*;?$')))) { r.period = parseFloat(m[1]); continue; }
      if ((m = l.match(new RegExp('slack\\s*\\(([^)]*)\\)\\s*' + NUM, 'i')))) { r.slacks.push({ kind: m[1].trim(), v: parseFloat(m[2]) }); continue; }
      if ((m = l.match(new RegExp('Total\\s+Dynamic\\s+Power\\s*=\\s*' + NUM + '\\s*(W|mW|uW|µW|nW|pW)', 'i')))) { r.dynMw = toMw(m[1], m[2]); continue; }
      if ((m = l.match(new RegExp('Cell\\s+Leakage\\s+Power\\s*=\\s*' + NUM + '\\s*(W|mW|uW|µW|nW|pW)', 'i')))) { r.leakMw = toMw(m[1], m[2]); continue; }
      if ((m = l.match(new RegExp('Total\\s+cell\\s+area\\s*:\\s*' + NUM, 'i')))) { r.area = parseFloat(m[1]); continue; }
      if (/^Total\b/i.test(l)) {
        const pairs = [...l.matchAll(new RegExp(NUM + '\\s*(W|mW|uW|µW|nW|pW)\\b', 'g'))];
        if (pairs.length >= 4) { r.rowTotalMw = toMw(pairs[3][1], pairs[3][2]); continue; }
      }
      if (/Computation took/i.test(l)) continue;
      // test and make chatter is expected in a paste; only list what might be DC output
      if (/ivd-|tb_top|^\[\d+\]|^make\b|\bvcs\b|simv|Test (PASSED|FAILED)|EQUIVALENT|MISMATCH|^cd /.test(l)) continue;
      r.unparsed.push(l);
    }
    if (r.slacks.length) r.worstSlack = Math.min(...r.slacks.map((s) => s.v));
    if (r.dynMw !== null && r.leakMw !== null) r.totalMw = r.dynMw + r.leakMw;
    else if (r.rowTotalMw !== null) r.totalMw = r.rowTotalMw;
    if (r.rowTotalMw !== null && r.totalMw !== null && Math.abs(r.rowTotalMw - r.totalMw) > 0.02 * r.totalMw)
      r.notes.push(`The power table's Total column (${r.rowTotalMw.toPrecision(5)} mW) and dynamic + leakage (${r.totalMw.toPrecision(5)} mW) differ by more than 2%. Look at the report.`);
    return r;
  }

  // ------------------------------------------------------------------ multiplier sharing arithmetic (BigInt)
  const B = BigInt;
  const mask = (w) => (1n << B(w)) - 1n;
  const ux = (v, w) => B(v) & mask(w);
  const sx = (v, w) => { const u = ux(v, w); return (u >> B(w - 1)) & 1n ? u - (1n << B(w)) : u; };
  const bin = (v, w) => ux(v, w).toString(2).padStart(w, '0');
  function pack(lanes, w) { let x = 0n; lanes.forEach((v, k) => { x |= ux(B(v), w) << B(k * w); }); return x; }
  function unpack(word, w, n) { return Array.from({ length: n }, (_, k) => sx(B(word) >> B(k * w), w)); }
  // One way to run all three modes on four 17x17 signed multipliers. a, b are 32-bit words (BigInt).
  // Each multiplier gets two 17-bit signed operands; ext says how its 17th bit was made ('s' = copy of the sign bit, 'z' = 0).
  function share(a, b, mode) {
    a = ux(a, 32); b = ux(b, 32);
    const M = [];
    const add = (name, x, xe, y, ye, role) => M.push({ name, x, xe, y, ye, p: x * y, role });
    let concat, cross, lanes, w, n;
    if (mode === 'INT32') {
      const aH = sx(a >> 16n, 16), aL = ux(a, 16), bH = sx(b >> 16n, 16), bL = ux(b, 16);
      add('M0', aL, 'z', bL, 'z', 'a_lo × b_lo'); add('M1', aL, 'z', bH, 's', 'a_lo × b_hi');
      add('M2', aH, 's', bL, 'z', 'a_hi × b_lo'); add('M3', aH, 's', bH, 's', 'a_hi × b_hi');
      concat = (ux(M[3].p, 32) << 32n) | ux(M[0].p, 32);
      cross = ux((M[1].p + M[2].p) << 16n, 64);
      w = 64; n = 1;
    } else if (mode === 'INT16') {
      const a1 = sx(a >> 16n, 16), a0 = sx(a, 16), b1 = sx(b >> 16n, 16), b0 = sx(b, 16);
      add('M0', a0, 's', b0, 's', 'lane 0'); add('M1', 0n, '0', 0n, '0', 'idle (inputs held at 0)');
      add('M2', 0n, '0', 0n, '0', 'idle (inputs held at 0)'); add('M3', a1, 's', b1, 's', 'lane 1');
      concat = (ux(M[3].p, 32) << 32n) | ux(M[0].p, 32);
      cross = 0n; w = 32; n = 2;
    } else {
      const al = unpack(a, 8, 4), bl = unpack(b, 8, 4);
      for (let k = 0; k < 4; k++) add('M' + k, al[k], 's', bl[k], 's', 'lane ' + k);
      concat = M.reduce((s, m, k) => s | (ux(m.p, 16) << B(16 * k)), 0n);
      cross = 0n; w = 16; n = 4;
    }
    const sum = ux(concat + cross, 64);
    lanes = unpack(sum, w, n);
    const expect = mode === 'INT32' ? [sx(a, 32) * sx(b, 32)] : (() => { const lw = 32 / n; const A = unpack(a, lw, n), Bv = unpack(b, lw, n); return A.map((x, k) => x * Bv[k]); })();
    const ok = lanes.every((v, k) => v === expect[k]);
    return { mode, a, b, mults: M, concat, cross, sum, laneWidth: w, lanes, expect, ok };
  }

  // ILLUSTRATIVE sample for the calculator's parser. The DC lines are made up: their shape follows the grep commands at
  // the end of dc_synth.tcl (period echo, slack, "Total" power lines, cell leakage, "Total cell area") and DC's usual
  // report layout, not a real run. The three testbench lines are real (16 PEs, reference design, Icarus), and the
  // "cd software && ivd-cc ..." lines are the commands the staff Makefile echoes before each test.
  const SAMPLE = [
    '2.000',
    '  slack (VIOLATED)                                                   -0.2487',
    'Total Dynamic Power    =  28.5510 mW  (87%)',
    'Total                  2.4512e+04 uW     4.0390e+03 uW     4.2873e+06 nW     3.2838e+04 uW',
    'Cell Leakage Power     =   4.2873 mW',
    'Total cell area:               213456.780012',
    'cd software && ivd-cc matrix.npy vector.npy INT8 --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm mat_mul.asm',
    '[164405000] tb_top: Computation took 16440 clock cycles.',
    'cd software && ivd-cc matrix.npy vector.npy INT16 --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm mat_mul.asm',
    '[82485000] tb_top: Computation took 8248 clock cycles.',
    'cd software && ivd-cc matrix.npy vector.npy INT32 --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm mat_mul.asm',
    '[41525000] tb_top: Computation took 4152 clock cycles.',
  ].join('\n');

  const api = { TESTS, MODES, EXP, SCALE, AREA_CAP, SAMPLE, tiles, cycles, sumCycles, imem, efficientP, fom, pctImprovement, factors,
    relFomPE, relFomPeriod, parseText, toMw, share, ux, sx, bin, pack, unpack };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PPA = api;
})(typeof window !== 'undefined' ? window : globalThis);
