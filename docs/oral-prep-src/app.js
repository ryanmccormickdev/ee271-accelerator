/* Oral exam practice: Drill, Mock exam, Browse. Everything runs from the JSON in #qdata, which
   docs/oral-prep-src/build.py writes from docs/oral-prep/*.md. Saved data: localStorage keys starting
   with "ee271oral:", per person; every access is wrapped so the page also works without storage. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------ data
  let DATA = { banks: [], questions: [], warnings: [] };
  try { DATA = JSON.parse($('#qdata').textContent); } catch (e) {
    DATA.warnings = ['The question data in this page could not be read (' + e.message + '). Rebuild it: python3 docs/oral-prep-src/build.py'];
  }
  const Q = Array.isArray(DATA.questions) ? DATA.questions : [];
  const BANKS = Array.isArray(DATA.banks) ? DATA.banks : [];
  const byId = new Map(Q.map((q) => [q.id, q]));
  const bankOf = new Map(BANKS.map((b) => [b.id, b]));
  const bankShort = (id) => (bankOf.get(id) || {}).short || id;
  const PARTS = ['part1', 'part2', 'part3', 'part4', 'general'];
  const PARTSET = new Set(PARTS);
  const PART_LABEL = { part1: 'Part 1', part2: 'Part 2', part3: 'Part 3', part4: 'Part 4', general: 'General' };
  const LEVELS = ['core', 'deeper', 'stretch'];
  const LEVEL_HELP = { core: 'must know cold', deeper: 'a likely follow-up', stretch: 'a hard follow-up' };
  const GRADE_LABEL = { got: 'Got it', shaky: 'Shaky', missed: 'Missed', skipped: 'Skipped' };
  const GRADE_KEYS = ['missed', 'shaky', 'got'];
  const partsPresent = PARTS.filter((p) => Q.some((q) => q.part === p));
  const topics = (q) => q.tags.filter((t) => !PARTSET.has(t));

  // ------------------------------------------------------------------ storage (never required)
  const NS = 'ee271oral:';
  let canStore = true;
  try { const k = NS + 'probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); } catch (e) { canStore = false; }
  function load(key, fallback) {
    try { const v = localStorage.getItem(NS + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) { canStore = false; showStorageNote(); }
  }
  function showStorageNote() { $('#storagenote').hidden = canStore; }

  // ------------------------------------------------------------------ theme (same key as the Part 1 walkthrough)
  const root = document.documentElement;
  try {
    const t = JSON.parse(localStorage.getItem('ee271wt:theme'));
    if (t === 'light' || t === 'dark') root.dataset.theme = t;
  } catch (e) { /* default theme */ }
  $('#themebtn').addEventListener('click', () => {
    let dark = false;
    try { dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { dark = root.dataset.theme === 'dark'; }
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ee271wt:theme', JSON.stringify(root.dataset.theme)); } catch (e) { /* not saved */ }
  });

  // ------------------------------------------------------------------ people and their progress
  const DEFAULT_PROFILES = () => ({ list: [{ id: 'p1', name: 'Ryan' }, { id: 'p2', name: 'Partner' }], active: 'p1' });
  function validProfiles(p) {
    return p && Array.isArray(p.list) && p.list.length > 0 && p.list.every((x) => x && typeof x.id === 'string' && typeof x.name === 'string');
  }
  let profiles = load('profiles', null);
  if (!validProfiles(profiles)) profiles = DEFAULT_PROFILES();
  if (!profiles.list.some((p) => p.id === profiles.active)) profiles.active = profiles.list[0].id;
  const saveProfiles = () => save('profiles', profiles);
  const pname = (pid) => (profiles.list.find((p) => p.id === pid) || { name: '?' }).name;
  const progCache = {};
  function prog(pid) {
    if (!progCache[pid]) {
      const p = load('progress:' + pid, null);
      const P = p && typeof p === 'object' && p.cards && typeof p.cards === 'object' ? p : { step: 0, cards: {} };
      if (typeof P.step !== 'number') P.step = 0;
      if (!Array.isArray(P.mocks)) P.mocks = [];
      if (!Array.isArray(P.review)) P.review = [];
      progCache[pid] = P;
    }
    return progCache[pid];
  }
  const saveProg = (pid) => save('progress:' + pid, prog(pid));

  // ------------------------------------------------------------------ spaced repetition
  // A card's gap is counted in graded questions: missed comes back after 2, shaky after 5,
  // got it after 12, then 25, 50, 100 as it keeps being right.
  const INTERVAL = [2, 5, 12, 25, 50, 100];
  const cardOf = (pid, qid) => prog(pid).cards[qid] || null;
  function status(pid, qid) { const c = cardOf(pid, qid); return c && c.last ? c.last : 'new'; }
  function isDue(pid, qid) { const c = cardOf(pid, qid); return !!c && c.due <= prog(pid).step; }
  function applyGrade(pid, qid, g) {
    if (!GRADE_KEYS.includes(g)) return;
    const P = prog(pid);
    const c = P.cards[qid] || { box: 1, n: 0, hist: '' };
    if (g === 'missed') c.box = 0;
    else if (g === 'shaky') c.box = 1;
    else c.box = Math.min((c.n ? c.box : 1) + 1, INTERVAL.length - 1);
    c.n = (c.n || 0) + 1;
    c.last = g;
    c.t = Date.now();
    c.hist = ((c.hist || '') + g.charAt(0)).slice(-12);
    P.step += 1;
    c.due = P.step + INTERVAL[c.box];
    P.cards[qid] = c;
    saveProg(pid);
  }
  function statusText(pid, qid) {
    const c = cardOf(pid, qid);
    if (!c || !c.last) return 'never seen';
    const d = c.due - prog(pid).step;
    return `last time ${GRADE_LABEL[c.last].toLowerCase()} (${c.n} ${c.n === 1 ? 'try' : 'tries'}), ${d <= 0 ? 'due now' : 'due in ' + d}`;
  }
  function weighted(list, w, rnd) {
    const tot = list.reduce((s, q) => s + w(q), 0);
    let r = rnd() * tot;
    for (const q of list) { r -= w(q); if (r < 0) return q; }
    return list[list.length - 1];
  }
  function pickNext(pid, pool, exclude) {
    const cand = pool.length > 1 ? pool.filter((q) => q.id !== exclude) : pool.slice();
    if (!cand.length) return null;
    const P = prog(pid), due = [], fresh = [], later = [];
    cand.forEach((q) => { const c = P.cards[q.id]; if (!c) fresh.push(q); else if (c.due <= P.step) due.push(q); else later.push(q); });
    if (due.length && (!fresh.length || Math.random() < 0.75)) {
      due.sort((a, b) => (P.cards[a.id].box - P.cards[b.id].box) || (P.cards[a.id].due - P.cards[b.id].due));
      return due[Math.floor(Math.random() * Math.min(3, due.length))];
    }
    if (fresh.length) return weighted(fresh, (q) => (q.level === 'core' ? 4 : q.level === 'deeper' ? 2 : 1), Math.random);
    later.sort((a, b) => (P.cards[a.id].due - P.cards[b.id].due) || (P.cards[a.id].box - P.cards[b.id].box));
    return later[0];
  }

  // ------------------------------------------------------------------ shared pieces of HTML
  const sdot = (s) => `<span class="sdot ${esc(s)}" aria-hidden="true"></span>`;
  const lvlHTML = (l) => `<span class="lvl ${esc(l)}" title="${esc(l)}: ${esc(LEVEL_HELP[l] || '')}">${esc(l)}</span>`;
  const tagHTML = (t) => `<span class="tag${PARTSET.has(t) ? ' p ' + esc(t) : ''}">${esc(t)}</span>`;
  const gradeButtons = () => GRADE_KEYS.map((g, i) => `<button type="button" data-g="${g}">${GRADE_LABEL[g]} <small>${i + 1}</small></button>`).join('');
  function metaHTML(q, extra) {
    return `<div class="qmeta"><span class="bankname">${esc(bankShort(q.bank))}</span>${lvlHTML(q.level)}${q.tags.map(tagHTML).join('')}`
      + (extra ? `<span class="spacer"></span>${extra}` : '') + '</div>';
  }
  function oursHTML(q) {
    return `<div class="ours${q.oursFill ? ' filled' : ''}"><span class="alabel">Fill in from your design</span>`
      + (q.ours ? `<div class="prose">${q.ours}</div>` : '')
      + (q.oursFill
        ? `<div class="oursfill"><span class="alabel">Ours</span><div class="prose">${q.oursFill}</div></div>`
        : `<p class="cap">Not filled in yet. Add <code>Ours:</code> and your answer to this question's Our design line in <code>docs/oral-prep/${esc(q.file)}</code> (the question starts at line ${esc(q.line)}), then rebuild.</p>`)
      + '</div>';
  }
  function answerHTML(q) {
    let h = `<div class="ablock"><span class="alabel">Model answer</span><div class="prose">${q.a}</div></div>`;
    if (q.ours || q.oursFill) h += oursHTML(q);
    (q.extra || []).forEach((x) => { h += `<div class="ablock"><span class="alabel">${esc(x[0])}</span><div class="prose">${x[1]}</div></div>`; });
    if (q.see) h += `<div class="see"><span class="alabel">See</span>${q.see}</div>`;
    return h;
  }
  function chips(el, items, excluded, onChange) {
    el.innerHTML = items.map((it) => `<button type="button" data-k="${esc(it.k)}" aria-pressed="${excluded.includes(it.k) ? 'false' : 'true'}">${esc(it.label)}${it.n != null ? ` <small>${it.n}</small>` : ''}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      const i = excluded.indexOf(b.dataset.k);
      if (i >= 0) excluded.splice(i, 1); else excluded.push(b.dataset.k);
      b.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
      onChange();
    };
  }
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtUp = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const isInteractive = (el) => !!(el && el.closest && el.closest('button, a, summary, label, input, select, textarea'));

  // ------------------------------------------------------------------ drill
  const DEFAULT_DF = () => ({ xbanks: [], xparts: [], xlevels: [], tag: '', status: 'all' });
  let df = Object.assign(DEFAULT_DF(), load('drill', {}) || {});
  ['xbanks', 'xparts', 'xlevels'].forEach((k) => { if (!Array.isArray(df[k])) df[k] = []; });
  const saveDf = () => save('drill', df);
  const drill = { cur: null, revealed: false, session: { got: 0, shaky: 0, missed: 0 } };

  function drillPool() {
    const pid = profiles.active, P = prog(pid);
    return Q.filter((q) => {
      if (df.xbanks.includes(q.bank) || df.xparts.includes(q.part) || df.xlevels.includes(q.level)) return false;
      if (df.tag && !q.tags.includes(df.tag)) return false;
      const s = status(pid, q.id);
      switch (df.status) {
        case 'due': return s === 'new' || isDue(pid, q.id);
        case 'weak': return s === 'missed' || s === 'shaky';
        case 'missed': return s === 'missed';
        case 'new': return s === 'new';
        case 'review': return P.review.includes(q.id);
        default: return true;
      }
    });
  }
  function renderDrillFilters() {
    chips($('#f-banks'), BANKS.map((b) => ({ k: b.id, label: b.short, n: b.count })), df.xbanks, drillFiltersChanged);
    chips($('#f-parts'), partsPresent.map((p) => ({ k: p, label: PART_LABEL[p], n: Q.filter((q) => q.part === p).length })), df.xparts, drillFiltersChanged);
    chips($('#f-levels'), LEVELS.map((l) => ({ k: l, label: l, n: Q.filter((q) => q.level === l).length })), df.xlevels, drillFiltersChanged);
    const count = {};
    Q.forEach((q) => topics(q).forEach((t) => { count[t] = (count[t] || 0) + 1; }));
    const tags = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
    if (df.tag && !count[df.tag]) df.tag = '';
    $('#f-tag').innerHTML = '<option value="">Any tag</option>' + tags.map((t) => `<option value="${esc(t)}"${t === df.tag ? ' selected' : ''}>${esc(t)} (${count[t]})</option>`).join('');
    $('#f-status').value = df.status;
    if ($('#f-status').value !== df.status) { df.status = 'all'; $('#f-status').value = 'all'; }
  }
  function drillFiltersChanged() { saveDf(); drill.cur = null; drill.revealed = false; renderDrill(); }
  $('#f-tag').addEventListener('change', (e) => { df.tag = e.target.value; drillFiltersChanged(); });
  $('#f-status').addEventListener('change', (e) => { df.status = e.target.value; drillFiltersChanged(); });
  $('#f-reset').addEventListener('click', () => { df = DEFAULT_DF(); renderDrillFilters(); drillFiltersChanged(); });

  function renderPoolStats(pool) {
    const pid = profiles.active, c = { missed: 0, shaky: 0, got: 0, new: 0 };
    let due = 0;
    pool.forEach((q) => { c[status(pid, q.id)]++; if (isDue(pid, q.id)) due++; });
    const seg = ['missed', 'shaky', 'got', 'new'].filter((k) => c[k]).map((k) => `<span class="s-${k}" style="flex:${c[k]}"></span>`).join('');
    $('#poolstats').innerHTML = `<div class="sbar" role="img" aria-label="${c.missed} missed, ${c.shaky} shaky, ${c.got} got it, ${c.new} never seen">${seg}</div>`
      + `<dl class="scount"><div><dt>Questions</dt><dd>${pool.length}</dd></div><div><dt>Due now</dt><dd>${due}</dd></div><div><dt>Never seen</dt><dd>${c.new}</dd></div>`
      + `<div><dt>Missed</dt><dd>${c.missed}</dd></div><div><dt>Shaky</dt><dd>${c.shaky}</dd></div><div><dt>Got it</dt><dd>${c.got}</dd></div></dl>`;
  }
  function renderDrill() {
    const pid = profiles.active, el = $('#drillcard');
    const pool = drillPool();
    renderPoolStats(pool);
    const s = drill.session, n = s.got + s.shaky + s.missed;
    $('#sessionline').textContent = n ? `This session, ${pname(pid)}: ${n} graded (${s.got} got it, ${s.shaky} shaky, ${s.missed} missed).` : '';
    if (!Q.length) {
      el.innerHTML = '<p class="empty">No questions yet. Add a bank to <code>docs/oral-prep/</code> and run <code>python3 docs/oral-prep-src/build.py</code>.</p>';
      return;
    }
    if (!pool.length) {
      const why = { review: 'The review list is empty. Finish a mock exam and press "Drill these now" to fill it.',
        due: 'Nothing is due and nothing is unseen. Come back later, or set Show to Everything.',
        weak: 'Nothing missed or shaky here. Nice.', missed: 'Nothing missed here.', new: 'You have seen every question in this set.' }[df.status] || 'No questions match these filters.';
      el.innerHTML = `<p class="empty">${esc(why)}</p><button type="button" class="small" data-act="resetf">Reset filters</button>`;
      return;
    }
    if (!drill.cur || !pool.some((q) => q.id === drill.cur)) { drill.cur = pickNext(pid, pool, null).id; drill.revealed = false; }
    const q = byId.get(drill.cur);
    el.innerHTML = metaHTML(q, `<span class="stline">${sdot(status(pid, q.id))}${esc(statusText(pid, q.id))}</span>`)
      + `<h2 class="qtext" id="drillq" tabindex="-1">${q.q}</h2>`
      + (drill.revealed
        ? `<div class="answer">${answerHTML(q)}</div><div class="gradebar"><span class="glabel">How did it go?</span>${gradeButtons()}<span class="spacer"></span><button type="button" class="small" data-act="next">Next without grading</button></div>`
        : ((q.ours || q.oursFill) ? '<p class="cap">This one also asks about your own design.</p>' : '')
          + '<div class="reveal-row"><button type="button" class="primary" data-act="reveal">Reveal answer</button><button type="button" class="small" data-act="next">Skip</button></div>');
  }
  function drillReveal() {
    drill.revealed = true;
    renderDrill();
    const b = $('#drillcard button[data-g="got"]');
    if (b) b.focus({ preventScroll: true });
  }
  function drillGrade(g) {
    const pid = profiles.active;
    if (g && drill.cur) { applyGrade(pid, drill.cur, g); drill.session[g]++; }
    const pool = drillPool();
    const nxt = pool.length ? pickNext(pid, pool, drill.cur) : null;
    drill.cur = nxt ? nxt.id : null;
    drill.revealed = false;
    renderDrill();
    const card = $('#drillcard');
    if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
    const h = $('#drillq');
    if (h) h.focus({ preventScroll: true });
  }
  $('#drillcard').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.g) drillGrade(b.dataset.g);
    else if (b.dataset.act === 'reveal') drillReveal();
    else if (b.dataset.act === 'next') drillGrade(null);
    else if (b.dataset.act === 'resetf') $('#f-reset').click();
  });

  // ------------------------------------------------------------------ mock exam
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function shuffle(a, R) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function follow(core, free, levels, R) {
    const ct = new Set(topics(core));
    for (const lv of levels) {
      let best = [], top = 0;
      free((q) => q.level === lv).forEach((q) => {
        let s = topics(q).filter((t) => ct.has(t)).length;
        if (!s) return;
        if (q.bank === core.bank) s += 0.5;
        if (s > top) { top = s; best = [q]; } else if (s === top) best.push(q);
      });
      if (best.length) return best[Math.floor(R() * best.length)];
    }
    return null;
  }
  // A plan: an opener if a bank has one, then rounds over the parts (shuffled; general last), each a
  // core question followed by a deeper one that shares its topic tags; the last follow-up is a stretch one if possible.
  function buildPlan(o) {
    const R = rng(o.seed);
    const pool = Q.filter((q) => o.banks.has(q.bank)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const used = new Set(), plan = [];
    const w = (q) => {
      if (!o.weak) return 1;
      const s = status(o.pid, q.id);
      return s === 'missed' ? 5 : s === 'shaky' ? 4 : s === 'new' ? 3 : isDue(o.pid, q.id) ? 2 : 1;
    };
    const pick = (list) => (list.length ? weighted(list, w, R) : null);
    const free = (f) => pool.filter((q) => !used.has(q.id) && f(q));
    const add = (q, role, of) => { used.add(q.id); plan.push({ id: q.id, role, of: of || null }); };
    const opener = pick(free((q) => q.level === 'core' && q.tags.includes('overview')));
    if (opener && o.n >= 5) add(opener, 'opener');
    const parts = PARTS.filter((p) => pool.some((q) => q.part === p));
    const order = shuffle(parts.filter((p) => p !== 'general'), R).concat(parts.includes('general') ? ['general'] : []);
    for (let i = 0; plan.length < o.n && i < 80 && order.length; i++) {
      const part = order[i % order.length];
      let core = pick(free((q) => q.part === part && q.level === 'core'));
      const role = core ? 'core' : 'question';
      if (!core) core = pick(free((q) => q.part === part));
      if (!core) { if (!free(() => true).length) break; continue; }
      add(core, role);
      if (plan.length >= o.n) break;
      const last = plan.length === o.n - 1;
      const fu = follow(core, free, last ? ['stretch', 'deeper'] : ['deeper', 'stretch'], R);
      if (fu) add(fu, fu.level === 'stretch' ? 'hard follow-up' : 'follow-up', core.id);
    }
    return plan;
  }

  const mock = { phase: 'setup', plan: [], idx: 0, view: 'examiner', grades: {}, times: {}, pid: null, banks: new Set(), minutes: 15,
    code: null, elapsed: 0, t0: 0, running: false, qStart: 0, timer: null, warned: false, timeup: false };
  let mxbanks = load('mockxbanks', []);
  if (!Array.isArray(mxbanks)) mxbanks = [];
  const elapsed = () => mock.elapsed + (mock.running ? performance.now() - mock.t0 : 0);

  function showMockPhase() {
    $('#mock-setup').hidden = mock.phase !== 'setup';
    $('#mock-run').hidden = mock.phase !== 'run';
    $('#mock-done').hidden = mock.phase !== 'done';
  }
  function renderMockSetup() {
    const sel = $('#m-examinee'), keep = sel.value;
    sel.innerHTML = profiles.list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    sel.value = profiles.list.some((p) => p.id === keep) ? keep : profiles.active;
    chips($('#m-banks'), BANKS.map((b) => ({ k: b.id, label: b.short, n: b.count })), mxbanks, () => save('mockxbanks', mxbanks));
    renderHistory();
  }
  function renderHistory() {
    const pid = $('#m-examinee').value || profiles.active;
    const list = prog(pid).mocks.slice(-8).reverse();
    $('#m-history').innerHTML = list.length
      ? '<ul class="histlist">' + list.map((m) => `<li><b>${esc(m.date)}</b><span>${m.n} asked: ${m.got} got it, ${m.shaky} shaky, ${m.missed} missed</span><span class="muted">${fmt(m.used)} of ${m.minutes}:00</span></li>`).join('') + '</ul>'
      : `<p class="muted">None yet for ${esc(pname(pid))}. The summary of each finished mock exam is kept here.</p>`;
  }
  $('#m-examinee').addEventListener('change', renderHistory);
  $('#m-start').addEventListener('click', () => {
    const banks = new Set(BANKS.map((b) => b.id).filter((id) => !mxbanks.includes(id)));
    const n = parseInt($('#m-count').value, 10) || 7;
    const weak = $('#m-weak').checked;
    let code = ($('#m-code').value || '').replace(/\D/g, '').slice(0, 6);
    if (!code) code = String(1000 + Math.floor(Math.random() * 9000));
    const pid = $('#m-examinee').value || profiles.active;
    const plan = buildPlan({ banks, n, pid, weak, seed: hashSeed(code + '|' + n + '|' + Array.from(banks).sort().join(',')) });
    if (!plan.length) { $('#m-setupmsg').textContent = 'There are no questions in the chosen banks.'; return; }
    $('#m-setupmsg').textContent = '';
    Object.assign(mock, { phase: 'run', plan, idx: 0, view: 'examiner', grades: {}, times: {}, pid, banks, code: weak ? null : code,
      minutes: parseInt($('#m-minutes').value, 10) || 15, elapsed: 0, t0: performance.now(), running: true, qStart: 0, warned: false, timeup: false });
    $('#m-pause').textContent = 'Pause';
    showMockPhase();
    renderRun();
    startTicker();
    window.scrollTo(0, 0);
  });
  function startTicker() { stopTicker(); mock.timer = setInterval(tick, 250); tick(); }
  function stopTicker() { if (mock.timer) clearInterval(mock.timer); mock.timer = null; }
  function announce(msg) { const a = $('#m-announce'); a.textContent = ''; setTimeout(() => { a.textContent = msg; }, 40); }
  function tick() {
    const left = mock.minutes * 60000 - elapsed(), t = $('#m-timer');
    t.textContent = left >= 0 ? fmtUp(left) : '+' + fmt(-left);
    t.classList.toggle('low', left >= 0 && left < 120000);
    t.classList.toggle('over', left < 0);
    t.classList.toggle('paused', !mock.running);
    t.setAttribute('aria-label', left >= 0 ? `${fmtUp(left)} left` : `${fmt(-left)} over time`);
    if (!mock.warned && left < 120000) { mock.warned = true; announce('Two minutes left.'); }
    if (!mock.timeup && left < 0) { mock.timeup = true; announce('Time is up. Finish this answer, then end the exam.'); }
  }
  $('#m-pause').addEventListener('click', () => {
    if (mock.running) { mock.elapsed += performance.now() - mock.t0; mock.running = false; } else { mock.t0 = performance.now(); mock.running = true; }
    $('#m-pause').textContent = mock.running ? 'Pause' : 'Resume';
    tick();
  });
  $('#m-viewseg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) { mock.view = b.dataset.v; renderRun(); }
  });
  $('#m-end').addEventListener('click', () => finishMock());

  function roleText(p) {
    if (p.role === 'opener') return 'Opening question';
    if (p.of) {
      const j = mock.plan.findIndex((x) => x.id === p.of);
      return `${p.role === 'hard follow-up' ? 'Hard follow-up' : 'Follow-up'} to question ${j + 1}`;
    }
    return p.role === 'core' ? 'Core question' : 'Question';
  }
  function alternatives(q, n) {
    const inPlan = new Set(mock.plan.map((p) => p.id)), ct = new Set(topics(q));
    return Q.filter((x) => mock.banks.has(x.bank) && !inPlan.has(x.id))
      .map((x) => ({ x, s: topics(x).filter((t) => ct.has(t)).length + (x.bank === q.bank ? 0.5 : 0) + (x.level !== 'core' ? 0.25 : 0) }))
      .filter((o) => o.s >= 1).sort((a, b) => b.s - a.s || (a.x.id < b.x.id ? -1 : 1)).slice(0, n).map((o) => o.x);
  }
  function renderRun() {
    if (mock.phase !== 'run') return;
    $$('#m-viewseg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === mock.view)));
    const item = mock.plan[mock.idx], q = item && byId.get(item.id);
    $('#m-pos').textContent = `Question ${Math.min(mock.idx + 1, mock.plan.length)} of ${mock.plan.length}${mock.code ? ` · plan code ${mock.code}` : ''}`;
    $('#m-strip').innerHTML = mock.plan.map((p, i) => {
      const g = mock.grades[p.id];
      return `<span class="pdot${p.of ? ' fu' : ''}${i === mock.idx ? ' cur' : ''}${g ? ' g-' + g : ''}" title="${i + 1}: ${esc(roleText(p))}${g ? ', ' + esc(GRADE_LABEL[g]) : ''}">${i + 1}</span>`;
    }).join('');
    if (!q) { finishMock(); return; }
    const card = $('#m-card');
    if (mock.view === 'examinee') {
      card.innerHTML = `<article class="qcard examinee"><div class="qmeta"><span class="bankname">Question ${mock.idx + 1}</span>${item.of ? '<span class="role">follow-up</span>' : ''}</div>`
        + `<h2 class="qtext">${q.q}</h2><p class="hint">Answer in one sentence first, then how it works, one concrete example, and how you checked it.</p>`
        + '<div class="reveal-row"><button type="button" class="small" data-act="skip">Next question (no grade)</button></div></article>';
      return;
    }
    const next = mock.plan[mock.idx + 1];
    const nextQ = next && next.of === item.id ? byId.get(next.id) : null;
    const alts = alternatives(q, 3);
    card.innerHTML = `<article class="qcard">${metaHTML(q)}<div class="role">${esc(roleText(item))}</div>`
      + `<h2 class="qtext">${q.q}</h2>`
      + '<p class="exnote">Read the question aloud and keep this screen turned away. Use the model answer to judge, and push with at least one follow-up.</p>'
      + `<div class="answer">${answerHTML(q)}`
      + '<div class="pushes"><span class="alabel">Push further</span><ul><li>"Why that way, and not another?"</li><li>"What would happen if that were different?"</li><li>"Where is that in your code? Can you draw it?"</li><li>"How did you check it?"</li></ul></div>'
      + (nextQ ? `<div class="ablock"><span class="alabel">Planned follow-up, next</span><div class="prose">${nextQ.q}</div></div>` : '')
      + (alts.length ? `<div class="ablock"><span class="alabel">Other follow-ups on the same tags</span><ul class="altlist">${alts.map((a) => `<li><span>${a.q} ${lvlHTML(a.level)}</span><button type="button" class="small" data-use="${esc(a.id)}">Ask next</button></li>`).join('')}</ul></div>` : '')
      + `</div><div class="gradebar"><span class="glabel">Grade the answer</span>${gradeButtons()}<span class="spacer"></span><button type="button" class="small" data-act="swap">Swap question</button><button type="button" class="small" data-act="skip">Skip</button></div></article>`;
  }
  function mockGrade(g) {
    const item = mock.plan[mock.idx];
    if (mock.phase !== 'run' || !item) return;
    const now = elapsed();
    mock.times[item.id] = now - mock.qStart;
    mock.qStart = now;
    mock.grades[item.id] = g;
    applyGrade(mock.pid, item.id, g);
    mock.idx += 1;
    if (mock.idx >= mock.plan.length) finishMock(); else renderRun();
    const top = $('#view-mock').getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > top) window.scrollTo(0, top);
  }
  function mockSwap() {
    const item = mock.plan[mock.idx], q = byId.get(item.id);
    const inPlan = new Set(mock.plan.map((p) => p.id));
    const cands = Q.filter((x) => mock.banks.has(x.bank) && !inPlan.has(x.id) && x.part === q.part && x.level === q.level);
    if (!cands.length) { announce('There is no other question with the same part and level.'); return; }
    const nq = cands[Math.floor(Math.random() * cands.length)];
    mock.plan.forEach((p) => { if (p.of === item.id) p.of = nq.id; });
    mock.plan[mock.idx] = Object.assign({}, item, { id: nq.id });
    renderRun();
  }
  function mockUseNext(id) {
    const item = mock.plan[mock.idx], next = mock.plan[mock.idx + 1], q = byId.get(id);
    const entry = { id, role: q && q.level === 'stretch' ? 'hard follow-up' : 'follow-up', of: item.id };
    if (next && next.of === item.id && !mock.grades[next.id]) mock.plan[mock.idx + 1] = entry; else mock.plan.splice(mock.idx + 1, 0, entry);
    renderRun();
  }
  $('#m-card').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.g) mockGrade(b.dataset.g);
    else if (b.dataset.act === 'skip') mockGrade('skipped');
    else if (b.dataset.act === 'swap') mockSwap();
    else if (b.dataset.use) mockUseNext(b.dataset.use);
  });
  function finishMock() {
    if (mock.phase !== 'run') return;
    stopTicker();
    if (mock.running) { mock.elapsed += performance.now() - mock.t0; mock.running = false; }
    const cur = mock.plan[mock.idx];
    mock.endedAt = cur && !mock.grades[cur.id] ? mock.idx : -1;
    if (mock.endedAt >= 0) mock.times[cur.id] = mock.elapsed - mock.qStart;
    mock.phase = 'done';
    const P = prog(mock.pid);
    const graded = mock.plan.filter((p) => GRADE_KEYS.includes(mock.grades[p.id]));
    const cnt = { got: 0, shaky: 0, missed: 0 };
    graded.forEach((p) => { cnt[mock.grades[p.id]]++; });
    const review = graded.filter((p) => mock.grades[p.id] === 'missed').concat(graded.filter((p) => mock.grades[p.id] === 'shaky')).map((p) => p.id);
    if (graded.length) {
      P.review = review;
      let date = '';
      try { date = new Date().toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { date = new Date().toISOString().slice(0, 16); }
      P.mocks.push({ date, n: graded.length, got: cnt.got, shaky: cnt.shaky, missed: cnt.missed, used: Math.round(mock.elapsed), minutes: mock.minutes });
      P.mocks = P.mocks.slice(-30);
      saveProg(mock.pid);
    }
    renderSummary(cnt, review);
    showMockPhase();
    window.scrollTo(0, 0);
  }
  function renderSummary(cnt, review) {
    const tally = {};
    review.forEach((id) => topics(byId.get(id)).forEach((t) => { tally[t] = (tally[t] || 0) + 1; }));
    const weakTags = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || a.localeCompare(b)).slice(0, 12);
    const rows = mock.plan.map((p, i) => {
      const q = byId.get(p.id), g = mock.grades[p.id];
      return `<tr><td class="num">${i + 1}</td><td>${q.q}</td><td>${esc(bankShort(q.bank))}, ${esc(q.level)}${p.of ? ', follow-up' : ''}</td>`
        + `<td class="gr ${esc(g || '')}">${g ? esc(GRADE_LABEL[g]) : i === mock.endedAt ? 'not graded' : 'not asked'}</td><td class="num">${mock.times[p.id] != null ? fmt(mock.times[p.id]) : ''}</td></tr>`;
    }).join('');
    const answered = cnt.got + cnt.shaky + cnt.missed;
    $('#mock-done').innerHTML = '<div class="board"><h2>Mock exam summary</h2>'
      + `<p>${esc(pname(mock.pid))} answered ${answered} of ${mock.plan.length} questions in ${fmt(mock.elapsed)} (limit ${mock.minutes}:00): <b>${cnt.got} got it, ${cnt.shaky} shaky, ${cnt.missed} missed</b>.${mock.code ? ` Plan code ${esc(mock.code)}.` : ''}</p>`
      + `<div class="tscroll"><table class="ref sumtable"><thead><tr><th>#</th><th>Question</th><th>Bank, level</th><th>Grade</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + (weakTags.length ? `<h3>Weak tags</h3><div class="weak">${weakTags.map((t) => `<span class="tag">${esc(t)} × ${tally[t]}</span>`).join('')}</div>` : '')
      + '<h3>Review these first</h3>'
      + (review.length
        ? '<ol class="review">' + review.map((id) => {
          const q = byId.get(id), g = mock.grades[id];
          return `<li>${metaHTML(q, `<span class="stline">${sdot(g)}${esc(GRADE_LABEL[g])}</span>`)}<div class="rq">${q.q}</div>${q.see ? `<div class="see"><span class="alabel">See</span>${q.see}</div>` : ''}</li>`;
        }).join('') + '</ol>'
        : `<p>${answered ? 'Nothing missed or shaky. Next time pick other banks, or ask harder follow-ups.' : 'No graded answers, so there is nothing to review.'}</p>`)
      + `<div class="controls"><button type="button" class="primary" data-act="drillreview"${review.length ? '' : ' disabled'}>Drill these now</button><button type="button" data-act="again">New mock exam</button></div></div>`;
  }
  $('#mock-done').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'drillreview') {
      profiles.active = mock.pid;
      saveProfiles();
      renderProfiles();
      df.status = 'review';
      saveDf();
      drill.cur = null;
      renderDrillFilters();
      location.hash = '#drill';
    } else if (b.dataset.act === 'again') {
      mock.phase = 'setup';
      renderMockSetup();
      showMockPhase();
    }
  });

  // ------------------------------------------------------------------ browse and print
  const bx = { levels: [], parts: [] };
  const bOpen = new Set();
  function qdHTML(q, pid) {
    const s = status(pid, q.id);
    return `<details class="qd" data-id="${esc(q.id)}"${bOpen.has(q.id) ? ' open' : ''}><summary><span class="qn">${esc(q.n)}</span><span class="qs">${q.q}</span>`
      + `<span class="qbadges">${lvlHTML(q.level)}<span class="sdot ${esc(s)}" title="${esc(pname(pid))}: ${esc(statusText(pid, q.id))}"></span></span></summary>`
      + `<div class="qbody"><div class="answer">${answerHTML(q)}</div><div class="qtags">${q.tags.map(tagHTML).join('')}<span class="src">${esc(q.file)}:${esc(q.line)}</span></div></div></details>`;
  }
  function renderBrowse() {
    const terms = ($('#b-search').value || '').toLowerCase().split(/\s+/).filter(Boolean);
    const oursOnly = $('#b-ours').checked, pid = profiles.active;
    let shown = 0, out = '';
    BANKS.forEach((b) => {
      const qs = Q.filter((q) => q.bank === b.id && !bx.levels.includes(q.level) && !bx.parts.includes(q.part)
        && (!oursOnly || q.ours || q.oursFill) && terms.every((t) => q.text.includes(t)));
      if (!qs.length) return;
      shown += qs.length;
      let section = null;
      out += `<section class="bbank" id="bank-${esc(b.id)}"><h2>${esc(b.title)} <small>${qs.length === b.count ? '' : qs.length + ' of '}${b.count} question${b.count === 1 ? '' : 's'}</small></h2>`
        + `<p class="bmeta"><code>docs/oral-prep/${esc(b.file)}</code> · ${b.levels.core} core, ${b.levels.deeper} deeper, ${b.levels.stretch} stretch · Our design prompts filled in: ${b.filled} of ${b.ours}</p>`
        + (b.intro && !terms.length ? `<div class="prose bintro">${b.intro}</div>` : '')
        + qs.map((q) => {
          const head = q.section && q.section !== section ? `<div class="bsection">${esc(q.section)}</div>` : '';
          section = q.section;
          return head + qdHTML(q, pid);
        }).join('') + '</section>';
    });
    $('#b-list').innerHTML = out || '<p class="empty">No questions match.</p>';
    $('#b-count').textContent = `${shown} of ${Q.length} question${Q.length === 1 ? '' : 's'}`;
  }
  function setupBrowse() {
    chips($('#b-levels'), LEVELS.map((l) => ({ k: l, label: l })), bx.levels, renderBrowse);
    chips($('#b-parts'), partsPresent.map((p) => ({ k: p, label: PART_LABEL[p] })), bx.parts, renderBrowse);
    let t = null;
    $('#b-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderBrowse, 120); });
    $('#b-ours').addEventListener('change', renderBrowse);
    $('#b-expand').addEventListener('click', () => $$('#b-list details.qd').forEach((d) => { d.open = true; }));
    $('#b-collapse').addEventListener('click', () => { $$('#b-list details.qd').forEach((d) => { d.open = false; }); bOpen.clear(); });
    $('#b-print').addEventListener('click', () => window.print());
    $('#b-list').addEventListener('toggle', (e) => {
      const d = e.target;
      if (d && d.matches && d.matches('details.qd') && !printing) { if (d.open) bOpen.add(d.dataset.id); else bOpen.delete(d.dataset.id); }
    }, true);
  }
  let printing = false, printOpened = [];
  window.addEventListener('beforeprint', () => {
    printing = true;
    printOpened = $$('#b-list details.qd:not([open])');
    printOpened.forEach((d) => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    printOpened.forEach((d) => { d.open = false; });
    printOpened = [];
    setTimeout(() => { printing = false; }, 0);
  });

  // ------------------------------------------------------------------ profiles bar
  function renderProfiles() {
    $('#profileseg').innerHTML = profiles.list.map((p) => `<button type="button" data-pid="${esc(p.id)}" aria-pressed="${p.id === profiles.active}">${esc(p.name)}</button>`).join('');
    $('#renamebtn').title = `Rename ${pname(profiles.active)}`;
  }
  $('#profileseg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pid]');
    if (!b || b.dataset.pid === profiles.active) return;
    profiles.active = b.dataset.pid;
    saveProfiles();
    renderProfiles();
    drill.cur = null;
    drill.session = { got: 0, shaky: 0, missed: 0 };
    refresh();
  });
  function closeRename() { $('#renameform').hidden = true; $('#renamebtn').hidden = false; }
  $('#renamebtn').addEventListener('click', () => {
    $('#renameform').hidden = false;
    $('#renamebtn').hidden = true;
    const i = $('#renameinput');
    i.value = pname(profiles.active);
    i.focus();
    i.select();
  });
  $('#renameform').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#renameinput').value.replace(/\s+/g, ' ').trim().slice(0, 24);
    const p = profiles.list.find((x) => x.id === profiles.active);
    if (v && p) { p.name = v; saveProfiles(); }
    closeRename();
    renderProfiles();
    refresh();
  });
  $('#renamecancel').addEventListener('click', closeRename);
  $('#renameinput').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRename(); });

  // ------------------------------------------------------------------ views, keys, footer
  const VIEWS = ['drill', 'mock', 'browse', 'practise'];
  let current = null;
  function refresh() {
    if (current === 'drill') renderDrill();
    else if (current === 'browse') renderBrowse();
    else if (current === 'mock' && mock.phase === 'setup') renderMockSetup();
  }
  function route() {
    const h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const parts = h.split('/');
    let v = VIEWS.includes(parts[0]) ? parts[0] : null, target = null;
    if (v && parts[1]) target = document.getElementById(parts.slice(1).join('/'));
    if (!v && h) {
      const el = document.getElementById(h);
      const sec = el && el.closest('.view');
      if (sec) { v = sec.id.replace(/^view-/, ''); target = el; }
    }
    v = v || 'drill';
    VIEWS.forEach((x) => { $('#view-' + x).hidden = x !== v; });
    $$('nav.tabs a[data-view]').forEach((a) => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    current = v;
    refresh();
    if (target) setTimeout(() => target.scrollIntoView({ block: 'start' }), 30); else window.scrollTo(0, 0);
  }
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tg = e.target;
    if (tg && (tg.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName))) return;
    const k = e.key;
    if (current === 'drill' && drill.cur) {
      if (k === ' ' && !drill.revealed && !isInteractive(tg)) { e.preventDefault(); drillReveal(); }
      else if (drill.revealed && (k === '1' || k === '2' || k === '3')) { e.preventDefault(); drillGrade(GRADE_KEYS[+k - 1]); }
      else if (k === 'n' || k === 'N') { e.preventDefault(); drillGrade(null); }
    } else if (current === 'mock' && mock.phase === 'run') {
      if (mock.view === 'examiner' && (k === '1' || k === '2' || k === '3')) { e.preventDefault(); mockGrade(GRADE_KEYS[+k - 1]); }
      else if (k === 'v' || k === 'V') { mock.view = mock.view === 'examiner' ? 'examinee' : 'examiner'; renderRun(); }
      else if (k === 'p' || k === 'P') $('#m-pause').click();
    }
  });
  window.addEventListener('storage', (e) => {          // another tab changed saved progress
    if (!e.key || e.key.indexOf(NS) !== 0) return;
    Object.keys(progCache).forEach((k) => { delete progCache[k]; });
    const p = load('profiles', null);
    if (validProfiles(p) && p.list.some((x) => x.id === p.active)) profiles = p;
    renderProfiles();
    refresh();
  });
  function renderFooter() {
    const w = Array.isArray(DATA.warnings) ? DATA.warnings : [];
    const list = BANKS.map((b) => `<code>${esc(b.file)}</code> (${b.count})`).join(', ') || 'no banks';
    $('#footer').innerHTML = `<p>Built ${esc(DATA.built || '')} from ${list} by <code>docs/oral-prep-src/build.py</code>. Edit the banks in <code>docs/oral-prep/</code>, then run <code>python3 docs/oral-prep-src/build.py</code>. Progress is kept per person, in this browser only.</p>`
      + (w.length ? `<details><summary>${w.length} build warning${w.length === 1 ? '' : 's'}</summary><ul>${w.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '')
      + '<p>Made for the EE271 project oral exam. Built with Claude Code; see <code>docs/ai-log.md</code>.</p>';
    $('#subline').textContent += ` ${Q.length} question${Q.length === 1 ? '' : 's'} in ${BANKS.length} bank${BANKS.length === 1 ? '' : 's'}.`;
  }

  showStorageNote();
  renderProfiles();
  renderDrillFilters();
  renderMockSetup();
  showMockPhase();
  setupBrowse();
  renderBrowse();
  renderFooter();
  route();
  window.addEventListener('hashchange', route);
})();
