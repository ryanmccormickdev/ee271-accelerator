(function () {
  'use strict';
  const S = window.SIMD;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const MINUS = '−';
  const num = (x) => { const n = BigInt(x); return n < 0n ? MINUS + (-n).toString() : n.toString(); };
  const comma = (x) => Number(x).toLocaleString('en-US');
  const par = (x) => (BigInt(x) < 0n ? '(' + num(x) + ')' : num(x));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hexw = (v, bits) => S.toU(v, bits).toString(16).padStart(Math.ceil(bits / 4), '0');
  const hexLanes = (v, bits, w) => { const h = hexw(v, bits), d = Math.max(1, w / 4), out = []; for (let i = 0; i < h.length; i += d) out.push(h.slice(i, i + d)); return '0x' + out.join('_'); };
  const hexSlices = (v, P, w) => Array.from({ length: P }, (_, i) => hexLanes((BigInt(v) >> BigInt((P - 1 - i) * 32)) & S.mask(32), 32, w)).join(' | ');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ee271wt:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ee271wt:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const pl = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  const SHORT = { 'mem opcode': 'op', 'mem mode': 'mode', MemAOffset: 'MemAOffset', MemBOffset: 'MemBOffset', 'PE opcode': 'op', 'PE mode': 'mode', 'PE value': 'value', Count: 'Count', MemAIncrement: 'incA', MemBIncrement: 'incB' };
  // x / 2^s written out exactly (up to 8 decimals, then an ellipsis), using BigInt only
  function exactDiv(x, s) {
    if (s === 0) return num(x);
    const neg = x < 0n, den = 1n << BigInt(s);
    const a = neg ? -x : x;
    let rem = a % den, frac = '';
    for (let i = 0; i < 8 && rem; i++) { rem *= 10n; frac += (rem / den).toString(); rem %= den; }
    return (neg ? MINUS : '') + (a / den).toString() + (frac ? '.' + frac + (rem ? '…' : '') : '');
  }
  const EXAMPLE = { M: [[1, 2, -1], [3, 0, 2], [-2, 1, 4], [0, -3, 1], [2, 2, 2], [-1, 4, 0]], v: [2, -1, 3] };

  // ------------------------------------------------------------------ flying chips
  function rectOf(x) {
    if (!x) return null;
    if (Array.isArray(x)) {
      const rs = x.filter(Boolean).map((e) => e.getBoundingClientRect());
      if (!rs.length) return null;
      const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
      const r = Math.max(...rs.map((q) => q.right)), b = Math.max(...rs.map((q) => q.bottom));
      return { left: l, top: t, width: r - l, height: b - t };
    }
    return x.getBoundingClientRect();
  }
  function fly(content, layer, from, to, text, cls, delay, dur) {
    const a = rectOf(from), b = rectOf(to);
    if (!a || !b || !content || !layer) return Promise.resolve();
    const cr = content.getBoundingClientRect();
    const x0 = a.left - cr.left + a.width / 2, y0 = a.top - cr.top + a.height / 2;
    const x1 = b.left - cr.left + b.width / 2, y1 = b.top - cr.top + b.height / 2;
    const chip = document.createElement('div');
    chip.className = 'fly ' + (cls || '');
    chip.textContent = text;
    layer.appendChild(chip);
    if (!chip.animate) { chip.remove(); return Promise.resolve(); }
    const w = chip.offsetWidth, h = chip.offsetHeight;
    const T = (x, y, s) => `translate(${x - w / 2}px, ${y - h / 2}px) scale(${s})`;
    const an = chip.animate([
      { transform: T(x0, y0, 0.7), opacity: 0 },
      { transform: T(x0, y0, 1), opacity: 1, offset: 0.14 },
      { transform: T(x1, y1, 1), opacity: 1, offset: 0.86 },
      { transform: T(x1, y1, 0.85), opacity: 0 },
    ], { duration: dur || 720, delay: delay || 0, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'both' });
    // the timer is a fallback for when the browser pauses animations (background tab)
    return Promise.race([an.finished.catch(() => {}), sleep((delay || 0) + (dur || 720) + 300)]).then(() => chip.remove());
  }
  function reveal(el) {
    if (!el || Array.isArray(el)) return;
    const c = el.closest && el.closest('.memscroll');
    if (!c) return;
    const cr = c.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < cr.top || r.bottom > cr.bottom) c.scrollTop += (r.top - cr.top) - (c.clientHeight - r.height) / 2;
  }
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

  // ------------------------------------------------------------------ theme
  const root = document.documentElement;
  const savedTheme = store.get('theme', null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $('#themebtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  // ------------------------------------------------------------------ router
  const views = {};
  let current = null;
  function showView(name) {
    if (!views[name]) name = 'big-picture';
    if (current === name) return;
    if (current && views[current].hide) views[current].hide();
    Object.keys(views).forEach((n) => { $('#view-' + n).hidden = n !== name; });
    $$('nav.tabs a').forEach((a) => { if (a.dataset.view === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    current = name;
    if (views[name].show) views[name].show();
    window.scrollTo(0, 0);
  }
  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    flash(el);
    return true;
  }
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const i = h.indexOf('/');
    const name = (i < 0 ? h : h.slice(0, i)) || 'big-picture';
    const rest = i < 0 ? '' : h.slice(i + 1);
    showView(name);
    if (rest) setTimeout(() => { const v = views[current]; if (!(v.go && v.go(rest))) scrollToId(rest); }, 40);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    e.preventDefault();
    const t = '#' + b.dataset.goto;
    if (location.hash === t) route(); else location.hash = t;
  });

  // ================================================================== BIG PICTURE
  function stats(rows, cols, P, w) {
    const n = 32 / w, R = P * n, blocks = Math.ceil(rows / R), pad = blocks * R - rows;
    const m0 = blocks * cols, m1 = Math.ceil(cols / n), m2 = blocks;
    return { n, R, blocks, pad, m0, m1, m2, width: 32 * P, instr: 4 * blocks, reps: blocks * (cols + 3), macs: blocks * cols * R, useful: rows * cols };
  }

  views['big-picture'] = (function () {
    const el = $('#view-big-picture');
    const pk = $('#bp-packets');
    const C = { m0: 'var(--m0)', m1: 'var(--m1)', m2: 'var(--m2)', ctl: 'var(--ctl)', pe: 'var(--pe)' };
    const ALL = ['bp-h1', 'bp-h2', 'bp-h3', 'bp-h4', 'bp-m0', 'bp-m1', 'bp-m2', 'bp-arr', 'bp-im', 'bp-ctl'];
    let token = 0, raf = 0, live = [];
    const INTRO = {
      title: 'The whole system, at test scale',
      body: `<p>Two sides. On the left is the <b>host</b>: your laptop running <code>test_accelerator.py</code>, with numpy and the given starter code. On the right is the <b>accelerator</b>: the part your three files simulate.</p>
        <p>Press <b>Play all four</b> to watch the INT16 public test go through its four phases: compile, load, run, read back. The numbers are the real ones, a 768×64 matrix on 64 PEs.</p>
        <p>The four long dashed lines that leave the host's box are the only places data crosses between the two sides.</p>`,
    };
    const PH = {
      1: { title: '1 · Compile (host only)', lit: ['bp-h1', 'bp-h2', 'bp-h3'],
        body: `<p>Nothing has touched the accelerator yet. numpy makes a 768×64 matrix M and a 64-entry vector v of random integers from −5 to 4, and computes the answer key, M @ v.</p>
          <p>The given <code>compiler.py</code> turns them into exactly what the hardware wants: a <b>MEM0 image</b> (the matrix, one column of a 128-row block per entry), a <b>MEM1 image</b> (the vector, two elements per entry in INT16), and a <b>program</b> of 24 lines of text. <code>assembler.py</code> turns each line into a 63-bit instruction.</p>
          <p>None of this is your code, and none of it runs on the accelerator.</p>` },
      2: { title: '2 · Load', lit: ['bp-h2', 'bp-h3', 'bp-m0', 'bp-m1', 'bp-im'],
        body: `<p><code>set_memory(mem0, mem1)</code> copies the two images into MEM0 and MEM1. Then <code>execute_instructions(program)</code> starts handing over instructions, one at a time.</p>
          <p>Those are the only inputs the accelerator ever gets: two memory images and a list of instructions. No matrix object, no numpy, no sizes. It doesn't even know how many rows M has. Only the program does.</p>` },
      3: { title: '3 · Run (accelerator only)', lit: ['bp-m0', 'bp-m1', 'bp-m2', 'bp-arr', 'bp-im', 'bp-ctl'],
        body: `<p>Now everything happens inside. The controller repeats each instruction Count + 1 times. On a MAC repeat, the main buffer reads one MEM0 entry (orange: a different slice for each PE) and one vector element from MEM1 (purple: the same for every PE), and every PE does the same thing, a MAC in both of its lanes. At the end of each block, the results go to MEM2 (green).</p>
          <p>At this scale, 24 instructions become <b>402 repeats</b>, and each MAC repeat is 64 PEs × 2 lanes = 128 multiplies at once. That's 49,152 multiplies in all.</p>
          <p>The host just waits. Nothing crosses the boundary during the run.</p><p class="muted" id="bp-count"></p>` },
      4: { title: '4 · Read back', lit: ['bp-m2', 'bp-h4'],
        body: `<p><code>get_mem2()</code> hands MEM2 back to the host. <code>extract_results_from_memory</code> cuts entries 0 to 5 into 16-bit pieces, left to right, and that's y: 6 entries × 128 results = 768.</p>
          <p>Then the test compares y with numpy's M @ v. If all 768 match, it prints "Test Passed!". That comparison is the only thing the public accelerator test checks. It never looks inside your PEs or your buffer.</p>` },
    };
    function setPanel(p) { $('#bp-title').textContent = p.title; $('#bp-body').innerHTML = p.body; }
    function light(ids) {
      ALL.forEach((id) => { const g = document.getElementById(id); g.classList.toggle('dim', !!ids && !ids.includes(id)); });
    }
    const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
    function packet(pathId, color, delay, dur) {
      const path = document.getElementById(pathId);
      if (!path) return;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '6.5');
      c.style.fill = color; c.style.stroke = 'var(--paper-3)'; c.style.strokeWidth = '1.5'; c.style.opacity = '0';
      pk.appendChild(c);
      live.push({ c, path, len: path.getTotalLength(), t0: performance.now() + (delay || 0), dur: dur || 800 });
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick(now) {
      live = live.filter((p) => {
        const u = (now - p.t0) / p.dur;
        if (u < 0) return true;
        if (u >= 1) { p.c.remove(); return false; }
        const pt = p.path.getPointAtLength(p.len * ease(u));
        p.c.setAttribute('cx', pt.x); p.c.setAttribute('cy', pt.y);
        p.c.style.opacity = String(u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1);
        return true;
      });
      raf = live.length ? requestAnimationFrame(tick) : 0;
    }
    function stopAll() { token++; live.forEach((p) => p.c.remove()); live = []; }
    async function phase(n, my) {
      const p = PH[n];
      setPanel(p); light(p.lit);
      $$('.phasebtns [data-phase]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.phase === n)));
      if (n !== 4) $('#bp-verdict').textContent = '';
      const still = reduced();
      if (n === 1) {
        if (!still) { packet('bpp-np-comp', C.m0, 200, 700); packet('bpp-np-comp', C.m1, 380, 700); }
        await sleep(1300); if (my !== token) return;
        if (!still) packet('bpp-comp-asm', C.ctl, 0, 700);
        await sleep(1400);
      } else if (n === 2) {
        if (!still) for (let i = 0; i < 3; i++) { packet('bpp-x-m0', C.m0, i * 280, 900); packet('bpp-x-m1', C.m1, 120 + i * 280, 1200); packet('bpp-x-im', C.ctl, 220 + i * 280, 1300); }
        await sleep(2600);
      } else if (n === 3) {
        const cycles = 16;
        for (let c = 0; c < cycles; c++) {
          if (my !== token) return;
          if (!still) {
            if (c % 4 === 0) packet('bpp-im-ctl', C.ctl, 0, 380);
            packet('bpp-ctl-pe', C.ctl, 60, 300); packet('bpp-ctl-m0', C.ctl, 60, 420); packet('bpp-ctl-m1', C.ctl, 60, 420);
            for (let i = 0; i < 3; i++) { packet('bpp-m0-' + i, C.m0, 300, 420); packet('bpp-m1-' + i, C.m1, 300, 480); }
            if (c % 4 === 3) { packet('bpp-ctl-m2', C.ctl, 0, 420); for (let i = 0; i < 3; i++) packet('bpp-pe-' + i, C.m2, 380, 420); }
          }
          const cnt = document.getElementById('bp-count');
          if (cnt) cnt.textContent = `repeat ${comma(Math.round(((c + 1) / cycles) * 402))} of 402`;
          await sleep(560);
        }
      } else if (n === 4) {
        if (!still) for (let i = 0; i < 6; i++) packet('bpp-x-m2', C.m2, i * 170, 1500);
        await sleep(2300); if (my !== token) return;
        $('#bp-verdict').textContent = '✓ 768 of 768 match';
        $('#bp-verdict').style.fill = 'var(--ok)';
        await sleep(600);
      }
    }
    async function playAll() {
      stopAll(); const my = token;
      for (let n = 1; n <= 4; n++) { await phase(n, my); if (my !== token) return; await sleep(300); }
    }
    $('#bp-play').addEventListener('click', playAll);
    $$('.phasebtns [data-phase]').forEach((b) => b.addEventListener('click', () => { stopAll(); phase(+b.dataset.phase, token); }));

    // scale table (tests as columns)
    const TESTS = [['INT16 test', 768, 64, 64, 16], ['INT32 test', 768, 64, 13, 32], ['INT8 test', 64, 3, 9, 8]];
    const ss = TESTS.map((t) => stats(t[1], t[2], t[3], t[4]));
    const rowsDef = [
      ['Matrix', (s, t) => `${t[1]} × ${t[2]}`], ['Mode', (s, t) => 'INT' + t[4]], ['PEs', (s, t) => t[3]],
      ['Lanes per PE', (s) => s.n], ['Rows per block (PEs × lanes)', (s) => s.R], ['Blocks', (s) => s.blocks],
      ['Padding rows in the last block', (s) => s.pad], ['MEM0 / MEM2 entry width', (s) => comma(s.width) + ' bits'],
      ['MEM0 entries used (of 65,536)', (s) => comma(s.m0)], ['MEM1 entries used (of 16,384)', (s) => comma(s.m1)],
      ['MEM2 entries written', (s) => comma(s.m2)], ['Instructions', (s) => comma(s.instr)], ['Repeats', (s) => comma(s.reps)],
      ['Multiplies done', (s) => comma(s.macs)], ['… of them on real rows', (s) => `${comma(s.useful)} (${(100 * s.useful / s.macs).toFixed(1)}%)`],
    ];
    $('#bp-scale-table').innerHTML = `<tr><th></th>${TESTS.map((t) => `<th class="num">${t[0]}</th>`).join('')}</tr>` +
      rowsDef.map(([k, f]) => `<tr><td>${k}</td>${ss.map((s, i) => `<td class="num">${f(s, TESTS[i])}</td>`).join('')}</tr>`).join('');

    function calc() {
      const g = (id, lo, hi, d) => { const v = Math.round(+$(id).value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
      const rows = g('#calc-rows', 1, 1e6, 768), cols = g('#calc-cols', 1, 1e6, 64), P = g('#calc-pes', 1, 1024, 64), w = +$('#calc-mode').value;
      const s = stats(rows, cols, P, w);
      const mib = (65536 * s.width) / 8 / 1048576;
      const items = [
        ['Rows per block', comma(s.R)], ['Blocks', comma(s.blocks)], ['Padding rows', comma(s.pad)],
        ['MEM0 entries used', `${comma(s.m0)} <small>of 65,536</small>`], ['MEM1 entries used', `${comma(s.m1)} <small>of 16,384</small>`],
        ['MEM0 size (full depth)', `${mib >= 1 ? mib.toFixed(mib < 10 ? 1 : 0) + ' MiB' : (mib * 1024).toFixed(0) + ' KiB'} <small>${comma(s.width)}-bit entries</small>`],
        ['Instructions', comma(s.instr)], ['Repeats', comma(s.reps)],
        ['Multiplies done', comma(s.macs)], ['Useful', `${(100 * s.useful / s.macs).toFixed(1)}%`],
      ];
      $('#calc-out').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      const warn = [];
      if (s.m0 > 65536) warn.push(`MEM0 would need ${comma(s.m0)} entries, but with a 16-bit counter it only has 65,536.`);
      if (s.m1 > 16384) warn.push(`MEM1 would need ${comma(s.m1)} entries, but it only has 16,384.`);
      if (cols > 65536) warn.push('Count is a 16-bit field, so one instruction can repeat at most 65,536 times, one per column.');
      $('#calc-warn').innerHTML = warn.length ? `<span class="c-warn"><b>Doesn't fit:</b> ${warn.join(' ')}</span>` : '<span class="muted">Fits in the tests\' memories.</span>';
    }
    ['#calc-rows', '#calc-cols', '#calc-pes', '#calc-mode'].forEach((id) => $(id).addEventListener('input', calc));
    calc();
    setPanel(INTRO);
    return { el, show() { setPanel(INTRO); light(null); }, hide: stopAll };
  })();

  // ================================================================== WORKED EXAMPLE
  views['worked-example'] = (function () {
    const el = $('#view-worked-example');
    const DEF = { w: 16, P: 2, data: 'example', rows: 6, cols: 3, seed: 7 };
    const sane = (c) => {
      const r = Object.assign({}, DEF, c || {});
      if (![8, 16, 32].includes(r.w)) r.w = DEF.w;
      if (!['example', 'small', 'large'].includes(r.data)) r.data = DEF.data;
      const ci = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
      r.P = ci(r.P, 1, 4, DEF.P); r.rows = ci(r.rows, 1, 12, DEF.rows); r.cols = ci(r.cols, 1, 5, DEF.cols); r.seed = ci(r.seed, 1, 9999, DEF.seed);
      return r;
    };
    let cfg = sane(store.get('we-cfg', {}));
    let T = null, cur = 0, gen = 0, playing = false, playTimer = 0;
    let fmt = store.get('we-fmt', 'dec');
    const E = new Map();
    const content = $('#we-content'), layer = $('#we-fly');

    function makeData(c) {
      if (c.data === 'example') return { M: EXAMPLE.M.map((r) => r.slice()), v: EXAMPLE.v.slice() };
      const rnd = S.lcg(c.seed * 7919 + c.rows * 131 + c.cols * 17 + (c.data === 'large' ? 5 : 0));
      const lim = { 8: 100, 16: 250, 32: 1000 }[c.w];
      const pick = c.data === 'large' ? () => Math.floor(rnd() * (2 * lim + 1)) - lim : () => Math.floor(rnd() * 10) - 5;
      return { M: Array.from({ length: c.rows }, () => Array.from({ length: c.cols }, pick)), v: Array.from({ length: c.cols }, pick) };
    }

    // ---------------------------------------------------------------- trace
    function buildTrace(c) {
      const { M, v } = makeData(c);
      const P = c.P, w = c.w, n = 32 / w, accW = 64 / n, lo = -(2 ** (w - 1)), hi = 2 ** (w - 1) - 1;
      const Cm = S.compile(M, v, P, w);
      const prog = Cm.program.map(S.assemble);
      const A = new S.Accelerator(P, { N: 16 });
      const rows = Cm.rows, cols = Cm.cols, R = Cm.R, blocks = Cm.blocks, per = Cm.per, pad = blocks * R - rows, mode = Cm.mode;
      const gold = M.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
      const st = { m0: 'none', m1: 'none', im: 'none', yOut: null };
      const steps = [];
      const rowOf = (b, i, k) => b * R + i * n + (n - 1 - k);
      const isPad = (r) => r >= rows;
      const L = (k) => (n > 1 ? ' L' + k : '');
      const peRows = (b, i) => { const rs = []; for (let k = n - 1; k >= 0; k--) rs.push(rowOf(b, i, k)); return rs; };
      const rowsTxt = (rs) => (rs.length === 1 ? 'row ' + rs[0] : 'rows ' + rs.join(', '));
      const snap = (ctl) => ({
        m0: st.m0, m1: st.m1, im: st.im, yOut: st.yOut && st.yOut.slice(),
        mem2: Array.from({ length: blocks }, (_, i) => (A.mb.mem2[i] === undefined ? 0n : A.mb.mem2[i])),
        p0: A.mb.p0, p1: A.mb.p1, p2: A.mb.p2,
        pes: A.pes.map((pe) => ({ a: pe.a, b: pe.b, acc: pe.acc, out: pe.out })),
        ctl: ctl || null,
      });
      const add = (s) => { s.state = snap(s.ctl); s.n = steps.length + 1; steps.push(s); return s; };
      const hostCol = (b, j) => { const ids = []; for (let e = 0; e < R; e++) { const r = b * R + e; if (!isPad(r)) ids.push(`hM-${r}-${j}`); } return ids; };
      const hostRows = (b) => { const ids = []; for (let e = 0; e < R; e++) { const r = b * R + e; if (!isPad(r)) ids.push(`hy-${r}`); } return ids; };
      const sliceVals = (word, i) => { const sl = (word >> BigInt((P - 1 - i) * 32)) & S.mask(32); const out = []; for (let k = n - 1; k >= 0; k--) out.push(num(S.getLane(sl, w, k))); return out.join(' '); };
      const wordVals = (word, lanes, lw) => { const out = []; for (let k = lanes - 1; k >= 0; k--) out.push(num(S.getLane(word, lw, k))); return out.join(' '); };
      const bracket = (word) => '[ ' + Array.from({ length: P }, (_, i) => sliceVals(word, i)).join(' | ') + ' ]';
      const peBoxes = () => Array.from({ length: P }, (_, i) => `pe-${i}`);
      const peInstrFlights = (txt) => peBoxes().map((id) => ({ from: 'we-ctl', to: id, text: txt, cls: 'ctl' }));
      const macLines = (pd, b) => {
        const lines = [];
        pd.forEach((d, i) => { for (let k = n - 1; k >= 0; k--) {
          const x = d.lanes[k], r = rowOf(b, i, k);
          const lab = `PE${i}${L(k)} (${isPad(r) ? 'pad' : 'row ' + r})`;
          lines.push(`${lab.padEnd(n > 1 ? 15 : 12)} ${num(x.before)} + ${par(x.a)}×${par(x.b)} = ${num(x.exact)}${x.wrapped ? `   wraps to ${num(x.after)}` : ''}`);
        } });
        return lines.join('\n');
      };
      const m1Explain = (md) => {
        if (per === 1) return {
          html: `<b>MEM1</b> (INT32) holds one element per entry, so it reads entry ${md.offB} as is: v[${md.offB}] = ${num(md.piece)}.`,
          eq: `  MEM1 port = MEM1[${md.offB}] = [ ${num(md.piece)} ]` };
        const sb = md.selBits, shift = sb === 1 ? '>> 1' : '>> 2', and = sb === 1 ? '& 1' : '& 3';
        const which = per === 2 ? (md.sel ? 'high half' : 'low half') : `byte ${md.sel}`;
        const bin = md.offB.toString(2).padStart(sb + 1, '0');
        return {
          html: `<b>MEM1</b> (${mode}) packs ${per} elements per entry. It reads entry MemBOffset ${shift} = ${md.m1addr}, and the low ${sb === 1 ? 'bit' : '2 bits'} of MemBOffset (${md.sel}) pick the ${which}, lane ${md.sel}: v[${md.offB}] = ${num(md.piece)}. It copies that one value into all ${per} lanes of its output port.`,
          eq: `  ${md.offB} = 0b${bin}\n  entry = ${md.offB} ${shift} = ${md.m1addr}\n  lane  = ${md.offB} ${and} = ${md.sel}\n  MEM1 port = [ ${Array(per).fill(num(md.piece)).join(' | ')} ]` };
      };
      const readFlights = (md) => {
        const f = [];
        for (let i = 0; i < P; i++) f.push({ from: `m0r-${md.m0addr}`, to: `p0s-${i}`, text: sliceVals(A.mb.p0, i), cls: 'm0' });
        for (let k = 0; k < per; k++) f.push({ from: `m1-${md.m1addr}-${md.sel}`, to: `p1-${k}`, text: num(md.piece), cls: 'm1', delay: 90 * k });
        return f;
      };
      const feedFlights = () => {
        const f = [];
        for (let i = 0; i < P; i++) {
          f.push({ from: `p0s-${i}`, to: laneIds(i, 'b'), text: sliceVals(A.mb.p0, i), cls: 'm0' });
          f.push({ from: 'p1s', to: laneIds(i, 'a'), text: wordVals(A.mb.p1, n, w), cls: 'm1', delay: 120 });
        }
        return f;
      };
      const laneIds = (i, r) => Array.from({ length: n }, (_, k) => `pe-${i}-${r}-${k}`);
      const portLanes = (p) => (p === 'p1' ? Array.from({ length: n }, (_, k) => `p1-${k}`) : Array.from({ length: P }, (_, i) => Array.from({ length: n }, (_, k) => `${p}-${i}-${k}`)).flat());
      const accLanes = () => Array.from({ length: P }, (_, i) => laneIds(i, 'acc')).flat();
      const padNote = (b) => {
        const lanes = [];
        for (let i = 0; i < P; i++) for (let k = n - 1; k >= 0; k--) if (isPad(rowOf(b, i, k))) lanes.push(`PE${i}${L(k)}`);
        return lanes.length ? `<p>${lanes.join(', ')} ${lanes.length === 1 ? 'holds a padding row' : 'hold padding rows'}, so ${lanes.length === 1 ? 'it multiplies' : 'they multiply'} zeros.</p>` : '';
      };

      // 1. the job
      const r0 = M[0];
      add({ key: 'job', group: 'Set up', title: 'The job: y = M · v',
        body: `<p>Everything this machine does serves one calculation: multiply a matrix <b>M</b> by a vector <b>v</b>. Each answer y[r] is a dot product: row r of M times v, element by element, then summed. That's a chain of multiply-and-add steps (<b>MAC</b>s), and MAC is the only arithmetic this hardware is built around.</p>
          <p>Here M is ${rows}×${cols}, so there are ${pl(rows, 'answer')} to compute. The strip at the top of the board is the host's side: the test script and numpy. Everything under it is the accelerator, still empty.</p>`,
        eq: `y[r] = ${Array.from({ length: cols }, (_, j) => `M[r][${j}]·v[${j}]`).join(' + ')}\n\ny[0] = ${r0.map((x, j) => `${par(x)}·${par(v[j])}`).join(' + ')}\n     = ${num(gold[0])}`,
        focus: [...Array.from({ length: cols }, (_, j) => `hM-0-${j}`), ...v.map((_, j) => `hv-${j}`), 'hy-0'],
        code: [['test_accelerator.py: one public test', 'cm-run-test']] });

      // 2. blocks
      add({ key: 'blocks', group: 'Set up', title: `Group the rows into blocks of ${R}`,
        body: `<p>The accelerator works on a fixed number of rows at a time: one row per <b>lane</b>. In ${mode} mode each PE's 32-bit input is split into ${n === 1 ? 'a single 32-bit lane' : `${n} lanes of ${w} bits`}, so ${pl(P, 'PE')} × ${pl(n, 'lane')} = <b>${pl(R, 'row')} per block</b>.</p>` +
          (blocks === 1 ? `<p>${pl(rows, 'row')} fit in one block.` : `<p>${rows} rows need ${blocks} blocks.`) +
          (pad ? ` The last block is short, so the compiler pads it with ${pl(pad, 'row')} of zeros (in italics). Those lanes do real multiplies on zeros, and their results get thrown away at the end.</p>` : ' They divide evenly, so there is no padding.</p>') +
          `<p>The machine finishes one block completely before it starts the next.</p>`,
        eq: `rows per block = PEs × (32 / ${w}) = ${P} × ${n} = ${R}\nblocks         = ceil(${rows} / ${R}) = ${blocks}` + (pad ? `\npadding rows   = ${blocks} × ${R} − ${rows} = ${pad}` : ''),
        focus: [], showPad: true, code: [['compiler.py: rows per block', 'cm-rows-per-block']] });

      // 3. pack M
      st.m0 = 'image';
      const own = Array.from({ length: P }, (_, i) => `PE${i} gets ${rowsTxt(peRows(0, i).slice().sort((x, y) => x - y))}`).join(', ');
      const m0lines = Cm.mem0.map((word, a) => { const mt = Cm.mem0Meta[a]; return `MEM0[${a}]`.padEnd(9) + `block ${mt.block}, column ${mt.col}`.padEnd(19) + bracket(word); });
      add({ key: 'pack-m', group: 'Set up', title: 'Pack M into MEM0, one entry per column of a block',
        body: `<p><code>compiler.py</code> walks the blocks in order and, inside each block, the columns. Each (block, column) pair becomes <b>one MEM0 entry</b>: the ${R} numbers in that column of the block, side by side, with the block's first row at the <b>left</b> (most significant) end.</p>
          <p>Each 32-bit slice of an entry is one PE's share. In block 0, ${own}. Block 0 fills entries 0–${cols - 1}${blocks > 1 ? `, block 1 fills ${cols}–${2 * cols - 1}` : ''}${blocks > 2 ? ', and so on' : ''}.</p>
          <p>The host builds this as a Python list (the dashed box). The accelerator doesn't have it yet.</p>`,
        eq: m0lines.join('\n') + `\n\n${P > 1 ? `each | separates two PEs' slices: ${Array.from({ length: P }, (_, i) => `PE${i}`).join(' | ')}` : 'one PE, so one slice per entry'}`,
        phases: [{ updates: ['mem0', 'boxes'], flights: Cm.mem0.map((word, a) => { const mt = Cm.mem0Meta[a]; return { from: hostCol(mt.block, mt.col), to: `m0r-${a}`, text: mt.elems.map(num).join(' '), cls: 'm0', delay: a * 130 }; }) }],
        focus: Cm.mem0Meta.flatMap((mt) => hostCol(mt.block, mt.col)), code: [['compiler.py: one MEM0 entry per (block, column)', 'cm-pack-m']] });

      // 4. pack v
      st.m1 = 'image';
      const m1lines = Cm.mem1.map((word, a) => {
        const ids = Cm.mem1Meta[a].ids.slice().reverse();
        return `MEM1[${a}] = [ ${ids.map((i) => `v[${i}]`).join(' | ')} ] = [ ${ids.map((i) => (i < v.length ? num(v[i]) : '0')).join(' | ')} ]` + (ids.some((i) => i >= v.length) ? '   (zeros past the end are padding)' : '');
      });
      add({ key: 'pack-v', group: 'Set up', title: per === 1 ? 'Pack v into MEM1, one per entry' : `Pack v into MEM1, ${per} per entry, reversed`,
        body: per === 1
          ? `<p>MEM1 is 32 bits wide, so in INT32 each entry holds exactly one element: MEM1[j] = v[j]. (The compiler still "reverses" each group, but a group of one doesn't change.)</p><p>MemBOffset will simply count 0, 1, 2… through it.</p>`
          : `<p>MEM1 is only 32 bits wide, so in ${mode} each entry holds ${per} vector elements. The compiler <b>reverses</b> each group before packing, which puts v[0] in lane 0 (the right, least significant end), v[1] in lane 1, and so on.</p>
            <p>That reversal is what lets the controller walk through v one element at a time by adding 1 to MemBOffset: the low ${per === 2 ? 'bit' : '2 bits'} of the offset pick the lane, and lane 0 comes first. You'll see it in the READ step.</p>`,
        eq: m1lines.join('\n'),
        phases: [{ updates: ['mem1', 'boxes'], flights: v.map((x, i) => ({ from: `hv-${i}`, to: `m1-${Math.floor(i / per)}-${i % per}`, text: num(x), cls: 'm1', delay: i * 120 })) }],
        focus: v.map((_, j) => `hv-${j}`), code: [['compiler.py: packing v, reversed', 'cm-pack-v']] });

      // 5. program
      st.im = 'image';
      const ex = prog.slice(0, 4).map((p) => p.text);
      add({ key: 'program', group: 'Set up', title: `Write the program: 4 instructions per block`,
        body: `<p>Each instruction has three parts split by <b>|</b>: what the main buffer does, what <b>every</b> PE does, and the controller's loop settings, which are how many times to repeat and whether MemAOffset and MemBOffset go up by 1 on each repeat.</p>
          <p>Per block: <b>CLR</b> zeroes the accumulators. <b>READ | MAC</b> repeats once per column (${cols}×), each time reading the next column and the next vector element. <b>OUT</b> copies the sums to the output registers. <b>WRITE</b> stores them in MEM2. ${blocks} ${blocks === 1 ? 'block' : 'blocks'} × 4 = ${pl(prog.length, 'instruction')}.</p>
          <p><code>assembler.py</code> turns each line into a 63-bit word, and it stores Count as repeats − 1, so the written "${cols}" is stored as ${cols - 1}. The bits are at the bottom of this page.</p>`,
        eq: `${ex[0].padEnd(34)}zero acc and out\n${ex[1].padEnd(34)}${cols} repeats, both offsets +1 each\n${ex[2].padEnd(34)}clamp acc into out\n${ex[3].padEnd(34)}out → MEM2[0]` + (blocks > 1 ? `\n… then the same four for block 1${blocks > 2 ? ', 2, …' : ''}, with READ starting at ${cols} and WRITE 1` : ''),
        phases: [{ updates: ['boxes'], flights: [{ from: 'we-hosttag', to: 'we-im', text: pl(prog.length, 'instruction'), cls: 'ctl' }] }],
        focus: [], code: [['compiler.py: four instructions per block', 'cm-program'], ['assembler.py: splitting one line', 'cm-asm-line']] });

      // 6. load: this is set_memory
      st.m0 = st.m1 = st.im = 'loaded';
      Cm.mem0.forEach((x, i) => { A.mb.mem0[i] = x; });
      Cm.mem1.forEach((x, i) => { A.mb.mem1[i] = x; });
      add({ key: 'load', group: 'Set up', title: 'Load, then hands off',
        body: `<p>This is the accelerator's whole connection to the outside world. The test script calls <code>accel.set_memory(mem0, mem1)</code>, which copies the two images into MEM0 and MEM1, then <code>accel.execute_instructions(program)</code>, which feeds the instructions to your <code>execute_instruction</code> one at a time.</p>
          <p>From here until the last instruction finishes, nothing comes in or goes out. No clock, no bus, no questions back to the host. MEM2 starts as all zeros, and so does every PE register.</p>`,
        eq: `accel.set_memory(mem0, mem1)   # ${Cm.mem0.length} + ${Cm.mem1.length} entries hold data, the rest are 0\naccel.execute_instructions(program)`,
        phases: [{ updates: ['boxes'], flights: [{ from: 'we-hosttag', to: 'we-m0', text: 'mem0 image', cls: 'm0' }, { from: 'we-hosttag', to: 'we-m1', text: 'mem1 image', cls: 'm1', delay: 150 }, { from: 'we-hosttag', to: 'we-im', text: 'program', cls: 'ctl', delay: 300 }] }],
        focus: [], code: [['accelerator.py: what the host calls', 'cm-acc-host']] });

      // blocks
      for (let b = 0; b < blocks; b++) {
        const grp = 'Block ' + b, base = b * cols;
        // CLR
        let idx = 4 * b, ins = prog[idx];
        A.exec(ins);
        add({ key: `clr-${b}`, group: grp, block: b, title: `Instruction ${idx}: CLR${b ? ` (block ${b} starts)` : ''}`,
          body: b === 0
            ? `<p><code>${esc(ins.text)}</code></p><p>The memory part is NOP, so the main buffer does nothing. The PE part, CLR, goes to <b>every</b> PE at once. That's the "single instruction" in SIMD. CLR zeroes the accumulator and the output register. Count + 1 = 1, so it runs once.</p><p>Everything was already 0, so nothing visibly changes. CLR matters for the next block.</p>`
            : `<p><code>${esc(ins.text)}</code></p><p>Same as block 0. The accumulators still hold block ${b - 1}'s sums (already safe in MEM2[${b - 1}]), and CLR wipes them. Without it, block ${b} would add its products on top of block ${b - 1}'s results.</p>`,
          eq: 'every PE:  acc = 0,  out = 0',
          ctl: { idx, k: 0 }, restStage: 'pe',
          phases: [{ stage: 'mem', updates: [], pause: 260 }, { stage: 'pe', updates: ['peAcc', 'peOut'], flights: peInstrFlights('CLR ' + mode) }, { stage: 'collect', updates: ['port2'] }],
          focus: [], code: [['processing_element.py: your handlers', 'cm-pe-yours'], ['assembler.py: the PE part', 'cm-asm-pe']] });

        // READ | MAC
        idx = 4 * b + 1; ins = prog[idx];
        for (let k = 0; k <= ins.count; k++) {
          const offA = ins.mem.offA + k * ins.incA, offB = ins.mem.offB + k * ins.incB;
          const md = A.mb.exec(ins.mem.op, ins.mem.w, offA, offB);
          const m1 = m1Explain(md);
          const ctl = { idx, k, offA, offB };
          const read = [`m0r-${md.m0addr}`, `m1-${md.m1addr}-${md.sel}`];
          const focus = [...hostCol(b, k), `hv-${k}`];
          const offEq = `repeat ${k + 1} of ${ins.reps} (k = ${k})\nMemAOffset = ${ins.mem.offA} + ${k}×1 = ${offA}\n  MEM0 port = MEM0[${offA}] = ${bracket(A.mb.p0)}\nMemBOffset = ${ins.mem.offB} + ${k}×1 = ${offB}\n`;
          const last = k === ins.count ? '<p>That was the last column. Every accumulator lane now holds a finished dot product: y for its row.</p>' : '';
          if (b === 0 && k === 0) {
            add({ key: 'read-0-0', group: grp, block: b, title: `Instruction ${idx}, repeat 1 of ${ins.reps}: READ`,
              body: `<p><code>${esc(ins.text)}</code></p>
                <p>Count + 1 = ${ins.reps} repeats, one per column. On the first repeat the controller uses the offsets as written: MemAOffset = ${offA}, MemBOffset = ${offB}. Within a repeat, the main buffer goes first.</p>
                <p><b>MEM0</b> puts entry ${offA} on its output port: column 0 of block 0, one 32-bit slice per PE.</p><p>${m1.html}</p>` +
                (per > 1 ? `<p>Why copy it? Every lane is a different row, but they're all on column 0, so they all need v[0] at the same moment.</p>` : ''),
              eq: offEq + m1.eq, ctl, read, focus, restStage: 'mem',
              phases: [{ stage: 'mem', updates: ['port0', 'port1'], flights: readFlights(md) }],
              code: [['main_buffer.py: yours', 'cm-mb-yours'], ['accelerator.py: yours', 'cm-acc-yours']] });
            A.feed();
            const pd = A.pes.map((pe) => pe.exec(ins.pe.op, ins.pe.w, ins.pe.s));
            A.collect();
            add({ key: 'mac-0-0', group: grp, block: b, title: 'Same repeat: feed the PEs, then MAC',
              body: `<p>Still the first repeat. The controller cuts the MEM0 port into 32-bit slices and gives slice i to PE i as input <b>B</b>, the leftmost slice to PE0. The MEM1 port goes to <b>every</b> PE as input <b>A</b>.</p>
                <p>Then every PE runs the same instruction, MAC: in each lane, acc = acc + A × B, using the full product. That's ${pl(P * n, 'multiply', 'multiplies')} in one repeat, all with v[0], each on a different row.</p>
                <p>READ ran first, so this MAC used the numbers just read. Staff confirmed that order on Ed (#221).</p>`,
              eq: macLines(pd, b), ctl, focus, restStage: 'pe', read: [...portLanes('p0'), ...portLanes('p1')],
              phases: [{ stage: 'feed', updates: ['peA', 'peB'], flights: feedFlights() }, { stage: 'pe', updates: ['peAcc'], flights: peInstrFlights('MAC') }, { stage: 'collect', updates: ['port2'] }],
              code: [['processing_element.py: yours', 'cm-pe-yours'], ['accelerator.py: yours', 'cm-acc-yours']] });
          } else {
            const mf = readFlights(md);
            A.feed();
            const ff = feedFlights();
            const pd = A.pes.map((pe) => pe.exec(ins.pe.op, ins.pe.w, ins.pe.s));
            A.collect();
            let body;
            if (k === 0) {
              body = `<p><code>${esc(ins.text)}</code></p><p>Block ${b}'s READ starts at MemAOffset = ${b} × ${cols} = ${base}: the compiler wrote block ${b}'s starting entry into the instruction. MemBOffset starts at 0 again, because every block multiplies by the whole vector.</p><p>${m1.html}</p>` + padNote(b);
            } else {
              const sameEntry = per > 1 && Math.floor((offB - 1) / per) === md.m1addr;
              body = `<p>Both offsets go up by 1. MEM0 reads entry ${offA}, column ${k} of block ${b}.</p><p>${m1.html}${sameEntry ? ' Same MEM1 entry as the last repeat; only the select bits changed.' : ''}</p><p>Then feed and MAC, exactly as before.</p>`;
            }
            add({ key: `rep-${b}-${k}`, group: grp, block: b, title: k === 0 ? `Instruction ${idx}, repeat 1 of ${ins.reps}: column 0 again` : `Repeat ${k + 1} of ${ins.reps}: column ${k}, v[${k}]`,
              body: body + last, eq: offEq + m1.eq + '\n\n' + macLines(pd, b), ctl, read, focus,
              phases: [{ stage: 'mem', updates: ['port0', 'port1'], flights: mf }, { stage: 'feed', updates: ['peA', 'peB'], flights: ff }, { stage: 'pe', updates: ['peAcc'], pause: 300 }, { stage: 'collect', updates: ['port2'] }],
              code: [['accelerator.py: yours', 'cm-acc-yours']] });
          }
        }

        // OUT
        idx = 4 * b + 2; ins = prog[idx];
        A.mb.exec(ins.mem.op, ins.mem.w, 0, 0); A.feed();
        const od = A.pes.map((pe) => pe.exec(ins.pe.op, ins.pe.w, ins.pe.s));
        A.collect();
        const clamped = [];
        const outLines = [];
        od.forEach((d, i) => { for (let k = n - 1; k >= 0; k--) {
          const x = d.lanes[k], r = rowOf(b, i, k);
          if (x.clamped) clamped.push(`PE${i}${L(k)} held ${num(x.before)}, which doesn't fit in ${w} bits, so it became ${num(x.after)}.`);
          outLines.push(`${(`PE${i}${L(k)} (${isPad(r) ? 'pad' : 'row ' + r})`).padEnd(n > 1 ? 15 : 12)} acc ${num(x.before)}  →  out ${num(x.after)}${x.clamped ? '   clamped' : ''}`);
        } });
        add({ key: `out-${b}`, group: grp, block: b, title: `Instruction ${idx}: OUT`,
          body: `<p><code>${esc(ins.text)}</code></p><p>Each PE squeezes every ${accW}-bit accumulator lane into a ${w}-bit output lane. A value outside ${num(lo)} … ${num(hi)} is <b>clamped</b> to the nearest end; anything else is copied as is. The accumulator keeps its value.</p>` +
            (clamped.length ? `<p>${clamped.join(' ')} That's the spec working as intended, but this answer will no longer match numpy, which has more bits.</p>` : '<p>All of these fit, so nothing is clamped.</p>') +
            `<p>When the PEs finish, the controller lines up their outputs, PE0 on the left, on MEM2's input port. Nothing is stored yet.</p>`,
          eq: outLines.join('\n'), ctl: { idx, k: 0 }, restStage: 'collect', read: accLanes(),
          phases: [{ stage: 'mem', updates: [], pause: 200 }, { stage: 'pe', updates: ['peOut'], flights: Array.from({ length: P }, (_, i) => ({ from: laneIds(i, 'acc'), to: laneIds(i, 'out'), text: 'clamp', cls: 'pe' })) },
            { stage: 'collect', updates: ['port2'], flights: Array.from({ length: P }, (_, i) => ({ from: laneIds(i, 'out'), to: `p2s-${i}`, text: wordVals(A.pes[i].out, n, w), cls: 'm2' })) }],
          focus: [], code: [['processing_element.py: yours', 'cm-pe-yours']] });

        // WRITE
        idx = 4 * b + 3; ins = prog[idx];
        A.exec(ins);
        const mem2Txt = bracket(A.mb.mem2[b]);
        add({ key: `write-${b}`, group: grp, block: b, title: `Instruction ${idx}: WRITE ${b}`,
          body: `<p><code>${esc(ins.text)}</code></p><p>The memory part is WRITE: the main buffer stores whatever is on MEM2's input port at MEM2[MemAOffset] = MEM2[${b}]. The PEs do NOP.</p>` +
            (b === 0 ? `<p>Same position out as in. PE0 read the leftmost slice of MEM0, so its results sit in the leftmost slice of MEM2. That keeps y in row order: MEM2[0] holds y[0] … y[${R - 1}], left to right.</p>` : `<p>MEM2[${b}] holds y[${b * R}] … y[${b * R + R - 1}], left to right${pad && b === blocks - 1 ? `, including ${pl(pad, 'padding result')} at the right end` : ''}.</p>`),
          eq: `MEM2[${b}] = [ ${Array.from({ length: P }, (_, i) => `PE${i}.out`).join(' | ')} ]\n        = ${mem2Txt}`,
          ctl: { idx, k: 0, offA: b, offB: 0 }, read: portLanes('p2'), restStage: 'mem',
          phases: [{ stage: 'mem', updates: ['mem2'], flights: Array.from({ length: P }, (_, i) => ({ from: `p2s-${i}`, to: `m2r-${b}`, text: sliceVals(A.mb.p2, i), cls: 'm2', delay: i * 120 })) }, { stage: 'pe', updates: [], pause: 120 }],
          focus: hostRows(b), code: [['main_buffer.py: yours', 'cm-mb-yours']] });
      }

      // read back
      const y = S.extract(A.mb.mem2, rows, P, w).map(Number);
      st.yOut = y;
      const ok = y.every((x, i) => x === gold[i]);
      const nOK = y.filter((x, i) => x === gold[i]).length;
      const tot = stats(rows, cols, P, w);
      const rbLines = Array.from({ length: blocks }, (_, b) => {
        const vals = []; for (let e = 0; e < R; e++) { const r = b * R + e; vals.push(r < rows ? num(y[r]) : `(${0})`); }
        return `MEM2[${b}] → y[${b * R}..${b * R + R - 1}] = ${vals.join(' ')}`;
      });
      add({ key: 'readback', group: 'Read back', title: 'Read back: the host unpacks MEM2',
        body: `<p>The run is over. The test script calls <code>accel.get_mem2()</code>, and <code>extract_results_from_memory</code> cuts each MEM2 entry into ${w}-bit pieces from the <b>left</b>: MEM2[0] holds y[0] … y[${R - 1}]${blocks > 1 ? `, MEM2[1] the next ${R}` : ''}. It keeps the first ${rows} and throws away the padding.</p>` +
          (ok ? `<p>Then it compares with numpy's M @ v. All ${rows} match, so this test would print "Test Passed!".</p>` : `<p>Then it compares with numpy's M @ v: ${nOK} of ${rows} match. The others differ because OUT clamped them (or an accumulator lane wrapped). The hardware did exactly what the spec says; numpy just has more bits. With the tests' small numbers this never happens.</p>`) +
          `<p>Count the work: ${pl(prog.length, 'instruction')} became ${pl(tot.reps, 'repeat')}, which did ${tot.macs} lane multiplies, ${tot.useful} of them on real rows.</p>`,
        eq: rbLines.join('\n') + `\n\ny     = [${y.map(num).join(', ')}]\nM @ v = [${gold.map(num).join(', ')}]   ${ok ? '✓ all match' : '✗ ' + (rows - nOK) + ' differ'}`,
        ctl: { idx: prog.length, k: 0 },
        phases: [{ updates: ['host'], flights: Array.from({ length: blocks }, (_, b) => ({ from: `m2r-${b}`, to: Array.from({ length: Math.min(R, rows - b * R) }, (_, e) => `hyo-${b * R + e}`), text: `y[${b * R}..]`, cls: 'm2', delay: b * 200 })) }],
        focus: gold.map((_, r) => `hy-${r}`), code: [['compiler.py: reading the answer back', 'cm-extract']] });

      return { steps, C: Cm, prog, M, v, gold, rows, cols, R, blocks, pad, n, accW, P, w };
    }

    // ---------------------------------------------------------------- board
    function buildBoard() {
      const P = T.P, w = T.w, n = T.n, accW = T.accW, R = T.R;
      const laneHdr = (cls) => Array.from({ length: n }, (_, j) => `<th class="${cls || ''}">${n > 1 ? 'L' + (n - 1 - j) : ''}</th>`).join('');
      const pesHdr = Array.from({ length: P }, (_, i) => `${i ? '<th class="sep"></th>' : ''}<th colspan="${n}">PE${i}</th>`).join('');
      const pesLaneHdr = Array.from({ length: P }, (_, i) => `${i ? '<th class="sep"></th>' : ''}${laneHdr()}`).join('');
      const cellsRow = (pre, a) => Array.from({ length: P }, (_, i) => `${i ? '<td class="sep"></td>' : ''}${Array.from({ length: n }, (_, j) => `<td class="v${i % 2 ? ' odd' : ''}" id="${pre}-${a}-${i}-${n - 1 - j}"></td>`).join('')}`).join('');
      // host
      let hM = `<table class="mx M" aria-label="Matrix M"><thead><tr><th></th>${Array.from({ length: T.cols }, (_, j) => `<th>c${j}</th>`).join('')}<th></th></tr></thead><tbody>`;
      for (let r = 0; r < T.blocks * R; r++) {
        const padRow = r >= T.rows, top = r % R === 0 && r > 0;
        hM += `<tr class="${padRow ? 'pad' : ''}${top ? ' blk-top' : ''}"><td class="rl">${padRow ? 'pad' : 'r' + r}</td>${Array.from({ length: T.cols }, (_, j) => `<td id="hM-${r}-${j}">${padRow ? '0' : num(T.M[r][j])}</td>`).join('')}<td class="bl">${r % R === 0 ? 'block ' + r / R : ''}</td></tr>`;
      }
      hM += '</tbody></table>';
      const hv = `<table class="mx v" aria-label="Vector v"><thead><tr><th></th><th>v</th></tr></thead><tbody>${T.v.map((x, j) => `<tr><td class="rl">${j}</td><td id="hv-${j}">${num(x)}</td></tr>`).join('')}</tbody></table>`;
      const hy = `<table class="mx y" aria-label="Result y"><thead><tr><th></th><th>M @ v</th><th>from MEM2</th></tr></thead><tbody>${T.gold.map((x, r) => `<tr class="${r % R === 0 && r > 0 ? 'blk-top' : ''}"><td class="rl">${r}</td><td id="hy-${r}">${num(x)}</td><td id="hyo-${r}">·</td></tr>`).join('')}</tbody></table>`;
      const host = `<div class="host"><div class="tag"><span id="we-hosttag">Host · the test script and numpy</span><span>${T.rows}×${T.cols} · ${T.w === 8 ? 'INT8' : T.w === 16 ? 'INT16' : 'INT32'} · ${pl(P, 'PE')}</span></div>${hM}<span class="op">·</span>${hv}<span class="op">=</span>${hy}</div>`;
      // memories
      const m0 = `<div class="mem m0" id="we-m0"><div class="memtitle">MEM0 · matrix <small>${32 * P} bits per entry</small></div><div class="memscroll"><table class="cells"><thead><tr><th></th>${pesHdr}<th></th></tr>${n > 1 ? `<tr><th>addr</th>${pesLaneHdr}<th></th></tr>` : ''}</thead><tbody>` +
        T.C.mem0.map((_, a) => { const mt = T.C.mem0Meta[a]; return `<tr id="m0r-${a}"><td class="addr">${a}</td>${cellsRow('m0', a)}<td class="meta">b${mt.block} c${mt.col}</td></tr>`; }).join('') +
        `</tbody></table></div><div class="cap" style="font-size:.66rem">+ ${comma(65536 - T.C.mem0.length)} more entries, all 0</div></div>`;
      const m1 = `<div class="mem m1" id="we-m1"><div class="memtitle">MEM1 · vector <small>32 bits per entry</small></div><table class="cells"><thead><tr><th>addr</th>${laneHdr()}<th></th></tr></thead><tbody>` +
        T.C.mem1.map((_, a) => `<tr id="m1r-${a}"><td class="addr">${a}</td>${Array.from({ length: n }, (_, j) => `<td class="v" id="m1-${a}-${n - 1 - j}"></td>`).join('')}<td class="meta">${T.C.mem1Meta[a].ids.slice().reverse().map((i) => (i < T.v.length ? 'v' + i : 'pad')).join(' ')}</td></tr>`).join('') +
        `</tbody></table></div>`;
      const p1 = `<div class="port m1p" id="p1s"><div class="pt">MEM1 output port → every PE's A</div><div class="lanes">${Array.from({ length: n }, (_, j) => `<span class="lane" id="p1-${n - 1 - j}"></span>`).join('')}</div></div>`;
      const m2 = `<div class="mem m2" id="we-m2"><div class="memtitle">MEM2 · results <small>${32 * P} bits per entry</small></div><table class="cells"><thead><tr><th></th>${pesHdr}<th></th></tr>${n > 1 ? `<tr><th>addr</th>${pesLaneHdr}<th></th></tr>` : ''}</thead><tbody>` +
        Array.from({ length: T.blocks }, (_, a) => `<tr id="m2r-${a}"><td class="addr">${a}</td>${cellsRow('m2', a)}<td class="meta">y${a * R}…</td></tr>`).join('') +
        `</tbody></table><div class="cap" style="font-size:.66rem">+ ${comma(65536 - T.blocks)} more, all 0</div></div>`;
      // PE rows
      const peRow = (i) => {
        const lanes = (r) => Array.from({ length: n }, (_, j) => `<span class="lane ${r}" id="pe-${i}-${r}-${n - 1 - j}"></span>`).join('');
        const grid = `<div class="pegrid" style="grid-template-columns: auto repeat(${n}, minmax(2.9em, auto))">` +
          `<span></span>${Array.from({ length: n }, (_, j) => `<span class="rl" style="text-align:center">${n > 1 ? 'L' + (n - 1 - j) : ''}</span>`).join('')}` +
          `<span class="rl"><b>A</b> · MEM1</span>${lanes('a')}<span class="rl"><b>B</b> · MEM0</span>${lanes('b')}` +
          `<span class="rl"><b>acc</b> · ${accW}-bit lanes</span>${lanes('acc')}<span class="rl"><b>out</b> · ${w}-bit lanes</span>${lanes('out')}</div>`;
        const ln = (pre) => Array.from({ length: n }, (_, j) => `<span class="lane" id="${pre}-${i}-${n - 1 - j}"></span>`).join('');
        return `<div class="perow"><div class="port m0p" id="p0s-${i}"><div class="pt">MEM0 port, slice ${i}</div><div class="lanes">${ln('p0')}</div></div>` +
          `<div class="pebox" id="pe-${i}"><div class="pename">PE${i}<small id="pe-${i}-rows"></small></div>${grid}</div>` +
          `<div class="port m2p" id="p2s-${i}"><div class="pt">MEM2 in port, slice ${i}</div><div class="lanes">${ln('p2')}</div></div></div>`;
      };
      const ctl = `<div class="ctlrow"><div class="ctlbox" id="we-ctl"><div class="t">Controller <small id="we-ctl-sub"></small></div><div class="instr" id="we-ctl-instr"></div>
          <div class="stages" id="we-stages"><span data-s="mem">1 memory</span><span data-s="feed">2 feed PEs</span><span data-s="pe">3 PEs run</span><span data-s="collect">4 collect outputs</span></div>
          <div class="ctlkv" id="we-ctl-kv"></div></div>
        <div class="imbox" id="we-im"><div class="t">Instruction memory <small>the program list</small></div><ol class="imlist" id="we-imlist">${T.prog.map((p, i) => `<li><span class="ix">${i}</span>${esc(p.text)}<span class="rep"></span></li>`).join('')}</ol></div></div>`;
      $('#we-hw').innerHTML = host + `<div class="hw">${m0}<div class="m1wrap">${m1}${p1}</div>${m2}</div><div class="perows">${Array.from({ length: P }, (_, i) => peRow(i)).join('')}</div>` + ctl;
      E.clear();
      $$('#we-hw [id]').forEach((x) => E.set(x.id, x));
    }

    // ---------------------------------------------------------------- rendering
    const fmtLane = (v, bits) => (fmt === 'hex' ? hexw(v, bits) : num(v));
    function cellMap(s) {
      const m = new Map(), P = T.P, w = T.w, n = T.n, accW = T.accW;
      const put = (id, v, bits, r, empty) => m.set(id, { t: empty ? '·' : fmtLane(v, bits), e: !!empty, r });
      const sl = (word, i) => (word >> BigInt((P - 1 - i) * 32)) & S.mask(32);
      T.C.mem0.forEach((word, a) => { for (let i = 0; i < P; i++) { const x = sl(word, i); for (let k = 0; k < n; k++) put(`m0-${a}-${i}-${k}`, S.getLane(x, w, k), w, 'mem0', s.m0 === 'none'); } });
      T.C.mem1.forEach((word, a) => { for (let k = 0; k < n; k++) put(`m1-${a}-${k}`, S.getLane(word, w, k), w, 'mem1', s.m1 === 'none'); });
      s.mem2.forEach((word, a) => { for (let i = 0; i < P; i++) { const x = sl(word, i); for (let k = 0; k < n; k++) put(`m2-${a}-${i}-${k}`, S.getLane(x, w, k), w, 'mem2'); } });
      for (let i = 0; i < P; i++) { const x = sl(s.p0, i), y = sl(s.p2, i); for (let k = 0; k < n; k++) { put(`p0-${i}-${k}`, S.getLane(x, w, k), w, 'port0'); put(`p2-${i}-${k}`, S.getLane(y, w, k), w, 'port2'); } }
      for (let k = 0; k < n; k++) put(`p1-${k}`, S.getLane(s.p1, w, k), w, 'port1');
      s.pes.forEach((pe, i) => { for (let k = 0; k < n; k++) {
        put(`pe-${i}-a-${k}`, S.getLane(pe.a, w, k), w, 'peA'); put(`pe-${i}-b-${k}`, S.getLane(pe.b, w, k), w, 'peB');
        put(`pe-${i}-acc-${k}`, S.getLane(pe.acc, accW, k), accW, 'peAcc'); put(`pe-${i}-out-${k}`, S.getLane(pe.out, w, k), w, 'peOut');
      } });
      for (let r = 0; r < T.rows; r++) m.set(`hyo-${r}`, { t: s.yOut ? num(s.yOut[r]) : '·', e: !s.yOut, r: 'host' });
      m.set('#boxes', { m0: s.m0, m1: s.m1, im: s.im, r: 'boxes' });
      return m;
    }
    function applyMap(m, regions, doFlash) {
      for (const [id, c] of m) {
        if (regions && !regions.includes(c.r)) continue;
        if (id === '#boxes') {
          E.get('we-m0').className = 'mem m0 ' + c.m0; E.get('we-m1').className = 'mem m1 ' + c.m1; E.get('we-im').className = 'imbox ' + c.im;
          continue;
        }
        const x = E.get(id);
        if (!x) continue;
        if (x.textContent !== c.t) { x.textContent = c.t; if (doFlash) flash(x); }
        x.classList.toggle('empty', c.e);
      }
    }
    function clearMarks() { E.forEach((x) => { x.classList.remove('chg', 'rd', 'rdrow', 'f'); }); }
    function markChanged(pm, cm) { for (const [id, c] of cm) { if (id[0] === '#' || c.e) continue; const p = pm.get(id); if (p && p.t !== c.t) { const x = E.get(id); if (x) x.classList.add('chg'); } } }
    function markRead(st) {
      (st.read || []).forEach((id) => { const x = E.get(id); if (!x) return; x.classList.add(x.tagName === 'TR' ? 'rdrow' : 'rd'); if (x.tagName === 'TR') $$('td.v', x).forEach((td) => td.classList.add('rd')); });
    }
    function markFocus(st) { (st.focus || []).forEach((id) => { const x = E.get(id); if (x) x.classList.add('f'); }); }
    function setStage(s) { $$('#we-stages span').forEach((sp) => sp.classList.toggle('on', sp.dataset.s === s)); }
    function renderCtl(st) {
      const c = st.ctl, box = E.get('we-ctl-instr'), sub = E.get('we-ctl-sub'), kv = E.get('we-ctl-kv');
      $$('#we-imlist li').forEach((li, i) => {
        li.classList.toggle('cur', !!c && i === c.idx); li.classList.toggle('done', !!c && i < c.idx);
        const tag = li.querySelector('.rep'); tag.textContent = c && i === c.idx && T.prog[i].reps > 1 ? `   ×${c.k + 1}/${T.prog[i].reps}` : '';
      });
      const curLi = c && $$('#we-imlist li')[c.idx];
      if (curLi) { const ol = curLi.parentElement; ol.scrollTop = curLi.offsetTop - ol.clientHeight / 2 + curLi.offsetHeight / 2; }
      if (!c) { box.innerHTML = '<span class="muted">idle</span>'; sub.textContent = ''; kv.textContent = st.key === 'load' ? 'about to start instruction 0' : 'no program yet'; return; }
      if (c.idx >= T.prog.length) { box.innerHTML = `<span class="muted">finished all ${T.prog.length} instructions</span>`; sub.textContent = ''; kv.textContent = 'the host takes over'; return; }
      const ins = T.prog[c.idx], [pm, pp, pc] = ins.text.split('|').map((x) => x.trim());
      box.innerHTML = `<span class="pm">${esc(pm)}</span> <span class="bar">|</span> <span class="pp">${esc(pp)}</span> <span class="bar">|</span> <span class="pc">${esc(pc)}</span>`;
      sub.textContent = `instruction ${c.idx} · repeat ${c.k + 1} of ${ins.reps}`;
      const offs = ins.mem.op === 'READ'
        ? `MemAOffset = ${ins.mem.offA} + ${c.k} × ${ins.incA} = <b>${c.offA}</b><br>MemBOffset = ${ins.mem.offB} + ${c.k} × ${ins.incB} = <b>${c.offB}</b>`
        : ins.mem.op === 'WRITE' ? `MemAOffset = <b>${ins.mem.offA}</b> (where WRITE stores)` : 'memory: NOP, offsets unused';
      kv.innerHTML = `${offs}<br>Count field = ${ins.count}, so it runs ${pl(ins.reps, 'time')}`;
    }
    function renderPanel(st) {
      $('#we-title').textContent = `${st.n}. ${st.title}`;
      $('#we-body').innerHTML = st.body;
      $('#we-eq').textContent = st.eq || '';
      $('#we-code').innerHTML = st.code && st.code.length ? 'In the code: ' + st.code.map(([l, id]) => `<button class="link" data-goto="code-map/${id}">${esc(l)}</button>`).join(' · ') : '';
      $('#we-prev').disabled = cur === 0;
      $('#we-next').disabled = cur === T.steps.length - 1;
    }
    function renderRows(st) {
      for (let i = 0; i < T.P; i++) {
        const x = E.get(`pe-${i}-rows`); if (!x) continue;
        if (st.block === undefined) { x.textContent = ''; continue; }
        const rs = []; for (let k = T.n - 1; k >= 0; k--) { const r = st.block * T.R + i * T.n + (T.n - 1 - k); rs.push(r >= T.rows ? 'pad' : 'r' + r); }
        x.textContent = `block ${st.block}: ${T.n > 1 ? 'L' + (T.n - 1) + '…L0 = ' : ''}${rs.join(', ')}`;
      }
    }
    function renderBits(st) {
      const c = st.ctl, wrap = $('#we-bits');
      if (!c || c.idx >= T.prog.length) wrap.innerHTML = '<p class="muted">No instruction is running in this step.</p>';
      else {
        const ins = T.prog[c.idx], f = S.encode(ins, 16);
        wrap.innerHTML = `<div class="instr">${esc(ins.text)}</div><div class="bits">${f.map((x) => `<div class="fld g-${x.grp}" title="${x.name}"><span class="b">${x.bits}</span><span class="n">${SHORT[x.name]} = ${x.v}</span></div>`).join('')}</div>` +
          `<p class="cap">${f.reduce((s, x) => s + x.n, 0)} bits. Orange: memory instruction. Blue: PE instruction. Pink: Count and the two increments.${ins.mem.op === 'READ' ? ` On this repeat the controller uses MemAOffset ${c.offA} and MemBOffset ${c.offB}, not the stored ${ins.mem.offA} and ${ins.mem.offB}.` : ''}</p>`;
      }
      const s = st.state, P = T.P, w = T.w, accW = T.accW;
      const rows = [['MEM0 out port', hexSlices(s.p0, P, w)], ['MEM1 out port', hexLanes(s.p1, 32, w)], ['MEM2 in port', hexSlices(s.p2, P, w)]];
      s.pes.forEach((pe, i) => rows.push([`PE${i}`, `A ${hexLanes(pe.a, 32, w)} · B ${hexLanes(pe.b, 32, w)} · acc ${hexLanes(pe.acc, 64, accW)} · out ${hexLanes(pe.out, 32, w)}`]));
      $('#we-wires').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }
    function buildTrack() {
      const tr = $('#we-track'); tr.innerHTML = '';
      const groups = [];
      T.steps.forEach((s, i) => { if (!groups.length || groups[groups.length - 1].name !== s.group) groups.push({ name: s.group, idx: [] }); groups[groups.length - 1].idx.push(i); });
      groups.forEach((g) => {
        const d = document.createElement('div'); d.className = 'grp';
        d.innerHTML = `<div class="dots">${g.idx.map((i) => `<button class="dot" data-i="${i}" aria-label="Step ${i + 1}: ${esc(T.steps[i].title)}" title="${esc(T.steps[i].title)}">${i + 1}</button>`).join('')}</div><span class="name">${esc(g.name)}</span>`;
        tr.appendChild(d);
      });
    }
    function renderTrack() {
      $$('#we-track .dot').forEach((b) => { const i = +b.dataset.i; b.classList.toggle('done', i < cur); if (i === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      $$('#we-track .grp').forEach((g) => g.classList.toggle('on', !!g.querySelector('[aria-current]')));
    }
    function finish(st, prev, cm) {
      applyMap(cm);
      clearMarks();
      if (prev) markChanged(cellMap(prev.state), cm);
      markRead(st); markFocus(st);
      $$('#we-hw .pebox').forEach((b) => b.classList.remove('busy'));
      setStage(st.restStage || null);
      schedule();
    }
    async function runPhases(st, cm, my) {
      for (const ph of st.phases) {
        if (my !== gen) return false;
        setStage(ph.stage || null);
        $$('#we-hw .pebox').forEach((b) => b.classList.toggle('busy', ph.stage === 'pe'));
        const fl = (ph.flights || []).map((f) => ({ f, from: Array.isArray(f.from) ? f.from.map((id) => E.get(id)) : E.get(f.from), to: Array.isArray(f.to) ? f.to.map((id) => E.get(id)) : E.get(f.to) }));
        fl.forEach((x) => { reveal(x.from); reveal(x.to); });
        if (fl.length) await Promise.all(fl.map((x) => fly(content, layer, x.from, x.to, x.f.text, x.f.cls, x.f.delay || 0, x.f.dur || 760)));
        if (my !== gen) return false;
        applyMap(cm, ph.updates, true);
        await sleep(ph.pause === undefined ? 240 : ph.pause);
      }
      return true;
    }
    function show(i, animate) {
      i = Math.max(0, Math.min(T.steps.length - 1, i));
      gen++; const my = gen;
      layer.innerHTML = '';
      clearTimeout(playTimer);
      cur = i;
      const st = T.steps[i], prev = T.steps[i - 1];
      renderPanel(st); renderTrack(); renderBits(st); renderCtl(st); renderRows(st);
      const cm = cellMap(st.state);
      if (animate && prev && st.phases && st.phases.length && !reduced()) {
        applyMap(cellMap(prev.state));
        clearMarks(); markRead(st); markFocus(st);
        runPhases(st, cm, my).then((done) => { if (done && my === gen) finish(st, prev, cm); });
      } else finish(st, prev, cm);
    }
    function schedule() {
      clearTimeout(playTimer);
      if (!playing) return;
      if (cur >= T.steps.length - 1) { setPlaying(false); return; }
      playTimer = setTimeout(() => { if (playing && current === 'worked-example') show(cur + 1, true); }, 2600);
    }
    function setPlaying(p) { playing = p; const b = $('#we-play'); b.setAttribute('aria-pressed', String(p)); b.textContent = p ? 'Pause' : 'Auto-play'; if (p) schedule(); else clearTimeout(playTimer); }

    // ---------------------------------------------------------------- config
    function syncCfgUI() {
      $$('#we-mode button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === cfg.w)));
      $('#we-pes').value = String(cfg.P); $('#we-data').value = cfg.data;
      $('#we-rows').value = cfg.rows; $('#we-cols').value = cfg.cols; $('#we-seed').value = cfg.seed;
      $$('#we-cfg .rnd').forEach((x) => { x.hidden = cfg.data === 'example'; });
      $$('#we-fmt button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fmt === fmt)));
    }
    function rebuild(keepKey) {
      const key = keepKey && T ? T.steps[cur].key : null;
      T = buildTrace(cfg);
      buildBoard(); buildTrack();
      let i = key ? T.steps.findIndex((s) => s.key === key) : 0;
      if (i < 0) i = 0;
      show(i, false);
      store.set('we-cfg', cfg);
    }
    $$('#we-mode button').forEach((b) => b.addEventListener('click', () => { cfg.w = +b.dataset.w; syncCfgUI(); rebuild(true); }));
    $('#we-pes').addEventListener('change', (e) => { cfg.P = +e.target.value; rebuild(true); });
    $('#we-data').addEventListener('change', (e) => { cfg.data = e.target.value; syncCfgUI(); rebuild(true); });
    const clampInt = (v, lo, hi, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    $('#we-rows').addEventListener('change', (e) => { cfg.rows = clampInt(e.target.value, 1, 12, 6); syncCfgUI(); rebuild(true); });
    $('#we-cols').addEventListener('change', (e) => { cfg.cols = clampInt(e.target.value, 1, 5, 3); syncCfgUI(); rebuild(true); });
    $('#we-seed').addEventListener('change', (e) => { cfg.seed = clampInt(e.target.value, 1, 9999, 7); syncCfgUI(); rebuild(true); });
    $('#we-default').addEventListener('click', () => { cfg = Object.assign({}, DEF); syncCfgUI(); rebuild(false); });
    $$('#we-fmt button').forEach((b) => b.addEventListener('click', () => { fmt = b.dataset.fmt; store.set('we-fmt', fmt); syncCfgUI(); show(cur, false); }));
    $('#we-prev').addEventListener('click', () => { setPlaying(false); show(cur - 1, false); });
    $('#we-next').addEventListener('click', () => show(cur + 1, true));
    $('#we-replay').addEventListener('click', () => show(cur, true));
    $('#we-play').addEventListener('click', () => { if (playing) setPlaying(false); else { setPlaying(true); if (cur < T.steps.length - 1) show(cur + 1, true); } });
    $('#we-track').addEventListener('click', (e) => { const b = e.target.closest('.dot'); if (b) { const i = +b.dataset.i; show(i, i === cur + 1); } });
    document.addEventListener('keydown', (e) => {
      if (current !== 'worked-example' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); show(cur - 1, false); }
    });
    window.addEventListener('resize', () => { if (current === 'worked-example') layer.innerHTML = ''; });

    syncCfgUI();
    T = buildTrace(cfg); buildBoard(); buildTrack(); show(0, false);
    // handle for poking at the trace from the browser console
    window.__walkthrough = { get trace() { return T; }, get step() { return cur; }, show, setConfig(c) { cfg = sane(c); syncCfgUI(); rebuild(false); } };
    return {
      el,
      defaultTrace() { return buildTrace(DEF); },
      show() { show(cur, false); },
      hide() { setPlaying(false); gen++; layer.innerHTML = ''; },
      go(key) {
        if (cfg.data !== DEF.data || cfg.w !== DEF.w || cfg.P !== DEF.P) { cfg = Object.assign({}, DEF); syncCfgUI(); T = buildTrace(cfg); buildBoard(); buildTrack(); }
        const i = T.steps.findIndex((s) => s.key === key);
        if (i < 0) return false;
        show(i, true);
        el.scrollIntoView({ block: 'start' });
        return true;
      },
    };
  })();

  // ================================================================== PROCESSING ELEMENT
  views['processing-element'] = (function () {
    const el = $('#view-processing-element');
    const join = (vals, w) => { let x = 0n; for (const v of vals) x = (x << BigInt(w)) | S.toU(v, w); return x; };
    const PRESETS = [
      { id: 'int32-mac', label: 'Public test: INT32 MAC', w: 32, A: [1073741824], B: [2], prog: ['MAC', 'OUT'], expect: '7fffffff', note: '2<sup>30</sup> × 2 = 2<sup>31</sup> fits easily in the 64-bit accumulator, but not in a signed 32-bit output, so OUT clamps it to the largest one, 0x7fffffff.' },
      { id: 'int32-pass', label: 'Public test: INT32 PASS', w: 32, A: [15], B: [-6], prog: ['PASS', 'OUT'], expect: '0000000f', note: 'PASS copies A (15), not B.' },
      { id: 'int32-rnd', label: 'Public test: INT32 RND', w: 32, A: [15], B: [-6], prog: ['PASS', 'RND 2', 'OUT'], expect: '00000004', note: '15 / 4 = 3.75, which rounds to 4.' },
      { id: 'int16-mac', label: 'Public test: INT16 MAC', w: 16, A: [-20000, 20000], B: [2, 2], prog: ['MAC', 'OUT'], expect: '80007fff', note: 'Each lane doubles: −40000 and 40000. Both fit in a 32-bit accumulator lane, neither fits in 16 bits, so OUT clamps them to 0x8000 and 0x7fff.' },
      { id: 'int16-pass', label: 'Public test: INT16 PASS', w: 16, A: [-15, 7], B: [8, 3], prog: ['PASS', 'OUT'], expect: 'fff10007', note: '−15 is 0xfff1 in 16 bits.' },
      { id: 'int16-rnd', label: 'Public test: INT16 RND', w: 16, A: [-21555, -4352], B: [8, 3], prog: ['PASS', 'RND 8', 'OUT'], expect: 'ffacffef', note: 'The test writes A as hex: 0xABCD is −21555 and 0xEF00 is −4352. Divided by 256: −84.2 rounds to −84 (0xffac), and −17 is exact (0xffef).' },
      { id: 'int8-mac', label: 'Public test: INT8 MAC', w: 8, A: [100, -100, 3, -3], B: [2, 2, -8, -8], prog: ['MAC', 'OUT'], expect: '7f80e818', note: 'Products 200, −200, −24, 24. The first two don\'t fit in 8 bits and clamp to 127 (0x7f) and −128 (0x80).' },
      { id: 'int8-pass', label: 'Public test: INT8 PASS', w: 8, A: [5, -5, 3, -3], B: [10, 10, -8, -8], prog: ['PASS', 'OUT'], expect: '05fb03fd' },
      { id: 'int8-rnd', label: 'Public test: INT8 RND', w: 8, A: [5, -5, 3, -3], B: [10, 10, -8, -8], prog: ['PASS', 'RND 1', 'OUT'], expect: '02fe02fe', note: 'All four are exact halves: 2.5 → 2, −2.5 → −2, 1.5 → 2, −1.5 → −2.' },
      { id: 'clr', label: 'Public test: CLR', w: 16, A: [-15, 7], B: [8, 3], prog: ['MAC', 'OUT', 'CLR'], expect: '00000000', expectAcc: true, note: 'Checks that both registers end at 0. A brand-new PE is already all zeros, so this test also passes on the empty skeleton.' },
      { id: 'wrap', label: 'Edge: an INT8 accumulator lane wraps', w: 8, A: [100, 0, 0, 0], B: [100, 0, 0, 0], prog: ['MAC', 'MAC', 'MAC', 'MAC', 'OUT'], note: 'Each MAC adds 10,000 to lane 3. A 16-bit lane holds at most 32,767, so the fourth MAC wraps to −25,536, and OUT then clamps that to −128, not +127. The other lanes stay 0: nothing spills over.' },
      { id: 'clamp-edges', label: 'Edge: OUT right at the limits', w: 8, A: [127, -128, 1, -1], B: [1, 1, 1, 1], prog: ['MAC', 'OUT', 'MAC', 'OUT'], note: '127 and −128 fit exactly. One more MAC makes them 254 and −256, which clamp back to 127 and −128.' },
      { id: 'ties', label: 'Edge: RND ties go to even', w: 8, A: [5, -5, 7, -7], B: [0, 0, 0, 0], prog: ['PASS', 'RND 1'], note: '2.5 → 2, −2.5 → −2, 3.5 → 4, −3.5 → −4. Always the even neighbor.' },
      { id: 's0', label: 'Edge: RND with s = 0', w: 16, A: [-3, 9], B: [0, 0], prog: ['PASS', 'RND 0'], note: 'Dividing by 2<sup>0</sup> = 1 changes nothing.' },
      { id: 'big-rnd', label: 'Edge: RND on a huge INT32 value', w: 32, A: [2147483647], B: [2147483647], prog: ['MAC', 'MAC', 'RND 1'], note: 'Two MACs leave 2 × (2<sup>31</sup> − 1)<sup>2</sup> = 9,223,372,028,264,841,218 in the accumulator. Halving it is exact: 4,611,686,014,132,420,609. But a float can\'t hold that many digits, so Python\'s <code>round(x / 2)</code> gives …608, one off. The integer method gets it right.' },
      { id: 'keep-acc', label: 'Edge: OUT leaves the accumulator alone', w: 16, A: [3, -4], B: [5, 5], prog: ['MAC', 'OUT', 'MAC', 'OUT'], note: 'The second OUT shows 30 and −40: the accumulator kept counting after the first OUT.' },
      { id: 'keep-out', label: 'Edge: PASS and RND leave the output alone', w: 16, A: [7, -2], B: [3, 3], prog: ['MAC', 'OUT', 'PASS', 'RND 1'], note: 'After OUT the output is [21, −6]. PASS and RND change only the accumulator.' },
      { id: 'pass-neg', label: 'Edge: PASS sign-extends', w: 8, A: [-1, -128, 127, 0], B: [0, 0, 0, 0], prog: ['PASS'], note: '−1 is 0xff in 8 bits and becomes 0xffff in its 16-bit accumulator lane, not 0x00ff.' },
    ];
    let w = 16, pe = new S.PE(), hist = [], preset = null, pc = 0, busy = false;
    const content = $('#lab-content'), layer = $('#lab-fly');
    const lanesN = () => 32 / w;
    const geo = () => pe.geometry(w);
    function buildGrid() {
      const n = lanesN(), g = geo();
      const hdr = Array.from({ length: n }, (_, j) => `<span>lane ${n - 1 - j}</span>`).join('');
      const inputs = (r) => Array.from({ length: n }, (_, j) => `<input type="number" step="1" min="${-(2 ** (w - 1))}" max="${2 ** (w - 1) - 1}" id="lab-${r}-${n - 1 - j}" aria-label="${r.toUpperCase()} lane ${n - 1 - j}">`).join('');
      const outs = (r) => Array.from({ length: n }, (_, j) => `<span class="lane ${r}" id="lab-${r}-${n - 1 - j}"></span>`).join('');
      $('#lab-grid').innerHTML =
        `<span></span><span class="lanecol hdr">${hdr}</span><span></span>` +
        `<span class="rl">A · Data0<small>from MEM1, same for every PE</small></span><span class="lanecol">${inputs('a')}</span><code class="hexw" id="lab-a-hex"></code>` +
        `<span class="rl">B · Data1<small>this PE's own MEM0 slice</small></span><span class="lanecol">${inputs('b')}</span><code class="hexw" id="lab-b-hex"></code>` +
        `<span class="rl">Accumulator<small>64 bits = ${n} × ${g.accW}-bit lanes</small></span><span class="lanecol">${outs('acc')}</span><code class="hexw" id="lab-acc-hex"></code>` +
        `<span class="rl">Output register<small>32 bits = ${n} × ${g.outW}-bit lanes</small></span><span class="lanecol">${outs('out')}</span><code class="hexw" id="lab-out-hex"></code>`;
      for (const r of ['a', 'b']) for (let k = 0; k < n; k++) $(`#lab-${r}-${k}`).addEventListener('change', onEdit);
    }
    function onEdit() {
      const n = lanesN(), lo = -(2 ** (w - 1)), hi = 2 ** (w - 1) - 1;
      for (const r of ['a', 'b']) {
        const vals = [];
        for (let k = 0; k < n; k++) { const inp = $(`#lab-${r}-${k}`); let v = Math.round(+inp.value); if (!Number.isFinite(v)) v = 0; v = Math.min(hi, Math.max(lo, v)); vals[k] = v; }
        pe[r] = S.packLanes(vals.map(BigInt), w);
      }
      render(null);
    }
    function render(changed) {
      const n = lanesN(), g = geo();
      for (let k = 0; k < n; k++) {
        $(`#lab-a-${k}`).value = String(S.getLane(pe.a, w, k)); $(`#lab-b-${k}`).value = String(S.getLane(pe.b, w, k));
        const acc = $(`#lab-acc-${k}`), out = $(`#lab-out-${k}`);
        const at = num(S.getLane(pe.acc, g.accW, k)), ot = num(S.getLane(pe.out, g.outW, k));
        if (acc.textContent !== at) { acc.textContent = at; if (changed) flash(acc); }
        if (out.textContent !== ot) { out.textContent = ot; if (changed) flash(out); }
      }
      $('#lab-a-hex').textContent = hexLanes(pe.a, 32, w); $('#lab-b-hex').textContent = hexLanes(pe.b, 32, w);
      $('#lab-acc-hex').textContent = hexLanes(pe.acc, 64, g.accW); $('#lab-out-hex').textContent = hexLanes(pe.out, 32, g.outW);
      $('#lab-hist').textContent = hist.length ? hist.join(', ') : 'none yet';
      $$('#lab-mode button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === w)));
      const pw = $('#lab-progwrap');
      pw.hidden = !preset;
      if (preset) {
        $('#lab-prog').innerHTML = preset.prog.map((p, i) => `<li class="${i < pc ? 'done' : i === pc ? 'next' : ''}">${p.split(' ')[0]} INT${w}${p.split(' ')[1] !== undefined ? ' ' + p.split(' ')[1] : ''}</li>`).join('');
        $('#lab-step').disabled = $('#lab-runall').disabled = pc >= preset.prog.length;
      }
    }
    function laneLines(d) {
      const n = d.g.n, out = [];
      for (let k = n - 1; k >= 0; k--) {
        const x = d.lanes[k], lab = n > 1 ? `lane ${k}: ` : '';
        const ind = '\n' + ' '.repeat(lab.length + 2) + '↳ ';
        if (d.op === 'MAC') out.push(`${lab}${num(x.before)} + ${par(x.a)}×${par(x.b)} = ${num(x.exact)}${x.wrapped ? `${ind}too big for ${d.g.accW} bits: wraps to ${num(x.after)}` : ''}`);
        if (d.op === 'OUT') out.push(`${lab}acc ${num(x.before)} → out ${num(x.after)}${x.clamped ? `${ind}clamped to the ${d.g.outW}-bit range ${num(-(2n ** BigInt(d.g.outW - 1)))} … ${num(2n ** BigInt(d.g.outW - 1) - 1n)}` : ''}`);
        if (d.op === 'PASS') out.push(`${lab}A = ${num(x.a)} (0x${hexw(x.a, d.g.inW)})  →  acc = ${num(x.after)} (0x${hexw(x.after, d.g.accW)})`);
        if (d.op === 'RND') {
          const s = d.s, den = 2n ** BigInt(s), q = x.before >> BigInt(s), r = x.before - q * den;
          const exact = exactDiv(x.before, s);
          const tie = s > 0 && r * 2n === den;
          out.push(`${lab}${num(x.before)} / 2^${s} = ${exact}  →  ${num(x.after)}${tie ? `${ind}exactly halfway, so the even one` : ''}`);
        }
      }
      return out.join('\n');
    }
    const RULE = {
      MAC: (g) => `<p>Each lane multiplies its A and B and adds the full product into its own ${g.accW}-bit accumulator lane. No clamping here. If a sum doesn't fit the lane, only the low ${g.accW} bits are kept (it wraps), and nothing spills into the next lane.</p>`,
      OUT: (g) => `<p>OUT narrows each ${g.accW}-bit accumulator lane to a ${g.outW}-bit output lane, clamping to the ${g.outW}-bit signed range first. The accumulator is untouched.</p>`,
      PASS: (g) => `<p>PASS copies input A (Data0, the MEM1 word) into the accumulator, one lane at a time, sign-extended from ${g.inW} to ${g.accW} bits, so a negative lane gets 1s in its new high bits and stays the same number. B is ignored, and the output register keeps its value.</p>`,
      CLR: () => '<p>CLR sets the accumulator and the output register to 0.</p>',
      RND: (g, s) => `<p>RND divides each accumulator lane by 2<sup>${s}</sup> = ${comma(2 ** s)} and rounds to the nearest integer; exact halves go to the even neighbor. The result goes back into the same ${g.accW}-bit lane. The output register keeps its value.</p>`,
      NOP: () => '<p>Nothing changes. In the compiler\'s program, this is what the PEs do while the memory runs WRITE.</p>',
    };
    async function exec(op, s) {
      if (busy) return;
      busy = true;
      const before = { acc: pe.acc, out: pe.out };
      const d = pe.exec(op, w, s);
      hist.push(op === 'RND' ? `RND INT${w} ${s}` : `${op} INT${w}`);
      $('#lab-title').textContent = op === 'RND' ? `RND INT${w} ${s}` : `${op} INT${w}`;
      $('#lab-body').innerHTML = RULE[op](d.g, s);
      $('#lab-eq').textContent = op === 'CLR' ? 'acc = 0\nout = 0' : op === 'NOP' ? '' : laneLines(d);
      $('#lab-verdict').innerHTML = '';
      if (!reduced() && op !== 'NOP') {
        const n = d.g.n, f = [];
        // show old values while chips fly
        const keep = { acc: pe.acc, out: pe.out }; pe.acc = before.acc; pe.out = before.out; render(null); pe.acc = keep.acc; pe.out = keep.out;
        for (let k = 0; k < n; k++) {
          if (op === 'MAC') f.push(fly(content, layer, [$(`#lab-a-${k}`), $(`#lab-b-${k}`)], $(`#lab-acc-${k}`), `${num(d.lanes[k].a)}×${num(d.lanes[k].b)}`, 'pe', 60 * (n - 1 - k), 700));
          if (op === 'PASS') f.push(fly(content, layer, $(`#lab-a-${k}`), $(`#lab-acc-${k}`), num(d.lanes[k].a), 'm1', 60 * (n - 1 - k), 650));
          if (op === 'OUT') f.push(fly(content, layer, $(`#lab-acc-${k}`), $(`#lab-out-${k}`), num(d.lanes[k].after), 'm2', 60 * (n - 1 - k), 650));
        }
        await Promise.all(f);
      }
      render(true);
      busy = false;
    }
    function loadPreset(p) {
      preset = p; pc = 0; hist = []; w = p.w; pe = new S.PE();
      buildGrid();
      pe.a = join(p.A, w); pe.b = join(p.B, w);
      render(null);
      $('#lab-title').textContent = p.label;
      $('#lab-body').innerHTML = `<p>${p.note || ''}</p><p>Program: <code>${p.prog.map((x) => x.split(' ')[0] + ' INT' + w + (x.split(' ')[1] !== undefined ? ' ' + x.split(' ')[1] : '')).join('</code>, <code>')}</code>. Press "Run the next instruction" to step through it.</p>`;
      $('#lab-eq').textContent = '';
      $('#lab-verdict').innerHTML = '';
    }
    async function stepPreset() {
      if (!preset || pc >= preset.prog.length || busy) return;
      const [op, s] = preset.prog[pc].split(' ');
      pc++;
      await exec(op, s === undefined ? 0 : +s);
      if (pc >= preset.prog.length && preset.expect) {
        const got = hexw(pe.out, 32), okOut = got === preset.expect, okAcc = !preset.expectAcc || pe.acc === 0n;
        $('#lab-verdict').innerHTML = okOut && okAcc
          ? `<span class="c-ok">✓ Output 0x${got} matches what the public test expects${preset.expectAcc ? ', and the accumulator is 0' : ''}.</span>`
          : `<span class="c-warn">✗ Expected 0x${preset.expect}, got 0x${got}.</span>`;
      }
      render(null);
    }
    async function runRest() { while (preset && pc < preset.prog.length) { await stepPreset(); await sleep(reduced() ? 0 : 250); } }
    // menu
    $('#lab-preset').innerHTML = '<option value="">choose…</option>' + PRESETS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
    $('#lab-preset').addEventListener('change', (e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) loadPreset(p); });
    $$('#lab-mode button').forEach((b) => b.addEventListener('click', () => { w = +b.dataset.w; preset = null; $('#lab-preset').value = ''; buildGrid(); render(null); }));
    $('#lab-reset').addEventListener('click', () => { pe.acc = 0n; pe.out = 0n; hist = []; if (preset) pc = 0; render(true); });
    $$('#lab .oprow [data-op]').forEach((b) => b.addEventListener('click', () => { preset = null; $('#lab-preset').value = ''; const s = Math.min(31, Math.max(0, Math.round(+$('#lab-s').value) || 0)); exec(b.dataset.op, s); }));
    $('#lab-step').addEventListener('click', stepPreset);
    $('#lab-runall').addEventListener('click', runRest);

    // encoding table
    const encRows = ['MAC INT16', 'NOP INT16', 'OUT INT16', 'PASS INT16', 'CLR INT16', 'RND INT16 8', 'MAC INT8', 'OUT INT32'];
    $('#pe-enc-table').innerHTML = '<tr><th>Assembly</th><th>opcode</th><th>mode</th><th>value</th><th>9-bit word</th><th>How to read it</th></tr>' + encRows.map((t) => {
      const ins = S.assemble(`NOP | ${t} | 1 0 0`), f = S.encode(ins, 16).filter((x) => x.grp === 'pe');
      const why = ins.pe.op === 'RND' ? `opcode 1 = RND, value = shift s = ${ins.pe.s}` : `opcode 0 = look at value; value ${ins.pe.value} = ${ins.pe.op}`;
      return `<tr><td><code>${t}</code></td><td class="num">${f[0].bits}</td><td class="num">${f[1].bits}</td><td class="num">${f[2].bits}</td><td class="num">${f.map((x) => x.bits).join('')}</td><td>${why}</td></tr>`;
    }).join('');

    // lane ruler
    function ruler(rw) {
      const n = 32 / rw;
      const top = Array.from({ length: 32 }, (_, i) => `<span>${31 - i}</span>`).join('');
      const idx = Array.from({ length: 32 }, (_, i) => `<span>${i}</span>`).join('');
      const band = Array.from({ length: 32 }, (_, i) => { const bit = 31 - i, k = Math.floor(bit / rw); return `<span class="l${k}${bit % rw === rw - 1 ? ' edge' : ''}${i === 31 ? ' last' : ''}" title="bit ${bit}, lane ${k}">&nbsp;</span>`; }).join('');
      const names = Array.from({ length: n }, (_, j) => { const k = n - 1 - j; return `<span style="width:${rw * 1.55}em">lane ${k}: bits ${k * rw + rw - 1}–${k * rw}</span>`; }).join('');
      const g = new S.PE().geometry(rw);
      $('#ruler').innerHTML = `<div class="ruler"><div class="rrow lab">${top}</div><div class="rrow lanesr">${band}</div><div class="rrow lab">${idx}</div><div class="lanenames">${names}</div></div>` +
        `<p class="cap" style="margin-top:-6px">Top row: hardware bit numbers (bit 0 = LSB, on the right). Bottom row: bitstring indexes (index 0 = MSB, on the left).</p>` +
        `<div class="tscroll"><table class="ref"><tr><th>Register</th><th>Bits</th><th>Lanes</th><th>Lane width</th><th>Lane 0 in bitstring</th><th>Top lane in bitstring</th></tr>` +
        `<tr><td>A, B (inputs)</td><td class="num">32</td><td class="num">${n}</td><td class="num">${rw}</td><td><code>x[${32 - rw}:32]</code></td><td><code>x[0:${rw}]</code></td></tr>` +
        `<tr><td>accumulator</td><td class="num">64</td><td class="num">${n}</td><td class="num">${g.accW}</td><td><code>x[${64 - g.accW}:64]</code></td><td><code>x[0:${g.accW}]</code></td></tr>` +
        `<tr><td>output register</td><td class="num">32</td><td class="num">${n}</td><td class="num">${g.outW}</td><td><code>x[${32 - g.outW}:32]</code></td><td><code>x[0:${g.outW}]</code></td></tr></table></div>`;
      $$('#ruler-mode button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.w === rw)));
    }
    $$('#ruler-mode button').forEach((b) => b.addEventListener('click', () => ruler(+b.dataset.w)));
    ruler(16);

    buildGrid(); render(null);
    return {
      el,
      go(rest) {
        if (rest.startsWith('preset:')) { const p = PRESETS.find((x) => x.id === rest.slice(7)); if (!p) return false; $('#lab-preset').value = p.id; loadPreset(p); el.scrollIntoView({ block: 'start' }); runRest(); return true; }
        return false;
      },
    };
  })();

  // ================================================================== MAIN BUFFER
  views['main-buffer'] = (function () {
    const el = $('#view-main-buffer');
    const V16 = [2, -1, 3, 5, -4, 0, 7, -2, 6, 1, -3, 4, -5, 8, -6, 9];
    let w = 16, data = 'v16', offA = 0, offB = 0, mb = null, busy = false, last = null;
    const content = $('#mb-content'), layer = $('#mb-fly');
    const P = 2;
    function setup() {
      mb = new S.MainBuffer({ M0W: data === 'v16' ? 32 * P : 256, M1W: 32, M2W: data === 'v16' ? 32 * P : 256 });
      if (data === 'v16') {
        const C = S.compile(EXAMPLE.M, V16, P, w);
        mb.mem1 = C.mem1.slice();
        const Cx = S.compile(EXAMPLE.M, EXAMPLE.v, P, w), Ax = new S.Accelerator(P, { N: 16 });
        mb.mem0 = Cx.mem0.slice();
        Cx.mem0.forEach((x, i) => { Ax.mb.mem0[i] = x; }); Cx.mem1.forEach((x, i) => { Ax.mb.mem1[i] = x; });
        Cx.program.map(S.assemble).forEach((ins) => Ax.exec(ins));
        mb.p2 = Ax.mb.mem2[0];          // what the PEs put on the port before the example's first WRITE
      } else {
        for (let i = 0; i < 1024; i++) { mb.mem0[i] = BigInt(2 * i); mb.mem1[i] = BigInt(data === 'public2' ? 2 * i : i); }
        mb.p2 = 176n;
      }
      const maxB = data === 'v16' ? 15 : 1023, maxA = data === 'v16' ? mb.mem0.length - 1 : 1023;
      $('#mb-offb').max = maxB; $('#mb-offa').max = maxA;
      offB = Math.min(offB, maxB); offA = Math.min(offA, maxA);
      $('#mb-offb').value = offB; $('#mb-offa').value = offA;
      last = null;
      draw(null);
      offTable();
    }
    function m1Rows() {
      const per = 32 / w, entry = offB >> Math.log2(per);
      if (data === 'v16') return Array.from({ length: mb.mem1.length }, (_, i) => i);
      const lo = Math.max(0, entry - 2), hi = Math.min(1023, lo + 5);
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
    function m0Rows() {
      if (data === 'v16') return Array.from({ length: mb.mem0.length }, (_, i) => i);
      const lo = Math.max(0, offA - 2), hi = Math.min(1023, lo + 4);
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
    function draw(d) {
      const per = 32 / w, sb = Math.log2(per), entry = offB >> sb, sel = offB & (per - 1);
      $('#mb-offb-v').textContent = `= ${offB}`; $('#mb-offa-v').textContent = `= ${offA}`;
      const bits = offB.toString(2).padStart(16, '0');
      const head = bits.slice(0, 16 - sb), tail = bits.slice(16 - sb);
      $('#mb-offbits').innerHTML = `<div class="cap" style="margin:0">MemBOffset as its 16 bits</div><div class="offbits"><span class="e">${head}</span>${sb ? `<span class="s">${tail}</span>` : ''}</div>` +
        `<div class="cap" style="margin:0 0 8px">${sb ? `<span class="c-m1">purple: MemBOffset[15:${sb}] = ${entry} picks the entry</span> · <span>yellow: MemBOffset[${sb - 1}:0] = ${sel} picks lane ${sel}</span>` : 'INT32: all 16 bits pick the entry; there\'s nothing to select inside it.'}</div>`;
      const m1 = m1Rows(), m0 = m0Rows();
      const laneCells = (word, a) => Array.from({ length: per }, (_, j) => { const k = per - 1 - j; return `<td class="v${a === entry && k === sel ? ' chg' : ''}${a === entry ? ' rd' : ''}" id="mb1-${a}-${k}">${num(S.getLane(word, w, k))}</td>`; }).join('');
      const meta = (a) => data === 'v16' ? Array.from({ length: per }, (_, j) => `v${a * per + per - 1 - j}`).join(' ') : '';
      const m1t = `<div class="mem m1"><div class="memtitle">MEM1 <small>${data === 'v16' ? `v packed ${per} per entry` : 'entries near the address'}</small></div><table class="cells"><thead><tr><th>addr</th>${Array.from({ length: per }, (_, j) => `<th>${per > 1 ? 'L' + (per - 1 - j) : ''}</th>`).join('')}<th></th></tr></thead><tbody>${m1.map((a) => `<tr id="mb1r-${a}" class="${a === entry ? 'rdrow' : ''}"><td class="addr">${a}</td>${laneCells(mb.word(mb.mem1, a), a)}<td class="meta">${meta(a)}</td></tr>`).join('')}</tbody></table></div>`;
      const p1 = `<div class="port m1p" id="mb-p1"><div class="pt">MEM1 output port</div><div class="lanes">${Array.from({ length: per }, (_, j) => `<span class="lane" id="mbp1-${per - 1 - j}">${num(S.getLane(mb.p1, w, per - 1 - j))}</span>`).join('')}</div></div>`;
      const m0word = (a) => data === 'v16' ? hexSlices(mb.word(mb.mem0, a), P, w) : `${comma(mb.word(mb.mem0, a))}  (= 2 × ${a})`;
      const m0t = `<div class="mem m0"><div class="memtitle">MEM0 <small>${data === 'v16' ? 'the worked example\'s matrix, 2 PEs' : 'MEM0[i] = 2i, 256 bits wide'}</small></div><table class="cells"><tbody>${m0.map((a) => `<tr id="mb0r-${a}" class="${a === offA ? 'rdrow' : ''}"><td class="addr">${a}</td><td class="v${a === offA ? ' rd' : ''}" style="text-align:left">${m0word(a)}</td></tr>`).join('')}</tbody></table></div>`;
      const p0 = `<div class="port m0p" id="mb-p0"><div class="pt">MEM0 output port</div><div class="lanes"><span class="lane">${data === 'v16' ? hexSlices(mb.p0, P, w) : comma(mb.p0)}</span></div></div>`;
      const written = Object.keys(mb.mem2).map(Number).sort((a, b) => a - b);
      const m2t = `<div class="mem m2"><div class="memtitle">MEM2 <small>entries WRITE has stored</small></div><table class="cells"><tbody>${written.length ? written.map((a) => `<tr id="mb2r-${a}"><td class="addr">${a}</td><td class="v" style="text-align:left">${data === 'v16' ? hexSlices(mb.mem2[a], P, w) : comma(mb.mem2[a])}</td></tr>`).join('') : '<tr><td class="meta">none yet</td></tr>'}</tbody></table>` +
        `<div class="port m2p" id="mb-p2" style="margin-top:6px"><div class="pt">MEM2 input port (the controller set this)</div><div class="lanes"><span class="lane">${data === 'v16' ? hexSlices(mb.p2, P, w) : comma(mb.p2)}</span></div></div></div>`;
      $('#mb-hw').innerHTML = `<div class="cols2"><div style="display:flex;flex-direction:column;gap:10px">${m1t}${p1}</div><div style="display:flex;flex-direction:column;gap:10px">${m0t}${p0}${m2t}</div></div>`;
      if (!d) explainIdle();
    }
    function explainIdle() {
      $('#mb-title').textContent = 'The main buffer, by hand';
      $('#mb-body').innerHTML = `<p>Drag <b>MemBOffset</b> and press <b>READ</b>. Watch which MEM1 entry and which lane it picks, and how that one value gets copied into every lane of the output port. Then switch modes: the same offset lands on the same element v[j] in all three, because the compiler packed MEM1 to match.</p><p>Or press <b>Sweep</b> to watch MemBOffset count up the way the controller counts it during a MAC.</p>`;
      $('#mb-eq').textContent = '';
    }
    function explain(d) {
      const per = d.per;
      $('#mb-title').textContent = d.op === 'READ' ? `READ INT${w} ${d.offA} ${d.offB}` : d.op === 'WRITE' ? `WRITE ${d.offA}` : 'NOP';
      if (d.op === 'READ') {
        const elem = data === 'v16' ? ` That's v[${d.offB}] = ${num(d.piece)}.` : '';
        $('#mb-body').innerHTML = `<p><b>MEM0</b>: the whole entry ${d.offA} goes to the MEM0 port. Mode never matters for MEM0.</p>` +
          (per === 1 ? `<p><b>MEM1</b> (INT32): entry MemBOffset = ${d.offB}, as is.${elem}</p>`
            : `<p><b>MEM1</b> (INT${w}): ${per} elements per entry, so entry = MemBOffset ${per === 2 ? '>> 1' : '>> 2'} = ${d.m1addr}, and lane = MemBOffset ${per === 2 ? '& 1' : '& 3'} = ${d.sel}.${elem} That value is copied into all ${per} lanes of the port.</p>`) +
          (data !== 'v16' ? `<p>This is the setup of the public READ tests: they expect the port to be ${per === 1 ? 'MEM1[26] = 52' : per === 2 ? '[13 | 13] for READ INT16 130 26' : '[6 | 6 | 6 | 6] for READ INT8 130 24'}.</p>` : '');
        const bin = d.offB.toString(2).padStart(Math.max(1, d.selBits + 1), '0');
        $('#mb-eq').textContent = `MEM0 port = MEM0[${d.offA}]\n` + (per === 1 ? `MEM1 port = MEM1[${d.offB}] = ${num(d.piece)}` :
          `MemBOffset = ${d.offB} = 0b${bin}\n  entry = ${d.offB} ${per === 2 ? '>> 1' : '>> 2'} = ${d.m1addr}\n  lane  = ${d.offB} ${per === 2 ? '& 1' : '& 3'} = ${d.sel}\nMEM1 port = [ ${Array(per).fill(num(d.piece)).join(' | ')} ]`);
      } else if (d.op === 'WRITE') {
        $('#mb-body').innerHTML = `<p>WRITE stores the MEM2 input port at MEM2[MemAOffset] = MEM2[${d.offA}]. Whatever the controller last put on that port is what gets stored. MemBOffset and the mode are ignored.</p>${data !== 'v16' ? '<p>The public WRITE test puts 176 on the port, runs WRITE 15, and checks that MEM2[15] is 176 and every other entry is still 0.</p>' : ''}`;
        $('#mb-eq').textContent = `MEM2[${d.offA}] = MEM2 input port`;
      } else {
        $('#mb-body').innerHTML = '<p>NOP does nothing. Both output ports keep whatever the last READ put there. That\'s why, during OUT and WRITE in the compiler\'s program, the PEs still see the last column\'s data on their inputs.</p>';
        $('#mb-eq').textContent = '';
      }
    }
    async function op(o) {
      if (busy) return; busy = true;
      const d = mb.exec(o, w, offA, offB);
      if (o === 'READ' && !reduced()) {
        const per = d.per, src = $(`#mb1-${d.m1addr}-${d.sel}`);
        const f = [];
        const p1Old = $$('#mb-p1 .lane'); // fly before redraw
        for (let j = 0; j < per; j++) f.push(fly(content, layer, src, p1Old[j], num(d.piece), 'm1', 90 * j, 650));
        f.push(fly(content, layer, $(`#mb0r-${d.offA}`), $('#mb-p0 .lane'), 'MEM0[' + d.offA + ']', 'm0', 0, 650));
        await Promise.all(f);
      } else if (o === 'WRITE' && !reduced()) {
        await fly(content, layer, $('#mb-p2'), $('#mb-hw .m2 table'), 'store', 'm2', 0, 650);
      }
      draw(d); explain(d);
      if (o === 'READ') $$('#mb-p1 .lane').forEach(flash);
      busy = false;
    }
    let sweeping = false;
    async function sweep() {
      if (sweeping) return; sweeping = true;
      for (let b = 0; b <= 7; b++) {
        offB = b; $('#mb-offb').value = b; offA = Math.min(+$('#mb-offa').max, b); $('#mb-offa').value = offA;
        draw(null); await op('READ'); await sleep(reduced() ? 400 : 650);
      }
      sweeping = false;
    }
    function offTable() {
      const rows = Array.from({ length: 8 }, (_, j) => j);
      const v = (j) => (data === 'v16' ? `v[${j}] = ${num(V16[j])}` : `v[${j}]`);
      $('#mb-offtable').innerHTML = '<tr><th>MemBOffset</th><th>binary</th><th>INT32: entry</th><th>INT16: entry, half</th><th>INT8: entry, byte</th><th>element read</th></tr>' +
        rows.map((j) => `<tr><td class="num">${j}</td><td class="num">${j.toString(2).padStart(3, '0')}</td><td class="num">${j}</td><td class="num">${j >> 1}, ${j & 1 ? 'high' : 'low'}</td><td class="num">${j >> 2}, byte ${j & 3}</td><td>${v(j)}</td></tr>`).join('');
    }
    $$('#mb-mode button').forEach((b) => b.addEventListener('click', () => { w = +b.dataset.w; $$('#mb-mode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); setup(); }));
    $('#mb-data').innerHTML = '<option value="v16">a 16-element vector, packed by the compiler</option><option value="public">MEM1[i] = i (public INT16 and INT8 tests)</option><option value="public2">MEM1[i] = 2i (public INT32 test)</option>';
    $('#mb-data').addEventListener('change', (e) => { data = e.target.value; setup(); });
    $('#mb-offb').addEventListener('input', (e) => { offB = +e.target.value; draw(null); });
    $('#mb-offa').addEventListener('input', (e) => { offA = +e.target.value; draw(null); });
    $$('#mb [data-mop]').forEach((b) => b.addEventListener('click', () => op(b.dataset.mop)));
    $('#mb-sweep').addEventListener('click', sweep);
    $$('#mb-mode button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.w === w)));
    setup();
    return {
      el,
      go(rest) {
        const pre = { 'preset:public-int16': [16, 'public', 130, 26], 'preset:public-int8': [8, 'public', 130, 24], 'preset:public-int32': [32, 'public2', 130, 26] }[rest];
        if (!pre) return false;
        [w, data, offA, offB] = pre;
        $('#mb-data').value = data; $$('#mb-mode button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.w === w)));
        setup(); offA = pre[2]; offB = pre[3]; $('#mb-offa').value = offA; $('#mb-offb').value = offB; draw(null);
        el.scrollIntoView({ block: 'start' });
        setTimeout(() => op('READ'), 300);
        return true;
      },
    };
  })();

  // ================================================================== CONTROLLER
  views['controller'] = (function () {
    const el = $('#view-controller');
    const C = S.compile(EXAMPLE.M, EXAMPLE.v, 2, 16);
    const prog = C.program.map(S.assemble);
    let sel = 1, anim = 0;
    const MEANING = {
      'mem opcode': (v) => ['READ', 'WRITE', 'NOP'][v], 'mem mode': (v, ins) => (ins.mem.op === 'READ' ? `INT${8 * 2 ** v}` : 'unused'),
      MemAOffset: (v, ins) => (ins.mem.op === 'NOP' ? 'unused' : ins.mem.op === 'WRITE' ? 'where WRITE stores' : 'first MEM0 entry'),
      MemBOffset: (v, ins) => (ins.mem.op === 'READ' ? 'first vector element' : 'unused'),
      'PE opcode': (v) => (v === 0 ? 'NO_VALUE: the value field names the op' : 'RND'), 'PE mode': (v) => `INT${8 * 2 ** v}`,
      'PE value': (v, ins) => (ins.pe.op === 'RND' ? `shift s = ${v}` : `${v} = ${ins.pe.op}`),
      Count: (v) => `repeats − 1, so it runs ${v + 1}×`, MemAIncrement: (v) => `MemAOffset += ${v} per repeat`, MemBIncrement: (v) => `MemBOffset += ${v} per repeat`,
    };
    const PEDO = { MAC: 'MAC: acc += A × B in every lane', CLR: 'CLR: acc = 0, out = 0', OUT: 'OUT: out = clamp(acc)', NOP: 'nothing', PASS: 'PASS', RND: 'RND' };
    const WHY = [
      'Starts block 0: every PE zeroes its accumulator and output register. The memory part is NOP.',
      'The heart of the program. One instruction, three repeats: each reads the next column (MemAOffset 0, 1, 2) and the next vector element (MemBOffset 0, 1, 2), and every PE MACs it. MemBOffset counts elements, not entries, so in INT16 it walks the low half of MEM1[0], the high half of MEM1[0], then the low half of MEM1[1].',
      'Every PE clamps its accumulator lanes into its output register. Then the controller lines the outputs up on MEM2\'s input port.',
      'The main buffer stores the MEM2 input port at MEM2[0]. The PEs do NOP: that pairing is the compiler\'s convention, and staff said combined WRITE + OUT won\'t be graded.',
      'Block 1 starts the same way as block 0.',
      'Same as instruction 1, but MemAOffset starts at 3 (block 1 × 3 columns). MemBOffset starts at 0 again, because each block needs the whole vector.',
      'Clamp block 1\'s sums into the output registers.',
      'Store block 1\'s results at MEM2[1]. That\'s the last instruction; the host takes over.',
    ];
    function render() {
      const ins = prog[sel];
      $('#ctl-pick').innerHTML = prog.map((p, i) => `<li><button aria-pressed="${i === sel}" data-i="${i}"><span class="muted">${i}</span>  ${esc(p.text)}</button></li>`).join('');
      const f = S.encode(ins, 16);
      $('#ctl-bits').innerHTML = `<div class="bits">${f.map((x) => `<div class="fld g-${x.grp}" title="${x.name}"><span class="b">${x.bits}</span><span class="n">${SHORT[x.name]}</span></div>`).join('')}</div><p class="cap">63 bits: memory instruction (orange, 36), PE instruction (blue, 9), then Count and the two increments (pink, 18).</p>`;
      $('#ctl-fields').innerHTML = '<tr><th>Field</th><th>Bits</th><th class="num">Value</th><th>Meaning here</th></tr>' + f.map((x) => `<tr><td>${x.name}</td><td class="num">${x.bits}</td><td class="num">${x.v}</td><td>${MEANING[x.name](x.v, ins)}</td></tr>`).join('');
      const rows = [];
      for (let k = 0; k <= ins.count; k++) {
        const a = ins.mem.offA + k * ins.incA, b = ins.mem.offB + k * ins.incB;
        const mem = ins.mem.op === 'READ' ? `MEM0[${a}] → port; MEM1 entry ${b >> 1}, ${b & 1 ? 'high' : 'low'} half (v[${b}] = ${num(EXAMPLE.v[b])}) → port, twice` : ins.mem.op === 'WRITE' ? `MEM2[${a}] ← input port` : 'nothing';
        rows.push(`<tr><td class="num">${k}</td><td class="num">${ins.mem.op === 'NOP' ? '–' : a}</td><td class="num">${ins.mem.op === 'READ' ? b : '–'}</td><td>${mem}</td><td>${PEDO[ins.pe.op]}</td></tr>`);
      }
      $('#ctl-expand').innerHTML = '<tr><th class="num">k</th><th class="num">MemAOffset</th><th class="num">MemBOffset</th><th>Memory does</th><th>Every PE does</th></tr>' + rows.join('');
      $('#ctl-title').textContent = `Instruction ${sel}: ${ins.text}`;
      $('#ctl-body').innerHTML = `<p>${WHY[sel]}</p><p>The assembler stored Count = ${ins.count}, so the controller runs it ${pl(ins.reps, 'time')}. On repeat k the memory instruction uses MemAOffset = ${ins.mem.offA} + k × ${ins.incA} and MemBOffset = ${ins.mem.offB} + k × ${ins.incB}; the PE instruction is the same on every repeat and for every PE.</p><p>Watch it run: <button class="link" data-goto="worked-example/${sel % 4 === 0 ? 'clr-' + (sel >> 2) : sel % 4 === 1 ? (sel === 1 ? 'read-0-0' : 'rep-1-0') : sel % 4 === 2 ? 'out-' + (sel >> 2) : 'write-' + (sel >> 2)}">this instruction in the worked example</button>.</p>`;
    }
    $('#ctl-pick').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { sel = +b.dataset.i; render(); } });
    $('#ctl-animate').addEventListener('click', async () => {
      const my = ++anim, boxes = $$('#ctl-seq [data-s]');
      for (let r = 0; r < 2; r++) for (const b of boxes) { if (my !== anim) return; boxes.forEach((x) => x.classList.toggle('on', x === b)); await sleep(reduced() ? 300 : 650); }
      boxes.forEach((x) => x.classList.remove('on'));
    });
    // order demo
    const gold = EXAMPLE.M.map((r) => r.reduce((s, x, j) => s + x * EXAMPLE.v[j], 0));
    const run = (order) => { const A = new S.Accelerator(2, { N: 16, order }); C.mem0.forEach((x, i) => { A.mb.mem0[i] = x; }); C.mem1.forEach((x, i) => { A.mb.mem1[i] = x; }); prog.forEach((p) => A.exec(p)); return S.extract(A.mb.mem2, 6, 2, 16).map(Number); };
    const good = run('mem-first'), bad = run('pe-first');
    const row = (label, ys) => `<tr><td>${label}</td><td><div class="yres">${ys.map((y, i) => `<span class="${y === gold[i] ? 'good' : 'bad'}">${num(y)}</span>`).join('')}</div></td></tr>`;
    $('#ctl-orderdemo').innerHTML = `<div class="tscroll"><table class="ref"><tr><th>Order inside each repeat</th><th>y read back from MEM2</th></tr>${row('memory, feed, PEs (correct)', good)}${row('feed, PEs, memory (wrong)', bad)}<tr><td>numpy M @ v</td><td><div class="yres">${gold.map((y) => `<span>${num(y)}</span>`).join('')}</div></td></tr></table></div>` +
      `<p>With the PEs first, repeat k multiplies the data read on repeat k − 1. The first MAC of each block uses whatever the ports held from before (zeros at the very start, the previous block's last column after that), and each block's last column is read but never used. In this example, y[0] = 1·2 + 2·(−1) = 0 instead of −3: the −1·3 from column 2 never made it in.</p>`;
    render();
    return { el, go(rest) { return false; } };
  })();

  // ================================================================== READ THE CODE
  views['code-map'] = (function () {
    const el = $('#view-code-map');
    let T = null;
    const trace = () => (T || (T = views['worked-example'].defaultTrace()));
    // fill each block's "worked example step" card from the real trace of the 6×3 example
    function fill(sec) {
      $$('.stepref[data-step]', sec).forEach((x) => {
        if (x.dataset.filled) return;
        const st = trace().steps.find((s) => s.key === x.dataset.step);
        if (!st) { x.remove(); return; }
        x.innerHTML = `<div class="srhead"><span>Worked example, step ${st.n}: <b>${esc(st.title)}</b></span><button class="small" data-goto="worked-example/${st.key}">Watch it</button></div>` +
          (st.eq ? `<pre class="eq">${esc(st.eq)}</pre>` : '') +
          `<details class="srbody"><summary>What that step says</summary><div class="prose">${st.body}</div></details>`;
        x.dataset.filled = '1';
      });
    }
    function showFile(fid) {
      const sec = document.getElementById(fid);
      if (!sec || !sec.classList.contains('rfile')) return false;
      $$('.rfile', el).forEach((s) => { s.hidden = s !== sec; });
      $$('.rfbtn', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.file === fid)));
      fill(sec);
      store.set('cm-file', fid);
      return true;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.rfbtn, .rfjump');
      if (!b) return;
      showFile(b.dataset.file);
      if (b.classList.contains('rfjump')) $('.rfbar', el).scrollIntoView({ block: 'start' });
    });
    const saved = store.get('cm-file', null);
    showFile(saved && document.getElementById(saved) ? saved : $('.rfile', el).id);
    return {
      el,
      go(id) {
        const target = document.getElementById(id);
        if (!target) return false;
        const sec = target.classList.contains('rfile') ? target : target.closest('.rfile');
        if (sec) showFile(sec.id);
        const det = target.closest('details');
        if (det) det.open = true;
        setTimeout(() => { target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); flash(target); }, 30);
        return true;
      },
    };
  })();

  window.addEventListener('hashchange', route);
  route();
})();
