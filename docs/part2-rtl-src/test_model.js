// Checks model.js against real runs. Usage: node docs/part2-rtl-src/test_model.js
// 1. schedule() vs the recorded reference waveform (waves.json), cycle by cycle
// 2. peStep() fed with the recorded PE inputs and instructions vs the recorded accumulators and outputs
// 3. peStep() vs the staff tb_pe run (facts.json)
// 4. rndLane() vs an exact divmod reference on random inputs
// 5. vdec() vs the recorded vector_data
// 6. sxEval() vs Icarus Verilog itself (skipped if iverilog isn't installed)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const M = require('./model.js');
const HERE = __dirname;
const waves = JSON.parse(fs.readFileSync(path.join(HERE, 'waves.json'), 'utf8'));
const facts = JSON.parse(fs.readFileSync(path.join(HERE, 'facts.json'), 'utf8'));
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };
const B = BigInt;
const hex = (h) => B('0x' + h);

// ---------------------------------------------------------------- 1. schedule vs the recording
const ref = waves.designs.ref, S = ref.signals;
const prog = ref.asm.map(M.assemble);
const sch = M.schedule(prog, prog.length + 1);
ok(sch.took === ref.took, `took ${sch.took} vs recorded ${ref.took}`);
for (let c = 1; c < ref.cycles; c++) {
  const r = sch.rows[c];
  if (!r) { ok(false, `schedule ends early at cycle ${c}`); break; }
  const rec = (k) => S[k].v[c];
  ok(r.pc === parseInt(rec('pc'), 16), `c${c} pc ${r.pc} vs ${rec('pc')}`);
  ok(+r.begins === +rec('begins'), `c${c} begins`);
  ok((r.st === 'EXEC' ? 1 : 0) === parseInt(rec('state'), 16), `c${c} state`);
  ok(+r.bufValid === +rec('buf_valid'), `c${c} buf_valid`);
  ok(+r.peValid === +rec('pe_valid'), `c${c} pe_valid`);
  ok(+(!!r.write) === +(rec('m2_gwen') === '0'), `c${c} MEM2 write`);
  if (r.write) ok(r.write.a === parseInt(rec('m2_a'), 16), `c${c} MEM2 address`);
  ok(r.rem === parseInt(rec('remaining'), 16), `c${c} remaining ${r.rem} vs ${rec('remaining')}`);
  if (r.bufValid) {
    const b = M.decBuf(rec('buf_inst'));
    ok(b.op === r.buf.op && b.mode === r.buf.mode && b.a === r.buf.a && b.b === r.buf.b, `c${c} buf_inst ${JSON.stringify(b)} vs ${JSON.stringify(r.buf)}`);
  }
  if (r.peValid) {
    const p = M.decPe(rec('pe_inst'));
    ok(p.op === r.pe.op && p.mode === r.pe.mode && p.value === r.pe.value, `c${c} pe_inst`);
  }
  ok(+r.done === +rec('done'), `c${c} simulation_complete`);
}

// ---------------------------------------------------------------- 2. the PE model on the recorded inputs
for (const pe of [0, 1]) {
  let regs = { acc: 0n, out: 0n };
  for (let c = 0; c + 1 < ref.cycles; c++) {
    const valid = S.pe_valid.v[c] === '1';
    const p = M.decPe(S.pe_inst.v[c]);
    const w = M.W_OF_MODE[p.mode];
    const md = hex(S.matrix_data.v[c]);
    const A = hex(S.vector_data.v[c]);
    const Bw = (md >> B(32 * (1 - pe))) & 0xffffffffn;           // PE 0 = the most significant slice
    const op = p.op === 1 ? 'RND' : M.PE_VALS[p.value];
    const nx = M.peStep(Object.assign({ A, B: Bw }, regs), op, w, p.value, valid);
    regs = { acc: nx.acc, out: nx.out };
    ok(regs.acc === hex(S['acc' + pe].v[c + 1]), `PE${pe} acc after cycle ${c}: ${regs.acc.toString(16)} vs ${S['acc' + pe].v[c + 1]}`);
    ok(regs.out === hex(S['out' + pe].v[c + 1]), `PE${pe} out after cycle ${c}`);
  }
}

