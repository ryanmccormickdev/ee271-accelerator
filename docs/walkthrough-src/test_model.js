// node test_model.js : checks model.js against the public tests and the real compiler/assembler output.
const S = require('./model.js');
const fx = require('./fixtures.json');
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
const hexOf = (v, bits) => v.toString(16).padStart(bits / 4, '0');
// Bits().join([...]) with the first value most significant, like the public tests write their inputs
const join = (vals, w) => { let x = 0n; for (const v of vals) x = (x << BigInt(w)) | S.toU(v, w); return x; };

// ---------------------------------------------------------------- PE public tests
function peRun(a, b, prog) {
  const pe = new S.PE({ IN: 32, ACC: 64, OUT: 32 });
  pe.a = a; pe.b = b;
  for (const line of prog) {
    const t = line.split(' ');
    pe.exec(t[0], parseInt(t[1].slice(3), 10), t[2] ? parseInt(t[2], 10) : 0);
  }
  return pe;
}
const peTests = [
  ['INT32 MAC', join([1073741824], 32), join([2], 32), ['MAC INT32', 'OUT INT32'], '7fffffff'],
  ['INT32 PASS', join([15], 32), join([-6], 32), ['PASS INT32', 'OUT INT32'], '0000000f'],
  ['INT32 RND', join([15], 32), join([-6], 32), ['PASS INT32', 'RND INT32 2', 'OUT INT32'], '00000004'],
  ['INT16 MAC', join([-20000, 20000], 16), join([2, 2], 16), ['MAC INT16', 'OUT INT16'], '80007fff'],
  ['INT16 PASS', join([-15, 7], 16), join([8, 3], 16), ['PASS INT16', 'OUT INT16'], 'fff10007'],
  ['INT16 RND', (0xABCDn << 16n) | 0xEF00n, join([8, 3], 16), ['PASS INT16', 'RND INT16 8', 'OUT INT16'], 'ffacffef'],
  ['INT8 MAC', join([100, -100, 3, -3], 8), join([2, 2, -8, -8], 8), ['MAC INT8', 'OUT INT8'], '7f80e818'],
  ['INT8 PASS', join([5, -5, 3, -3], 8), join([10, 10, -8, -8], 8), ['PASS INT8', 'OUT INT8'], '05fb03fd'],
  ['INT8 RND', join([5, -5, 3, -3], 8), join([10, 10, -8, -8], 8), ['PASS INT8', 'RND INT8 1', 'OUT INT8'], '02fe02fe'],
];
for (const [name, a, b, prog, want] of peTests) {
  const got = hexOf(peRun(a, b, prog).out, 32);
  ok(got === want, `${name}: got ${got} want ${want}`);
}
for (const m of ['INT32', 'INT16', 'INT8']) {
  const pe = peRun(join([15], 32), join([-6], 32), [`MAC ${m}`, `OUT ${m}`, `CLR ${m}`]);
  ok(pe.out === 0n && pe.acc === 0n, `${m} CLR`);
}

// ---------------------------------------------------------------- main buffer public tests
function mbWith(m0, m1) {
  const mb = new S.MainBuffer({ M0W: 256, M1W: 32, M2W: 256 });
  for (let i = 0; i < 1024; i++) { mb.mem0[i] = BigInt(m0(i)); mb.mem1[i] = BigInt(m1(i)); }
  return mb;
}
{ const mb = mbWith((i) => 2 * i, (i) => 2 * i); mb.exec('READ', 32, 130, 26); ok(mb.p0 === 260n && mb.p1 === 52n, 'READ INT32'); }
{ const mb = mbWith((i) => 2 * i, (i) => i); mb.exec('READ', 16, 130, 26); ok(mb.p0 === 260n && mb.p1 === join([13, 13], 16), 'READ INT16'); }
{ const mb = mbWith((i) => 2 * i, (i) => i); mb.exec('READ', 8, 130, 24); ok(mb.p0 === 260n && mb.p1 === join([6, 6, 6, 6], 8), 'READ INT8'); }
{ const mb = mbWith((i) => 2 * i, (i) => 2 * i); mb.p2 = 176n; mb.exec('WRITE', 8, 15, 0);
  ok(mb.mem2[15] === 176n && mb.mem2.filter((x) => x !== undefined).length === 1, 'WRITE'); }

