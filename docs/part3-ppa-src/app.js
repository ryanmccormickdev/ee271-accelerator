(function () {
  'use strict';
  const L = window.PPA, D = window.PPA_DATA;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const MINUS = '−';
  const comma = (x) => Number(x).toLocaleString('en-US');
  const sgn = (x, d) => (x < 0 ? MINUS : '') + Math.abs(x).toFixed(d);
  const pct = (x, d) => (x > 0 ? '+' : x < 0 ? MINUS : '') + Math.abs(x).toFixed(d === undefined ? 1 : d) + '%';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtG = (x, p) => { if (!Number.isFinite(x)) return '—'; const a = Math.abs(x); if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(p === undefined ? 3 : p - 1).replace('e+', ' × 10^').replace('e-', ' × 10^' + MINUS).replace('-', MINUS); return x.toLocaleString('en-US', { maximumSignificantDigits: p || 4 }); };
  const supE = (s) => s.replace(/10\^(−?\d+)/, '10<sup>$1</sup>');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ee271ppa:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ee271ppa:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem('ee271ppa:' + k); } catch (e) { /* storage unavailable */ } },
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) { const t = el('text', Object.assign({ x, y }, attrs || {}), parent); t.textContent = s; return t; }

  // ------------------------------------------------------------------ theme
  const root = document.documentElement;
  const savedTheme = store.get('theme', null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $('#themebtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  // ------------------------------------------------------------------ router (same scheme as the Part 1 walkthrough)
  const VIEWS = ['fom', 'cycles', 'calc', 'reuse', 'opt', 'blocks', 'plan', 'words'];
  const onShow = {};
  let current = null;
  function flash(e) { if (!e) return; e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
  function showView(name) {
    if (!VIEWS.includes(name)) name = 'fom';
    if (current !== name) {
      VIEWS.forEach((n) => { $('#view-' + n).hidden = n !== name; });
      $$('nav.tabs a').forEach((a) => { if (a.dataset.view === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      current = name;
      if (onShow[name]) onShow[name]();
      window.scrollTo(0, 0);
    }
  }
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const i = h.indexOf('/');
    const name = (i < 0 ? h : h.slice(0, i)) || 'fom';
    const rest = i < 0 ? '' : h.slice(i + 1);
    showView(VIEWS.includes(name) ? name : (document.getElementById(name) ? viewOf(name) : 'fom'));
    const target = rest || (!VIEWS.includes(name) ? name : '');
    if (target) setTimeout(() => { const e = document.getElementById(target); if (e) { e.scrollIntoView({ block: 'start' }); flash(e); } }, 30);
  }
  function viewOf(id) { const e = document.getElementById(id); const v = e && e.closest('section.view'); return v ? v.id.replace('view-', '') : 'fom'; }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    e.preventDefault();
    const t = '#' + b.dataset.goto;
    if (location.hash === t) route(); else location.hash = t;
  });
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------------ a small, careful chart helper (SVG, hover + keyboard, table twin)
  // cfg: { title, sub, x: {log2?, min, max, ticks, label, fmt}, y: {log10?, min, max, ticks, label, fmt}, series: [{name, cls, pts:[[x,y]], dots?: [[x,y]], noLine?}],
  //        marks: [{x, label, cls}], rings: [{x, y, label}], hoverX: [x values to snap to], tip(x) -> html, table: {head:[], rows:[[]]} }
  function chart(box, cfg) {
    box.innerHTML = '';
    const W = 760, H = cfg.height || 330, m = { l: 62, r: cfg.right || 96, t: 14, b: 44 };
    if (cfg.title) { const h = document.createElement('h4'); h.textContent = cfg.title; box.appendChild(h); }
    if (cfg.sub) { const p = document.createElement('p'); p.className = 'csub'; p.textContent = cfg.sub; box.appendChild(p); }
    if (cfg.legend && cfg.legend.length) {
      const lg = document.createElement('div'); lg.className = 'legend';
      cfg.legend.forEach((it) => {
        const c = document.createElement('span'); c.className = 'chip';
        const k = document.createElement('span'); k.className = 'key' + (it.dot ? ' dot' : '');
        if (it.dot) k.style.background = `var(--${it.v})`; else k.style.borderTopColor = `var(--${it.v})`;
        c.appendChild(k); c.appendChild(document.createTextNode(it.label)); lg.appendChild(c);
      });
      box.appendChild(lg);
    }
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': cfg.aria || cfg.title || 'chart', tabindex: '0' }, box);
    const X = cfg.x, Y = cfg.y;
    const fx = (v) => { const a = X.log2 ? Math.log2(v) : v, lo = X.log2 ? Math.log2(X.min) : X.min, hi = X.log2 ? Math.log2(X.max) : X.max; return m.l + (a - lo) / (hi - lo) * (W - m.l - m.r); };
    const fy = (v) => { const a = Y.log10 ? Math.log10(v) : v, lo = Y.log10 ? Math.log10(Y.min) : Y.min, hi = Y.log10 ? Math.log10(Y.max) : Y.max; return H - m.b - (a - lo) / (hi - lo) * (H - m.t - m.b); };
    const g = el('g', {}, svg);
    const inX = (v) => v >= X.min - 1e-9 && v <= X.max + 1e-9, inY = (v) => v >= Y.min - 1e-9 && v <= Y.max + 1e-9;
    Y.ticks.filter(inY).forEach((v) => { el('line', { x1: m.l, x2: W - m.r, y1: fy(v), y2: fy(v), class: 'grid' }, g); txt(g, m.l - 8, fy(v) + 4, (Y.fmt || comma)(v), { 'text-anchor': 'end' }); });
    X.ticks.filter(inX).forEach((v) => { el('line', { x1: fx(v), x2: fx(v), y1: H - m.b, y2: H - m.b + 4, class: 'axis' }, g); txt(g, fx(v), H - m.b + 17, (X.fmt || comma)(v), { 'text-anchor': 'middle' }); });
    el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }, g);
    if (X.label) txt(g, (m.l + W - m.r) / 2, H - 6, X.label, { 'text-anchor': 'middle' });
    if (Y.label) txt(g, 14, m.t + (H - m.t - m.b) / 2, Y.label, { 'text-anchor': 'middle', transform: `rotate(-90 14 ${m.t + (H - m.t - m.b) / 2})` });
    (cfg.bands || []).forEach((b) => { el('rect', { x: fx(b.x0), y: m.t, width: Math.max(0, fx(b.x1) - fx(b.x0)), height: H - m.t - m.b, fill: 'var(--warn)', opacity: 0.07 }, g); if (b.label) txt(g, fx(b.x0) + 6, m.t + 12, b.label, {}); });
    (cfg.marks || []).forEach((mk) => { el('line', { x1: fx(mk.x), x2: fx(mk.x), y1: m.t, y2: H - m.b, class: mk.cls || 'cap' }, g); if (mk.label) txt(g, fx(mk.x) + (mk.left ? -6 : 6), m.t + 12 + (mk.dy || 0), mk.label, { 'text-anchor': mk.left ? 'end' : 'start' }); });
    (cfg.hlines || []).forEach((hl) => { el('line', { x1: m.l, x2: W - m.r, y1: fy(hl.y), y2: fy(hl.y), class: 'axis' }, g); });
    cfg.series.forEach((s) => {
      if (s.pts && s.pts.length && !s.noLine) {
        const d = s.pts.map(([a, b], i) => (i ? (s.step ? 'H' + fx(a).toFixed(1) + ' V' + fy(b).toFixed(1) : 'L' + fx(a).toFixed(1) + ' ' + fy(b).toFixed(1)) : 'M' + fx(a).toFixed(1) + ' ' + fy(b).toFixed(1))).join(' ');
        el('path', { d, class: 'ln ' + s.cls, opacity: s.faint ? 0.45 : 1 }, g);
      }
      (s.dots || []).forEach(([a, b]) => el('circle', { cx: fx(a), cy: fy(b), r: 4.5, class: 'dot ' + s.fcls }, g));
      if (s.endLabel && s.pts && s.pts.length) { const [a, b] = s.pts[s.pts.length - 1]; txt(g, fx(a) + 8, fy(b) + 4, s.endLabel, { class: 'lbl' }); }
    });
    (cfg.rings || []).forEach((r) => { el('circle', { cx: fx(r.x), cy: fy(r.y), r: 7, class: 'ring' }, g); if (r.label) txt(g, fx(r.x) + (r.left ? -11 : 11), fy(r.y) + (r.dy || -9), r.label, { class: 'lbl', 'text-anchor': r.left ? 'end' : 'start' }); });
    // hover / keyboard layer
    const snaps = cfg.hoverX || [];
    if (snaps.length && cfg.tip) {
      const cross = el('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' }, svg);
      const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; box.appendChild(tip);
      let idx = -1;
      const show = (i) => {
        idx = Math.max(0, Math.min(snaps.length - 1, i));
        const xv = snaps[idx], px = fx(xv);
        cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
        tip.innerHTML = cfg.tip(xv); tip.hidden = false;
        const br = box.getBoundingClientRect(), sr = svg.getBoundingClientRect();
        const scale = sr.width / W, left = sr.left - br.left + px * scale;
        const tw = tip.offsetWidth;
        tip.style.left = Math.max(4, Math.min(br.width - tw - 4, left + 12 + tw > br.width ? left - tw - 12 : left + 12)) + 'px';
        tip.style.top = (sr.top - br.top + m.t * scale + 4) + 'px';
      };
      const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
      const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, class: 'hit' }, svg);
      hit.addEventListener('pointermove', (e) => {
        const sr = svg.getBoundingClientRect(), px = (e.clientX - sr.left) * (W / sr.width);
        let best = 0, bd = Infinity;
        snaps.forEach((v, i) => { const d = Math.abs(fx(v) - px); if (d < bd) { bd = d; best = i; } });
        show(best);
      });
      hit.addEventListener('pointerleave', hide);
      svg.addEventListener('focus', () => show(idx < 0 ? 0 : idx));
      svg.addEventListener('blur', hide);
      svg.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { show(idx + 1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { show(idx - 1); e.preventDefault(); }
        else if (e.key === 'Escape') hide();
      });
    }
    if (cfg.table) {
      const det = document.createElement('details'); det.className = 'tview';
      const sm = document.createElement('summary'); sm.textContent = 'Show the numbers as a table'; det.appendChild(sm);
      const wrap = document.createElement('div'); wrap.className = 'tscroll';
      const t = document.createElement('table'); t.className = 'ref tight';
      const tr = document.createElement('tr');
      cfg.table.head.forEach((h) => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
      t.appendChild(tr);
      cfg.table.rows.forEach((r) => { const row = document.createElement('tr'); r.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c; if (i) td.className = 'num'; row.appendChild(td); }); t.appendChild(row); });
      wrap.appendChild(t); det.appendChild(wrap); box.appendChild(det);
    }
    if (cfg.keyHint !== false && snaps.length) { const p = document.createElement('p'); p.className = 'csub'; p.style.margin = '2px 4px'; p.textContent = 'Hover, or focus the chart and use the arrow keys, to read values.'; box.appendChild(p); }
  }

  // ================================================================== FIGURE OF MERIT tab
  (function () {
    const setv = (id, s) => { $(id).textContent = s; };
    function whatif() {
      const t = +$('#wi-t').value, a = +$('#wi-a').value, p = +$('#wi-p').value;
      setv('#wi-t-v', pct(t, 0)); setv('#wi-a-v', pct(a, 0)); setv('#wi-p-v', pct(p, 0));
      const rT = Math.pow(1 + t / 100, L.EXP), rA = 1 + a / 100, rP = 1 + p / 100, r = rT * rA * rP;
      const cls = r < 1 ? 'delta-good' : r > 1 ? 'delta-bad' : '';
      $('#wi-out').innerHTML = `<p style="margin:6px 0 0">FoM × <b>${rT.toFixed(3)}</b> (time<sup>2.3</sup>) × <b>${rA.toFixed(3)}</b> (area) × <b>${rP.toFixed(3)}</b> (power) = <b class="${cls}">${r.toFixed(3)}</b>, so the FoM changes by <b class="${cls}">${pct((r - 1) * 100)}</b>${r < 1 ? ' (an improvement)' : r > 1 ? ' (worse)' : ''}.</p>`;
    }
    ['#wi-t', '#wi-a', '#wi-p'].forEach((id) => $(id).addEventListener('input', whatif));
    whatif();

    function periodChart() {
      const tau0 = +$('#pt-tau0').value, d = +$('#pt-d').value, gg = +$('#pt-g').value, tmin = +$('#pt-min').value;
      setv('#pt-tau0-v', tau0.toFixed(2) + ' ns'); setv('#pt-d-v', (d * 100).toFixed(0) + '%'); setv('#pt-g-v', '+' + (gg * 100).toFixed(0) + '% area'); setv('#pt-min-v', tmin.toFixed(2) + ' ns');
      const lo = Math.max(0.5, Math.min(tmin, tau0) * 0.85), hi = Math.max(tau0 * 2, tmin * 1.5);
      const o = { tau0, d, g: gg };
      const pts = [], dead = [];
      for (let i = 0; i <= 240; i++) { const t = lo + (hi - lo) * i / 240; (t >= tmin ? pts : dead).push([t, L.relFomPeriod(t, o)]); }
      let best = pts.reduce((b, p) => (p[1] < b[1] ? p : b), pts[0]);
      const ys = pts.map((p) => p[1]).concat(dead.map((p) => p[1]));
      const ymax = Math.min(Math.max(...ys) * 1.05, 4), ymin = Math.max(0, Math.min(...ys) * 0.9);
      const yt = niceTicks(ymin, ymax, 5);
      const snaps = pts.filter((_, i) => i % 6 === 0).map((p) => p[0]);
      chart($('#pt-chart'), {
        title: 'FoM relative to the reference period', sub: 'One series: the model above. Left of the red line, timing fails, so those periods are not allowed.',
        aria: 'Line chart of relative FoM against clock period, with a vertical line at the fastest period that meets timing',
        x: { min: lo, max: hi, ticks: niceTicks(lo, hi, 6), label: 'clock period (ns)', fmt: (v) => v.toFixed(2) },
        y: { min: yt[0], max: yt[yt.length - 1], ticks: yt, label: 'FoM / FoM(τ0)', fmt: (v) => v.toFixed(2) },
        series: [{ name: 'model', cls: 's1', pts }, { name: 'not allowed', cls: 'sm', pts: dead, faint: true }],
        bands: [{ x0: lo, x1: tmin, label: 'fails timing' }], marks: [{ x: tmin, cls: 'cap' }], hlines: [{ y: 1 }],
        rings: [{ x: best[0], y: best[1], label: `best: ${best[0].toFixed(2)} ns, ×${best[1].toFixed(3)}`, dy: -12 }],
        hoverX: snaps, tip: (t) => `<div>period <b>${t.toFixed(2)} ns</b></div><div class="row"><span class="key" style="border-top-color:var(--s1)"></span><b>×${L.relFomPeriod(t, o).toFixed(3)}</b> FoM vs τ0</div>${t < tmin ? '<div class="c-warn">fails timing</div>' : ''}`,
        table: { head: ['period (ns)', 'FoM / FoM(τ0)'], rows: snaps.map((t) => [t.toFixed(2), L.relFomPeriod(t, o).toFixed(3)]) },
      });
      $('#pt-note').innerHTML = `With these settings the best allowed period is ${best[0].toFixed(2)} ns, ${pct((best[1] - 1) * 100)} vs ${tau0.toFixed(2)} ns. ` +
        (best[0] - tmin < 0.02 * tmin ? 'It sits at the timing wall: pushing the clock pays all the way down.' : 'It sits above the timing wall: the last bit of speed costs more area than it saves time.');
    }
    ['#pt-tau0', '#pt-d', '#pt-g', '#pt-min'].forEach((id) => $(id).addEventListener('input', periodChart));

    function peChart() {
      const aPe = +$('#pe-a').value, aFixed = +$('#pe-f').value;
      setv('#pe-a-v', comma(aPe) + ' µm²'); setv('#pe-f-v', comma(aFixed) + ' µm²');
      const o = { aPe, aFixed }, pmax = Math.floor((L.AREA_CAP - aFixed) / aPe);
      const pts = [], over = [];
      for (let P = 5; P <= 160; P++) (P <= pmax ? pts : over).push([P, L.relFomPE(P, o)]);
      const eff = []; for (let t = 1; t <= 52; t++) { const P = L.efficientP(t); if (P >= 5 && P <= 160 && !eff.includes(P)) eff.push(P); }
      eff.sort((x, y) => x - y);
      const effIn = eff.filter((P) => P <= pmax);
      const best = effIn.length ? effIn.reduce((b, P) => (L.relFomPE(P, o) < L.relFomPE(b, o) ? P : b), effIn[0]) : null;
      const all = pts.concat(over).map((p) => p[1]);
      const yt = niceTicks(Math.min(...all) * 0.9, Math.min(Math.max(...all), 3) * 1.05, 5);
      chart($('#pe-chart'), {
        title: 'FoM relative to 16 PEs', sub: 'The sawtooth comes from the tile count: between two dots the cycles stay the same while area and power grow. Dots mark the tile-efficient PE counts; past the red line the design breaks the 1,000,000 µm² cap.',
        aria: 'Line chart of relative FoM against PE count, sawtooth shaped, with dots at tile-efficient PE counts and a vertical line at the area cap',
        x: { log2: true, min: 5, max: 160, ticks: [8, 16, 32, 64, 128], label: 'PE count (log scale)' },
        y: { min: yt[0], max: yt[yt.length - 1], ticks: yt, label: 'FoM / FoM(16 PEs)', fmt: (v) => v.toFixed(2) },
        series: [{ name: 'model', cls: 's1', fcls: 'f1', pts, dots: effIn.map((P) => [P, L.relFomPE(P, o)]) }, { name: 'over the cap', cls: 'sm', fcls: 'fm', pts: over, faint: true }],
        marks: pmax >= 5 && pmax <= 160 ? [{ x: pmax, cls: 'cap', label: `area cap: ${pmax} PEs`, left: true }] : [], hlines: [{ y: 1 }],
        rings: best ? [{ x: best, y: L.relFomPE(best, o), label: `best: ${best} PEs`, dy: 18 }] : [],
        hoverX: eff, tip: (P) => { const t = L.tiles(P, 'INT8'); return `<div><b>${P}</b> PEs, ${t} tile${t > 1 ? 's' : ''}</div><div>Σ cycles <b>${comma(L.sumCycles(P))}</b></div><div>area ≈ <b>${comma(aFixed + P * aPe)}</b> µm²${P > pmax ? ' <span class="c-warn">over the cap</span>' : ''}</div><div class="row"><span class="key" style="border-top-color:var(--s1)"></span><b>×${L.relFomPE(P, o).toFixed(3)}</b> FoM vs 16 PEs</div>`; },
        table: { head: ['PEs', 'tiles', 'Σ cycles', 'area (µm²)', 'FoM / FoM(16)'], rows: eff.map((P) => [String(P), String(L.tiles(P, 'INT8')), comma(L.sumCycles(P)), comma(aFixed + P * aPe) + (P > pmax ? ' (over cap)' : ''), L.relFomPE(P, o).toFixed(3)]) },
      });
      $('#pe-note').innerHTML = best ? `Under the cap, the best tile-efficient count with these settings is <b>${best} PEs</b> (×${L.relFomPE(best, o).toFixed(3)} vs 16, about ${comma(aFixed + best * aPe)} µm²). Up to ${pmax} PEs fit.` : 'Not even 5 PEs fit under the cap with these settings.';
    }
    ['#pe-a', '#pe-f'].forEach((id) => $(id).addEventListener('input', peChart));
    onShow.fom = () => { periodChart(); peChart(); };
  })();

  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || raw;
    const a = Math.floor(lo / step) * step, out = [];
    for (let v = a; v <= hi + step * 0.5; v += step) out.push(+v.toFixed(10));
    return out;
  }

  // ================================================================== CYCLE MODEL tab
  (function () {
    // the toy timeline: 2 tiles of a 3-column matrix
    function timeline() {
      const reps = [];
      for (let t = 0; t < 2; t++) { reps.push(['CLR', 'c-clr', 'NOP', 'CLR']); for (let j = 0; j < 3; j++) reps.push(['MAC', 'c-mac', 'READ', 'MAC']); reps.push(['OUT', 'c-out', 'NOP', 'OUT']); reps.push(['WR', 'c-wr', 'WRITE', 'NOP']); }
      reps.push(['pad', 'c-pad', 'READ', 'MAC']);
      const R = reps.length, N = R + 8, cw = 33, lw = 150, rh = 26, top = 22;
      const W = lw + N * cw + 120, H = top + 6 * rh + 56;
      const svg = el('svg', { class: 'tl', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Timeline of a 13-repetition toy program: 5 reset cycles, memory operations in cycles 5 to 17, PE operations one cycle later, then the testbench wait; the testbench reports 20 cycles' });
      const rows = ['clock cycle', 'rst_n', 'memory op (buf_inst)', 'PE op (pe_inst)', 'MEM2 write commits', 'testbench'];
      rows.forEach((r, i) => txt(svg, 6, top + i * rh + 17, r, { class: i === 0 ? 'mut' : '' }));
      for (let c = 0; c < N; c++) {
        const x = lw + c * cw;
        txt(svg, x + cw / 2, top + 17, String(c), { 'text-anchor': 'middle', class: 'mut' });
        el('rect', { x, y: top + rh + 3, width: cw, height: rh - 6, class: 'cell ' + (c < 5 ? 'c-rst' : 'c-idle') }, svg);
        if (c === 2) txt(svg, x + cw / 2, top + rh + 17, 'reset', { 'text-anchor': 'middle' });
      }
      reps.forEach((r, k) => {
        const cb = 5 + k, cp = 6 + k;
        el('rect', { x: lw + cb * cw, y: top + 2 * rh + 3, width: cw, height: rh - 6, class: 'cell ' + r[1] }, svg);
        txt(svg, lw + cb * cw + cw / 2, top + 2 * rh + 17, r[2] === 'NOP' ? '·' : r[2] === 'READ' ? 'RD' : 'WR', { 'text-anchor': 'middle' });
        el('rect', { x: lw + cp * cw, y: top + 3 * rh + 3, width: cw, height: rh - 6, class: 'cell ' + r[1] }, svg);
        txt(svg, lw + cp * cw + cw / 2, top + 3 * rh + 17, r[3] === 'NOP' ? '·' : r[3], { 'text-anchor': 'middle' });
        if (r[2] === 'WRITE') { const x = lw + (cb + 2) * cw; el('line', { x1: x, x2: x, y1: top + 4 * rh + 2, y2: top + 5 * rh - 2, class: 'brace', 'stroke-width': 2.5 }, svg); txt(svg, x - 3, top + 4 * rh + 17, 'commit', { 'text-anchor': 'end' }); }
      });
      const cDone = 6 + R, cDump = cDone + 1;
      const xd = lw + cDone * cw, xu = lw + (cDump + 1) * cw;
      el('line', { x1: xd, x2: xd, y1: top + 5 * rh + 2, y2: top + 6 * rh - 2, class: 'brace' }, svg);
      txt(svg, xd - 3, top + 5 * rh + 17, 'complete', { 'text-anchor': 'end' });
      el('line', { x1: xu - cw, x2: xu - cw, y1: top + 5 * rh + 2, y2: top + 6 * rh - 2, class: 'brace', 'stroke-width': 2.5 }, svg);
      txt(svg, xu - cw + 4, top + 5 * rh + 17, 'dump: prints 20', {});
      // braces under the rows
      const by = top + 6 * rh + 12;
      const brace = (c0, c1, label) => { const x0 = lw + c0 * cw + 2, x1 = lw + c1 * cw - 2; el('path', { d: `M ${x0} ${by} v 6 H ${x1} v -6`, class: 'brace' }, svg); txt(svg, (x0 + x1) / 2, by + 20, label, { 'text-anchor': 'middle' }); };
      brace(0, 5, '5 reset');
      brace(5, 11, 'tile 0: 3 + 3');
      brace(11, 17, 'tile 1: 3 + 3');
      brace(17, 18, '0-word');
      brace(18, 19, 'PE');
      brace(19, 20, 'wait');
      $('#tl-box').appendChild(svg);
    }
    timeline();

    const off = D.cycles.official;
    const byP = {};
    off.forEach((r) => { (byP[r.P] = byP[r.P] || {})[r.mode] = r; });
    const Ps = Object.keys(byP).map(Number).sort((a, b) => a - b);
    // table
    let h = '<table class="ref tight"><caption>Measured on the official tests (Icarus 13.0; Verilator 5.052 gave the same counts). Σ is the sum of the three; T is Σ at 2.000 ns.</caption><tr><th class="num">PEs</th><th class="num">tiles</th><th class="num">imem depth</th>' +
      L.MODES.map((m) => `<th class="num">${m} measured</th><th class="num">${m} model</th>`).join('') + '<th class="num">Σ cycles</th><th class="num">T at 2 ns (ns)</th><th>verdict</th></tr>';
    Ps.forEach((P) => {
      const r = byP[P];
      const eff = L.efficientP(L.tiles(P, 'INT8')) === P;
      let sum = 0, okAll = true, note = '';
      const cells = L.MODES.map((m) => {
        const x = r[m];
        if (!x) return '<td></td><td></td>';
        if (x.cycles === null) { okAll = false; note = 'INT8: staff ivd-sim fails (P = 4)'; return `<td class="num bad">—</td><td class="num">${comma(x.model)}</td>`; }
        sum += x.cycles;
        const ok = x.cycles === x.model;
        if (!ok) okAll = false;
        return `<td class="num">${comma(x.cycles)}</td><td class="num ${ok ? 'ok' : 'bad'}">${comma(x.model)}</td>`;
      }).join('');
      const eq = L.MODES.every((m) => !r[m] || r[m].cycles === null || (r[m].icarus === 'EQUIVALENT' && (!r[m].verilator || r[m].verilator === 'EQUIVALENT')));
      h += `<tr${eff ? '' : ' class="dim"'}><td class="num">${P}${eff ? '' : '<sup>*</sup>'}</td><td class="num">${L.tiles(P, 'INT8')}</td><td class="num">${r.INT8 ? r.INT8.imem_depth : ''}</td>${cells}` +
        `<td class="num">${note ? '—' : comma(sum)}</td><td class="num">${note ? '—' : comma(sum * 2)}</td><td>${note ? '<span class="c-warn">' + note + '</span>' : eq && okAll ? '<span class="c-ok">equivalent, exact</span>' : '<span class="c-warn">check</span>'}</td></tr>`;
    });
    h += '</table>';
    $('#cy-table').innerHTML = h;
    const nRuns = off.filter((r) => r.cycles !== null).length;
    $('#cy-foot').innerHTML = `${nRuns} runs, every one equivalent to the staff Python reference and equal to the model. <sup>*</sup> Not tile-efficient: the same tile count is reachable with fewer PEs (e.g. 48 → 43, 96 → 86). The imem depth column is what the run needed: below 9 PEs, 128 is too small.`;
    const odd = D.cycles.odd.map((r) => `${r.P} PEs, ${r.mode} ${r.rows}×${r.cols}: ${comma(r.cycles)} cycles (model ${comma(r.model)})`).join('; ');
    $('#cy-odd').textContent = odd + '. All equivalent in Icarus' + (D.cycles.odd.every((r) => r.verilator === 'EQUIVALENT') ? ' and Verilator.' : '.');

    // chart: measured dots and the model staircase, log-log
    const cls = { INT8: ['s1', 'f1', 's1'], INT16: ['s2', 'f2', 's2'], INT32: ['s3', 'f3', 's3'] };
    const series = L.MODES.map((m) => {
      const pts = []; for (let P = 4; P <= 128; P++) pts.push([P, L.cycles(P, m)]);
      const dots = off.filter((r) => r.mode === m && r.cycles !== null).map((r) => [r.P, r.cycles]);
      return { name: m, cls: cls[m][0], fcls: cls[m][1], pts, dots, endLabel: m, step: true };
    });
    function drawCy() {
      chart($('#cy-chart'), {
        title: 'Cycles vs PE count: measured (dots) and the model (line)', sub: 'Both axes are logarithmic. The line is the formula evaluated at every integer PE count; it steps wherever ceil(256 / P) changes.',
        aria: 'Log-log chart of cycle count against PE count for INT8, INT16 and INT32; measured dots lie on the model lines',
        legend: [{ v: 's1', label: 'INT8' }, { v: 's2', label: 'INT16' }, { v: 's3', label: 'INT32' }, { v: 'muted', label: 'line = model, dots = measured', dot: true }],
        x: { log2: true, min: 4, max: 128, ticks: [4, 8, 16, 32, 64, 128], label: 'PE count (log scale)' },
        y: { log10: true, min: 400, max: 80000, ticks: [500, 1000, 2000, 5000, 10000, 20000, 50000], label: 'cycles (log scale)', fmt: (v) => (v >= 1000 ? v / 1000 + 'K' : String(v)) },
        series, right: 56,
        hoverX: Ps, tip: (P) => { const r = byP[P]; return `<div><b>${P}</b> PEs, ${L.tiles(P, 'INT8')} tiles</div>` + L.MODES.map((m) => `<div class="row"><span class="key" style="border-top-color:var(--${cls[m][2]})"></span>${m} <b>${r[m] && r[m].cycles !== null ? comma(r[m].cycles) : '—'}</b> <span class="muted">model ${comma(L.cycles(P, m))}</span></div>`).join(''); },
        table: { head: ['PEs', 'INT8', 'INT16', 'INT32'], rows: Ps.map((P) => [String(P)].concat(L.MODES.map((m) => (byP[P][m] && byP[P][m].cycles !== null ? comma(byP[P][m].cycles) : 'n/a')))) },
      });
    }

    // truncation demo table
    const tr = D.cycles.trunc;
    $('#cy-trunc').innerHTML = '<table class="ref tight"><tr><th class="num">PEs</th><th class="num">instructions in mat_mul.asm</th><th class="num">lines ivd-as kept</th><th class="num">INST_COUNT passed</th><th class="num">what the 7-bit port holds</th><th class="num">cycles printed</th><th class="num">MEM2 rows written / needed</th><th>result</th></tr>' +
      tr.map((r) => `<tr><td class="num">${r.P}</td><td class="num">${r.asm_lines}</td><td class="num">${r.inst_bits_lines}${r.asm_lines > r.inst_bits_lines ? ' (' + (r.asm_lines - r.inst_bits_lines) + ' cut)' : ' (no zero word left)'}</td><td class="num">${r.inst_count_passed}</td><td class="num">${r.inst_count_seen}</td><td class="num">${comma(r.icarus.cycles)}</td><td class="num">${r.icarus.rtl_rows} / ${r.rows_needed}</td><td class="bad">${r.icarus.result}</td></tr>`).join('') + '</table>';

    // variants
    const V = D.cycles.variants.filter((v) => v.sim === 'icarus');
    const base = (P, m) => byP[P][m].cycles;
    let vh = '<table class="ref tight"><tr><th>Design</th><th class="num">PEs</th>' + L.MODES.map((m) => `<th class="num">${m}</th>`).join('') + '<th class="num">Σ cycles</th><th class="num">FoM change (same area, power, period)</th></tr>';
    [16, 24].forEach((P) => {
      const s0 = L.MODES.reduce((s, m) => s + base(P, m), 0);
      vh += `<tr><td>zero-bubble reference</td><td class="num">${P}</td>${L.MODES.map((m) => `<td class="num">${comma(base(P, m))}</td>`).join('')}<td class="num">${comma(s0)}</td><td class="num">—</td></tr>`;
      [['bubble', 'one bubble per instruction'], ['tworep', 'two cycles per repetition']].forEach(([k, label]) => {
        const rows = L.MODES.map((m) => V.find((v) => v.kind === k && v.P === P && v.mode === m));
        if (rows.some((x) => !x)) return;
        const s = rows.reduce((a, x) => a + x.cycles, 0);
        const f = Math.pow(s / s0, L.EXP);
        vh += `<tr><td>${label}</td><td class="num">${P}</td>${rows.map((x) => `<td class="num">${comma(x.cycles)}${x.cycles !== x.model ? '<sup>†</sup>' : ''}</td>`).join('')}<td class="num">${comma(s)}</td><td class="num bad">${f < 1.5 ? pct((f - 1) * 100, 2) : '×' + f.toFixed(2)}</td></tr>`;
      });
    });
    vh += '</table>';
    $('#cy-var').innerHTML = vh;
    const gl = V.filter((v) => v.cycles !== v.model);
    $('#cy-glitch').innerHTML = gl.length ? `<sup>†</sup> Measured here: ${gl.map((v) => `${v.P} PEs ${v.mode} ${comma(v.cycles)} vs ${comma(v.model)}`).join(', ')}.` : '';
    onShow.cycles = drawCy;
  })();

  // ================================================================== CALCULATOR tab
  (function () {
    const ids = ['c-p', 'c-per', 'c-cycsrc', 'c-c8', 'c-c16', 'c-c32', 'c-area', 'c-pow', 'c-slack'];
    const num = (id) => { const v = parseFloat($('#' + id).value); return Number.isFinite(v) ? v : NaN; };
    const saved = store.get('calc', null);
    if (saved) ids.forEach((id) => { if (saved[id] !== undefined && $('#' + id)) $('#' + id).value = saved[id]; });
    ['c-who', 'c-tag', 'c-commit', 'c-change', 'c-note'].forEach((id) => { const v = store.get(id, ''); if (v) $('#' + id).value = v; });
    function syncModel() {
      const P = Math.max(1, Math.round(num('c-p') || 16));
      const model = $('#c-cycsrc').value === 'model';
      ['c-c8', 'c-c16', 'c-c32'].forEach((id, i) => { const inp = $('#' + id); inp.readOnly = model; if (model) inp.value = L.cycles(P, L.MODES[i]); });
    }
    function current() {
      const P = Math.round(num('c-p')), per = num('c-per');
      const c = [num('c-c8'), num('c-c16'), num('c-c32')];
      const area = num('c-area'), power = num('c-pow'), slack = num('c-slack');
      const f = L.fom(c[0], c[1], c[2], per, area, power);
      return { P, per, c, area, power, slack, T: f.T, f };
    }
    function stat(k, v, cls) { return `<div><dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd></div>`; }
    function render() {
      syncModel();
      const s = {}; ids.forEach((id) => { s[id] = $('#' + id).value; }); store.set('calc', s);
      const x = current(), f = x.f;
      const okT = Number.isFinite(f.T);
      $('#c-out').innerHTML = [
        stat('T INT8', okT ? comma(f.T8.toFixed(1)) + ' <small>ns</small>' : '—'), stat('T INT16', okT ? comma(f.T16.toFixed(1)) + ' <small>ns</small>' : '—'),
        stat('T INT32', okT ? comma(f.T32.toFixed(1)) + ' <small>ns</small>' : '—'), stat('T sum', okT ? comma(f.T.toFixed(1)) + ' <small>ns</small>' : '—'),
        stat('FoM', Number.isFinite(f.fom) ? supE(fmtG(f.fom, 5)) : '<small>needs area and power</small>'),
      ].join('');
      const ck = [];
      if (Number.isFinite(x.slack)) ck.push(x.slack >= 0 ? `<span class="c-ok">Timing met</span> (worst slack ${sgn(x.slack, 4)} ns).` : `<span class="c-warn">Timing violated</span> (worst slack ${sgn(x.slack, 4)} ns). This run's period can't be used for the FoM; synthesize at a longer period, or fix the path.`);
      if (Number.isFinite(x.area)) ck.push(x.area <= L.AREA_CAP ? `<span class="c-ok">Under the area cap</span> (${(100 * x.area / L.AREA_CAP).toFixed(1)}% of 1,000,000 µm²).` : '<span class="c-warn">Over the 1,000,000 µm² area cap.</span>');
      if (x.P >= 1) {
        const im = L.imem(x.P);
        ck.push(im.defaultOk ? `${x.P} PEs: ${im.lines} instructions per test, so the default imem depth of 128 is enough.` : `<span class="c-warn">${x.P} PEs: ${im.lines} instructions per test, so pass --controller_imem_depth ${im.depth} to ivd-gv, ivd-as and ivd-sim.</span>`);
        if (x.P === 4) ck.push('<span class="c-warn">4 PEs: the staff ivd-sim cannot run the INT8 test (16-bit MemAOffset overflow), so there is no INT8 reference.</span>');
        if (L.efficientP(L.tiles(x.P, 'INT8')) !== x.P) ck.push(`${x.P} PEs take ${L.tiles(x.P, 'INT8')} tiles, the same as ${L.efficientP(L.tiles(x.P, 'INT8'))} PEs: the extra PEs only add area and power.`);
        if ($('#c-cycsrc').value === 'typed' && x.c.every(Number.isFinite)) {
          const dm = L.MODES.map((m, i) => x.c[i] - L.cycles(x.P, m));
          if (dm.some((d) => d !== 0)) ck.push(`Your counts are ${dm.map((d, i) => `${d >= 0 ? '+' : MINUS}${Math.abs(d)} (${L.MODES[i]})`).join(', ')} vs the zero-bubble model for ${x.P} PEs. ` + (dm.every((d) => d === dm[0]) ? 'The same offset in every mode suggests a fixed extra latency (fine).' : 'Different offsets per mode usually mean bubbles per tile or per instruction (worth fixing), or counts from a different PE count.'));
          else ck.push(`Your counts equal the zero-bubble model for ${x.P} PEs.`);
        }
      }
      $('#c-checks').innerHTML = ck.map((c) => `<p class="cap" style="margin:4px 0">${c}</p>`).join('');
      compare(x);
    }
    function compare(x) {
      const base = store.get('base', null), best = store.get('best', null);
      const out = [];
      const ok = Number.isFinite(x.f.fom);
      [['baseline', base], ['previous best', best]].forEach(([name, r]) => {
        if (!r) { out.push(`<p class="cap">No ${name} saved yet.</p>`); return; }
        const line = `Saved ${name}: ${r.P} PEs, ${r.per} ns, FoM ${supE(fmtG(r.fom, 5))}`;
        if (!ok) { out.push(`<p class="cap">${line}.</p>`); return; }
        const imp = L.pctImprovement(r.fom, x.f.fom);
        out.push(`<p style="margin:6px 0">${line}. Now: <b class="${imp >= 0 ? 'delta-good' : 'delta-bad'}">${imp >= 0 ? '' : MINUS}${Math.abs(imp).toFixed(2)}% ${imp >= 0 ? 'better' : 'worse'}</b> (improvement = (FoM<sub>ref</sub> − FoM<sub>new</sub>)/FoM<sub>ref</sub>).</p>`);
        if (name === 'baseline') {
          const fa = L.factors({ T: r.T, area: r.area, power: r.power }, { T: x.f.T, area: x.area, power: x.power });
          const lg = [Math.log(fa.rT), Math.log(fa.rA), Math.log(fa.rP)], tot = lg.reduce((a, b) => a + b, 0);
          const rows = [['time²·³', fa.rT, lg[0]], ['area', fa.rA, lg[1]], ['power', fa.rP, lg[2]]];
          const mx = Math.max(0.05, ...lg.map(Math.abs));
          out.push('<div class="factors">' + rows.map(([n, rr, l]) => `<span>${n}</span><span class="barwrap"><span class="mid"></span><span class="bar ${l > 0 ? 'up' : 'down'}" style="position:absolute;top:0;height:10px;${l < 0 ? `right:50%;width:${(50 * Math.abs(l) / mx).toFixed(1)}%;border-radius:4px 0 0 4px` : `left:50%;width:${(50 * Math.abs(l) / mx).toFixed(1)}%`}"></span></span><span class="num">×${rr.toFixed(3)}</span>`).join('') + '</div>');
          out.push(`<p class="cap">Against the baseline: time<sup>2.3</sup> ×${fa.rT.toFixed(3)} · area ×${fa.rA.toFixed(3)} · power ×${fa.rP.toFixed(3)} = ×${fa.ratio.toFixed(3)}. Bars to the left (green) lowered the FoM, bars to the right (red) raised it; bar length is the size of each factor's log, so the three lengths add up to the net change (${tot < 0 ? 'net lower' : 'net higher'}).</p>`);
        }
      });
      $('#c-compare').innerHTML = out.join('');
    }
    function snapshot() { const x = current(); return { P: x.P, per: x.per, c: x.c, area: x.area, power: x.power, slack: x.slack, T: x.f.T, fom: x.f.fom }; }
    $('#c-savebase').addEventListener('click', () => { const s = snapshot(); if (!Number.isFinite(s.fom)) { $('#c-rowmsg').textContent = 'Fill in area and power first.'; return; } store.set('base', s); if (!store.get('best', null)) store.set('best', s); render(); });
    $('#c-savebest').addEventListener('click', () => { const s = snapshot(); if (!Number.isFinite(s.fom)) { $('#c-rowmsg').textContent = 'Fill in area and power first.'; return; } store.set('best', s); render(); });
    $('#c-forget').addEventListener('click', () => { store.del('base'); store.del('best'); render(); });
    $('#c-row').addEventListener('click', () => {
      ['c-who', 'c-tag', 'c-commit', 'c-change', 'c-note'].forEach((id) => store.set(id, $('#' + id).value));
      const x = current(), base = store.get('base', null), best = store.get('best', null);
      const cell = (s) => String(s === undefined || s === null || s === '' ? '' : s).replace(/\|/g, '\\|');
      const ok = Number.isFinite(x.f.fom);
      const vs = (r) => (r && ok ? (L.pctImprovement(r.fom, x.f.fom) >= 0 ? '+' : '-') + Math.abs(L.pctImprovement(r.fom, x.f.fom)).toFixed(2) + '%' : '');
      const d0 = new Date(), today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
      // columns of the table in docs/experiments.md: # | Date | Who | Tag (runs/) | Commit | Change | PEs | Period (ns) | Cycles 8/16/32 | Area | Power | Worst slack | FoM | % vs prev best | % vs baseline
      let row = ['|  ', today, cell($('#c-who').value), cell($('#c-tag').value), cell($('#c-commit').value), cell($('#c-change').value), x.P, x.per,
        x.c.map((c) => (Number.isFinite(c) ? c : '?')).join('/'), Number.isFinite(x.area) ? x.area : '?', Number.isFinite(x.power) ? x.power : '?',
        Number.isFinite(x.slack) ? x.slack : '?', ok ? x.f.fom.toPrecision(5) : '?', vs(best), vs(base) + ' |'].join(' | ');
      const note = $('#c-note').value.trim();
      if (note) row += `\n- **#? ${$('#c-tag').value.trim() || 'run'}:** ${note}`;
      const pre = $('#c-rowout'); pre.hidden = false; pre.textContent = row;
      let copied = false;
      try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(row); copied = true; } } catch (e) { copied = false; }
      $('#c-rowmsg').textContent = copied ? 'Copied to the clipboard.' : 'Select the row below and copy it.';
    });
    ids.forEach((id) => $('#' + id).addEventListener('input', render));
    $('#c-cycsrc').addEventListener('change', render);

    // parser
    $('#sample').addEventListener('click', () => { $('#paste').value = L.SAMPLE; $('#c-p').value = 16; doParse(); });
    $('#clearpaste').addEventListener('click', () => { $('#paste').value = ''; $('#parse-out').innerHTML = ''; });
    $('#parse').addEventListener('click', doParse);
    function doParse() {
      const r = L.parseText($('#paste').value);
      const lines = [];
      const put = (k, v) => lines.push(k.padEnd(26) + v);
      put('clock period (ns)', r.period !== null ? String(r.period) : 'not found');
      put('slack lines', r.slacks.length ? r.slacks.map((s) => `${s.v} (${s.kind})`).join(', ') : 'not found');
      put('Total Dynamic Power', r.dynMw !== null ? r.dynMw.toPrecision(6) + ' mW' : 'not found');
      put('Cell Leakage Power', r.leakMw !== null ? r.leakMw.toPrecision(6) + ' mW' : 'not found');
      put('power table Total column', r.rowTotalMw !== null ? r.rowTotalMw.toPrecision(6) + ' mW' : 'not found');
      put('total power used', r.totalMw !== null ? r.totalMw.toPrecision(6) + ' mW' : 'not found');
      put('Total cell area', r.area !== null ? r.area + ' µm²' : 'not found');
      L.MODES.forEach((m) => put(m + ' cycles', r.cycles[m] !== undefined ? String(r.cycles[m]) : 'not found'));
      let html = `<pre class="parsed">${esc(lines.join('\n'))}</pre>`;
      if (r.notes.length) html += r.notes.map((n) => `<p class="cap c-warn" style="margin:4px 0">${esc(n)}</p>`).join('');
      if (r.unparsed.length) html += `<details class="tview" style="margin:6px 0"><summary>${r.unparsed.length} line${r.unparsed.length > 1 ? 's' : ''} not recognized (read them: check_error output lands here)</summary><pre class="parsed">${esc(r.unparsed.slice(0, 60).join('\n'))}</pre></details>`;
      $('#parse-out').innerHTML = html;
      if (r.period !== null) $('#c-per').value = r.period;
      if (r.worstSlack !== null) $('#c-slack').value = r.worstSlack;
      if (r.area !== null) $('#c-area').value = r.area;
      if (r.totalMw !== null) $('#c-pow').value = +r.totalMw.toPrecision(6);
      const got = L.MODES.filter((m) => r.cycles[m] !== undefined);
      if (got.length) {
        $('#c-cycsrc').value = 'typed';
        syncModel();
        got.forEach((m) => { $('#c-c' + m.slice(3)).value = r.cycles[m]; });
      }
      render();
    }
    render();
  })();

  // ================================================================== MULTIPLIER SHARING demo
  (function () {
    const box = $('#md-ctl');
    let mode = store.get('md-mode', 'INT32');
    const LANES = { INT8: 4, INT16: 2, INT32: 1 };
    const W = { INT8: 8, INT16: 16, INT32: 32 };
    let vals = store.get('md-vals', null) || { INT32: { a: ['-123456789'], b: ['987654321'] }, INT16: { a: ['-20000', '300'], b: ['-32768', '-7'] }, INT8: { a: ['-128', '127', '-5', '4'], b: ['-128', '-128', '3', '-2'] } };
    const EDGE = {
      INT32: [[['-2147483648'], ['-2147483648']], [['-2147483648'], ['-1']], [['2147483647'], ['2147483647']], [['-1'], ['-1']], [['0x0000FFFF'], ['0x0000FFFF']], [['0xFFFF0000'], ['0x00010000']], [['-5'], ['4']]],
      INT16: [[['-32768', '-32768'], ['-32768', '-32768']], [['32767', '-32768'], ['32767', '32767']], [['-1', '-1'], ['-1', '-1']], [['-5', '4'], ['3', '-2']]],
      INT8: [[['-128', '-128', '-128', '-128'], ['-128', '-128', '-128', '-128']], [['127', '-128', '-1', '0'], ['127', '127', '-1', '-128']], [['-5', '4', '-1', '3'], ['2', '-5', '-5', '4']]],
    };
    let edgeIdx = 0;
    function parseLane(s, w) {
      s = String(s).trim();
      let v;
      if (/^[-+]?0x[0-9a-f]+$/i.test(s)) { const neg = s.startsWith('-'); v = BigInt(s.replace(/^[-+]/, '')); if (neg) v = -v; v = L.sx(v, w); }
      else if (/^[-+]?\d+$/.test(s)) v = BigInt(s);
      else return null;
      const lo = -(1n << BigInt(w - 1)), hi = (1n << BigInt(w - 1)) - 1n;
      return v < lo || v > hi ? null : v;
    }
    function build() {
      const n = LANES[mode], w = W[mode];
      let h = `<label>Mode <select id="md-mode">${L.MODES.map((m) => `<option${m === mode ? ' selected' : ''}>${m}</option>`).join('')}</select></label>`;
      ['a', 'b'].forEach((op) => {
        for (let k = n - 1; k >= 0; k--) {
          const lab = n === 1 ? `${op} (signed 32-bit, decimal or 0x hex)` : `${op} lane ${k} (signed ${w}-bit)`;
          h += `<label>${lab} <input type="text" data-op="${op}" data-k="${k}" value="${esc(vals[mode][op][n - 1 - k])}" spellcheck="false"></label>`;
        }
      });
      box.innerHTML = h;
      $('#md-mode').addEventListener('change', (e) => { mode = e.target.value; store.set('md-mode', mode); edgeIdx = 0; build(); });
      $$('input[data-op]', box).forEach((inp) => inp.addEventListener('input', () => { vals[mode][inp.dataset.op][n - 1 - +inp.dataset.k] = inp.value; store.set('md-vals', vals); draw(); }));
      $('#md-btns').innerHTML = '<button class="small" id="md-rand">Random, full range</button><button class="small" id="md-small">Random, like the tests (−5…4)</button><button class="small" id="md-edge">Next edge case</button>';
      const setAll = (fn) => { ['a', 'b'].forEach((op) => { vals[mode][op] = Array.from({ length: n }, fn); }); store.set('md-vals', vals); build(); };
      $('#md-rand').addEventListener('click', () => setAll(() => { let v = 0n; for (let i = 0; i < w; i++) v = (v << 1n) | (Math.random() < 0.5 ? 1n : 0n); return String(L.sx(v, w)); }));
      $('#md-small').addEventListener('click', () => setAll(() => String(Math.floor(Math.random() * 10) - 5)));
      $('#md-edge').addEventListener('click', () => { const e = EDGE[mode][edgeIdx % EDGE[mode].length]; edgeIdx++; vals[mode].a = e[0].slice(); vals[mode].b = e[1].slice(); store.set('md-vals', vals); build(); });
      draw();
    }
    const B2 = (v, w) => L.bin(v, w);
    let vlist = [];
    function bitsRow(label, sub, word, colorOf, groupAt, valueText, cls) {
      let cells = '';
      for (let i = 63; i >= 0; i--) {
        const bit = (word >> BigInt(i)) & 1n;
        const c = ['b', bit ? '' : 'z', colorOf ? colorOf(i) : '', groupAt.includes(i + 1) && i !== 63 ? 'g' : ''].filter(Boolean).join(' ');
        cells += `<td class="${c}">${bit}</td>`;
      }
      vlist.push([label, valueText]);
      return `<tr class="${cls || ''}"><th>${label}${sub ? `<small>${sub}</small>` : ''}</th>${cells}</tr>`;
    }
    function draw() {
      const n = LANES[mode], w = W[mode];
      const parsed = { a: [], b: [] };
      let bad = null;
      ['a', 'b'].forEach((op) => { for (let k = 0; k < n; k++) { const v = parseLane(vals[mode][op][n - 1 - k], w); if (v === null) bad = `${op}${n > 1 ? ' lane ' + k : ''} isn't a signed ${w}-bit number`; parsed[op][k] = v; } });
      if (bad) { $('#md-out').innerHTML = `<p class="c-warn">${esc(bad)}.</p>`; return; }
      const A = L.pack(parsed.a, w), Bw = L.pack(parsed.b, w);
      const r = L.share(A, Bw, mode);
      const hex = (v) => '0x' + L.ux(v, 32).toString(16).padStart(8, '0').toUpperCase();
      let h = `<p class="cap" style="margin-top:8px">a = ${hex(A)}, b = ${hex(Bw)} as 32-bit words.</p><div class="opgrid">`;
      r.mults.forEach((mm, i) => {
        const ext = (e) => (e === 's' ? 'sign copy' : e === 'z' ? '0 (unsigned half)' : 'held at 0');
        const b17 = (v, e) => { const s = B2(v, 17); return `<span style="color:var(--m1);font-weight:700">${s[0]}</span>_${s.slice(1)}`; };
        h += `<div class="op"><b>${mm.name}</b> · ${esc(mm.role)}<div class="mono">x = ${b17(mm.x, mm.xe)} = ${mm.x}<br><span class="muted">17th bit: ${ext(mm.xe)}</span><br>y = ${b17(mm.y, mm.ye)} = ${mm.y}<br><span class="muted">17th bit: ${ext(mm.ye)}</span><br>x·y = ${mm.p}</div></div>`;
      });
      h += '</div>';
      const groups = mode === 'INT8' ? [16, 32, 48] : mode === 'INT16' ? [32] : [16, 32, 48];
      const colConcat = (i) => (mode === 'INT8' ? 'on' + (1 + Math.floor(i / 16)) : i >= 32 ? 'on4' : 'on1');
      vlist = [];
      let t = '<div class="mscroll"><table class="bits"><tr class="idx"><th></th>';
      for (let i = 63; i >= 0; i--) t += `<td class="b${groups.includes(i + 1) && i !== 63 ? ' g' : ''}">${i % 8 === 0 ? i : ''}</td>`;
      t += '</tr>';
      const srcs = mode === 'INT8' ? '{M3, M2, M1, M0}, 16 bits each' : '{M3[31:0], M0[31:0]}';
      t += bitsRow(mode === 'INT32' ? 'outer products, concatenated' : 'lane products, concatenated', srcs, r.concat, colConcat, groups, mode === 'INT32' ? `${L.sx(r.concat, 64)}` : 'the lane products side by side');
      if (mode === 'INT32') t += bitsRow('cross terms', '(M1 + M2) << 16: a 33-bit sum, sign-extended', r.cross, (i) => (i >= 16 && i < 49 ? 'on2' : ''), groups, `${L.sx(r.cross, 64)} = (${r.mults[1].p} + ${r.mults[2].p}) × 65,536`);
      const laneTxt = r.lanes.map((v, k) => (n > 1 ? `lane ${k}: ${v}` : String(v))).reverse().join(', ');
      t += bitsRow(mode === 'INT32' ? 'sum (64-bit add)' : 'word for the accumulator', mode === 'INT32' ? 'what MAC adds to acc' : `${r.laneWidth}-bit lanes, carries killed between them`, r.sum, null, groups, laneTxt, 'sum');
      const expWord = mode === 'INT32' ? L.ux(r.expect[0], 64) : L.pack(r.expect, r.laneWidth);
      t += bitsRow('true product', mode === 'INT32' ? 'BigInt a × b' : 'BigInt, lane by lane', expWord, null, groups, r.expect.map((v, k) => (n > 1 ? `lane ${k}: ${v}` : String(v))).reverse().join(', '));
      t += '</table></div>';
      h += t + '<dl class="wires">' + vlist.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '</dl>';
      h += `<p class="${r.ok ? 'verdict-ok' : 'verdict-bad'}">${r.ok ? 'Match: the shared multipliers give the true product' + (n > 1 ? ' in every lane.' : '.') : 'Mismatch (this should never happen; please report it).'}</p>`;
      if (mode === 'INT32') h += '<p class="cap">The outer products don\'t overlap because M0 = a<sub>L</sub>b<sub>L</sub> &lt; 2<sup>32</sup>. In the accumulator this becomes a three-input add (acc + outer + cross), usually one carry-save row and one ordinary adder.</p>';
      else h += `<p class="cap">${mode === 'INT16' ? 'M1 and M2 are idle in INT16, with their inputs held at 0 so they don\'t toggle. ' : ''}The accumulator adds this word lane by lane: its ${mode === 'INT16' ? 'carry at bit 32 is' : 'carries at bits 16, 32 and 48 are'} killed.</p>`;
      $('#md-out').innerHTML = h;
    }
    build();
  })();

  // ================================================================== BUILDING BLOCKS tab
  (function () {
    const bk = D.blocks;
    $('#bk-tool').textContent = bk.tool.replace(/\s*\(git sha1.*$/, '');
    const get = (m) => bk.blocks.find((b) => b.module === m);
    const rows = bk.blocks.map((b) => {
      const seq = b.relaxed.seq_area_um2 > 0;
      const cells = Object.entries(b.relaxed.cells).slice(0, 3).map(([c, n]) => `${n} ${c}`).join(', ');
      return `<tr><td>${esc(b.what)}</td><td class="num">${b.relaxed.area_um2.toFixed(1)}</td><td class="num">${b.array_relaxed ? b.array_relaxed.area_um2.toFixed(1) : ''}</td><td class="num">${seq ? '' : (b.relaxed.abc_delay_ps / 1000).toFixed(2)}</td><td class="muted" style="font-size:.78rem">${esc(cells)}</td></tr>`;
    }).join('');
    $('#bk-table').innerHTML = `<table class="ref tight"><caption><span class="label-est">Yosys + open Nangate45 estimate, not Design Compiler</span> Area-oriented mapping ("relaxed").</caption><tr><th>Block</th><th class="num">area (µm²)</th><th class="num">same, no Booth (µm²)</th><th class="num">ABC delay est. (ns)</th><th>largest cell counts</th></tr>${rows}</table>`;
    $('#bk-flow').innerHTML = `Flow: <code>${esc(bk.flow)}</code>. Multipliers use Yosys's Booth encoding (<code>synth -booth</code>), the kind of structure DesignWare also uses for large multipliers; the plain array mapping is shown for comparison.`;
    const order = ['mul32s', 'mul17s', 'mul16s', 'mul8s', 'add64_ks', 'add64', 'reg64_en', 'reg64_arst', 'reg64_norst', 'mux4_32'];
    const short = { mul32s: '32×32 mult', mul17s: '17×17 mult', mul16s: '16×16 mult', mul8s: '8×8 mult', add64: '64-bit add', add64_ks: '64-bit add (KS)', reg64_arst: '64b reg + reset', reg64_norst: '64b reg', reg64_en: '64b reg + enable', mux4_32: '4:1 mux ×32' };
    function drawBars() {
      const boxEl = $('#bk-chart'); boxEl.innerHTML = '';
      const h4 = document.createElement('h4'); h4.textContent = 'Area of each block (µm², area-oriented mapping)'; boxEl.appendChild(h4);
      const p = document.createElement('p'); p.className = 'csub'; p.textContent = 'One series, so one color. Values are printed at the bar ends.'; boxEl.appendChild(p);
      const Wd = 760, rh = 26, lw = 130, Hh = order.length * rh + 30, max = 5000;
      const svg = el('svg', { viewBox: `0 0 ${Wd} ${Hh}`, role: 'img', 'aria-label': 'Horizontal bar chart of building-block areas; the 32 by 32 multiplier is by far the largest' }, boxEl);
      const fx = (v) => lw + v / max * (Wd - lw - 90);
      [0, 1000, 2000, 3000, 4000, 5000].forEach((v) => { el('line', { x1: fx(v), x2: fx(v), y1: 4, y2: Hh - 22, class: 'grid' }, svg); txt(svg, fx(v), Hh - 6, comma(v), { 'text-anchor': 'middle' }); });
      order.forEach((m, i) => {
        const b = get(m); if (!b) return;
        const y = 8 + i * rh, a = b.relaxed.area_um2;
        txt(svg, lw - 8, y + 13, short[m], { 'text-anchor': 'end' });
        const wpx = Math.max(2, fx(a) - lw);
        el('path', { d: `M ${lw} ${y + 3} h ${wpx - 4} a 4 4 0 0 1 4 4 v 8 a 4 4 0 0 1 -4 4 h ${-(wpx - 4)} z`, class: 'f1' }, svg);
        txt(svg, fx(a) + 6, y + 14, a.toFixed(0), { class: 'lbl' });
      });
    }
    // sums
    const A = (m) => get(m).relaxed.area_um2;
    const naive = 4 * A('mul8s') + 2 * A('mul16s') + A('mul32s');
    const shared = 4 * A('mul17s');
    const regs = A('reg64_arst') * 1.5;
    $('#bk-sums').innerHTML = `<div class="tscroll"><table class="ref tight">
      <tr><th>Sum of blocks</th><th class="num">µm²</th><th>How it's made</th></tr>
      <tr><td>multipliers in a naive PE</td><td class="num">${comma(naive.toFixed(0))}</td><td>4 × 8×8 (${A('mul8s').toFixed(0)}) + 2 × 16×16 (${A('mul16s').toFixed(0)}) + 1 × 32×32 (${A('mul32s').toFixed(0)})</td></tr>
      <tr><td>four shared 17×17 multipliers</td><td class="num">${comma(shared.toFixed(0))}</td><td>4 × ${A('mul17s').toFixed(0)}; add a few hundred for input muxes and a carry-save row</td></tr>
      <tr><td>difference</td><td class="num">${comma((naive - shared).toFixed(0))}</td><td>per PE, before the muxes and the extra adder row take some back</td></tr>
      <tr><td>acc + out registers with reset</td><td class="num">${comma(regs.toFixed(0))}</td><td>96 DFFR_X1 = 1.5 × the 64-bit register</td></tr>
      <tr><td>the same without reset</td><td class="num">${comma((A('reg64_norst') * 1.5).toFixed(0))}</td><td>96 DFF_X1</td></tr>
      <tr><td>one 64-bit product pipeline register</td><td class="num">${comma(A('reg64_norst').toFixed(0))}–${comma(A('reg64_arst').toFixed(0))}</td><td>without or with reset</td></tr>
    </table></div>`;
    const sp = ['mul32s', 'mul17s', 'add64', 'add64_ks'].map((m) => { const b = get(m); return `<tr><td>${esc(short[m])}</td><td class="num">${b.relaxed.area_um2.toFixed(0)}</td><td class="num">${(b.relaxed.abc_delay_ps / 1000).toFixed(2)}</td><td class="num">${b.fast.area_um2.toFixed(0)}</td><td class="num">${(b.fast.abc_delay_ps / 1000).toFixed(2)}</td><td class="num">${pct(100 * (b.fast.area_um2 / b.relaxed.area_um2 - 1), 0)} area for ${pct(100 * (b.fast.abc_delay_ps / b.relaxed.abc_delay_ps - 1), 0)} delay</td></tr>`; }).join('');
    $('#bk-speedtab').innerHTML = `<table class="ref tight"><caption><span class="label-est">Yosys + open Nangate45 estimate, not Design Compiler</span></caption><tr><th>Block</th><th class="num">relaxed area (µm²)</th><th class="num">relaxed delay (ns)</th><th class="num">fast area (µm²)</th><th class="num">fast delay (ns)</th><th class="num">trade</th></tr>${sp}</table>`;
    onShow.blocks = drawBars;
  })();

  route();
})();
