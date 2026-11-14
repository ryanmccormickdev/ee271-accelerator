// Checks lib.js against the recorded runs and against exact arithmetic.   Run: node docs/part3-ppa-src/test_lib.js
'use strict';
const path = require('path');
const assert = require('assert');
const L = require(path.join(__dirname, 'lib.js'));
const D = require(path.join(__dirname, 'data', 'cycles.json'));
let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const near = (a, b, rel, msg) => ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b}`);

// 1. the cycle model reproduces every recorded run
for (const r of D.official) {
  ok(L.tiles(r.P, r.mode) === r.tiles, `tiles P=${r.P} ${r.mode}`);
  ok(L.cycles(r.P, r.mode) === r.model, `model P=${r.P} ${r.mode}`);
  if (r.cycles !== null) ok(r.cycles === r.model && r.icarus === 'EQUIVALENT', `measured P=${r.P} ${r.mode}`);
}
for (const r of D.odd) {
  const t = { rows: r.rows, cols: r.cols, lanes: L.TESTS[r.mode].lanes };
  ok(L.cycles(r.P, r.mode, {}, t) === r.cycles, `odd size ${r.P} ${r.mode} ${r.rows}x${r.cols}`);
}
for (const v of D.variants) {
  const o = v.kind === 'bubble' ? { bubblesPerInstr: 1 } : { cyclesPerRep: 2 };
  ok(L.cycles(v.P, v.mode, o) === v.model, `variant model ${v.kind} ${v.P} ${v.mode}`);
  if (v.sim === 'verilator') ok(v.cycles === v.model, `variant measured (verilator) ${v.kind} ${v.P} ${v.mode}`);
  else ok(v.cycles === v.model || (v.kind === 'bubble' && v.model - v.cycles === 1), `variant measured (icarus, allows the 1-cycle end-of-test glitch) ${v.kind} ${v.P} ${v.mode}`);
}
ok(L.sumCycles(16) === 28840 && L.sumCycles(128) === 3626, 'sum of cycles');
for (const P of [5, 16, 24, 43, 86, 128]) ok(L.sumCycles(P) === 1801 * Math.ceil(256 / P) + 24, `closed form P=${P}`);
ok(JSON.stringify([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(L.efficientP)) === JSON.stringify([128, 86, 64, 52, 43, 37, 32, 29, 26, 24, 22, 20, 19, 18, 16]), 'tile-efficient P');
ok(L.imem(9).defaultOk && !L.imem(8).defaultOk && L.imem(8).depth === 256 && L.imem(5).depth === 256 && L.imem(4).depth === 512 && L.imem(16).depth === 128, 'imem depth');
for (const t of D.trunc) ok(t.inst_count_seen === t.inst_count_passed % 128 && !L.imem(t.P).defaultOk, `truncation case P=${t.P}`);

// 2. FoM arithmetic
const f = L.fom(16440, 8248, 4152, 2.0, 1, 1);
ok(f.T === 57680, 'T sum');
near(f.fom, 8.9199e-5, 1e-4, 'FoM coefficient at 16 PEs, 2 ns');
near(L.fom(16440, 8248, 4152, 2.0, 200000, 30).fom, 535.2, 1e-3, 'illustrative FoM 535');
ok(Math.abs(L.pctImprovement(100, 80) - 20) < 1e-12 && L.pctImprovement(100, 125) === -25, 'pct improvement');
near(Math.pow(0.9, 2.3), 0.785, 1e-3, '10% time cut factor');
const fa = L.factors({ T: 100, area: 10, power: 5 }, { T: 90, area: 11, power: 5 });
near(fa.ratio, Math.pow(0.9, 2.3) * 1.1, 1e-12, 'factor product');
near(L.relFomPE(32, { aPe: 13000, aFixed: 0 }), Math.pow(14432 / 28840, 2.3) * 4, 1e-12, 'relFomPE');
near(L.relFomPeriod(1.8, { tau0: 2, d: 1, g: 0 }), Math.pow(0.9, 1.3), 1e-12, 'relFomPeriod, all dynamic, no area growth');

// 3. multiplier sharing: exhaustive edge cases plus random full-range operands, every mode
const rnd32 = () => (BigInt(Math.floor(Math.random() * 2 ** 16)) << 16n) | BigInt(Math.floor(Math.random() * 2 ** 16));
const edges = [0n, 1n, 0x7FFFFFFFn, 0x80000000n, 0xFFFFFFFFn, 0x0000FFFFn, 0xFFFF0000n, 0x00008000n, 0x80008000n, 0x7F7F7F7Fn, 0x80808080n, 0xFFFBFFFBn];
for (const mode of L.MODES) {
  for (const a of edges) for (const b of edges) ok(L.share(a, b, mode).ok, `share edge ${mode} ${a} ${b}`);
  for (let i = 0; i < 20000; i++) { const a = rnd32(), b = rnd32(); const r = L.share(a, b, mode); if (!r.ok) assert.fail(`share ${mode} a=${a} b=${b}`); }
  n++;
}
const r32 = L.share(L.ux(-5n, 32), 4n, 'INT32');
ok(r32.lanes[0] === -20n && r32.mults[2].x === -1n && r32.mults[0].x === 65531n, 'the -5 x 4 example');

// 4. results.txt / testbench parser on the illustrative sample
const p = L.parseText(L.SAMPLE);
ok(p.period === 2 && p.worstSlack === -0.2487, 'period and slack');
near(p.dynMw, 28.551, 1e-9, 'dynamic'); near(p.leakMw, 4.2873, 1e-9, 'leakage'); near(p.rowTotalMw, 32.838, 1e-9, 'table total');
near(p.totalMw, 32.8383, 1e-9, 'total used'); ok(p.area === 213456.780012, 'area');
ok(p.cycles.INT8 === 16440 && p.cycles.INT16 === 8248 && p.cycles.INT32 === 4152, 'cycles by mode');
ok(p.unparsed.length === 0 && p.notes.length === 0, 'nothing left over in the sample');
const dc = L.SAMPLE.split('\n').slice(0, 6).join('\n');
const two = L.parseText(dc.replace('2.000', '2.500') + '\n' + dc);
ok(two.runs === 2 && two.period === 2 && two.notes.length === 1, 'appended results.txt: uses the last run');
const bare = L.parseText('Computation took 100 clock cycles.\nComputation took 50 clock cycles.\nComputation took 25 clock cycles.');
ok(bare.cycles.INT8 === 100 && bare.cycles.INT16 === 50 && bare.cycles.INT32 === 25, 'cycle lines without mode names, by order');
near(L.toMw('5', 'nW'), 5e-6, 1e-12, 'nW'); near(L.toMw('2', 'W'), 2000, 1e-12, 'W'); near(L.toMw('3', 'uW'), 0.003, 1e-12, 'uW');

console.log(`test_lib.js: ${n} checks passed`);