// ---------------------------------------------------------------- compiler / assembler / full runs vs the real starter
for (const f of fx) {
  const C = S.compile(f.matrix, f.vector, f.pes, f.mode);
  const W0 = f.pes * 32;
  ok(C.mem0.length === f.mem0.length && C.mem0.every((x, i) => hexOf(x, W0) === f.mem0[i]), `${f.name}: MEM0 image`);
  ok(C.mem1.length === f.mem1.length && C.mem1.every((x, i) => hexOf(x, 32) === f.mem1[i]), `${f.name}: MEM1 image`);
  ok(JSON.stringify(C.program) === JSON.stringify(f.program), `${f.name}: program text`);
  const asm = C.program.map(S.assemble);
  ok(asm.every((ins, i) => S.encode(ins, 16).map((x) => x.bits).join('') === f.machine[i]), `${f.name}: machine code`);
  for (const order of ['mem-first', 'pe-first']) {
    const acc = new S.Accelerator(f.pes, { N: 16, order });
    C.mem0.forEach((x, i) => { acc.mb.mem0[i] = x; });
    C.mem1.forEach((x, i) => { acc.mb.mem1[i] = x; });
    asm.forEach((ins) => acc.exec(ins));
    const y = S.extract(acc.mb.mem2, f.gold.length, f.pes, f.mode).map(Number);
    const match = JSON.stringify(y) === JSON.stringify(f.gold);
    if (order === 'mem-first') ok(match, `${f.name}: accelerator result`);
    else if (f.vector[f.vector.length - 1] !== 0) ok(!match, `${f.name}: the wrong order should break the result`);
  }
}

// ---------------------------------------------------------------- edge cases worked by hand
const r = (x, s) => Number(S.roundHalfEven(BigInt(x), s));
ok(r(5, 1) === 2 && r(-5, 1) === -2 && r(3, 1) === 2 && r(-3, 1) === -2, 'ties to even');
ok(r(7, 1) === 4 && r(-7, 1) === -4 && r(6, 2) === 2 && r(-6, 2) === -2 && r(10, 2) === 2 && r(-10, 2) === -2, 'more ties');
ok(r(15, 2) === 4 && r(-15, 2) === -4 && r(13, 2) === 3 && r(-13, 2) === -3, 'non-ties');
ok(r(-1, 31) === 0 && r(9, 0) === 9 && r(-9, 0) === -9, 's = 31 and s = 0');
// 2^60 + 1 is not representable as a float; rounding it by 2^1 must still be exact
ok(S.roundHalfEven((1n << 60n) + 1n, 1) === (1n << 59n), 'big value: float would lose this');
{ // INT8 accumulator lanes are 16 bits: 100*100 + 100*100 + 100*100 = 30000 fits, a fourth wraps
  const pe = peRun(join([100, 0, 0, 0], 8), join([100, 0, 0, 0], 8), ['MAC INT8', 'MAC INT8', 'MAC INT8', 'MAC INT8']);
  const lanes = S.lanesOf(pe.acc, 64, 16);
  ok(lanes[3] === BigInt(40000 - 65536) && lanes[2] === 0n, 'INT8 lane wraps inside its own 16 bits: ' + lanes);
}
{ const pe = peRun(join([-128, 127, 1, 0], 8), join([1, 1, 1, 1], 8), ['PASS INT8']);
  ok(S.lanesOf(pe.acc, 64, 16).map(Number).join() === '0,1,127,-128', 'PASS sign-extends'); }

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
