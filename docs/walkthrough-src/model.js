/* Bit-accurate model of the EE271 SIMD accelerator, used only to drive the walkthrough's
   animations. It follows the handout (Project_Part_1.pdf, section 3) and the starter's
   compiler.py / assembler.py conventions. Every register and memory word is an unsigned
   BigInt; lane k = bits [k*w, (k+1)*w) counted from the least significant end. */
(function (root) {
  'use strict';
  const B = BigInt;
  const mask = (w) => (1n << B(w)) - 1n;
  const toU = (v, w) => BigInt.asUintN(w, B(v));   // wrap into w-bit unsigned
  const toS = (v, w) => BigInt.asIntN(w, B(v));    // wrap into w-bit signed

  function getLane(word, w, k) { return toS((word >> B(k * w)) & mask(w), w); }
  // out[k] = lane k (k = 0 is the least significant lane)
  function lanesOf(word, width, w) {
    const out = [];
    for (let k = 0; k < width / w; k++) out.push(getLane(word, w, k));
    return out;
  }
  function packLanes(vals, w) {
    let word = 0n;
    vals.forEach((v, k) => { word |= toU(v, w) << B(k * w); });
    return word;
  }
  function clamp(x, w) {
    const lo = -(1n << B(w - 1)), hi = (1n << B(w - 1)) - 1n;
    return x < lo ? lo : x > hi ? hi : x;
  }
  // x / 2^s rounded to nearest, ties to even, in exact integer arithmetic.
  function roundHalfEven(x, s) {
    if (s === 0) return x;
    const S = B(s);
    const q = x >> S;                 // BigInt >> floors toward -infinity
    const r = x - (q << S);           // 0 <= r < 2^s
    const half = 1n << (S - 1n);
    if (r > half) return q + 1n;
    if (r < half) return q;
    return (q & 1n) ? q + 1n : q;     // exactly halfway: pick the even neighbour
  }

  const MODE_CODE = { 8: 0, 16: 1, 32: 2 };
  const MEM_OP = { READ: 0, WRITE: 1, NOP: 2 };
  const PE_SUB = { MAC: 0, NOP: 1, OUT: 2, PASS: 3, CLR: 4 };

  class PE {
    constructor(cfg) {
      this.cfg = cfg || { IN: 32, ACC: 64, OUT: 32 };
      this.a = 0n; this.b = 0n; this.acc = 0n; this.out = 0n;
    }
    geometry(w) {
      const n = this.cfg.IN / w;
      return { n, inW: w, accW: this.cfg.ACC / n, outW: this.cfg.OUT / n };
    }
    clone() { const p = new PE(this.cfg); Object.assign(p, { a: this.a, b: this.b, acc: this.acc, out: this.out }); return p; }
    exec(op, w, s) {
      s = s || 0;
      const g = this.geometry(w);
      const A = lanesOf(this.a, this.cfg.IN, g.inW);
      const Bv = lanesOf(this.b, this.cfg.IN, g.inW);
      const C = lanesOf(this.acc, this.cfg.ACC, g.accW);
      const d = { op, w, s, g, A, B: Bv, accBefore: C, outBefore: lanesOf(this.out, this.cfg.OUT, g.outW), lanes: [] };
      if (op === 'MAC') {
        const next = C.map((c, k) => {
          const prod = A[k] * Bv[k], exact = c + prod, after = toS(exact, g.accW);
          d.lanes.push({ k, a: A[k], b: Bv[k], prod, before: c, exact, after, wrapped: after !== exact });
          return after;
        });
        this.acc = packLanes(next, g.accW);
      } else if (op === 'OUT') {
        const o = C.map((c, k) => {
          const v = clamp(c, g.outW);
          d.lanes.push({ k, before: c, after: v, clamped: v !== c });
          return v;
        });
        this.out = packLanes(o, g.outW);
      } else if (op === 'PASS') {
        A.forEach((a, k) => d.lanes.push({ k, a, before: C[k], after: a }));
        this.acc = packLanes(A, g.accW);          // packing a negative lane wider = sign extension
      } else if (op === 'CLR') {
        this.acc = 0n; this.out = 0n;
      } else if (op === 'RND') {
        const next = C.map((c, k) => {
          const r = roundHalfEven(c, s);
          d.lanes.push({ k, before: c, after: r });
          return r;
        });
        this.acc = packLanes(next, g.accW);
      } else if (op !== 'NOP') {
        throw new Error('unknown PE op ' + op);
      }
      d.accAfter = lanesOf(this.acc, this.cfg.ACC, g.accW);
      d.outAfter = lanesOf(this.out, this.cfg.OUT, g.outW);
      return d;
    }
  }

  class MainBuffer {
    constructor(cfg) {
      this.cfg = cfg;                        // { M0W, M1W, M2W } (depths are not needed here)
      this.mem0 = []; this.mem1 = []; this.mem2 = [];
      this.p0 = 0n; this.p1 = 0n; this.p2 = 0n;
    }
    word(mem, i) { return mem[i] === undefined ? 0n : mem[i]; }
    exec(op, w, offA, offB) {
      const d = { op, w, offA, offB };
      if (op === 'READ') {
        this.p0 = this.word(this.mem0, offA);
        const per = this.cfg.M1W / w, selBits = Math.log2(per);
        const addr = offB >> selBits, sel = offB & (per - 1);
        const piece = (this.word(this.mem1, addr) >> B(sel * w)) & mask(w);
        let rep = 0n;
        for (let k = 0; k < per; k++) rep |= piece << B(k * w);
        this.p1 = rep;
        Object.assign(d, { m0addr: offA, m1addr: addr, sel, per, selBits, piece: toS(piece, w) });
      } else if (op === 'WRITE') {
        this.mem2[offA] = this.p2;
        d.m2addr = offA;
      } else if (op !== 'NOP') {
        throw new Error('unknown memory op ' + op);
      }
      return d;
    }
  }

  // inst = { mem: {op, w, offA, offB}, pe: {op, w, s}, count, incA, incB }  (count = repeats - 1)
  class Accelerator {
    constructor(P, opts) {
      opts = opts || {};
      this.P = P; this.N = opts.N || 16;
      this.order = opts.order || 'mem-first';
      this.pes = Array.from({ length: P }, () => new PE());
      this.mb = new MainBuffer({ M0W: 32 * P, M1W: 32, M2W: 32 * P });
    }
    feed() {
      const P = this.P;
      this.pes.forEach((pe, i) => {
        pe.b = (this.mb.p0 >> B((P - 1 - i) * 32)) & mask(32);   // PE 0 takes the leftmost (most significant) slice
        pe.a = this.mb.p1;                                       // every PE gets the same MEM1 word
      });
    }
    collect() {
      const P = this.P;
      let w = 0n;
      this.pes.forEach((pe, i) => { w |= pe.out << B((P - 1 - i) * 32); });
      this.mb.p2 = w;                                            // same position out as in
    }
    rep(inst, k) {
      const lim = 2 ** this.N;
      const offA = (inst.mem.offA + k * inst.incA) % lim;
      const offB = (inst.mem.offB + k * inst.incB) % lim;
      let md, pd;
      if (this.order === 'mem-first') {
        md = this.mb.exec(inst.mem.op, inst.mem.w, offA, offB);
        this.feed();
        pd = this.pes.map((pe) => pe.exec(inst.pe.op, inst.pe.w, inst.pe.s));
      } else {                      // the wrong order, used to show why the order matters
        this.feed();
        pd = this.pes.map((pe) => pe.exec(inst.pe.op, inst.pe.w, inst.pe.s));
        md = this.mb.exec(inst.mem.op, inst.mem.w, offA, offB);
      }
      this.collect();
      return { k, offA, offB, md, pd };
    }
    exec(inst) {
      const out = [];
      for (let k = 0; k <= inst.count; k++) out.push(this.rep(inst, k));
      return out;
    }
  }

  // Port of compiler.compile_matrix_vector_multiplication (without the zero padding to full depth).
  function compile(M, v, P, w) {
    const rows = M.length, cols = M[0].length, lanes = 32 / w, R = P * lanes;
    const blocks = Math.ceil(rows / R), mode = 'INT' + w;
    const mem0 = [], mem0Meta = [], program = [];
    for (let b = 0; b < blocks; b++) {
      for (let j = 0; j < cols; j++) {
        const elems = [], rowIds = [];
        for (let e = 0; e < R; e++) {
          const r = b * R + e;
          elems.push(r < rows ? M[r][j] : 0); rowIds.push(r);
        }
        let word = 0n;
        for (const x of elems) word = (word << B(w)) | toU(x, w);   // first element ends up most significant
        mem0.push(word); mem0Meta.push({ block: b, col: j, rowIds, elems });
      }
      program.push(`NOP | CLR ${mode} | 1 0 0`);
      program.push(`READ ${mode} ${b * cols} 0 | MAC ${mode} | ${cols} 1 1`);
      program.push(`NOP | OUT ${mode} | 1 0 0`);
      program.push(`WRITE ${b} | NOP ${mode} | 1 0 0`);
    }
    const per = 32 / w, vwords = Math.ceil(v.length / per), mem1 = [], mem1Meta = [];
    for (let c = 0; c < vwords; c++) {
      const sub = [], ids = [];
      for (let e = 0; e < per; e++) { const i = c * per + e; sub.push(i < v.length ? v[i] : 0); ids.push(i); }
      const rev = sub.slice().reverse();
      let word = 0n;
      for (const x of rev) word = (word << B(w)) | toU(x, w);
      mem1.push(word); mem1Meta.push({ ids, sub });
    }
    return { rows, cols, lanes, R, blocks, per, mode, mem0, mem0Meta, mem1, mem1Meta, program };
  }

  // Port of compiler.extract_results_from_memory: cut each MEM2 word into w-bit pieces, left to right.
  function extract(mem2, rows, P, w) {
    const per = (P * 32) / w, entries = Math.ceil(rows / per), out = [];
    for (let e = 0; e < entries; e++) {
      const word = mem2[e] === undefined ? 0n : mem2[e];
      for (let k = per - 1; k >= 0; k--) out.push(toS((word >> B(k * w)) & mask(w), w));
    }
    return out.slice(0, rows);
  }

  // Port of assembler.convert_instruction (text -> fields), keeping the raw field values too.
  function assemble(text) {
    const parts = text.trim().toUpperCase().split('|').map((s) => s.trim());
    if (parts.length !== 3) throw new Error('Malformed instruction: ' + text);
    const mt = parts[0].split(' '), pt = parts[1].split(' '), ct = parts[2].split(' ');
    const mem = { op: mt[0], modeCode: 0, offA: 0, offB: 0 };
    if (mem.op === 'WRITE') mem.offA = parseInt(mt[1], 10);
    if (mem.op === 'READ') {
      mem.modeCode = MODE_CODE[parseInt(mt[1].slice(3), 10)];
      mem.offA = parseInt(mt[2], 10); mem.offB = parseInt(mt[3], 10);
    }
    mem.w = 8 * 2 ** mem.modeCode;
    const pe = { op: pt[0], modeCode: MODE_CODE[parseInt(pt[1].slice(3), 10)], s: 0 };
    pe.w = 8 * 2 ** pe.modeCode;
    if (pe.op === 'RND') { pe.opcode = 1; pe.s = parseInt(pt[2], 10); pe.value = pe.s; }
    else { pe.opcode = 0; pe.value = PE_SUB[pe.op]; }
    const reps = parseInt(ct[0], 10);
    return { text, mem, pe, reps, count: reps - 1, incA: parseInt(ct[1], 10), incB: parseInt(ct[2], 10) };
  }

  // Field-by-field machine code, in the order Instruction.get_instruction() joins them.
  function encode(inst, N) {
    const bits = (v, n) => toU(v, n).toString(2).padStart(n, '0');
    return [
      { name: 'mem opcode', grp: 'mem', n: 2, v: MEM_OP[inst.mem.op], bits: bits(MEM_OP[inst.mem.op], 2) },
      { name: 'mem mode', grp: 'mem', n: 2, v: inst.mem.modeCode, bits: bits(inst.mem.modeCode, 2) },
      { name: 'MemAOffset', grp: 'mem', n: N, v: inst.mem.offA, bits: bits(inst.mem.offA, N) },
      { name: 'MemBOffset', grp: 'mem', n: N, v: inst.mem.offB, bits: bits(inst.mem.offB, N) },
      { name: 'PE opcode', grp: 'pe', n: 2, v: inst.pe.opcode, bits: bits(inst.pe.opcode, 2) },
      { name: 'PE mode', grp: 'pe', n: 2, v: inst.pe.modeCode, bits: bits(inst.pe.modeCode, 2) },
      { name: 'PE value', grp: 'pe', n: 5, v: inst.pe.value, bits: bits(inst.pe.value, 5) },
      { name: 'Count', grp: 'ctl', n: N, v: inst.count, bits: bits(inst.count, N) },
      { name: 'MemAIncrement', grp: 'ctl', n: 1, v: inst.incA, bits: bits(inst.incA, 1) },
      { name: 'MemBIncrement', grp: 'ctl', n: 1, v: inst.incB, bits: bits(inst.incB, 1) },
    ];
  }

  // Deterministic small-integer generator for the "random" example matrices.
  function lcg(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  const api = { mask, toU, toS, getLane, lanesOf, packLanes, clamp, roundHalfEven, MODE_CODE, MEM_OP, PE_SUB,
    PE, MainBuffer, Accelerator, compile, extract, assemble, encode, lcg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SIMD = api;
})(typeof window !== 'undefined' ? window : globalThis);