// ---------------------------------------------------------------- 3. the staff tb_pe program (MAC INT8, OUT INT8, padding MAC)
{
  const t = facts.tb['pe|icarus'];
  let r = { acc: 0n, out: 0n, A: 0xfe000302n, B: 0xfcfcfcfcn };
  r = Object.assign(r, M.peStep(r, 'MAC', 8, 0));
  ok(r.acc === hex(t.acc_changes[0][1]), 'tb_pe acc after the MAC');
  r = Object.assign(r, M.peStep(r, 'OUT', 8, 0));
  ok(r.out === hex(t.out_changes[0][1]), 'tb_pe out after the OUT');
  r = Object.assign(r, M.peStep(r, 'MAC', 8, 0));
  ok(r.acc === hex(t.final.acc), 'tb_pe acc after the padding MAC');
}

// ---------------------------------------------------------------- 4. RND vs exact rounding
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  const exact = (x, s) => {             // nearest, ties to even, by exact integer arithmetic
    if (s === 0) return x;
    const d = 1n << B(s);
    let q = x / d; if ((x % d !== 0n) && (x < 0n)) q -= 1n;    // floor
    const r = x - q * d;
    if (2n * r > d || (2n * r === d && (q & 1n) === 1n)) q += 1n;
    return q;
  };
  for (const w of [16, 32, 64]) {
    for (let i = 0; i < 4000; i++) {
      const bits = B(rnd()) * B(rnd()) * B(rnd());
      const x = M.toS(bits, w);
      const s = rnd() % 32;
      const got = M.rndLane(x, w, s).result;
      ok(got === M.toS(exact(x, s), w), `rnd w=${w} x=${x} s=${s}: ${got} vs ${exact(x, s)}`);
    }
  }
  // the public test from Part 1: INT8 acc lanes [5, -5, 3, -3], s = 1 -> [2, -2, 2, -2]
  ok([5n, -5n, 3n, -3n].map((x) => M.rndLane(x, 16, 1).result).join() === '2,-2,2,-2', 'rnd public example');
}

// ---------------------------------------------------------------- 5. vector_decoder vs the recording
for (let c = 0; c < ref.cycles; c++) {
  const mode = parseInt(S.mode_q.v[c], 16);
  if (mode > 2) continue;
  const d = M.vdec(hex(S.m1_q.v[c]), 0, parseInt(S.memb_q.v[c], 16), M.W_OF_MODE[mode]);
  ok(d.data === hex(S.vector_data.v[c]), `c${c} vector_data ${d.data.toString(16)} vs ${S.vector_data.v[c]}`);
}
for (const w of [8, 16, 32]) for (let off = 0; off < 64; off++) {
  ok(M.vdec(0n, off, off, w).addr === off >> { 8: 2, 16: 1, 32: 0 }[w], `vdec address w=${w} off=${off}`);
}

// ---------------------------------------------------------------- 6. the signedness rules vs Icarus
let ivl = null;
try { ivl = execFileSync('which', ['iverilog']).toString().trim(); } catch (e) { ivl = null; }
if (ivl) {
  const cases = [];
  for (const [acc, a, b] of [[10, -2, 3], [0, -128, -128], [-300, 127, -1], [5, 3, 4], [-1, -1, -1], [32767, 1, 1]]) {
    for (let m = 0; m < 8; m++) cases.push({ acc, a, b, sAcc: !!(m & 4), sA: !!(m & 2), sB: !!(m & 1) });
  }
  const w = (x, s) => (s ? `$signed(${x})` : x);
  const sv = ['module t; logic [15:0] acc, r; logic [7:0] a, b; initial begin'];
  cases.forEach((k) => {
    sv.push(`  acc = 16'd${Number(M.toU(k.acc, 16))}; a = 8'd${Number(M.toU(k.a, 8))}; b = 8'd${Number(M.toU(k.b, 8))};`);
    sv.push(`  r = ${w('acc', k.sAcc)} + ${w('a', k.sA)} * ${w('b', k.sB)}; $display("%0d", r);`);
  });
  sv.push('end endmodule');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sx-'));
  fs.writeFileSync(path.join(dir, 't.sv'), sv.join('\n'));
  execFileSync('iverilog', ['-g2012', '-o', path.join(dir, 't.vvp'), path.join(dir, 't.sv')]);
  const outs = execFileSync('vvp', ['-n', path.join(dir, 't.vvp')]).toString().trim().split('\n').filter((l) => /^\d+$/.test(l)).map(Number);
  ok(outs.length === cases.length, `icarus printed ${outs.length} results for ${cases.length} cases`);
  cases.forEach((k, i) => ok(Number(M.sxEval(k).sum) === outs[i], `sx ${JSON.stringify(k)}: model ${M.sxEval(k).sum} vs icarus ${outs[i]}`));
  fs.rmSync(dir, { recursive: true, force: true });
} else console.log('(iverilog not found: skipped the signedness check)');

console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
