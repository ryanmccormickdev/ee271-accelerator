// Small models behind the page's widgets. Checked by test_model.js against the recorded waveforms (waves.json),
// the recorded testbench values (facts.json) and Icarus Verilog runs. Heads-up: schedule() is the reference
// design's timing contract written in JavaScript, so it is effectively a reference answer for the controller's timing.
(function (root) {
  'use strict';
  const B = BigInt;
  const mask = (w) => (1n << B(w)) - 1n;
  const toU = (v, w) => B.asUintN(w, B(v));
  const toS = (v, w) => B.asIntN(w, B(v));
  const getLane = (word, w, k) => toS((B(word) >> B(k * w)) & mask(w), w);
  const setLane = (word, w, k, v) => (B(word) & ~(mask(w) << B(k * w))) | (toU(v, w) << B(k * w));
  const MODES = { 0: 'INT8', 1: 'INT16', 2: 'INT32', 3: 'mode 3' };
  const MODE_OF_W = { 8: 0, 16: 1, 32: 2 };
  const W_OF_MODE = { 0: 8, 1: 16, 2: 32 };
  const BUF_OPS = { 0: 'READ', 1: 'WRITE', 2: 'NOP', 3: 'op 3' };
  const PE_VALS = { 0: 'MAC', 1: 'NOP', 2: 'OUT', 3: 'PASS', 4: 'CLR' };

  // ---------------------------------------------------------------- instruction fields (defines.sv, 16-bit counter)
  function decBuf(x) {
    const v = B(typeof x === 'string' ? '0x' + x : x);
    return { op: Number(v >> 34n), mode: Number((v >> 32n) & 3n), a: Number((v >> 16n) & 0xffffn), b: Number(v & 0xffffn) };
  }
  function decPe(x) {
    const v = B(typeof x === 'string' ? '0x' + x : x);
    return { op: Number(v >> 7n), mode: Number((v >> 5n) & 3n), value: Number(v & 31n) };
  }
  function decInst(x) {
    const v = B(typeof x === 'string' ? '0x' + x : x);
    return { buf: decBuf(v >> 27n), pe: decPe((v >> 18n) & 511n), count: Number((v >> 2n) & 0xffffn), inca: Number((v >> 1n) & 1n), incb: Number(v & 1n), zero: v === 0n };
  }
  const peName = (p) => (p.op === 1 ? 'RND' : p.op === 0 ? (PE_VALS[p.value] || 'value ' + p.value) : 'opcode ' + p.op);
  const bufText = (b) => BUF_OPS[b.op] + (b.op === 0 ? ` ${MODES[b.mode]} ${b.a} ${b.b}` : b.op === 1 ? ` ${b.a}` : '');
  const peText = (p) => peName(p) + ' ' + MODES[p.mode] + (p.op === 1 ? ' ' + p.value : '');
  const instText = (i) => `${bufText(i.buf)} | ${peText(i.pe)} | ${i.count + 1} ${i.inca} ${i.incb}`;
  const instShort = (i) => (i.zero ? 'all zeros (pad)' : `${BUF_OPS[i.buf.op]}|${peName(i.pe)}` + (i.count ? ' ×' + (i.count + 1) : ''));
  function encInst(i) {
    let v = B(i.buf.op);
    v = (v << 2n) | B(i.buf.mode); v = (v << 16n) | B(i.buf.a); v = (v << 16n) | B(i.buf.b);
    v = (v << 2n) | B(i.pe.op); v = (v << 2n) | B(i.pe.mode); v = (v << 5n) | B(i.pe.value);
    v = (v << 16n) | B(i.count); v = (v << 1n) | B(i.inca); v = (v << 1n) | B(i.incb);
    return v;
  }
  // a few lines of the staff assembler's syntax: "READ INT16 0 0 | MAC INT16 | 3 1 1" (written count, stored minus one)
  function assemble(line) {
    const [m, p, c] = line.toUpperCase().split('|').map((s) => s.trim().split(/\s+/));
    const modeOf = (s) => ({ INT8: 0, INT16: 1, INT32: 2 }[s]);
    const buf = { op: { READ: 0, WRITE: 1, NOP: 2 }[m[0]], mode: 0, a: 0, b: 0 };
    if (buf.op === 0) { buf.mode = modeOf(m[1]); buf.a = +m[2]; buf.b = +m[3]; }
    if (buf.op === 1) buf.a = +m[1];
    const vals = { MAC: 0, NOP: 1, OUT: 2, PASS: 3, CLR: 4 };
    const pe = p[0] === 'RND' ? { op: 1, mode: modeOf(p[1]), value: +p[2] } : { op: 0, mode: modeOf(p[1]), value: vals[p[0]] };
    const i = { buf, pe, count: +c[0] - 1, inca: +c[1], incb: +c[2] };
    i.zero = encInst(i) === 0n;
    return i;
  }
  const ZERO = decInst(0n);

  // ---------------------------------------------------------------- the timing contract (cycle n ends at the edge at 10n + 5 ns)
  // prog: list of instructions (padding not included), instCount: what the testbench passes as +INST_COUNT.
  function schedule(prog, instCount, opts) {
    const o = Object.assign({ reset: 5, maxCycles: 400 }, opts || {});
    const imem = (i) => (i < prog.length ? prog[i] : ZERO);
    let pc = 0, st = 'IDLE', cur = ZERO, rem = 0, offA = 0, offB = 0, peQ = { inst: ZERO.pe, valid: false }, wr = null, doneAt = null;
    const rows = [];
    for (let c = 0; c < o.maxCycles; c++) {
      const rst = c < o.reset;
      const instValid = !rst && pc < instCount;
      const inst = imem(pc);
      const last = st === 'EXEC' && rem === 0;
      const begins = instValid && (st === 'IDLE' || last);
      const bufValid = st === 'EXEC';
      const buf = { op: cur.buf.op, mode: cur.buf.mode, a: offA, b: offB };
      const write = wr;                                    // a WRITE issued last cycle commits at the end of this one
      const done = pc === instCount && !bufValid && !peQ.valid;
      rows.push({ c, rst, pc, inst, instValid, begins, st, rem, bufValid, buf, pe: peQ.inst, peValid: peQ.valid, write, done, last });
      if (done && doneAt === null) doneAt = c;
      if (doneAt !== null && c >= doneAt) break;
      if (rst) continue;
      // the edge at the end of cycle c
      peQ = { inst: cur.pe, valid: bufValid };
      wr = bufValid && buf.op === 1 ? { a: buf.a } : null;
      if (begins) { st = 'EXEC'; cur = inst; rem = inst.count; offA = inst.buf.a; offB = inst.buf.b; }
      else if (st === 'EXEC') { if (last) st = 'IDLE'; else { rem -= 1; offA = (offA + cur.inca) & 0xffff; offB = (offB + cur.incb) & 0xffff; } }
      if (begins) pc += 1;
    }
    return { rows, took: doneAt === null ? null : doneAt };
  }

  // ---------------------------------------------------------------- the PE's arithmetic (32-bit inputs, 64-bit acc, 32-bit out)
  function rndLane(x, w, s) {
    x = toS(x, w);
    if (s === 0) return { q: x, r: 0n, g: 0, st: 0, lsb: Number(toU(x, w) & 1n), up: false, result: x };
    const q = x >> B(s);                                   // BigInt >> floors, like >>> on a signed lane
    const r = x - (q << B(s));                             // 0 .. 2^s - 1
    const half = 1n << B(s - 1);
    const g = r >= half ? 1 : 0;
    const st = (r & (half - 1n)) !== 0n ? 1 : 0;
    const lsb = Number(toU(q, w + 40) & 1n);
    const up = g === 1 && (st === 1 || lsb === 1);
    return { q, r, half, g, st, lsb, up, result: toS(q + (up ? 1n : 0n), w) };
  }
  function clampLane(x, w) {
    const lo = -(1n << B(w - 1)), hi = (1n << B(w - 1)) - 1n;
    return x < lo ? { v: lo, how: 'low' } : x > hi ? { v: hi, how: 'high' } : { v: x, how: 'fits' };
  }
  // one rising edge with pe_inst = {op, w, s} (op: MAC | OUT | PASS | CLR | NOP | RND); returns the new registers and how each lane got there
  function peStep(regs, op, w, s, valid) {
    const n = 32 / w, aw = 64 / n;
    let acc = B(regs.acc), out = B(regs.out);
    const lanes = [];
    let accSrc = 'hold', outSrc = 'hold';
    if (valid !== false) {
      if (op === 'MAC') {
        accSrc = 'mac';
        for (let k = 0; k < n; k++) {
          const a = getLane(regs.A, w, k), b = getLane(regs.B, w, k), c = getLane(acc, aw, k);
          const exact = c + a * b, r = toS(exact, aw);
          lanes.push({ k, a, b, c, prod: a * b, exact, r, wrapped: r !== exact });
          acc = setLane(acc, aw, k, r);
        }
      } else if (op === 'OUT') {
        outSrc = 'clamp';
        for (let k = 0; k < n; k++) {
          const c = getLane(acc, aw, k), cl = clampLane(c, w);
          lanes.push({ k, c, r: cl.v, how: cl.how });
          out = setLane(out, w, k, cl.v);
        }
      } else if (op === 'PASS') {
        accSrc = 'pass';
        for (let k = 0; k < n; k++) { const a = getLane(regs.A, w, k); lanes.push({ k, a, r: a }); acc = setLane(acc, aw, k, a); }
      } else if (op === 'CLR') { accSrc = 'zero'; outSrc = 'zero'; acc = 0n; out = 0n; }
      else if (op === 'RND') {
        accSrc = 'rnd';
        for (let k = 0; k < n; k++) { const c = getLane(acc, aw, k), x = rndLane(c, aw, s); lanes.push(Object.assign({ k, c }, x, { r: x.result })); acc = setLane(acc, aw, k, x.result); }
      }
    }
    return { acc: toU(acc, 64), out: toU(out, 32), lanes, accSrc, outSrc, n, aw };
  }

  // ---------------------------------------------------------------- vector_decoder (defines.sv) and the MEM1 packing (ivd-cc)
  function packMem1(v, w) {
    const n = 32 / w, words = [];
    for (let e = 0; e * n < v.length; e++) { let x = 0n; for (let k = 0; k < n; k++) x = setLane(x, w, k, v[e * n + k] || 0); words.push(x); }
    return words;
  }
  function vdec(word, offLive, offReg, w) {
    const sh = { 8: 2, 16: 1, 32: 0 }[w], n = 32 / w;
    const addr = (offLive >> sh) & 0x3fff;
    const lane = offReg & (n - 1);
    let data = 0n; const x = getLane(word, w, lane);
    for (let k = 0; k < n; k++) data = setLane(data, w, k, x);
    return { addr, lane, value: x, data };
  }

  // ---------------------------------------------------------------- one INT8 MAC lane, evaluated by the SystemVerilog rules
  // acc_n[15:0] = acc[15:0] + a[7:0] * b[7:0], each operand optionally wrapped in $signed(...)
  function sxEval(o) {
    const W = 16, signedExpr = !!(o.sAcc && o.sA && o.sB);
    const ext = (bits, w) => (signedExpr ? toU(toS(bits, w), W) : toU(bits, W));
    const acc = toU(o.acc, 16), a = toU(o.a, 8), b = toU(o.b, 8);
    const ea = ext(a, 8), eb = ext(b, 8), ec = ext(acc, 16);
    const prod = toU(ea * eb, W), sum = toU(ec + prod, W);
    const want = toU(toS(acc, 16) + toS(a, 8) * toS(b, 8), W);
    return { W, signedExpr, a, b, acc, ea, eb, ec, prod, sum, want, ok: sum === want };
  }

  const api = { B, mask, toU, toS, getLane, setLane, MODES, MODE_OF_W, W_OF_MODE, BUF_OPS, PE_VALS, decBuf, decPe, decInst, encInst, assemble,
    peName, bufText, peText, instText, instShort, schedule, rndLane, clampLane, peStep, packMem1, vdec, sxEval, ZERO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RTL = api;
})(typeof window !== 'undefined' ? window : globalThis);
