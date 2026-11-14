// Checks parser.js against the illustrative samples (samples/*.txt) plus deliberately messy variants.
// Run: node docs/synthesis-src/test_parser.js        (exit code 1 on any failure)
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./parser.js');

const S = (f) => fs.readFileSync(path.join(__dirname, 'samples', f), 'utf8');
const X = JSON.parse(S('expected.json'));          // written by make_samples.py from what the samples print
let fails = 0, passes = 0;
function eq(name, got, want, tol) {
  const ok = (typeof want === 'number' && typeof got === 'number') ? Math.abs(got - want) <= (tol ?? 1e-6) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

// ---- timing, MET
let t = P.parseTiming(S('timing_met.txt'));
eq('timing paths', t.length, 1);
let p = t[0];
eq('startpoint', p.startpoint, 'g_pe[5].u_pe/acc_reg[3]');
eq('endpoint', p.endpoint, 'g_pe[5].u_pe/acc_reg[61]');
eq('start kind', p.startKind, 'rising edge-triggered flip-flop clocked by clk');
eq('group', p.group, 'clk');
eq('type', p.type, 'max');
eq('arrival', p.arrival, X.timing_met.arrival);
eq('required', p.required, 1.9609);
eq('setup', p.setup, X.timing_met.setup);
eq('period', p.period, X.timing_met.period);
eq('slack', p.slack, X.timing_met.slack);
eq('met', p.met, true);
eq('cells on path', p.cellCount, X.timing_met.cells);          // CK pin, the gates, D pin
eq('wrapped FA lines joined', p.byCell['FA_X1'].count, 5);
eq('increments add up', p.consistent, true);
const sum = p.launch.reduce((a, x) => a + (x.incr || 0), 0);
eq('sum of incr = arrival', sum, X.timing_met.arrival, 1e-3);

// ---- timing, VIOLATED
p = P.parseTiming(S('timing_violated.txt'))[0];
eq('viol slack', p.slack, X.timing_violated.slack);
eq('viol met', p.met, false);
eq('viol period', p.period, X.timing_violated.period);

// ---- messy variants: CRLF, tabs, 2-digit compile.log style, "increase significant digits"
let messy = S('timing_met.txt').replace(/\n/g, '\r\n').replace(/    /g, '\t');
p = P.parseTiming(messy)[0];
eq('crlf+tabs slack', p.slack, X.timing_met.slack);
eq('crlf+tabs cells', p.cellCount, X.timing_met.cells);
const twoDigit = S('timing_met.txt').replace(/(-?\d+\.\d\d)\d\d/g, '$1');
p = P.parseTiming(twoDigit)[0];
eq('2-digit slack', p.slack, Math.round(X.timing_met.slack * 100) / 100);
eq('2-digit arrival', p.arrival, Math.floor(X.timing_met.arrival * 100) / 100);
const tiny = S('timing_violated.txt').replace(/slack \(VIOLATED\)\s+-[\d.]+/, 'slack (VIOLATED: increase significant digits)               -0.00');
p = P.parseTiming(tiny)[0];
eq('tiny violated label', p.slackLabel, 'VIOLATED: increase significant digits');
eq('tiny violated met', p.met, false);
// two paths pasted together
t = P.parseTiming(S('timing_met.txt') + '\n' + S('timing_violated.txt'));
eq('two paths', t.length, 2);
eq('second path slack', t[1].slack, X.timing_violated.slack);

// ---- area
let a = P.parseArea(S('area.txt'));
eq('total cell area', a.totalCell, X.area.totalCell);
eq('combinational', a.combinational, X.area.combinational);
eq('noncombinational', a.noncombinational, X.area.noncombinational);
eq('buf/inv', a.bufinv, X.area.bufinv);
eq('macro', a.macro, 0);
eq('net', a.net, 'undefined');
eq('net note', a.netNote, 'Wire load has zero net area');
eq('total area', a.total, 'undefined');
eq('cells count', a.counts['cells'], X.area.cells);
eq('black boxes count', a.counts['macros/black boxes'], 4);
a = P.parseArea(S('area_hier.txt'));
eq('hier rows', a.hier.length, X.area.hier_rows);
eq('hier pe count', a.hier.filter((r) => /u_pe$/.test(r.name)).length, 16);
const im = a.hier.find((r) => r.name === 'u_instruction_memory/u_instruction_memory');
eq('wrapped hier row', im && im.design, 'array_DW63_NW128_AW7');
eq('pe0 abs', a.hier.find((r) => r.name === 'g_pe[0].u_pe').abs, 8523.116);
eq('top pct', a.hier[0].pct, 100);

// ---- power
let w = P.parsePower(S('power.txt'));
eq('internal', w.internal, X.power.internal, 1e-9);
eq('switching', w.switching, X.power.switching, 1e-9);
eq('dynamic', w.dynamic, X.power.dynamic, 1e-9);
eq('leakage', w.leakage, X.power.leakage, 1e-9);
eq('total', w.total, X.power.total_uW / 1000, 1e-9);
eq('groups', w.groups.length, X.power.groups);
eq('register pct', w.groups.find((g) => g.name === 'register').pct, X.power.register_pct);
eq('register internal (uW->mW)', w.groups.find((g) => g.name === 'register').internal, 8.6021, 1e-6);
eq('register leakage (nW->mW)', w.groups.find((g) => g.name === 'register').leakage, 0.1556, 1e-6);
// power with the unit header missing (someone pasted only the bottom half)
const half = S('power.txt').split('\n').filter((l) => !/Units =/.test(l)).join('\n');
eq('no-units total', P.parsePower(half).total, X.power.total_uW / 1000, 1e-9);

// ---- results.txt
let r = P.parseResults(S('results.txt'));
eq('results period', r.period, 2.0);
eq('results slack', r.slack, X.timing_met.slack);
eq('results met', r.met, true);
eq('results dynamic', r.dynamic, X.power.dynamic, 1e-9);
eq('results total', r.total, X.power.total_uW / 1000, 1e-9);
eq('results leakage', r.leakage, X.power.leakage, 1e-9);
eq('results area', r.area, X.area.totalCell);
eq('results other lines', r.other, []);
// results.txt appended twice (make synthesize run again without make clean): first block wins, warn in UI
r = P.parseResults(S('results.txt') + S('results.txt').replace('2.000', '1.800'));
eq('appended results first period', r.period, 2.0);

// ---- qor
const q = P.parseQor(S('qor.txt'));
eq('qor length', q.length, X.qor.length);
eq('qor slack', q.slack, X.qor.slack);
eq('qor period', q.period, 2.0);
eq('qor levels', q.levels, X.qor.levels);
eq('qor leaf cells', q.leafCells, X.area.cells);
eq('qor wns', q.wns, 0);

// ---- compile.log message counting
const log = [
  'Information: Building the design \'array\' instantiated from design \'buffer\'. (HDL-193)',
  'Warning:  ./defines.sv:95: Netlist for always_comb block contains a latch. (ELAB-974)',
  '|   data_to_pe_reg    | Latch     |  32   |  Y  | N  | N  | N  | -  | -  | -  |',
  'Warning: In design \'array_DW512_NW65536_AW16\', port \'clk\' is not connected to any nets. (LINT-28)',
  'Warning: In design \'array_DW512_NW65536_AW16\', port \'cen\' is not connected to any nets. (LINT-28)',
  'Error:  ../logical/processing_element.sv:40: Net \'acc\' or a directly connected net is driven by more than one source, and not all drivers are three-state. (ELAB-366)',
  'Warning: Unable to resolve reference \'procesing_element\' in \'top\'. (LINK-5)',
].join('\n');
const L = P.parseLog(log);
eq('log errors', L.errors.length, 1);
eq('log error id', L.errors[0].id, 'ELAB-366');
eq('log LINT-28 count', L.warnings['LINT-28'].count, 2);
eq('log latch rows', L.latches.length, 1);
eq('log unresolved', L.unresolved.length, 1);

// ---- everything pasted at once, plus garbage
const all = P.parseAll('some junk\n' + S('timing_met.txt') + S('area_hier.txt') + S('power.txt') + S('qor.txt') + '\nmore junk ### \n');
eq('parseAll found', all.found, ['timing', 'area (with hierarchy)', 'power', 'qor']);
eq('parseAll results only', P.parseAll(S('results.txt')).found, ['results.txt']);
eq('parseAll empty', P.parseAll('').found, []);
eq('parseAll nonsense', P.parseAll('hello\nworld 1 2 3\n(((').found, []);
eq('parseAll log', P.parseAll(log).found, ['compile.log messages']);

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
