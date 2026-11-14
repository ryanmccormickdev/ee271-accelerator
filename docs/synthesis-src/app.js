(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MINUS = '−';
  const fmt = (x, d) => { if (x == null || isNaN(x)) return '–'; const s = Number(x).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); return s.replace(/^-/, MINUS); };
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ee271syn:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ee271syn:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  let D = {};
  try { D = JSON.parse($('#synth-data').textContent); } catch (e) { console.error('page data missing', e); }
  const L = D.lib || {};
  const Y = {};
  ((D.yosys && D.yosys.experiments) || []).forEach((e) => { Y[e.id] = e; });
  const P = window.SynthParse;
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  const leakOf = (cells) => Object.entries(cells || {}).reduce((a, [c, n]) => a + n * ((L.all_leak_nW || {})[c] || 0), 0);
  const delay0 = (e) => (e && e.abc && e.abc.length ? e.abc[0].delay_ps : null);
  const delayN = (e) => (e && e.abc && e.abc.length ? e.abc[e.abc.length - 1].delay_ps : null);

  // ------------------------------------------------------------------ theme
  const root = document.documentElement;
  const savedTheme = store.get('theme', null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $('#themebtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
    redrawCharts();
  });

  // ------------------------------------------------------------------ router (same scheme as the walkthrough)
  const views = {};
  let current = null;
  function showView(name) {
    if (!views[name]) name = 'big-picture';
    if (current === name) return;
    Object.keys(views).forEach((n) => { $('#view-' + n).hidden = n !== name; });
    $$('nav.tabs a').forEach((a) => { if (a.dataset.view === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    current = name;
    if (views[name].show) views[name].show();
    window.scrollTo(0, 0);
  }
  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    const det = el.closest('details');
    if (det) det.open = true;
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    flash(el);
    return true;
  }
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const i = h.indexOf('/');
    let name = (i < 0 ? h : h.slice(0, i)) || 'big-picture';
    let rest = i < 0 ? '' : h.slice(i + 1);
    if (!views[name]) {            // a bare anchor id: find which view holds it
      const el = document.getElementById(name);
      const v = el && el.closest('.view');
      if (v) { rest = name; name = v.id.replace(/^view-/, ''); }
    }
    showView(name);
    if (!rest) return;
    const go = () => { const v = views[current]; if (!(v.go && v.go(rest))) scrollToId(rest); };
    setTimeout(go, 40);
    if (firstRoute && document.fonts && document.fonts.ready) {     // web fonts reflow the page after the first jump
      document.fonts.ready.then(() => setTimeout(() => { const el = document.getElementById(rest); if (el) el.scrollIntoView({ block: 'start' }); }, 120));
    }
  }
  let firstRoute = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    e.preventDefault();
    const t = '#' + b.dataset.goto;
    if (location.hash === t) route(); else location.hash = t;
  });
  $$('.view').forEach((v) => { views[v.id.replace(/^view-/, '')] = views[v.id.replace(/^view-/, '')] || {}; });

  // ------------------------------------------------------------------ copy buttons on command blocks
  $$('.cmd[data-copy]').forEach((c) => {
    const b = document.createElement('button');
    b.className = 'small';
    b.textContent = 'Copy';
    b.style.float = 'right';
    b.addEventListener('click', () => {
      const text = c.dataset.copy === '1' ? c.innerText.replace(/^Copy\n?/, '') : c.dataset.copy;
      const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); };
      try { navigator.clipboard.writeText(text).then(done, () => { b.textContent = 'Select and copy'; }); } catch (err) { b.textContent = 'Select and copy'; }
    });
    c.prepend(b);
  });

  // ================================================================== BIG PICTURE: the flow, one tiny design through it
  views['big-picture'] = (function () {
    const add = Y.add8_reg || {};
    const dff = (L.seq || {}).DFF_X1 || {};
    const cq = dff['CK->Q'] ? Math.max(dff['CK->Q'].cell_rise, dff['CK->Q'].cell_fall) : null;
    const su = dff.setup ? Math.max(dff.setup.rise_constraint, dff.setup.fall_constraint) : null;
    const comb = delay0(add);
    const cellsHtml = (cells) => Object.entries(cells || {}).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<span class="${/^DFF|^DL/.test(c) ? 'seq' : ''}">${n} × ${esc(c)}</span>`).join('');
    const total = cq != null && comb != null && su != null ? (cq + comb + su) : null;
    const ap = add.abc && add.abc[0];
    const regName = (n) => String(n || '').replace(/^\\/, '').replace(/\s+/g, '').replace(/\[/, '_reg[');            // ABC's "\\b_q [2]" -> b_q_reg[2]
    const startReg = ap && ap.start ? regName(ap.start) : 'a_q_reg[0]';
    const endBit = ap && ap.end ? (String(ap.end).match(/\[(\d+)\]\s*$/) || [])[1] : null;
    const endReg = 's_reg[' + (endBit != null ? endBit : '8') + ']';
    const budget = total != null ? `<div class="budget" role="img" aria-label="Timing budget of the 2 ns cycle"><div class="b-cq" style="width:${cq / 20}%">clk→Q</div><div class="b-lg" style="width:${comb / 20}%">adder</div><div class="b-su" style="width:${su / 20}%">setup</div><div class="b-sl" style="flex:1">slack ${fmt((2000 - total) / 1000, 2)} ns</div></div>` : '';
    const STEPS = [
      { t: 'Your RTL', body: `<p>DC reads SystemVerilog text. The running example is a registered 8-bit adder: inputs captured in flops, a sum captured in flops, an adder in between. That's the same shape as one slice of your PE's accumulate path.</p>`,
        view: `<pre class="code">${esc((D.sources || {})['add8_reg.sv'] || '')}</pre>` },
      { t: 'analyze', body: `<p><code>analyze -format sverilog</code> parses every file in the list and checks the syntax. Nothing is built yet. A typo stops you here, with <code>Error:</code>, a file name and a line number in <code>compile.log</code>.</p><p>It stores the parsed form in the work library folder <code>FreePDK_45nm/</code>.</p>`,
        view: `<p class="cap"><span class="ev docs">DC docs</span>Files read, in order: <code>defines.sv</code>, <code>buffer.sv</code>, <code>controller.sv</code>, <code>instruction_memory.sv</code>, <code>processing_element.sv</code>, <code>top.sv</code>, <code>macros/array.sv</code> (the empty one).</p>` },
      { t: 'elaborate', body: `<p><code>elaborate top</code> builds the hierarchy from <code>top</code> down, fixes every parameter, and unrolls generate loops. It turns each <code>always_ff</code> into inferred flip-flops and each operator into a generic block.</p><p>The result is technology-independent: <b>GTECH</b> gates plus "synthetic operators" (an adder, a multiplier) that don't have an architecture yet. Latch and multiple-driver messages appear here.</p>`,
        view: `<p class="cap"><span class="ev illus">illustrative</span>What the example looks like now, roughly (we can't run DC here):</p><div class="minicells"><span class="seq">a_q_reg[7:0]: 8 generic flops</span><span class="seq">b_q_reg[7:0]: 8 generic flops</span><span class="gt">add: 8-bit + 8-bit → 9-bit, architecture not chosen</span><span class="seq">s_reg[8:0]: 9 generic flops</span></div>` },
      { t: 'link', body: `<p><code>link</code> checks that every instance points at a real design or library cell. In this design the four <code>array</code> instances resolve to the <b>empty</b> module from <code>macros/array.sv</code>: boxes with ports and nothing inside.</p><p>A missing module gives <code>Unable to resolve reference (LINK-5)</code>, and the instance becomes a black box.</p>`,
        view: `<p class="cap"><span class="ev file">from the files</span>Memories in this design: MEM0 65,536 × 512 b, MEM1 16,384 × 32 b, MEM2 65,536 × 512 b, and the instruction memory 128 × 63 b. All four are empty boxes to DC. <button class="link" data-goto="black-boxes">What that means</button></p>` },
      { t: 'constraints', body: `<p>Now the script tells DC what "good" means: a 2.0 ns clock on <code>clk</code>, the <code>1K_hvratio_1_4</code> wire-load model, input delays and driving cells, max fanout 4 on input ports, a 150,000 µm² area goal, and an ideal, untouchable reset.</p><p>Without a clock constraint DC would just make everything small.</p>`,
        view: total != null ? `<p class="cap"><span class="ev lib">from the .lib</span><span class="ev local">Yosys/ABC</span>The example's register-to-register budget: DFF_X1 clock-to-Q ≈ ${fmt(cq)} ps, the mapped adder ≈ ${fmt(comb)} ps (ABC's estimate), DFF_X1 setup ≈ ${fmt(su)} ps. That uses ${fmt(total)} ps of the 2,000 ps period.</p>${budget}` : '' },
      { t: 'compile_ultra', body: `<p>The big step. DC chooses an adder architecture from DesignWare, optimizes the logic, maps it onto real Nangate cells, sizes and buffers gates until timing is met, may move registers (retiming), then shrinks whatever isn't critical.</p><p>Here is what the same example became in <b>Yosys</b> with the open Nangate45 library: real cell names, real areas, not DC's result.</p>`,
        view: `<p class="cap"><span class="ev local">Yosys + open Nangate45, not DC</span>${fmt(add.num_cells)} cells, ${fmt(add.area, 1)} µm² (${fmt(add.seq_area, 1)} µm² of it flip-flops):</p><div class="minicells">${cellsHtml(add.cells)}</div><p class="cap">No <code>FA_X1</code> full-adder cells: Yosys's mapper (ABC) can't use cells with two outputs. DC can. <button class="link" data-goto="see-it/x-add8_reg">Open this example</button></p>` },
      { t: 'reports', body: `<p>After compile the script writes the reports (<code>reports/</code>), the gate-level netlist (<code>netlist/top.mapped.v</code>) and the six-line summary <code>results.txt</code>. Part 3's figure of merit takes slack, power and area from it.</p>`,
        view: `<p class="cap"><span class="ev illus">illustrative</span><span class="ev lib">.lib numbers</span>A hand-made timing report for the example, built the way report_timing adds things up:</p><pre class="code">clock clk (rise edge)            0.000    0.000\n${(startReg + '/CK (DFF_X1)').padEnd(33)}0.000    0.000 r\n${(startReg + '/Q (DFF_X1)').padEnd(33)}${(cq / 1000).toFixed(3)}    ${(cq / 1000).toFixed(3)}   (from the .lib)\n  ... ${String((add.abc && add.abc[0] && add.abc[0].path.length - 1) || '?').padStart(2)} gates of the adder ...  ${(comb / 1000).toFixed(3)}    ${((cq + comb) / 1000).toFixed(3)}   (ABC's estimate)\n${(endReg + '/D (DFF_X1)').padEnd(42)}${((cq + comb) / 1000).toFixed(3)}\ndata arrival time                         ${((cq + comb) / 1000).toFixed(3)}\n\nclock clk (rise edge)            2.000    2.000\nlibrary setup time              ${(-su / 1000).toFixed(3)}    ${((2000 - su) / 1000).toFixed(3)}\ndata required time                        ${((2000 - su) / 1000).toFixed(3)}\nslack (MET)                               ${((2000 - total) / 1000).toFixed(3)}</pre>` },
    ];
    const box = $('#flow');
    const title = $('#fl-title'), body = $('#fl-body'), view = $('#fl-view');
    box.innerHTML = STEPS.map((s, i) => `<button class="fstep" data-i="${i}"><span class="n">${i + 1}</span><b>${esc(s.t)}</b><small>${['the .sv files', 'parse, check syntax', 'build generic gates', 'resolve every instance', 'clock, wires, I/O, area', 'map, size, retime', 'timing, area, power, netlist'][i]}</small></button>`).join('');
    let at = 0, timer = 0;
    function show(i) {
      at = Math.max(0, Math.min(STEPS.length - 1, i));
      $$('.fstep', box).forEach((b, k) => { b.setAttribute('aria-pressed', String(k === at)); b.classList.toggle('done', k < at); });
      title.textContent = (at + 1) + ' · ' + STEPS[at].t;
      body.innerHTML = STEPS[at].body;
      view.innerHTML = STEPS[at].view;
    }
    box.addEventListener('click', (e) => { const b = e.target.closest('.fstep'); if (b) { stop(); show(+b.dataset.i); } });
    function stop() { clearInterval(timer); timer = 0; $('#fl-play').textContent = 'Play the flow'; }
    $('#fl-play').addEventListener('click', () => {
      if (timer) { stop(); return; }
      show(0);
      $('#fl-play').textContent = 'Pause';
      timer = setInterval(() => { if (at >= STEPS.length - 1) stop(); else show(at + 1); }, reduced() ? 2600 : 3200);
    });
    $('#fl-prev').addEventListener('click', () => { stop(); show(at - 1); });
    $('#fl-next').addEventListener('click', () => { stop(); show(at + 1); });
    show(0);
    return { show() {}, go(id) { return false; } };
  })();

  // ================================================================== THE SCRIPT: clickable reader
  views['script'] = (function () {
    const el = $('#view-script');
    const rd = $('#sreader');
    const note = $('#snote');
    const blocks = $$('.sblock', rd);
    let cur = -1;
    function select(i, scroll) {
      if (i < 0 || i >= blocks.length) return;
      cur = i;
      blocks.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
      const b = blocks[i];
      const n = document.getElementById('note-' + b.dataset.b);
      note.innerHTML = n ? n.innerHTML + `<div class="navs"><button class="small" data-step="-1">← previous line</button><button class="small primary" data-step="1">next line →</button></div>` : '';
      if (window.innerWidth <= 1000) {       // on narrow screens the note sits right under the clicked lines
        b.after(note);
      } else if (note.parentNode !== $('#snote-home')) $('#snote-home').appendChild(note);
      if (scroll) b.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      store.set('script-b', b.dataset.b);
    }
    rd.addEventListener('click', (e) => {
      const b = e.target.closest('.sblock');
      if (b) { select(blocks.indexOf(b)); return; }
      const s = e.target.closest('[data-step]');
      if (s) select(cur + (+s.dataset.step), true);
    });
    rd.addEventListener('keydown', (e) => {
      if (!e.target.closest('.sblock')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); select(cur + 1, true); blocks[cur].focus(); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); select(cur - 1, true); blocks[cur].focus(); }
    });
    // "which lines affect ..." filter
    $('#sfilter').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-aff]');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      $$('#sfilter button[data-aff]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', String(on));
      const k = on ? b.dataset.aff : null;
      blocks.forEach((x) => {
        const hit = k && (' ' + x.dataset.aff + ' ').includes(' ' + k + ' ');
        x.classList.toggle('hot', !!hit);
        x.classList.toggle('dim', !!k && !hit);
      });
      $('#sfilter-count').textContent = k ? blocks.filter((x) => x.classList.contains('hot')).length + ' blocks' : '';
    });
    $('#snotes-all').addEventListener('click', (e) => {
      const on = rd.classList.toggle('allnotes');
      e.target.setAttribute('aria-pressed', String(on));
      if (!on && cur >= 0) select(cur);
    });
    const saved = store.get('script-b', null);
    const start = Math.max(0, blocks.findIndex((b) => b.dataset.b === saved));
    select(start);
    return {
      show() {},
      go(id) {
        const b = blocks.findIndex((x) => x.dataset.b === id || x.id === id);
        if (b >= 0) { select(b); setTimeout(() => { blocks[b].scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); flash(blocks[b]); }, 30); return true; }
        return false;
      },
    };
  })();

  // ================================================================== charts (SVG, sized to their box so text stays readable)
  const charts = [];
  function chart(el, draw) { charts.push({ el, draw }); draw(el); }
  function redrawCharts() { charts.forEach((c) => { if (c.el.offsetParent !== null) c.draw(c.el); }); }
  let rT = 0;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(redrawCharts, 150); });
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function scatter(el, pts, opts) {
    const W = Math.max(300, el.clientWidth || 600), H = Math.min(340, Math.max(230, W * 0.55));
    const m = { l: 54, r: 16, t: 14, b: 42 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = 0, x1 = Math.max(...xs) * 1.12, y0 = 0, y1 = Math.max(...ys) * 1.15;
    const X = (v) => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const Yv = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
    const ticks = (a, b, n) => { const step = Math.pow(10, Math.floor(Math.log10((b - a) / n))); const s = [1, 2, 5, 10].map((k) => k * step).find((k) => (b - a) / k <= n) || step * 10; const out = []; for (let v = Math.ceil(a / s) * s; v <= b; v += s) out.push(v); return out; };
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}"><defs><marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${css('--ink')}"/></marker></defs>`;
    ticks(x0, x1, 6).forEach((v) => { s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text class="lbl" x="${X(v)}" y="${H - m.b + 15}" text-anchor="middle">${fmt(v)}</text>`; });
    ticks(y0, y1, 5).forEach((v) => { s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Yv(v)}" y2="${Yv(v)}"/><text class="lbl" x="${m.l - 6}" y="${Yv(v) + 4}" text-anchor="end">${fmt(v)}</text>`; });
    s += `<path class="ax" d="M${m.l},${m.t} V${H - m.b} H${W - m.r}"/>`;
    s += `<text class="lbl" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(opts.xlabel)}</text>`;
    s += `<text class="lbl" transform="translate(13,${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">${esc(opts.ylabel)}</text>`;
    (opts.arrows || []).forEach((a) => { s += `<path class="arrow" d="M${X(a.x0)},${Yv(a.y0)} L${X(a.x1)},${Yv(a.y1)}"/>`; });
    pts.forEach((p) => {
      s += `<circle class="dot" cx="${X(p.x)}" cy="${Yv(p.y)}" r="${p.r || 6}" fill="${css(p.color || '--m0')}"><title>${esc(p.label)}: ${fmt(p.x)} ${opts.xunit}, ${fmt(p.y)} ${opts.yunit}</title></circle>`;
      const anchor = p.anchor || (X(p.x) > W * 0.72 ? 'end' : 'start');
      s += `<text x="${X(p.x) + (anchor === 'end' ? -9 : 9)}" y="${Yv(p.y) + (p.dy || 4)}" text-anchor="${anchor}" style="font-size:11px">${esc(p.label)}</text>`;
    });
    el.innerHTML = s + '</svg>';
  }
  function lines(el, series, opts) {
    const W = Math.max(300, el.clientWidth || 600), H = Math.min(300, Math.max(220, W * 0.5));
    const m = { l: 50, r: 70, t: 12, b: 40 };
    const xs = opts.x, x1 = Math.max(...xs), y1 = Math.max(...series.flatMap((s) => s.y)) * 1.1;
    const X = (v) => m.l + v / x1 * (W - m.l - m.r), Yv = (v) => H - m.b - v / y1 * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">`;
    [0, 20, 40, 60].filter((v) => v <= x1).forEach((v) => { s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text class="lbl" x="${X(v)}" y="${H - m.b + 15}" text-anchor="middle">${v}</text>`; });
    [0, 25, 50, 75, 100, 125].filter((v) => v <= y1).forEach((v) => { s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Yv(v)}" y2="${Yv(v)}"/><text class="lbl" x="${m.l - 6}" y="${Yv(v) + 4}" text-anchor="end">${v}</text>`; });
    s += `<path class="ax" d="M${m.l},${m.t} V${H - m.b} H${W - m.r}"/>`;
    s += `<text class="lbl" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(opts.xlabel)}</text>`;
    s += `<text class="lbl" transform="translate(12,${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">${esc(opts.ylabel)}</text>`;
    series.forEach((sr) => {
      const c = css(sr.color);
      s += `<path d="${sr.y.map((v, i) => (i ? 'L' : 'M') + X(xs[i]) + ',' + Yv(v)).join(' ')}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
      sr.y.forEach((v, i) => { s += `<circle cx="${X(xs[i])}" cy="${Yv(v)}" r="3" fill="${c}"><title>${esc(sr.label)} at ${xs[i]} fF: ${fmt(v, 1)} ps</title></circle>`; });
      s += `<text x="${X(xs[xs.length - 1]) + 6}" y="${Yv(sr.y[sr.y.length - 1]) + 4}" style="font-size:11px;fill:${c};font-weight:700">${esc(sr.label)}</text>`;
    });
    el.innerHTML = s + '</svg>';
  }

  // ================================================================== INSIDE COMPILE_ULTRA: the adder chart, sizing, inverter drive
  views['compile-ultra'] = (function () {
    const arch = [['add64_area', 'ripple-like (area flow)', '--m0'], ['add64_bk', 'Brent-Kung', '--pe'], ['add64_sk', 'Sklansky', '--m1'], ['add64_hc', 'Han-Carlson', '--ctl'], ['add64_ks', 'Kogge-Stone', '--m2']];
    const sized = { add64_bk: 'add64_bk_sized', add64_sk: 'add64_sk_sized', add64_hc: 'add64_hc_sized', add64_ks: 'add64_ks_sized' };
    const el = $('#adder-chart');
    if (el && Y.add64_bk) {
      chart(el, (box) => {
        const place = { add64_hc: { anchor: 'end', dy: 16 }, add64_sk: { dy: -8 } };      // keep labels off the sizing arrows
        const pts = arch.map(([id, lbl, c]) => Object.assign({ x: Y[id].area, y: delay0(Y[id]), label: lbl, color: c }, place[id] || {}));
        Object.entries(sized).forEach(([a, b]) => { pts.push({ x: Y[b].area, y: delayN(Y[b]), label: '', color: arch.find((x) => x[0] === a)[2], r: 4 }); });
        const arrows = Object.entries(sized).map(([a, b]) => ({ x0: Y[a].area, y0: delay0(Y[a]), x1: Y[b].area, y1: delayN(Y[b]) }));
        scatter(box, pts, { xlabel: 'area (µm²)', ylabel: 'critical path (ps)', xunit: 'µm²', yunit: 'ps', arrows, aria: 'Area versus delay for one 64-bit adder in five architectures, with arrows showing the effect of gate sizing' });
      });
      const rows = arch.map(([id, lbl]) => {
        const e = Y[id], s = Y[sized[id]];
        return `<tr><td>${esc(lbl)}</td><td class="num">${fmt(e.num_cells)}</td><td class="num">${fmt(e.area)}</td><td class="num">${fmt(delay0(e))}</td><td class="num">${e.abc[0].path.length - 1}</td>` +
          (s ? `<td class="num">${fmt(s.area)}</td><td class="num">${fmt(delayN(s))}</td>` : '<td class="num">–</td><td class="num">–</td>') + '</tr>';
      }).join('');
      $('#adder-table').innerHTML = `<tr><th>64-bit adder built as</th><th class="num">cells</th><th class="num">area µm²</th><th class="num">delay ps</th><th class="num">gates on path</th><th class="num">sized: area</th><th class="num">sized: delay</th></tr>${rows}`;
    }
    const ic = $('#inv-chart');
    if (ic && L.inv_sweep) {
      chart(ic, (box) => lines(box, [['INV_X1', '--m0'], ['INV_X2', '--m1'], ['INV_X4', '--pe'], ['INV_X8', '--m2']].map(([c, col]) => ({ label: c, y: L.inv_sweep[c], color: col })),
        { x: L.inv_sweep_loads, xlabel: 'load capacitance (fF)', ylabel: 'delay (ps)', aria: 'Delay of Nangate inverters X1, X2, X4 and X8 versus load capacitance, read from the Liberty tables' }));
    }
    const dt = $('#drive-table');
    if (dt && L.drive) {
      const order = ['INV_X1', 'INV_X2', 'INV_X4', 'INV_X8', 'NAND2_X1', 'NOR2_X1', 'AOI21_X1', 'XOR2_X1'];
      const textbook = { INV_X1: '1', NAND2_X1: '4/3 ≈ 1.33', NOR2_X1: '5/3 ≈ 1.67', XOR2_X1: '4 (static CMOS XOR)' };
      dt.innerHTML = '<tr><th>cell (input)</th><th class="num">area µm²</th><th class="num">C<sub>in</sub> fF</th><th class="num">R<sub>drive</sub> kΩ (rise / fall)</th><th class="num">g from the .lib</th><th>textbook g</th></tr>' +
        order.map((c) => { const d = L.drive[c]; return `<tr><td><code>${c}</code> (${d.pin})</td><td class="num">${fmt(d.area, 3)}</td><td class="num">${fmt(d.cin_fF, 2)}</td><td class="num">${fmt(d.R_rise_kohm, 2)} / ${fmt(d.R_fall_kohm, 2)}</td><td class="num">${/^INV_X[248]/.test(c) ? '–' : fmt(d.g, 2)}</td><td>${textbook[c] || (/^INV/.test(c) ? 'same cell, scaled' : '')}</td></tr>`; }).join('');
    }
    return { show() { redrawCharts(); } };
  })();

  // ================================================================== SEE IT HAPPEN: the Yosys explorer
  const NOTICE = {
    add8_reg: () => `<p>${Y.add8_reg.cells.DFF_X1} <code>DFF_X1</code> (8 + 8 input flops, 9 sum flops) are ${fmt(Y.add8_reg.seq_area)} of the ${fmt(Y.add8_reg.area)} µm²: in small blocks, flops dominate. The adder is ${fmt(Y.add8_reg.num_cells - Y.add8_reg.cells.DFF_X1)} gates. On the critical path, look at the alternating <code>AOI21_X1</code> / <code>OAI21_X1</code>: that's the carry rippling up, with each stage inverting so no inverters are needed (lecture 05 p34).</p>`,
    mux4_case: () => `<p>No <code>MUX2_X1</code> or 4:1 mux cell here. ABC built the selection from NAND/AOI gates, because that was smaller and faster for this library. You write a case; the tool picks gates. With a <code>default</code> arm the log says "No latch inferred".</p>`,
    reg_plain: () => `<p>32 × <code>DFF_X1</code> at ${fmt(L.cells.DFF_X1.area, 3)} µm² each. Nothing else: a register with no reset or enable is just flops.</p>`,
    reg_async: () => `<p>32 × <code>DFFR_X1</code>: the reset is <i>inside</i> the cell (pin <code>RN</code>), so it costs no gates, but each flop is bigger (${fmt(L.cells.DFFR_X1.area, 3)} vs ${fmt(L.cells.DFF_X1.area, 3)} µm²) and leaks more (${fmt(L.cells.DFFR_X1.leak_nW, 1)} vs ${fmt(L.cells.DFF_X1.leak_nW, 1)} nW).</p>`,
    reg_sync: () => `<p>A synchronous reset is ordinary logic in front of a plain flop: 32 × <code>DFF_X1</code> + 32 × <code>AND2_X1</code>. It's on the D path, so it costs ${fmt(delay0(Y.reg_sync))} ps of the cycle here.</p>`,
    reg_en: () => `<p>Nangate has no enable flop, so "hold when en = 0" becomes a <code>MUX2_X1</code> feeding each <code>DFF_X1</code> back its own output. The flop still clocks every cycle and burns clock power. Clock gating (Part 3) replaces those 32 muxes with one gate on the clock (a <code>CLKGATETST_X1</code> cell, ${fmt(L.cells.CLKGATETST_X1.area, 2)} µm²), so the flops stop toggling.</p>`,
    vd_staff: () => `<p>This is the real staff <code>vector_decoder</code> from <code>defines.sv</code>. Its <code>case (mode)</code> has arms for INT8, INT16 and INT32 but none for mode 3. So when mode = 3 neither output is assigned, and the block must <i>remember</i> the old value: a latch. Yosys refuses outright because the block is <code>always_comb</code>, which promises no memory. DC, as far as we know, gives a warning (<code>ELAB-974</code>) and builds the latch.</p>`,
    vd_star: () => `<p>Same code with <code>always @*</code> (changed in a scratch copy only, so Yosys would go on). ${Y.vd_star.cells.DLL_X1} latches appear: 14 for <code>addr_to_mem</code> and 32 for <code>data_to_pe</code>, ${fmt(Y.vd_star.cells.DLL_X1 * L.cells.DLL_X1.area, 1)} µm² of <code>DLL_X1</code>. Total ${fmt(Y.vd_star.area)} µm² vs ${fmt(Y.vd_default.area)} µm² with a default arm.</p>`,
    vd_default: () => `<p>Same code plus <code>default: begin addr_to_mem = '0; data_to_pe = '0; end</code>. "No latch inferred" for both outputs, and no <code>DLL_X1</code>. You can't make this change in the staff file (<code>make synthesize</code> regenerates <code>defines.sv</code> every run), and you don't need to: the handout says warnings are fine. Do it in your own <code>always_comb</code> blocks.</p>`,
    prio_chain: () => `<p>Each <code>else if</code> only matters if every earlier condition was false, so the hardware is a chain: the last request's data passes through about one gate per earlier condition. ${fmt(Y.prio_chain.num_cells)} cells, ${fmt(delay0(Y.prio_chain))} ps.</p>`,
    onehot_andor: () => `<p>With the promise that only one request is set, every input is gated by its own request and ORed: two levels of logic (<code>AOI22_X1</code> → <code>NAND4_X1</code>). ${fmt(Y.onehot_andor.num_cells)} cells and ${fmt(delay0(Y.onehot_andor))} ps vs ${fmt(Y.prio_chain.num_cells)} cells and ${fmt(delay0(Y.prio_chain))} ps. It's only the same function when the input really is one-hot; that's knowledge the tool doesn't have, and lecture 05 p47 says exactly this.</p>`,
    share_two_muls: () => `<p>Yosys built <b>two</b> 16 × 16 multipliers and a 32-bit mux: ${fmt(Y.share_two_muls.area)} µm².</p>`,
    share_two_muls_noalumacc: () => `<p>Same RTL, but with Yosys's <code>alumacc</code> pass skipped its sharing pass <i>did</i> merge them: ${fmt(Y.share_two_muls_noalumacc.area)} µm². Whether a tool finds a sharing opportunity depends on its internals and pass order. DC's high-level optimization does resource sharing too, but check your area report rather than hoping.</p>`,
    share_one_mul: () => `<p>Mux the operand first, then one multiplier: ${fmt(Y.share_one_mul.area)} µm², about half. Same function as the two-multiplier version for every input. Writing it this way guarantees one multiplier no matter what the tool does.</p>`,
    bb_empty: () => `<p><b>0 cells.</b> The memory module is empty, like <code>synth/macros/array.sv</code>. Once Yosys flattens it, the MAC's result drives nothing and <code>top</code> has no outputs, so everything is unused and removed.</p>`,
    bb_blackbox: () => `<p><b>Still 0 cells</b>, even though the memory is now a black-box cell. Its <code>q</code> feeds the MAC and the MAC feeds its <code>d</code>, but nothing outside that loop needs either. Yosys keeps only logic that can reach an output or a kept cell.</p>`,
    bb_keep: () => `<p>Mark the black box <code>(* keep *)</code> and everything comes back: ${fmt(Y.bb_keep.num_cells)} cells, ${fmt(Y.bb_keep.area)} µm². This is the mechanism behind the risk in the Black boxes tab. DC has its own rules (dont_touch, black-box handling, boundary optimization), and nobody has checked yet what DC does with <code>macros/array.sv</code>.</p>`,
  };
  ['mul8_unsigned', 'mul8_signed', 'mul8_unsigned_booth', 'mul8_signed_booth', 'mul8_signed_keep', 'mul8_signed_booth_keep', 'mul16_signed', 'mul16_signed_booth', 'mul16_signed_keep', 'mul16_signed_booth_keep',
    'mul32_signed', 'mul32_signed_booth', 'mul32_signed_keep', 'mul32_signed_booth_keep'].forEach((id) => {
    NOTICE[id] = () => {
      const e = Y[id];
      const bits = +(id.match(/mul(\d+)/) || [])[1];
      return `<p>${fmt(e.num_cells)} cells, ${fmt(e.area)} µm², ${fmt(delay0(e))} ps through the slowest path. ${bits}×${bits} = ${bits * bits} partial-product bits to add up, so area grows roughly with the square of the width. Compare the four ways Yosys built the same <code>a * b</code> in the multiplier table below this explorer.</p>`;
    };
  });
  ['mac8_lane', 'mac8_lane_booth', 'mac32_lane', 'mac32_lane_booth'].forEach((id) => {
    NOTICE[id] = () => { const e = Y[id]; return `<p>One multiply-accumulate lane: ${e.cells.DFFR_X1} <code>DFFR_X1</code> for the accumulator (${fmt(e.seq_area)} µm²) and ${fmt(e.area - e.seq_area)} µm² of logic for the multiply and the add. Yosys merges the accumulate into the multiplier's adder tree (its <code>$macc</code> cell), as DC's datapath extraction would.</p>`; };
  });
  ['add64_area', 'add64_bk', 'add64_sk', 'add64_hc', 'add64_ks', 'add64_bk_sized', 'add64_sk_sized', 'add64_hc_sized', 'add64_ks_sized'].forEach((id) => {
    NOTICE[id] = () => { const e = Y[id]; const p = e.abc[e.abc.length - 1]; return `<p>${fmt(e.num_cells)} cells, ${fmt(e.area)} µm², ${fmt(p.delay_ps)} ps over ${p.path.length - 1} gates.${e.abc.length > 1 ? ` Before sizing: ${fmt(e.abc[0].delay_ps)} ps.` : ''} The chart in "Inside compile_ultra" puts all of them side by side.</p>`; };
  });

  views['see-it'] = (function () {
    const list = $('#xlist');
    const body = $('#xbody');
    if (!list || !D.yosys) return {};
    const GROUPS = [['Basics', ['add8_reg', 'mux4_case']], ['Registers', ['reg_plain', 'reg_async', 'reg_sync', 'reg_en']], ['A latch from a case', ['vd_staff', 'vd_star', 'vd_default']],
      ['Multipliers', ['mul8_unsigned', 'mul8_signed', 'mul8_signed_booth', 'mul16_signed_booth', 'mul32_signed', 'mul32_signed_booth']], ['MAC lanes', ['mac8_lane', 'mac8_lane_booth', 'mac32_lane', 'mac32_lane_booth']],
      ['Same function, two ways', ['share_two_muls', 'share_one_mul', 'share_two_muls_noalumacc', 'prio_chain', 'onehot_andor']], ['Adder architectures', ['add64_area', 'add64_bk', 'add64_ks', 'add64_sk_sized']],
      ['Empty memory, black box', ['bb_empty', 'bb_blackbox', 'bb_keep']]];
    const SHORT = { add8_reg: 'registered 8-bit adder', mux4_case: '4:1 mux (case)', reg_plain: 'no reset', reg_async: 'async reset', reg_sync: 'sync reset', reg_en: 'load enable',
      vd_staff: 'staff, always_comb', vd_star: 'same, always @*', vd_default: 'with a default arm', mul8_unsigned: '8×8 unsigned', mul8_signed: '8×8 signed', mul8_signed_booth: '8×8 signed, Booth',
      mul16_signed_booth: '16×16 signed, Booth', mul32_signed: '32×32 signed', mul32_signed_booth: '32×32 signed, Booth', mac8_lane: 'INT8 lane', mac8_lane_booth: 'INT8 lane, Booth',
      mac32_lane: 'INT32 lane', mac32_lane_booth: 'INT32 lane, Booth', share_two_muls: 'two multipliers + mux', share_one_mul: 'mux + one multiplier', share_two_muls_noalumacc: 'two multipliers, other pass order',
      prio_chain: 'if / else-if chain', onehot_andor: 'one-hot AND-OR', add64_area: 'ripple-like (default flow)', add64_bk: 'Brent-Kung', add64_ks: 'Kogge-Stone', add64_sk_sized: 'Sklansky, sized',
      bb_empty: 'empty module', bb_blackbox: 'black box', bb_keep: 'black box, keep' };
    list.innerHTML = GROUPS.map(([g, ids]) => `<div class="grp"><span>${esc(g)}</span>${ids.filter((i) => Y[i]).map((i) => `<button data-x="${i}" title="${esc(Y[i].title)}">${esc(SHORT[i] || Y[i].title)}</button>`).join('')}</div>`).join('');
    function src(e) {
      if (e.files[0] === 'defines.sv' || /^defines_/.test(e.files[0])) {
        const vd = D.yosys.vector_decoder;
        let lines = vd.lines.slice();
        if (e.id === 'vd_star') lines = lines.map((l) => l.replace('always_comb begin', 'always @* begin   // changed for Yosys only'));
        if (e.id === 'vd_default') { const k = lines.findIndex((l) => /^\s+endcase\s*$/.test(l) && /^ {8}endcase/.test(l)); lines.splice(k, 0, "            default: begin              // added", "                addr_to_mem = '0;", "                data_to_pe  = '0;", '            end'); }
        return `<p class="cap">From the generated <code>defines.sv</code> (line ${vd.first_line} on), ${esc(vd.path_note)}.</p><pre class="code">${lines.map((l) => esc(l)).join('\n')}</pre>`;
      }
      return e.files.map((f) => `<pre class="code">${esc((D.sources || {})[f] || '')}</pre>`).join('');
    }
    function cellTable(e) {
      const rows = Object.entries(e.cells || {}).sort((a, b) => ((L.all_areas[b[0]] || 0) * b[1]) - ((L.all_areas[a[0]] || 0) * a[1]));
      const max = Math.max(1, ...rows.map(([c, n]) => (L.all_areas[c] || 0) * n));
      const leak = leakOf(e.cells);
      return `<div class="tscroll"><table class="cells"><tr><th>cell</th><th class="num">count</th><th class="num">µm² each</th><th class="num">µm² total</th><th></th></tr>` +
        rows.map(([c, n]) => { const a = L.all_areas[c]; const tot = a != null ? a * n : null; return `<tr class="${/^DFF/.test(c) ? 'seq' : /^DL/.test(c) ? 'lat' : ''}"><td><code>${esc(c)}</code></td><td class="num">${n}</td><td class="num">${a != null ? fmt(a, 3) : 'box'}</td><td class="num">${tot != null ? fmt(tot, 2) : '0'}</td><td style="width:30%"><span class="bar" style="width:${tot ? 100 * tot / max : 0}%"></span></td></tr>`; }).join('') +
        `<tr class="tot"><td>total</td><td class="num">${fmt(e.num_cells)}</td><td></td><td class="num">${fmt(e.area, 2)}</td><td class="muted" style="font-weight:500">leakage ≈ ${fmt(leak / 1000, 2)} µW</td></tr></table></div>`;
    }
    function pathBars(p) {
      if (!p || !p.path || p.path.length < 2) return '';
      const T = p.delay_ps || 1;
      let prev = 0;
      const rows = p.path.slice(1).map((g) => { const a = prev, b = g.arrival_ps; prev = b; return { c: g.cell, a, b, d: b - a, fo: g.fanout }; });
      const big = rows.map((r) => r.d).sort((x, y) => y - x)[Math.min(2, rows.length - 1)];
      return `<div class="pathbars" role="img" aria-label="Critical path: ${rows.length} gates, ${fmt(T)} ps">` + rows.map((r) => `<div class="pb ${r.d >= big ? 'big' : ''}"><span class="c">${esc(r.c)}</span><span class="t"><i style="left:${100 * r.a / T}%;width:${Math.max(0.6, 100 * r.d / T)}%"></i></span><span class="v">${fmt(r.b, 1)} ps</span></div>`).join('') + '</div>';
    }
    function show(id) {
      const e = Y[id];
      if (!e) return;
      $$('button[data-x]', list).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.x === id)));
      let h = `<h3 id="x-${e.id}">${esc(e.title)}</h3><div class="xmeta"><span class="ev local">Yosys + open Nangate45, not DC</span><span>top: <code>${esc(e.top)}</code></span><span>flow: ${esc({ default: 'Yosys default (area-oriented)', keep: 'structure kept, plain mapping', size: 'structure kept, then sized' }[e.flow] || e.flow)}</span></div>`;
      h += `<div class="cols2"><div><h4>The RTL</h4>${src(e)}<details style="margin-top:8px"><summary class="cap" style="cursor:pointer">The Yosys commands</summary><pre class="code">${e.yosys.map(esc).join('\n')}</pre></details></div><div>`;
      if (!e.ok) {
        h += `<h4>Result</h4><p class="flagline warn">Yosys stopped:</p><pre class="code wrapme">${esc(e.error)}</pre>`;
      } else {
        h += `<h4>Cells it became</h4>${e.num_cells ? cellTable(e) : '<p class="flagline warn">0 cells: everything was removed.</p>'}`;
        const p = e.abc && e.abc[e.abc.length - 1];
        if (p && p.path && p.path.length > 1) h += `<h4>Slowest path (ABC's estimate)</h4><p class="cap">${p.path.length - 1} gates, ${fmt(p.delay_ps)} ps from <code>${esc(p.start || '?')}</code> to <code>${esc(p.end || '?')}</code>. Ideal inputs, no wire load, no flop delay: optimistic next to DC.</p>${pathBars(p)}`;
      }
      const notes = (e.notes || []).filter((n) => !/multi-output/.test(n));
      if (notes.length) h += `<h4>From the Yosys log</h4><pre class="code wrapme">${notes.map(esc).join('\n')}</pre>`;
      h += `</div></div><div class="note pe">${NOTICE[id] ? NOTICE[id]() : ''}</div>`;
      body.innerHTML = h;
      store.set('x', id);
    }
    list.addEventListener('click', (e) => { const b = e.target.closest('button[data-x]'); if (!b) return; show(b.dataset.x); if (window.innerWidth <= 860) body.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); });
    show(Y[store.get('x', 'add8_reg')] ? store.get('x', 'add8_reg') : 'add8_reg');

    // ---- multiplier table
    const mt = $('#mul-table');
    if (mt) {
      const row = (w, sgn) => {
        const base = `mul${w}_${sgn}`;
        const v = [base, base + '_booth', base + '_keep', base + '_booth_keep'].map((id) => Y[id]);
        return `<tr><td>${w} × ${w} ${sgn}</td>` + v.map((e) => e ? `<td class="num">${fmt(e.area)}<br><small class="muted">${fmt(delay0(e))} ps</small></td>` : '<td class="num muted">–</td>').join('') + '</tr>';
      };
      mt.innerHTML = '<tr><th>multiply</th><th class="num">array<br><small>default flow</small></th><th class="num">Booth<br><small>default flow</small></th><th class="num">array<br><small>structure kept</small></th><th class="num">Booth<br><small>structure kept</small></th></tr>' +
        row(8, 'unsigned') + row(8, 'signed') + row(16, 'signed') + row(32, 'signed');
    }
    // ---- registers table
    const rt = $('#reg-table');
    if (rt) {
      rt.innerHTML = '<tr><th>32-bit register</th><th>cells</th><th class="num">area µm²</th><th class="num">leakage µW</th><th class="num">logic in front of D</th></tr>' +
        [['reg_plain', 'no reset'], ['reg_async', 'async reset (<code>always_ff @(posedge clk or negedge rst_n)</code>)'], ['reg_sync', 'sync reset'], ['reg_en', 'load enable']].map(([id, lbl]) => {
          const e = Y[id];
          return `<tr><td>${lbl}</td><td>${Object.entries(e.cells).map(([c, n]) => `${n} × <code>${c}</code>`).join(' + ')}</td><td class="num">${fmt(e.area, 1)}</td><td class="num">${fmt(leakOf(e.cells) / 1000, 2)}</td><td class="num">${delay0(e) != null ? fmt(delay0(e)) + ' ps' : 'none'}</td></tr>`;
        }).join('');
    }
    // ---- .lib cell table
    const lt = $('#lib-table');
    if (lt && L.cells) {
      const g = L.gate_delays_ps;
      const dl = (k) => (g[k] ? `${fmt(g[k].cell_rise)} / ${fmt(g[k].cell_fall)}` : '–');
      const rows = [['INV_X1', 'A', 'INV_X1 A->ZN'], ['INV_X4', 'A', 'INV_X4 A->ZN'], ['BUF_X1', 'A', 'BUF_X1 A->Z'], ['NAND2_X1', 'A1', 'NAND2_X1 A1->ZN'], ['NOR2_X1', 'A1', 'NOR2_X1 A1->ZN'], ['AOI21_X1', 'A', 'AOI21_X1 A->ZN'], ['OAI21_X1', 'A', 'OAI21_X1 A->ZN'],
        ['XOR2_X1', 'A', 'XOR2_X1 A->Z'], ['MUX2_X1', 'S', 'MUX2_X1 S->Z'], ['HA_X1', 'A', 'HA_X1 A->S'], ['FA_X1', 'A', 'FA_X1 A->S'], ['FA_X1', 'CI', 'FA_X1 CI->CO']];
      lt.innerHTML = '<tr><th>cell</th><th>function</th><th class="num">area µm²</th><th class="num">leakage nW</th><th class="num">C<sub>in</sub> fF</th><th>arc</th><th class="num">delay ps rise / fall</th></tr>' +
        rows.map(([c, pin, k]) => {
          const x = L.cells[c];
          const arcOut = k.split('->')[1];
          const fn = (x.pins[arcOut] || {}).fn || '';
          return `<tr><td><code>${c}</code></td><td><code>${esc(arcOut)} = ${esc(fn)}</code></td><td class="num">${fmt(x.area, 3)}</td><td class="num">${fmt(x.leak_nW, 1)}</td><td class="num">${fmt(x.pins[pin].cap, 2)}</td><td>${esc(k.split(' ')[1])}</td><td class="num">${dl(k)}</td></tr>`;
        }).join('');
    }
    const st = $('#seq-table');
    if (st && L.seq) {
      const f = L.seq;
      const pair = (o) => (o ? `${fmt(o.cell_rise != null ? o.cell_rise : o.rise_constraint)} / ${fmt(o.cell_fall != null ? o.cell_fall : o.fall_constraint)}` : '–');
      st.innerHTML = '<tr><th>cell</th><th class="num">area µm²</th><th class="num">leakage nW</th><th class="num">CK→Q ps (r / f)</th><th class="num">setup ps (r / f)</th><th class="num">hold ps (r / f)</th><th class="num">clock pin fF</th></tr>' +
        ['DFF_X1', 'DFFR_X1'].map((c) => `<tr><td><code>${c}</code></td><td class="num">${fmt(L.cells[c].area, 3)}</td><td class="num">${fmt(L.cells[c].leak_nW, 1)}</td><td class="num">${pair(f[c]['CK->Q'])}</td><td class="num">${pair(f[c].setup)}</td><td class="num">${pair(f[c].hold)}</td><td class="num">${fmt(f[c].CK_cap, 3)}</td></tr>`).join('') +
        `<tr><td><code>DLH_X1</code> (latch)</td><td class="num">${fmt(L.cells.DLH_X1.area, 3)}</td><td class="num">${fmt(L.cells.DLH_X1.leak_nW, 1)}</td><td class="num">D→Q ${pair(f.DLH_X1['D->Q (transparent)'])}</td><td class="num">${pair(f.DLH_X1.setup_falling)}</td><td class="num">–</td><td class="num">${fmt(L.cells.DLH_X1.pins.G.cap, 3)}</td></tr>`;
    }
    const wt = $('#wlm-table');
    if (wt && L.wlm) {
      wt.innerHTML = '<tr><th class="num">fanout</th><th class="num">length (units)</th><th class="num">C fF</th><th class="num">R Ω</th><th>source</th></tr>' +
        L.wlm.rows.slice(0, 10).map((r) => `<tr${r.fanout === 4 ? ' class="hl"' : ''}><td class="num">${r.fanout}</td><td class="num">${fmt(r.length, 2)}</td><td class="num">${fmt(r.C_fF, 2)}</td><td class="num">${fmt(r.R_ohm, 1)}</td><td>${r.from_table ? 'table' : r.fanout > 8 ? 'extrapolated: slope ' + L.wlm.slope : 'interpolated'}</td></tr>`).join('');
    }

    // ---- what a PE costs, roughly
    const calc = $('#pe-calc');
    if (calc) {
      const MUL = { array: ['mul8_signed', 'mul16_signed', 'mul32_signed'], booth: ['mul8_signed_booth', 'mul16_signed_booth', 'mul32_signed_booth'],
                    array_keep: ['mul8_signed_keep', 'mul16_signed_keep', 'mul32_signed_keep'], booth_keep: ['mul8_signed_booth_keep', 'mul16_signed_booth_keep', 'mul32_signed_booth_keep'] };
      const ADD = { add64_area: 'ripple-like', add64_bk: 'Brent-Kung', add64_ks: 'Kogge-Stone' };
      function upd() {
        const pes = Math.max(1, Math.min(256, +$('#pc-pes').value || 16));
        const st = $('#pc-mul').value;
        const n8 = Math.max(0, +$('#pc-n8').value || 0), n16 = Math.max(0, +$('#pc-n16').value || 0), n32 = Math.max(0, +$('#pc-n32').value || 0);
        const regs = Math.max(0, +$('#pc-regs').value || 0);
        const adds = Math.max(0, +$('#pc-adds').value || 0);
        const ad = Y[$('#pc-add').value];
        const per = (e, n) => ({ a: (e ? e.area : 0) * n, l: (e ? leakOf(e.cells) : 0) * n });
        const m = MUL[st].map((id) => Y[id]);
        const parts = [per(m[0], n8), per(m[1], n16), per(m[2], n32), per(ad, adds)];
        const flopA = regs * L.cells.DFFR_X1.area, flopL = regs * L.cells.DFFR_X1.leak_nW;
        const peA = parts.reduce((s, p) => s + p.a, 0) + flopA, peL = parts.reduce((s, p) => s + p.l, 0) + flopL;
        const period = Math.max(0.1, +$('#pc-period').value || 2);
        const ckE = L.clock_pin_energy.DFFR_X1.energy_per_cycle_fJ;            // fJ per flop per cycle
        const clkmW = pes * regs * ckE * 1e-15 / (period * 1e-9) * 1e3;
        $('#pc-out').innerHTML = [
          ['multipliers per PE', fmt(parts[0].a + parts[1].a + parts[2].a) + ' µm²'],
          ['64-bit adders per PE', fmt(parts[3].a) + ' µm²'],
          ['register bits per PE', fmt(flopA) + ' µm²'],
          ['one PE (these parts only)', fmt(peA) + ' µm²'],
          [pes + ' PEs', fmt(peA * pes) + ' µm² <small>' + (peA * pes > 1e6 ? 'over the Part 3 cap' : peA * pes > 150000 ? 'above set_max_area 150,000' : 'under set_max_area 150,000') + '</small>'],
          ['leakage of those cells', fmt(peL * pes / 1e6, 2) + ' mW'],
          ['flop clock pins alone, at ' + fmt(period, 2) + ' ns', fmt(clkmW, 2) + ' mW'],
        ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      }
      calc.addEventListener('input', upd);
      calc.addEventListener('change', upd);
      $('#pc-reset').addEventListener('click', () => { $('#pc-pes').value = 16; $('#pc-mul').value = 'booth'; $('#pc-n8').value = 4; $('#pc-n16').value = 2; $('#pc-n32').value = 1; $('#pc-regs').value = 96; $('#pc-adds').value = 1; $('#pc-add').value = 'add64_bk'; $('#pc-period').value = '2.0'; upd(); });
      upd();
    }
    return {
      show() {},
      go(id) { const x = id.replace(/^e?x-/, ''); if (Y[x]) { show(x); setTimeout(() => scrollToId('xbody'), 30); return true; } return false; },
    };
  })();

  // ================================================================== READING REPORTS: annotated samples + paste tool
  const ANN = (window.SYN_ANNOTATIONS || (() => ({})))(L);
  views['reports'] = (function () {
    const view = $('#anno-view'), note = $('#anno-note');
    const kinds = { timing: 'timing_met.txt', violated: 'timing_violated.txt', area: 'area.txt', hier: 'area_hier.txt', power: 'power.txt', qor: 'qor.txt', results: 'results.txt' };
    let kind = store.get('anno', 'timing');
    function classify(k, line, ctx) {
      const rules = (ANN[k === 'violated' ? 'timing' : k] || { rules: [] }).rules;
      for (const r of rules) { if (r.re.test(line) && (!r.when || r.when(ctx))) return r; }
      return null;
    }
    function render() {
      const text = (D.samples || {})[kinds[kind]] || '';
      const ctx = { seenArrival: false, seenClock: 0 };
      let last = null;
      const NUMS = /^\s*[-+]?\d[\d.eE+-]*(\s+[-+]?\d[\d.eE+-]*)*\s*[rf]?\s*$/;
      const html = text.split('\n').map((line, i) => {
        if (/^#/.test(line)) return `<span class="al banner">${esc(line)}</span>`;
        if (/^\s*clock clk \(rise edge\)/.test(line)) ctx.seenClock++;
        const r = NUMS.test(line) && last ? last : classify(kind, line, ctx);
        last = r;
        if (/data arrival time/.test(line)) ctx.seenArrival = true;
        if (!r) return `<span class="al">${esc(line) || ' '}</span>`;
        return `<span class="al k" data-k="${r.key}" data-i="${i}" style="--c: var(${r.color || '--line'})" tabindex="0">${esc(line) || ' '}</span>`;
      }).join('');
      view.innerHTML = html;
      $$('.rtabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === kind)));
      const first = $('.al.k', view);
      if (first) pick(first);
      if (kind === 'timing' || kind === 'violated') walk(); else $('#anno-walk').innerHTML = '';
    }
    function pick(el) {
      $$('.al.sel', view).forEach((x) => x.classList.remove('sel'));
      el.classList.add('sel');
      const set = ANN[kind === 'violated' ? 'timing' : kind] || {};
      const n = (set.notes || {})[el.dataset.k];
      note.innerHTML = n ? `<h4>${n[0]}</h4><div class="prose">${n[1]}</div>` : '';
    }
    view.addEventListener('click', (e) => { const el = e.target.closest('.al.k'); if (el) pick(el); });
    view.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.al.k')) { e.preventDefault(); pick(e.target.closest('.al.k')); } });
    $('.rtabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b) { kind = b.dataset.k; store.set('anno', kind); render(); } });
    function walk() {
      const t = P.parseTiming((D.samples || {})[kinds[kind]] || '')[0];
      if (!t) return;
      $('#anno-walk').innerHTML = timingCard(t, true);
    }
    render();

    // ---- the paste tool
    const ta = $('#paste-in'), out = $('#paste-out');
    function analyze() {
      const r = P.parseAll(ta.value);
      if (!r.found.length) { out.innerHTML = `<p class="flagline warn">Didn't recognize a report. Paste the whole thing, from the header down; the parser looks for lines like <code>Startpoint:</code>, <code>Total cell area:</code>, <code>Total Dynamic Power</code>, a bare first line like <code>2.000</code> (results.txt), or messages ending in IDs like <code>(LINT-28)</code>.</p>`; return; }
      let h = `<p class="cap">Found: ${r.found.map(esc).join(', ')}. Parsed in your browser; nothing was sent anywhere.</p>`;
      if (r.results) h += resultsCard(r.results);
      if (r.timing) r.timing.slice(0, 4).forEach((t) => { h += timingCard(t, false); });
      if (r.timing && r.timing.length > 4) h += `<p class="cap">${r.timing.length - 4} more paths not shown.</p>`;
      if (r.area) h += areaCard(r.area);
      if (r.power) h += powerCard(r.power);
      if (r.qor) h += qorCard(r.qor);
      if (r.log) h += logCard(r.log);
      out.innerHTML = h;
      fomHook();
    }
    $('#paste-go').addEventListener('click', analyze);
    $('#paste-clear').addEventListener('click', () => { ta.value = ''; out.innerHTML = ''; });
    $('#paste-samples').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-s]');
      if (!b) return;
      ta.value = (D.samples || {})[b.dataset.s] || '';
      analyze();
    });
    $('#paste-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rdr = new FileReader();
      rdr.onload = () => { ta.value = String(rdr.result || ''); analyze(); };
      rdr.readAsText(f);
    });
    return { show() {}, go(id) { if (kinds[id]) { kind = id; render(); setTimeout(() => scrollToId('reports-anatomy'), 30); return true; } return false; } };
  })();

  function timingCard(t, sample) {
    const met = t.met === true, viol = t.met === false;
    const stages = t.launch.filter((x) => x.kind === 'pin' || x.kind === 'port' || x.kind === 'external');
    const total = t.arrival || (stages.length ? stages[stages.length - 1].path : 0) || 1;
    const top = stages.filter((s) => s.kind === 'pin').slice().sort((a, b) => (b.incr || 0) - (a.incr || 0)).slice(0, 3).map((s) => s);
    const cq = stages.find((s) => /\/(Q|QN)$/.test(s.inst + '/' + s.pin) && s.kind === 'pin');
    const byCell = Object.entries(t.byCell || {}).sort((a, b) => b[1].delay - a[1].delay).slice(0, 6);
    let h = `<div class="pcard"><h4>${sample ? 'Walk the sample path' : 'Timing path'} <span class="verdict ${met ? 'met' : viol ? 'viol' : ''}">${esc(t.slackLabel || '')} ${t.slack != null ? fmt(t.slack, 4) + ' ns' : ''}</span></h4>`;
    h += `<dl class="stats"><div><dt>startpoint</dt><dd style="font-size:.8rem">${esc(t.startpoint || '?')}</dd></div><div><dt>endpoint</dt><dd style="font-size:.8rem">${esc(t.endpoint || '?')}</dd></div>` +
      `<div><dt>clock period (capture edge)</dt><dd>${t.period != null ? fmt(t.period, 4) + ' ns' : '?'}</dd></div><div><dt>data arrival</dt><dd>${fmt(t.arrival, 4)} ns</dd></div>` +
      `<div><dt>library setup</dt><dd>${t.setup != null ? fmt(-t.setup, 4) + ' ns' : '?'}</dd></div><div><dt>data required</dt><dd>${fmt(t.required, 4)} ns</dd></div>` +
      `<div><dt>cells on the path</dt><dd>${t.cellCount}</dd></div><div><dt>group / type</dt><dd>${esc(t.group || '?')} / ${esc(t.type || '?')}</dd></div></dl>`;
    if (!t.consistent) h += `<p class="flagline warn">The last Path value doesn't match "data arrival time": some lines probably didn't parse. Check the table below against your report.</p>`;
    if (t.period != null && t.required != null && t.setup != null) h += `<p class="flagline">required = ${fmt(t.period, 4)} − ${fmt(-t.setup, 4)} = ${fmt(t.required, 4)} ns; slack = required − arrival = ${fmt(t.required, 4)} − ${fmt(t.arrival, 4)} = <b>${fmt(t.required - t.arrival, 4)} ns</b>.</p>`;
    if (cq) h += `<p class="flagline">Clock-to-Q of the launching flop: ${fmt(cq.incr, 4)} ns (${esc(cq.cell)}).</p>`;
    if (top.length) h += `<p class="flagline">Biggest single steps: ${top.map((s) => `<code>${esc(s.cell)}</code> ${fmt(s.incr, 4)}`).join(', ')}.</p>`;
    h += `<div class="tscroll">` + stages.map((s) => `<div class="hbar${top.includes(s) ? ' warn' : ''}"><span class="n" title="${esc(s.name)}">${esc(s.kind === 'pin' ? (s.cell + ' · ' + s.inst.split('/').pop() + '/' + s.pin) : s.name)}</span><span class="t"><i style="left:${100 * ((s.path || 0) - (s.incr || 0)) / total}%;width:${Math.max(0.5, 100 * (s.incr || 0) / total)}%"></i></span><span class="v">${fmt(s.incr, 4)} → ${fmt(s.path, 4)}</span></div>`).join('') + `</div>`;
    if (byCell.length) h += `<p class="cap">Delay by cell type on this path: ${byCell.map(([c, v]) => `${esc(c)} ×${v.count} = ${fmt(v.delay, 3)} ns`).join(' · ')}</p>`;
    return h + '</div>';
  }
  function areaCard(a) {
    const total = typeof a.totalCell === 'number' ? a.totalCell : null;
    const cats = [['combinational', a.combinational, '(includes buf/inv)'], ['  of which buf/inv', a.bufinv, ''], ['noncombinational (flops, latches)', a.noncombinational, ''], ['macro / black box', a.macro, ''], ['net interconnect', a.net, a.netNote ? '(' + a.netNote + ')' : '']];
    let h = `<div class="pcard"><h4>Area ${total != null ? '· total cell area ' + fmt(total, 1) + ' µm²' : ''}</h4>`;
    h += cats.map(([k, v, note]) => `<div class="hbar"><span class="n">${esc(k.trim())}</span><span class="t"><i style="width:${typeof v === 'number' && total ? 100 * v / total : 0}%"></i></span><span class="v">${typeof v === 'number' ? fmt(v, 1) + (total ? ' (' + fmt(100 * v / total, 1) + '%)' : '') : esc(v == null ? '–' : v)} ${esc(note)}</span></div>`).join('');
    if (total != null) h += `<p class="flagline ${total > 1e6 ? 'warn' : ''}">${total > 1e6 ? 'Over the Part 3 cap of 1,000,000 µm².' : total > 150000 ? 'Above the script\'s set_max_area goal of 150,000 µm² (a goal, not an error).' : 'Under the set_max_area goal of 150,000 µm².'}</p>`;
    if (total != null && total < 5000) h += `<p class="flagline warn">That's tiny for this design. Check the hierarchical report: has logic been optimized away?</p>`;
    if (a.hier && a.hier.length) {
      const rows = a.hier.filter((r) => r.name !== 'top');
      const max = Math.max(1, ...rows.map((r) => r.abs || 0));
      const pes = rows.filter((r) => /pe/i.test(r.name) && !/\//.test(r.name.replace(/^.*?\]\./, '')));
      const peAreas = pes.map((r) => r.abs).filter((x) => x != null);
      const med = peAreas.length ? peAreas.slice().sort((x, y) => x - y)[Math.floor(peAreas.length / 2)] : null;
      h += `<h4 style="margin-top:12px">By instance</h4>`;
      if (pes.length) h += `<p class="flagline ${pes.some((r) => (r.abs || 0) < 0.5 * med || (r.abs || 0) < 500) ? 'warn' : 'ok'}">${pes.length} instances look like PEs; median ${fmt(med, 1)} µm²${pes.some((r) => (r.abs || 0) < 0.5 * med || (r.abs || 0) < 500) ? '. Some are far smaller than the rest: check them (Black boxes tab).' : ', none suspiciously small.'}</p>`;
      const mems = rows.filter((r) => /array/i.test(r.design));
      if (mems.length) h += `<p class="flagline">${mems.length} memory instance${mems.length > 1 ? 's' : ''} (designs named array…) at ${fmt(mems.reduce((s, r) => s + (r.abs || 0), 0), 1)} µm²: expected, they're empty boxes.</p>`;
      else h += `<p class="flagline warn">No array instances listed. If your design has memories, DC may have ungrouped or removed them; check that the PEs still have area.</p>`;
      h += `<div class="tscroll">` + rows.map((r) => `<div class="hbar${(pes.includes(r) && ((r.abs || 0) < 0.5 * med || (r.abs || 0) < 500)) ? ' warn' : ''}"><span class="n" title="${esc(r.name)} (${esc(r.design)})">${esc(r.name)}</span><span class="t"><i style="width:${100 * (r.abs || 0) / max}%"></i></span><span class="v">${fmt(r.abs, 1)} µm²</span></div>`).join('') + '</div>';
    }
    return h + '</div>';
  }
  function powerCard(p) {
    const T = p.total;
    let h = `<div class="pcard"><h4>Power ${T != null ? '· total ' + fmt(T, 4) + ' mW' : ''}</h4>`;
    const items = [['cell internal', p.internal], ['net switching', p.switching], ['leakage', p.leakage]];
    h += items.map(([k, v]) => `<div class="hbar"><span class="n">${k}</span><span class="t"><i style="width:${v != null && T ? 100 * v / T : 0}%"></i></span><span class="v">${v != null ? fmt(v, 4) + ' mW' + (T ? ' (' + fmt(100 * v / T, 1) + '%)' : '') : '–'}</span></div>`).join('');
    if (p.dynamic != null) h += `<p class="flagline">Dynamic (internal + switching) = ${fmt(p.dynamic, 4)} mW. ${p.totalRow ? 'Total row (dynamic + leakage) = ' + fmt(p.totalRow.total, 4) + ' mW: the number we assume the FoM means by Power.' : ''}</p>`;
    if (p.groups.length) {
      const max = Math.max(1e-9, ...p.groups.map((g) => g.total || 0));
      h += `<h4 style="margin-top:10px">By group</h4>` + p.groups.map((g) => `<div class="hbar"><span class="n">${esc(g.name)}</span><span class="t"><i style="width:${100 * (g.total || 0) / max}%"></i></span><span class="v">${fmt(g.total, 4)} mW (${fmt(g.pct, 2)}%)</span></div>`).join('');
      const reg = p.groups.find((g) => g.name === 'register');
      if (reg && T && reg.total / T > 0.5) h += `<p class="flagline">Registers are ${fmt(100 * reg.total / T, 0)}% of the total: mostly clock-pin power, paid every cycle whether the data changes or not. That's what clock gating attacks.</p>`;
    }
    return h + '</div>';
  }
  function qorCard(q) {
    const k = [['critical path length', q.length, 'ns'], ['critical path slack', q.slack, 'ns'], ['clock period', q.period, 'ns'], ['levels of logic', q.levels, ''], ['total negative slack', q.tns, 'ns'], ['violating paths', q.violating, ''], ['leaf cells', q.leafCells, ''], ['sequential cells', q.seqCells, ''], ['cell area', q.cellArea, 'µm²'], ['nets with DRC violations', q.netViol, ''], ['compile wall clock', q.wallClock, 's']].filter((x) => x[1] != null);
    return `<div class="pcard"><h4>QoR</h4><dl class="stats">${k.map(([n, v, u]) => `<div><dt>${n}</dt><dd>${fmt(v, u === 'ns' ? 2 : u === 'µm²' ? 1 : 0)} <small>${u}</small></dd></div>`).join('')}</dl>${q.slack != null && q.slack < 0 ? '<p class="flagline warn">Negative slack: timing is not met at this period.</p>' : ''}${q.netViol ? '<p class="flagline warn">Design-rule violations remain (max transition / capacitance). DC fixes those first; leftovers usually mean very high fanout somewhere.</p>' : ''}</div>`;
  }
  function logCard(g) {
    const w = Object.entries(g.warnings).sort((a, b) => b[1].count - a[1].count);
    const KNOWN = { 'ELAB-974': 'latch in an always_comb (expected once per vector_decoder instance; a bug anywhere else)', 'LINT-28': 'unconnected port (expected on the empty arrays)', 'LINT-32': 'pin tied to 0 or 1 (expected: cen/wen/gwen tie-offs)', 'LINT-33': 'same net on several pins of one cell (expected: tie-offs)', 'LINT-52': 'output port driven by a constant', 'LINK-5': 'unresolved reference: a module is missing. Fix this', 'ELAB-366': 'multiple drivers: an error. Fix this' };
    let h = `<div class="pcard"><h4>compile.log messages</h4>`;
    h += `<p class="flagline ${g.errors.length ? 'warn' : 'ok'}">${g.errors.length ? g.errors.length + ' line(s) start with "Error". Part 2 needs zero.' : 'No lines starting with "Error".'}</p>`;
    g.errors.slice(0, 8).forEach((e) => { h += `<pre class="code wrapme">${esc('line ' + e.line + ': ' + e.text)}</pre>`; });
    if (g.unresolved.length) h += `<p class="flagline warn">Unresolved references: ${g.unresolved.length}. A module DC couldn't find becomes an empty black box.</p>`;
    if (g.latches.length) h += `<p class="flagline">Inferred latches: ${g.latches.map((x) => esc(x.name) + ' (' + x.width + ' bits)').join(', ')}.</p>`;
    h += `<p class="flagline">${g.warningCount} warning line(s), by message ID:</p>` + w.map(([id, x]) => `<div class="hbar"><span class="n">${esc(id)}</span><span class="t"><i style="width:${100 * x.count / Math.max(1, w[0][1].count)}%"></i></span><span class="v">${x.count} ×</span></div><p class="cap" style="margin:0 0 6px">${KNOWN[id] ? esc(KNOWN[id]) + '. ' : ''}First: <code>${esc(x.first.slice(0, 160))}</code></p>`).join('');
    return h + '</div>';
  }
  function resultsCard(r) {
    let h = `<div class="pcard"><h4>results.txt</h4><dl class="stats">` +
      `<div><dt>clock period</dt><dd>${fmt(r.period, 3)} ns</dd></div><div><dt>slack</dt><dd class="verdict ${r.met ? 'met' : 'viol'}">${esc(r.slackLabel || '?')} ${fmt(r.slack, 4)}</dd></div>` +
      `<div><dt>total power</dt><dd>${fmt(r.total, 4)} mW</dd></div><div><dt>dynamic</dt><dd>${fmt(r.dynamic, 4)} mW</dd></div><div><dt>leakage</dt><dd>${fmt(r.leakage, 4)} mW</dd></div><div><dt>total cell area</dt><dd>${fmt(r.area, 1)} µm²</dd></div></dl>`;
    if (r.met === false) h += `<p class="flagline warn">VIOLATED: Part 3 doesn't allow this period. Lengthen the period, or fix the path.</p>`;
    if (r.other.length) h += `<p class="cap">Other lines (probably check_error's output): ${r.other.slice(0, 6).map((l) => '<code>' + esc(l) + '</code>').join(' ')}</p>`;
    h += `<div class="fom" data-period="${r.period}" data-area="${r.area}" data-power="${r.total}"><h4 style="margin-top:10px">Figure of merit from these numbers</h4><p class="cap">FoM = (T<sub>int8</sub> + T<sub>int16</sub> + T<sub>int32</sub>)<sup>2.3</sup> × area × power × 10<sup>−15</sup>, with T = cycles × period in ns. Type your cycle counts from your own equivalence runs (<code>make eq</code> prints "Computation took N clock cycles").</p>` +
      `<div class="calc"><label>INT8 cycles <input type="number" class="fc" data-m="8" min="0"></label><label>INT16 cycles <input type="number" class="fc" data-m="16" min="0"></label><label>INT32 cycles <input type="number" class="fc" data-m="32" min="0"></label><button class="small fex" type="button">Use example counts</button></div><p class="cap">Heads-up: the example counts (16,440 / 8,248 / 4,152 cycles) were measured on one zero-bubble design with 16 PEs, so they're effectively a reference answer for the cycle timing. Use your own.</p><p class="fomout flagline"></p></div>`;
    return h + '</div>';
  }
  function fomHook() {
    $$('.fom').forEach((f) => {
      if (f.dataset.wired) return;
      f.dataset.wired = '1';
      const upd = () => {
        const c = $$('.fc', f).map((i) => +i.value || 0);
        const period = +f.dataset.period, area = +f.dataset.area, power = +f.dataset.power;
        if (!c.every((x) => x > 0) || !(period > 0) || !(area > 0) || !(power > 0)) { $('.fomout', f).textContent = 'Fill in all three cycle counts.'; return; }
        const T = (c[0] + c[1] + c[2]) * period;
        const fom = Math.pow(T, 2.3) * area * power * 1e-15;
        $('.fomout', f).innerHTML = `T total = ${fmt(c[0] + c[1] + c[2])} cycles × ${fmt(period, 3)} ns = ${fmt(T)} ns → FoM ≈ <b>${fom.toPrecision(4)}</b>. (Halving T alone divides it by 2<sup>2.3</sup> ≈ 4.9.)`;
      };
      f.addEventListener('input', upd);
      $('.fex', f).addEventListener('click', () => { const ex = [16440, 8248, 4152]; $$('.fc', f).forEach((i, k) => { i.value = ex[k]; }); upd(); });
      upd();
    });
  }

  // ================================================================== BLACK BOXES: toggle the "registered SRAM outputs" variant
  views['black-boxes'] = (function () {
    const svg = $('#bb-svg');
    const seg = $('#bb-seg');
    if (!svg || !seg) return {};
    function set(v) {
      $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
      $$('[data-show]', svg).forEach((g) => g.classList.toggle('hide', g.dataset.show !== v && g.dataset.show !== 'both'));
      $('#bb-cap').innerHTML = v === 'direct'
        ? 'PE operands come straight from the memories\' <code>q</code> pins, as in a design that feeds the PEs in the same cycle the SRAM data appears. The operand data has no timed startpoint, so only the accumulate feedback, the instruction paths and any register that steers the operands (a lane or mode select) are checked.'
        : 'With a register between <code>q</code> and the PE, <code>q → register</code> is still unchecked, but <code>register → multiply → add → accumulator</code> is a normal register-to-register path that report_timing sees. That costs a cycle of latency your controller has to account for: a design decision, not a free fix.';
    }
    seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) set(b.dataset.v); });
    set('direct');
    return {};
  })();

  // ================================================================== CLEAN LOG: paste compile.log
  views['clean-log'] = (function () {
    const ta = $('#log-in');
    if (!ta) return {};
    $('#log-go').addEventListener('click', () => {
      const t = ta.value;
      const g = P.parseLog(t);
      $('#log-out').innerHTML = /\S/.test(t) ? logCard(g) : '<p class="flagline warn">Paste your compile.log first.</p>';
    });
    $('#log-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rdr = new FileReader();
      rdr.onload = () => { ta.value = String(rdr.result || ''); $('#log-go').click(); };
      rdr.readAsText(f);
    });
    $('#log-example').addEventListener('click', () => { ta.value = $('#log-example-text').textContent; $('#log-go').click(); });
    return {};
  })();

  window.addEventListener('hashchange', route);
  route();
  firstRoute = false;
})();
