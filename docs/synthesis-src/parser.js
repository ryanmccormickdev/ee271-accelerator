/* Tolerant parsers for Design Compiler reports (report_timing, report_area [-hierarchy],
   report_power, report_qor), the course's results.txt, and compile.log message counts.
   Used by docs/synthesis.html ("paste your report") and by test_parser.js under Node.
   Nothing here talks to a server: the text you paste never leaves the page.
   Every parser returns plain objects and never throws on odd input; missing pieces come back null. */
(function (root) {
  'use strict';
  // one number, matchable in only one way (so repeated numbers can't backtrack exponentially)
  const N = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?';
  const RE_NUM = new RegExp('^' + N + '$');
  const UNIT = { W: 1e3, mW: 1, uW: 1e-3, 'µW': 1e-3, nW: 1e-6, pW: 1e-9, fW: 1e-12 };

  function clean(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/ /g, ' ');
  }
  function toMW(v, unit) {
    if (v == null || isNaN(v)) return null;
    const k = UNIT[unit];
    return k === undefined ? null : v * k;
  }
  function num(s) { const v = parseFloat(s); return isNaN(v) ? null : v; }

  // --------------------------------------------------------------- report_timing
  // DC wraps a point whose name is too long: the name sits alone on one line and its numbers
  // on the next. Join those back together first.
  const ONLY_NUMS = new RegExp('^\\s*(?:' + N + '\\s*[*&#@$+]?\\s+)*' + N + '\\s*[*&#@$+]?(?:\\s+[rf])?\\s*$');
  function joinWrapped(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const next = lines[i + 1];
      if (next !== undefined && /\S/.test(L) && !/\d\s*[rf]?\s*$/.test(L) && !/:/.test(L) && !/^\s*-{4,}/.test(L)
          && ONLY_NUMS.test(next) && /\(/.test(L)) {
        out.push(L.replace(/\s+$/, '') + '   ' + next.trim());
        i++;
      } else out.push(L);
    }
    return out;
  }
  const RE_POINT2 = new RegExp('^\\s*(.+?)\\s+(' + N + ')\\s*[*&#@$+]?\\s+(' + N + ')\\s*([rf])?\\s*$');
  const RE_POINT1 = new RegExp('^\\s*(data arrival time|data required time)\\s+(' + N + ')\\s*$');
  const RE_SLACK = new RegExp('^\\s*slack\\s*\\(([^)]*)\\)\\s*(' + N + ')?');

  function parsePoint(name, incr, path, edge) {
    const p = { name: name.trim(), incr: num(incr), path: num(path), edge: edge || '' };
    let m;
    if ((m = p.name.match(/^clock\s+(\S+)\s+\((rise|fall) edge\)/))) { p.kind = 'clock'; p.clock = m[1]; }
    else if (/^clock network delay/.test(p.name)) p.kind = 'clocknet';
    else if (/^(input|output) external delay/.test(p.name)) p.kind = 'external';
    else if (/^library (setup|hold) time/.test(p.name)) p.kind = 'setup';
    else if (/^clock (uncertainty|reconvergence)/.test(p.name)) p.kind = 'uncertainty';
    else if ((m = p.name.match(/^(\S+)\s+\(([^)]+)\)$/))) {
      const full = m[1];
      p.cell = m[2];
      if (p.cell === 'in' || p.cell === 'out' || p.cell === 'inout') { p.kind = 'port'; p.inst = full; p.pin = ''; }
      else if (p.cell === 'net') p.kind = 'net';
      else {
        p.kind = 'pin';
        const k = full.lastIndexOf('/');
        p.inst = k >= 0 ? full.slice(0, k) : full;
        p.pin = k >= 0 ? full.slice(k + 1) : '';
      }
    } else p.kind = 'other';
    return p;
  }

  function parseTiming(text) {
    const lines = joinWrapped(clean(text).split('\n'));
    const paths = [];
    for (let i = 0; i < lines.length; i++) {
      const sm = lines[i].match(/^\s*Startpoint:\s*(\S+)(?:\s*\((.*)\))?/);
      if (!sm) continue;
      const p = { startpoint: sm[1], startKind: sm[2] || null, endpoint: null, endKind: null, group: null, type: null,
                  launch: [], capture: [], arrival: null, required: null, setup: null, slack: null, slackLabel: null, met: null, period: null };
      let j = i + 1;
      if (j < lines.length && /^\s*\(/.test(lines[j]) && !p.startKind) { p.startKind = lines[j].trim().replace(/^\(|\)$/g, ''); j++; }
      let section = 'head';
      for (; j < lines.length; j++) {
        const L = lines[j];
        if (/^\s*Startpoint:/.test(L)) { j--; break; }
        let m;
        if ((m = L.match(/^\s*Endpoint:\s*(\S+)(?:\s*\((.*)\))?/))) {
          p.endpoint = m[1];
          if (m[2]) p.endKind = m[2];
          else if (/^\s*\(/.test(lines[j + 1] || '')) { p.endKind = lines[j + 1].trim().replace(/^\(|\)$/g, ''); j++; }
          continue;
        }
        if ((m = L.match(/^\s*Path Group:\s*(\S+)/))) { p.group = m[1]; continue; }
        if ((m = L.match(/^\s*Path Type:\s*(\S+)/))) { p.type = m[1]; continue; }
        if ((m = L.match(RE_SLACK))) {
          p.slackLabel = m[1].trim();
          p.slack = m[2] !== undefined ? num(m[2]) : null;
          p.met = /VIOLATED/i.test(m[1]) ? false : /MET/i.test(m[1]) ? true : (p.slack != null ? p.slack >= 0 : null);
          break;
        }
        if ((m = L.match(RE_POINT1))) {
          if (m[1] === 'data arrival time' && p.arrival == null) { p.arrival = num(m[2]); section = 'between'; }
          else if (m[1] === 'data required time' && p.required == null) { p.required = num(m[2]); section = 'tail'; }
          continue;
        }
        if (/^\s*Point\b/.test(L) && /Incr/.test(L)) { section = 'launch'; continue; }
        if ((m = L.match(RE_POINT2)) && section !== 'head' && section !== 'tail') {
          if (/^(Des\/Clust\/Port|Point)\b/.test(m[1].trim())) continue;
          const pt = parsePoint(m[1], m[2], m[3], m[4]);
          if (pt.kind === 'net') continue;
          if (section === 'launch') p.launch.push(pt);
          else {
            p.capture.push(pt);
            if (pt.kind === 'clock' && p.period == null) p.period = pt.path;
            if (pt.kind === 'setup') p.setup = pt.incr;
          }
        }
      }
      i = j;
      // derived: the data-path stages (cells), their delays, and a consistency check
      const stages = p.launch.filter((x) => x.kind === 'pin' || x.kind === 'port' || x.kind === 'external');
      p.stages = stages;
      p.cellCount = stages.filter((x) => x.kind === 'pin').length;
      const byCell = {};
      stages.forEach((s) => { if (s.cell && s.kind === 'pin') { const k = s.cell; byCell[k] = byCell[k] || { count: 0, delay: 0 }; byCell[k].count++; byCell[k].delay += s.incr || 0; } });
      p.byCell = byCell;
      const last = p.launch.length ? p.launch[p.launch.length - 1].path : null;
      p.consistent = p.arrival == null || last == null || Math.abs(last - p.arrival) < 0.0011;
      if (p.slack == null && p.required != null && p.arrival != null) p.slack = +(p.required - p.arrival).toFixed(4);
      paths.push(p);
    }
    return paths;
  }

  // --------------------------------------------------------------- report_area
  function lineVal(t, label) {
    const re = new RegExp('(?:^|\\n)\\s*' + label + '\\s*:?\\s*(' + N + '|undefined)', 'i');
    const m = t.match(re);
    if (!m) return null;
    return m[1].toLowerCase() === 'undefined' ? 'undefined' : num(m[1]);
  }
  function parseArea(text) {
    const t = clean(text);
    const r = {
      combinational: lineVal(t, 'Combinational area'),
      bufinv: lineVal(t, 'Buf/Inv area'),
      noncombinational: lineVal(t, 'Noncombinational area'),
      macro: lineVal(t, 'Macro/Black Box area'),
      net: lineVal(t, 'Net Interconnect area'),
      totalCell: lineVal(t, 'Total cell area'),
      total: lineVal(t, 'Total area'),
      counts: {}, hier: [],
    };
    // the case-insensitive "Combinational area" must not be fooled by "Noncombinational area"
    const cm = t.match(new RegExp('(?:^|\\n)\\s*Combinational area\\s*:\\s*(' + N + ')'));
    r.combinational = cm ? num(cm[1]) : null;
    const nm = t.match(/(?:^|\n)\s*Net Interconnect area\s*:\s*(undefined|[-+.\deE]+)\s*(\(([^)]*)\))?/);
    if (nm) { r.net = nm[1] === 'undefined' ? 'undefined' : num(nm[1]); r.netNote = nm[3] || null; }
    t.replace(/(?:^|\n)\s*Number of ([^:\n]+):\s*(\d+)/g, (_, k, v) => { r.counts[k.trim()] = +v; return _; });
    // hierarchical table
    const lines = t.split('\n');
    const h = lines.findIndex((l) => /^\s*Hierarchical cell\b/.test(l));
    if (h >= 0) {
      let k = h + 1;
      while (k < lines.length && !/^\s*-{6,}/.test(lines[k])) k++;
      k++;
      const rowRe = new RegExp('^\\s*(\\S+)?\\s+((?:' + N + '\\s+){2,}' + N + ')\\s*(\\S+)?\\s*$');
      for (; k < lines.length; k++) {
        let L = lines[k];
        if (/^\s*-{6,}/.test(L)) break;
        if (!/\S/.test(L)) continue;
        if (/^\s*\S+\s*$/.test(L) && rowRe.test(lines[k + 1] || '') && /^\s/.test(lines[k + 1] || '')) {   // wrapped name
          L = L.trim() + ' ' + lines[k + 1].trim();
          k++;
        }
        const m = L.match(rowRe);
        if (!m || !m[1]) continue;
        const ns = m[2].trim().split(/\s+/).map(num);
        r.hier.push({ name: m[1], abs: ns[0], pct: ns[1], comb: ns[2] ?? null, noncomb: ns[3] ?? null, bb: ns[4] ?? null, design: m[3] || '' });
      }
    }
    return r;
  }

  // --------------------------------------------------------------- report_power
  function parsePower(text) {
    const t = clean(text);
    const val = (label) => {
      const m = t.match(new RegExp(label + '\\s*=\\s*(' + N + ')\\s*([a-zA-Zµ]+)'));
      return m ? toMW(num(m[1]), m[2]) : null;
    };
    const du = (t.match(/Dynamic Power Units\s*=\s*1\s*([a-zA-Zµ]+)/) || [])[1] || 'uW';
    const lu = (t.match(/Leakage Power Units\s*=\s*1\s*([a-zA-Zµ]+)/) || [])[1] || 'nW';
    const r = {
      internal: val('Cell Internal Power'), switching: val('Net Switching Power'), dynamic: val('Total Dynamic Power'),
      leakage: val('Cell Leakage Power'), dynUnit: du, leakUnit: lu, groups: [], totalRow: null, total: null,
    };
    const groupRe = new RegExp('^\\s*([A-Za-z_]+)\\s+(' + N + ')\\s+(' + N + ')\\s+(' + N + ')\\s+(' + N + ')\\s*\\(\\s*(' + N + ')\\s*%\\s*\\)');
    const totalRe = new RegExp('^\\s*Total\\s+(' + N + ')\\s*([a-zA-Zµ]+)?\\s+(' + N + ')\\s*([a-zA-Zµ]+)?\\s+(' + N + ')\\s*([a-zA-Zµ]+)?\\s+(' + N + ')\\s*([a-zA-Zµ]+)?');
    t.split('\n').forEach((L) => {
      let m;
      if ((m = L.match(totalRe))) {
        r.totalRow = { internal: toMW(num(m[1]), m[2] || du), switching: toMW(num(m[3]), m[4] || du), leakage: toMW(num(m[5]), m[6] || lu), total: toMW(num(m[7]), m[8] || du) };
      } else if ((m = L.match(groupRe)) && m[1] !== 'Total') {
        r.groups.push({ name: m[1], internal: toMW(num(m[2]), du), switching: toMW(num(m[3]), du), leakage: toMW(num(m[4]), lu), total: toMW(num(m[5]), du), pct: num(m[6]) });
      }
    });
    if (r.totalRow) r.total = r.totalRow.total;
    else if (r.dynamic != null && r.leakage != null) r.total = r.dynamic + r.leakage;
    if (r.dynamic == null && r.internal != null && r.switching != null) r.dynamic = r.internal + r.switching;
    if (r.leakage == null && r.totalRow) r.leakage = r.totalRow.leakage;
    return r;
  }

  // --------------------------------------------------------------- results.txt (the course's summary)
  function parseResults(text) {
    const lines = clean(text).split('\n').filter((l) => !/^\s*#/.test(l));
    const r = { period: null, slack: null, slackLabel: null, met: null, dynamic: null, total: null, leakage: null, area: null, other: [] };
    const totalRe = new RegExp('^\\s*Total\\s+(' + N + ')\\s*([a-zA-Zµ]+)?\\s+(' + N + ')\\s*([a-zA-Zµ]+)?\\s+(' + N + ')\\s*([a-zA-Zµ]+)?\\s+(' + N + ')\\s*([a-zA-Zµ]+)?');
    for (const L of lines) {
      let m;
      if (!/\S/.test(L)) continue;
      if (r.period == null && RE_NUM.test(L.trim())) { r.period = num(L); continue; }
      if ((m = L.match(RE_SLACK))) { if (r.slack == null) { r.slackLabel = m[1].trim(); r.slack = m[2] !== undefined ? num(m[2]) : null; r.met = !/VIOLATED/i.test(m[1]); } continue; }
      if ((m = L.match(new RegExp('Total Dynamic Power\\s*=\\s*(' + N + ')\\s*([a-zA-Zµ]+)')))) { r.dynamic = toMW(num(m[1]), m[2]); continue; }
      if ((m = L.match(totalRe))) { r.total = toMW(num(m[7]), m[8] || 'uW'); r.totalLeak = toMW(num(m[5]), m[6] || 'nW'); continue; }
      if ((m = L.match(new RegExp('Cell Leakage Power\\s*=\\s*(' + N + ')\\s*([a-zA-Zµ]+)')))) { r.leakage = toMW(num(m[1]), m[2]); continue; }
      if ((m = L.match(new RegExp('Total cell area\\s*:\\s*(' + N + ')')))) { r.area = num(m[1]); continue; }
      if (/^\s*Internal\s+Switching\s+Leakage\s+Total\s*$/.test(L)) continue;   // the power table's header row also contains "Total"
      r.other.push(L.trim());
    }
    if (r.total == null && r.dynamic != null && r.leakage != null) r.total = r.dynamic + r.leakage;
    return r;
  }

  // --------------------------------------------------------------- report_qor
  function parseQor(text) {
    const t = clean(text);
    const g = (label) => { const m = t.match(new RegExp(label + '\\s*:\\s*(' + N + ')')); return m ? num(m[1]) : null; };
    const wns = t.match(new RegExp('Design\\s+WNS:\\s*(' + N + ')\\s+TNS:\\s*(' + N + ')\\s+Number of Violating Paths:\\s*(\\d+)'));
    return {
      levels: g('Levels of Logic'), length: g('Critical Path Length'), slack: g('Critical Path Slack'), period: g('Critical Path Clk Period'),
      tns: g('Total Negative Slack'), violating: g('No\\. of Violating Paths'), holdWorst: g('Worst Hold Violation'),
      leafCells: g('Leaf Cell Count'), seqCells: g('Sequential Cell Count'), bufinvCells: g('Buf/Inv Cell Count'),
      cellArea: g('Cell Area'), designArea: g('Design Area'), netViol: g('Nets With Violations'), transViol: g('Max Trans Violations'), capViol: g('Max Cap Violations'),
      wns: wns ? num(wns[1]) : null, tnsDesign: wns ? num(wns[2]) : null, violDesign: wns ? +wns[3] : null,
      wallClock: g('Overall Compile Wall Clock Time'),
    };
  }

  // --------------------------------------------------------------- compile.log: errors and warnings by message ID
  function parseLog(text) {
    const lines = clean(text).split('\n');
    const r = { errors: [], warnings: {}, warningCount: 0, latches: [], unresolved: [], information: {} };
    lines.forEach((L, i) => {
      const id = (L.match(/\(([A-Z]+-\d+)\)\s*$/) || [])[1] || null;
      if (/^\s*Error\b/.test(L)) r.errors.push({ line: i + 1, text: L.trim(), id });
      else if (/^\s*Warning\b/.test(L)) {
        r.warningCount++;
        const k = id || 'no ID';
        (r.warnings[k] = r.warnings[k] || { count: 0, first: L.trim(), line: i + 1 }).count++;
      } else if (/^\s*Information\b/.test(L) && id) {
        (r.information[id] = r.information[id] || { count: 0, first: L.trim() }).count++;
      }
      let m;
      if ((m = L.match(/^\s*\|\s*(\S+)\s*\|\s*Latch\s*\|\s*(\d+)/))) r.latches.push({ name: m[1], width: +m[2], line: i + 1 });
      if (/Unable to resolve reference/.test(L)) r.unresolved.push(L.trim());
    });
    return r;
  }

  // --------------------------------------------------------------- detect everything in one paste
  function parseAll(text) {
    const t = clean(text);
    const out = { found: [] };
    const safe = (name, fn) => { try { out[name] = fn(t); } catch (e) { out[name] = null; out.found.push(name + ' (could not parse: ' + e.message + ')'); } };
    if (/^\s*Startpoint:/m.test(t)) { safe('timing', parseTiming); if (out.timing && out.timing.length) out.found.push('timing'); }
    if (/(Total cell area|Combinational area)\s*:/.test(t) && /Report\s*:\s*area|Library\(s\) Used|Number of cells/.test(t)) { safe('area', parseArea); if (out.area) out.found.push(out.area.hier.length ? 'area (with hierarchy)' : 'area'); }
    if (/Total Dynamic Power|Cell Leakage Power|Cell Internal Power/.test(t) && /Report\s*:\s*power|Power Group|Power-specific/.test(t)) { safe('power', parsePower); if (out.power) out.found.push('power'); }
    if (/Critical Path Length|Leaf Cell Count/.test(t)) { safe('qor', parseQor); if (out.qor) out.found.push('qor'); }
    const firstReal = t.split('\n').find((l) => /\S/.test(l) && !/^\s*#/.test(l));
    if (firstReal && RE_NUM.test(firstReal.trim()) && /slack|Total cell area|Leakage/.test(t)) { safe('results', parseResults); if (out.results) out.found.push('results.txt'); }
    if (/^\s*(Error|Warning|Information)\b.*\([A-Z]+-\d+\)/m.test(t)) { safe('log', parseLog); if (out.log) out.found.push('compile.log messages'); }
    return out;
  }

  const api = { clean, toMW, parseTiming, parseArea, parsePower, parseResults, parseQor, parseLog, parseAll, joinWrapped };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SynthParse = api;
})(typeof window !== 'undefined' ? window : this);
