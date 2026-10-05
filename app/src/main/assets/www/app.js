'use strict';
/* =========================================================
   Sueño — interfaz
   ========================================================= */
const N = window.Android || window.MockBridge;
const NATIVE = !!window.Android;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const range = n => [...Array(n).keys()];

/* ---------- Ajustes ---------- */
const DEF = {
  onboarded: false, goal: 8, sens: 'media',
  alarmOn: true, wake: '06:30', win: 30, alarmSound: 'amanecer', vibrate: true, ramp: true, snooze: 9,
  aidTypes: [], aidVols: {}, aidMin: 30, relaxTypes: ['lluvia'], relaxVols: {}, relaxMin: 30,
  breatheBefore: false, breathTech: '478', breathVib: true, breathVoice: false,
  reminderOn: false, reminderTime: '21:45', reminderDays: [0, 1, 2, 3, 4],
  saveClips: true, cleanDays: 30, customTags: [], lastTags: [],
};
let S = { ...DEF, ...J(N.getSettings(), {}) };
function saveS() { N.setSettings(JSON.stringify(S)); }

const TAGS = [['Café', 'coffee'], ['Alcohol', 'wine'], ['Ejercicio', 'dumbbell'], ['Estrés', 'zap'], ['Cena pesada', 'utensils'], ['Pantallas tarde', 'phone'], ['Trabajé tarde', 'briefcase'], ['Calor', 'thermo'], ['Medicina', 'pill'], ['Siesta', 'bed'], ['Acompañado', 'users']];
const MORNING = [['Me despertaron', 'users'], ['Me levanté al baño', 'bed'], ['Soñé mucho', 'sparkles'], ['Pesadillas', 'zap'], ['Dolor de cabeza', 'thermo']];
const SOUNDS = [['lluvia', 'Lluvia', 'rain'], ['olas', 'Olas', 'waves'], ['bosque', 'Bosque', 'trees'], ['ventilador', 'Ventilador', 'fan'], ['fogata', 'Fogata', 'flame'], ['viento', 'Viento', 'wind'], ['cafe', 'Ruido café', 'volume'], ['blanco', 'Ruido blanco', 'sparkles']];
const SOUND_NAME = Object.fromEntries(SOUNDS.map(s => [s[0], s[1]]));
const ALARM_SOUNDS = [['amanecer', 'Amanecer suave', 'Notas que suben como un amanecer'], ['campanas', 'Campanas', 'Campanas tranquilas'], ['pajaros', 'Pájaros', 'Trinos de pájaros'], ['clasica', 'Clásica', 'Pitidos de despertador']];
const tagIcon = t => (TAGS.find(x => x[0] === t) || MORNING.find(x => x[0] === t) || [t, 'flag'])[1];

/* ---------- Datos ---------- */
let cache = null;
function nights() {
  if (!cache) cache = J(N.listNights(), []).filter(n => n.status === 'done' && n.summary).sort((a, b) => b.start - a.start);
  return cache;
}
function invalidate() { cache = null; }
function getNight(id) { return J(N.getNight(id), null); }
function saveNight(n) { N.saveNight(JSON.stringify(n)); invalidate(); }
function finalize(id, extra = {}) {
  const n = getNight(id);
  if (!n) return null;
  if (!n.end) n.end = n.start + (n.minutes || []).length * 60000;
  n.status = 'done';
  Object.assign(n, extra);
  n.summary = analyze(n, S.goal);
  saveNight(n);
  return n;
}
function wakeTsFrom(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now() + 60000) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function bedtimeFor(wake, goal) { const [h, m] = wake.split(':').map(Number); return fmtClockMin(h * 60 + m - goal * 60 - 15 + 1440); }

/* ---------- Avisos y hojas ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600);
}
let sheetOpen = false, sheetClose = null;
function openSheet(html, onMount, onClose) {
  const sh = $('#sheet');
  sh.innerHTML = '<div class="grab"></div>' + html;
  sh.scrollTop = 0;
  $('#scrim').classList.add('on');
  requestAnimationFrame(() => sh.classList.add('on'));
  sheetOpen = true; sheetClose = onClose || null;
  if (onMount) onMount(sh);
  return sh;
}
function closeSheet() {
  if (!sheetOpen) return;
  $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on');
  sheetOpen = false;
  const f = sheetClose; sheetClose = null;
  if (f) f();
}
$('#scrim').addEventListener('click', closeSheet);
function confirmSheet(title, text, ok, danger, onOk) {
  openSheet(`<h2>${title}</h2><p class="mute" style="margin:6px 0 22px">${text}</p>
    <button class="btn ${danger ? 'danger' : 'main'}" id="c-ok" style="width:100%">${ok}</button>
    <button class="btn" id="c-no" style="width:100%;margin-top:8px;color:var(--mute)">Cancelar</button>`, sh => {
    $('#c-ok', sh).onclick = () => { closeSheet(); onOk(); };
    $('#c-no', sh).onclick = closeSheet;
  });
}

/* ---------- Componentes ---------- */
function stars(n, h = 320) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const sz = Math.random() < .15 ? 3 : 2;
    o += `<i class="star" style="left:${Math.random() * 100}%;top:${Math.random() * h}px;width:${sz}px;height:${sz}px;animation-delay:${(Math.random() * 4).toFixed(2)}s;animation-duration:${(3 + Math.random() * 4).toFixed(1)}s"></i>`;
  }
  return o;
}
const MOON = `<svg class="moon" width="84" height="84" viewBox="0 0 84 84"><defs><radialGradient id="mg" cx=".35" cy=".35"><stop offset="0" stop-color="#FFF6DF"/><stop offset=".6" stop-color="#E9DDBE"/><stop offset="1" stop-color="#CFC09A"/></radialGradient><mask id="mm"><rect width="84" height="84" fill="#fff"/><circle cx="62" cy="28" r="34" fill="#000"/></mask></defs><circle cx="42" cy="42" r="38" fill="url(#mg)" mask="url(#mm)"/></svg>`;

let ringId = 0;
function ring(size, pct, stroke = 10, label = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, id = 'rg' + (++ringId);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ringsvg">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A89BE0"/><stop offset="1" stop-color="#78B3A6"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2A2F5C" stroke-width="${stroke}"/>
    <circle class="ringarc" data-off="${c * (1 - pct / 100)}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)"/>
    <text x="50%" y="${label ? '47%' : '50%'}" text-anchor="middle" dominant-baseline="central" fill="#ECE6D6" font-family="Fraunces" font-weight="300" font-size="${size * .3}"><tspan class="countup" data-to="${pct}">0</tspan><tspan font-size="${size * .12}" fill="#9A97B8">%</tspan></text>
    ${label ? `<text x="50%" y="${size * .7}" text-anchor="middle" fill="#9A97B8" font-size="${size * .085}" font-family="Atkinson">${label}</text>` : ''}</svg>`;
}
function animateIn(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.ringarc', root).forEach(a => a.setAttribute('stroke-dashoffset', a.dataset.off));
    $$('.countup', root).forEach(el => {
      const to = +el.dataset.to, t0 = performance.now(), D = 1300;
      const step = t => { const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    $$('[data-w]', root).forEach(el => { el.style.width = el.dataset.w; });
  }));
  $$('.drawline', root).forEach(p => { try { p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 1); } catch (e) {} });
}

/* Gráfica de la noche */
function hypSvg(n, W, H, compact) {
  const s = n.summary || {}, d = s.depth || [], L = d.length;
  if (L < 2) return `<svg width="${W}" height="${H}"></svg>`;
  const mx = compact ? Math.max(0.01, ...d) : 1;
  const pl = compact ? 0 : 62, pb = compact ? 2 : 22, sn = compact ? 0 : 12, top = 4, bot = H - pb - sn - 4, cw = W - pl - 4;
  const X = i => pl + i / (L - 1) * cw, Y = v => top + (compact ? v / mx * .95 : v) * (bot - top);
  const step = Math.max(1, Math.floor(L / 150));
  let px = X(0), py = Y(d[0]), path = `M${px.toFixed(1)},${py.toFixed(1)}`;
  for (let i = step; i < L; i += step) {
    let a = 0, c = 0; for (let j = i - step + 1; j <= i; j++) { a += d[j]; c++; }
    const x = X(Math.min(i, L - 1)), y = Y(a / c), xm = (px + x) / 2;
    path += ` C${xm.toFixed(1)},${py.toFixed(1)} ${xm.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
    px = x; py = y;
  }
  const gid = 'hg' + (++ringId);
  let o = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A89BE0" stop-opacity=".04"/><stop offset=".5" stop-color="#A89BE0" stop-opacity=".22"/><stop offset="1" stop-color="#78B3A6" stop-opacity=".65"/></linearGradient></defs>`;
  if (!compact) {
    o += `<rect x="${pl}" y="${top}" width="${cw}" height="${(bot - top) * .15}" fill="#D98C8C" opacity=".07"/><rect x="${pl}" y="${top + (bot - top) * .6}" width="${cw}" height="${(bot - top) * .4}" fill="#78B3A6" opacity=".07"/>`;
    [['Despierto', .07], ['Ligero', .37], ['Profundo', .8]].forEach(([l, y]) => o += `<text x="0" y="${top + y * (bot - top) + 4}" fill="#9A97B8" font-size="12" font-family="Atkinson">${l}</text>`);
    [.15, .6].forEach(y => o += `<line x1="${pl}" x2="${W}" y1="${top + y * (bot - top)}" y2="${top + y * (bot - top)}" stroke="#9A97B8" stroke-opacity=".15"/>`);
  }
  o += `<path class="fadein" d="${path} L${X(L - 1)},${top} L${X(0)},${top} Z" fill="url(#${gid})"/><path class="drawline" d="${path}" fill="none" stroke="#78B3A6" stroke-width="${compact ? 1.6 : 2.2}" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (!compact) {
    const segs = []; let a = null, prev = -9;
    for (const i of s.snoreIdx || []) { if (i - prev > 2) { if (a !== null) segs.push([a, prev]); a = i; } prev = i; }
    if (a !== null) segs.push([a, prev]);
    segs.forEach(([x0, x1]) => o += `<rect class="fadein" x="${X(x0)}" y="${bot + 6}" width="${Math.max(3, X(x1 + 1) - X(x0))}" height="${sn - 2}" rx="2" fill="#E6A85C"/>`);
    (s.marks || []).forEach(m => o += `<circle class="fadein" cx="${X(m.i)}" cy="${bot + 11}" r="3.5" fill="${m.type === 'tos' ? '#D98C8C' : '#A89BE0'}"/>`);
    const first = new Date(n.start); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
    const hrs = L / 60, every = cw / hrs >= 38 ? 1 : 2;
    for (let t = first.getTime(); t < n.start + L * 60000; t += every * 3600e3) {
      const i = (t - n.start) / 60000, x = X(i);
      if (x < pl + 12 || x > W - 14) continue;
      o += `<text x="${x}" y="${H - 4}" fill="#9A97B8" font-size="11" text-anchor="middle" font-family="Fraunces">${pad2(new Date(t).getHours())}:00</text>`;
    }
  }
  return o + '</svg>';
}
function attachGraphTip(wrap, n, W) {
  const s = n.summary, d = s.depth || [], L = d.length; if (L < 2) return;
  const pl = 62, cw = W - pl - 4;
  const tip = $('.tip', wrap), cur = $('.cursor', wrap);
  let hideT;
  const show = ev => {
    const r = wrap.getBoundingClientRect(); const x = ev.clientX - r.left;
    if (x < pl) return;
    const i = Math.round(clamp((x - pl) / cw) * (L - 1));
    const ts = n.start + i * 60000;
    let what = i < (s.onsetTs - n.start) / 60000 ? 'Despierto' : phaseAt(d[i]);
    if ((s.snoreIdx || []).includes(i)) what += ', roncando';
    tip.textContent = `${fmtTime(ts)}  ${what}`;
    const xx = pl + i / (L - 1) * cw;
    tip.style.left = clamp(xx, 70, W - 70) + 'px'; cur.style.left = xx + 'px';
    tip.classList.add('on'); cur.classList.add('on');
    clearTimeout(hideT); hideT = setTimeout(() => { tip.classList.remove('on'); cur.classList.remove('on'); }, 2200);
  };
  wrap.addEventListener('pointerdown', show);
  wrap.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') show(e); });
}
function waveBars(n, h = 22, seed = 5, col = '#9A97B8') {
  let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let o = `<svg width="${n * 4}" height="${h}">`;
  for (let i = 0; i < n; i++) { const v = Math.max(.12, Math.abs(Math.sin(i / 3.2)) * .7 + r() * .3); o += `<rect x="${i * 4}" y="${(h - v * h) / 2}" width="2.4" height="${v * h}" rx="1.2" fill="${col}"/>`; }
  return o + '</svg>';
}

/* Rueda de hora */
function wheelHtml(id) {
  const col = (name, vals) => `<div class="wcol" data-wc="${name}"><div class="pad"></div>${vals.map(v => `<div data-v="${v}">${pad2(v)}</div>`).join('')}<div class="pad"></div></div>`;
  return `<div class="wheel" id="${id}">${col('h', range(24))}<span class="wsep">:</span>${col('m', range(12).map(x => x * 5))}</div>`;
}
function initWheel(id, hhmm, onChange) {
  const w = $('#' + id); if (!w) return;
  const cols = $$('.wcol', w);
  const items = c => $$('[data-v]', c);
  const mark = c => { const idx = clamp(Math.round(c.scrollTop / 56), 0, items(c).length - 1); items(c).forEach((x, i) => x.classList.toggle('sel', i === idx)); return +items(c)[idx].dataset.v; };
  const [h, m] = hhmm.split(':').map(Number);
  const set = (c, v) => { const idx = items(c).findIndex(x => +x.dataset.v === v); c.scrollTop = Math.max(0, idx) * 56; mark(c); };
  set(cols[0], h); set(cols[1], (Math.round(m / 5) * 5) % 60);
  let t;
  cols.forEach(c => c.addEventListener('scroll', () => {
    mark(c); clearTimeout(t);
    t = setTimeout(() => { if (N.vibrate) N.vibrate(8); onChange(`${pad2(mark(cols[0]))}:${pad2(mark(cols[1]))}`); }, 140);
  }, { passive: true }));
}

/* ---------- Navegación ---------- */
const ROOTS = ['home', 'diary', 'stats', 'relax', 'settings'];
const TABS = [['home', 'moon', 'Dormir'], ['diary', 'calendar', 'Diario'], ['stats', 'chart', 'Estadísticas'], ['relax', 'sparkles', 'Relajarse'], ['settings', 'settings', 'Ajustes']];
let stack = [];
let current = null;
let cleanups = [];
const V = {}; // renderizadores de cada vista

function buildNav() {
  $('#nav').innerHTML = TABS.map(([v, i, l]) => `<button data-tab="${v}"><span class="pill">${ic(i, 20)}</span>${l}</button>`).join('');
  $$('#nav button').forEach(b => b.onclick = () => { if (current && current.v === b.dataset.tab) return; go(b.dataset.tab, {}, { reset: true }); });
}
function onCleanup(f) { cleanups.push(f); }
function go(v, p = {}, opt = {}) {
  cleanups.forEach(f => { try { f(); } catch (e) {} }); cleanups = [];
  closeSheet();
  if (opt.reset) stack = ROOTS.includes(v) ? [] : [{ v: 'home', p: {} }];
  else if (opt.replace) { /* no se agrega la vista actual */ }
  else if (current) stack.push(current);
  current = { v, p };
  show(v, p, opt);
}
function show(v, p, opt = {}) {
  $$('.view').forEach(el => { el.classList.remove('on'); });
  const el = $('#v-' + v);
  el.classList.toggle('noanim', !!opt.noanim);
  el.classList.add('on');
  el.scrollTop = 0;
  const root = ROOTS.includes(v);
  $('#nav').classList.toggle('hide', !root);
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === v));
  V[v](el, p);
}
function back() {
  if (sheetOpen) { closeSheet(); return true; }
  if (!current) return false;
  if (current.v === 'recording' || current.v === 'alarm') { toast('Mantén presionado el botón para terminar'); return true; }
  if (current.v === 'onboard') return false;
  if (stack.length) {
    cleanups.forEach(f => { try { f(); } catch (e) {} }); cleanups = [];
    current = stack.pop(); show(current.v, current.p); return true;
  }
  if (current.v !== 'home') { go('home', {}, { reset: true }); return true; }
  return false;
}
function refresh() { if (current) show(current.v, current.p, { noanim: true }); }
document.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (b) back(); });

/* =========================================================
   INICIO
   ========================================================= */
V.home = el => {
  const list = nights(), last = list[0];
  const now = new Date(), hr = now.getHours();
  const greet = hr < 5 ? 'Buenas noches' : hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
  const st = streak(list), db = debt(list, S.goal);
  let card;
  if (last) {
    const s = last.summary;
    card = `<button class="card" id="h-last" style="display:block;width:100%;text-align:left;margin-top:26px;background:rgba(16,18,42,.94)">
      <div class="row" style="gap:16px">${ring(104, s.score, 9)}
        <div style="flex:1"><p class="mute xs">${Date.now() - (last.end || last.start) < 20 * 3600e3 ? 'Anoche' : esc(nightLabel(last.start))}</p>
        <p style="font-family:var(--serif);font-size:19px;line-height:1.2">${verdict(s)}</p>
        <p class="sm" style="margin-top:4px">${s.noSleep ? '' : fmtDur(s.sleepMin)}</p>
        <p class="mute xs">${s.onsetTs ? fmtTime(s.onsetTs) + ' a ' + fmtTime(s.wakeTs) : ''}</p></div>${ic('chevR', 20, 'style="color:#9A97B8"')}</div>
      <div style="margin-top:12px" id="h-mini"></div></button>`;
  } else {
    card = `<div class="card" style="margin-top:26px;background:rgba(16,18,42,.94);text-align:center;padding:26px 20px">
      ${ic('moon', 34, 'style="margin:0 auto;color:#E6A85C"')}<h2 style="margin-top:12px">Tu primera noche</h2>
      <p class="mute sm" style="margin-top:6px">Toca "Ir a dormir" cuando te acuestes. En la mañana verás aquí cómo dormiste.</p></div>`;
  }
  el.innerHTML = `<div class="sky">${stars(42, 330)}${MOON}</div>
  <div class="rel">
    <p class="mute sm" style="margin-top:12px">${cap(DIAS[now.getDay()])} ${now.getDate()} de ${MESES[now.getMonth()]}</p>
    <h1 style="margin-top:4px">${greet.replace(' ', '<br>')}</h1>
    ${card}
    ${list.length ? `<div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
      <span class="chip plain">${ic('flame', 15, 'style="color:#E6A85C"')}${st} ${st === 1 ? 'noche seguida' : 'noches seguidas'}</span>
      <span class="chip plain">${ic('target', 15, 'style="color:#78B3A6"')}Deuda ${fmtDurShort(db)}</span></div>` : ''}
    <button class="btn main" id="h-go" style="margin-top:20px">${ic('moon', 22)}Ir a dormir</button>
    <button class="row" id="h-alarm" style="justify-content:center;margin:10px auto 0;gap:6px;color:var(--mute);font-size:13px;padding:6px">${ic('alarm', 15)}${S.alarmOn ? `Alarma ${S.win ? 'inteligente ' + fmtClockMin(toMin(S.wake) - S.win) + ' a ' + S.wake : 'a las ' + S.wake}` : 'Sin alarma'}</button>
    <div class="row" style="gap:10px;margin-top:18px">
      <button class="tile" id="h-breathe"><span class="ibox" style="background:rgba(120,179,166,.18);color:#78B3A6">${ic('lungs', 20)}</span><b class="sm">Respirar</b></button>
      <button class="tile" id="h-sounds"><span class="ibox" style="background:rgba(168,155,224,.18);color:#A89BE0">${ic('rain', 20)}</span><b class="sm">Sonidos</b></button>
      <button class="tile" id="h-report"><span class="ibox" style="background:rgba(230,168,92,.18);color:#E6A85C">${ic('report', 20)}</span><b class="sm">Reporte</b></button>
    </div>
  </div>`;
  if (last) {
    $('#h-mini').innerHTML = hypSvg(last, innerWidth - 40 - 38, 58, true);
    $('#h-last').onclick = () => go('detail', { id: last.id });
  }
  $('#h-go').onclick = () => go('prepare');
  $('#h-alarm').onclick = () => go('prepare');
  $('#h-breathe').onclick = () => go('breathe', {});
  $('#h-sounds').onclick = () => go('relax', {}, { reset: true });
  $('#h-report').onclick = () => go('report');
  animateIn(el);
};
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/* =========================================================
   PREPARAR LA NOCHE
   ========================================================= */
let prepTags = null;
V.prepare = el => {
  if (!prepTags) prepTags = new Set();
  const allTags = TAGS.map(t => t[0]).concat(S.customTags || []);
  const aidTxt = S.aidTypes.length ? `${S.aidTypes.map(t => SOUND_NAME[t]).join(' + ')}, se apaga en ${S.aidMin} min` : 'Ninguno';
  const alarmName = (ALARM_SOUNDS.find(a => a[0] === S.alarmSound) || ALARM_SOUNDS[0])[1];
  el.innerHTML = `
  <div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><h3>Preparar la noche</h3><span style="width:44px"></span></div>
  <div class="card" style="text-align:center;padding:14px 18px 18px">
    <button class="between" id="p-aon" style="width:100%"><span class="row sm" style="gap:8px">${ic('alarm', 18, 'style="color:#E6A85C"')}<b>Despertador inteligente</b></span><span class="sw ${S.alarmOn ? 'on' : ''}"></span></button>
    <div id="p-aopts" style="transition:opacity .25s;${S.alarmOn ? '' : 'opacity:.35;pointer-events:none'}">
      <div style="margin:8px 0 6px">${wheelHtml('p-wheel')}</div>
      <div class="chips" style="justify-content:center">${[[0, 'Exacta'], [10, '10 min'], [20, '20 min'], [30, '30 min'], [45, '45 min']].map(([v, l]) => `<button class="chip ${S.win === v ? 'amb' : ''}" data-win="${v}">${l}</button>`).join('')}</div>
      <p class="mute xs" style="margin-top:10px" id="p-wintxt"></p>
    </div>
  </div>
  <div class="lst card" style="margin-top:12px;padding:4px 16px">
    <button class="it" id="p-asound">${ic('music', 20, 'style="color:#A89BE0"')}<div style="flex:1"><b class="sm">Sonido de alarma</b><p class="mute xs">${alarmName}</p></div>${ic('chevR', 18)}</button>
    <button class="it" id="p-aid">${ic('rain', 20, 'style="color:#A89BE0"')}<div style="flex:1"><b class="sm">Sonido para dormir</b><p class="mute xs">${aidTxt}</p></div>${ic('chevR', 18)}</button>
    <button class="it" id="p-br">${ic('lungs', 20, 'style="color:#78B3A6"')}<div style="flex:1"><b class="sm">Respirar antes de dormir</b><p class="mute xs">${techName(S.breathTech)}, unos 3 minutos</p></div><span class="sw ${S.breatheBefore ? 'on' : ''}"></span></button>
  </div>
  <h3 style="margin:20px 0 10px">Notas de hoy</h3>
  <div class="chips" id="p-tags">${allTags.map(t => `<button class="chip ${prepTags.has(t) ? 'on' : ''}" data-tag="${esc(t)}">${ic(tagIcon(t), 14)}${esc(t)}</button>`).join('')}<button class="chip" id="p-new">${ic('plus', 14)}Nueva</button></div>
  <div class="hint" style="margin-top:16px">${ic('bulb', 20, 'style="color:#78B3A6"')}<span id="p-bed"></span></div>
  <button class="btn main" id="p-start" style="margin-top:16px">${ic('moon', 22)}Empezar a dormir</button>`;
  const upd = () => {
    const w = toMin(S.wake);
    $('#p-wintxt').textContent = S.win ? `Te despierta entre ${fmtClockMin(w - S.win)} y ${S.wake}, cuando estés en sueño ligero.` : `Suena exactamente a las ${S.wake}.`;
    $('#p-bed').innerHTML = S.alarmOn ? `Para dormir ${S.goal} h, acuéstate a las <b>${bedtimeFor(S.wake, S.goal)}</b>.` : `Tu meta es dormir ${S.goal} horas.`;
  };
  upd();
  initWheel('p-wheel', S.wake, v => { S.wake = v; saveS(); upd(); });
  $('#p-aon').onclick = () => { S.alarmOn = !S.alarmOn; saveS(); $('.sw', $('#p-aon')).classList.toggle('on', S.alarmOn); const o = $('#p-aopts'); o.style.opacity = S.alarmOn ? 1 : .35; o.style.pointerEvents = S.alarmOn ? '' : 'none'; upd(); };
  $$('[data-win]', el).forEach(b => b.onclick = () => { S.win = +b.dataset.win; saveS(); $$('[data-win]', el).forEach(x => x.classList.toggle('amb', x === b)); upd(); });
  $('#p-asound').onclick = () => alarmSoundSheet(() => refresh());
  $('#p-aid').onclick = () => soundPickSheet('aid', () => refresh());
  $('#p-br').onclick = () => { S.breatheBefore = !S.breatheBefore; saveS(); $('.sw', $('#p-br')).classList.toggle('on', S.breatheBefore); };
  $('#p-tags').addEventListener('click', e => {
    const c = e.target.closest('[data-tag]'); if (!c) return;
    const t = c.dataset.tag; if (prepTags.has(t)) prepTags.delete(t); else prepTags.add(t);
    c.classList.toggle('on', prepTags.has(t));
  });
  $('#p-new').onclick = () => openSheet(`<h2>Nueva nota</h2><p class="mute sm" style="margin-bottom:14px">Por ejemplo: té, lectura, meditación.</p>
    <input id="nt" maxlength="22" placeholder="Nombre de la nota" style="width:100%;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;outline:none">
    <button class="btn main" id="nt-ok" style="margin-top:14px">Agregar</button>`, sh => {
    const inp = $('#nt', sh); setTimeout(() => inp.focus(), 300);
    $('#nt-ok', sh).onclick = () => {
      const v = inp.value.trim(); if (!v) return;
      if (!S.customTags.includes(v) && !TAGS.some(t => t[0] === v)) { S.customTags.push(v); saveS(); }
      prepTags.add(v); closeSheet(); refresh();
    };
  });
  $('#p-start').onclick = startFlow;
};
function techName(t) { return { '478': '4-7-8', caja: 'Respiración en caja', relajante: 'Relajante' }[t] || '4-7-8'; }

function startFlow() {
  const p = J(N.perms(), {});
  if (!p.mic) {
    openSheet(`${ic('mic', 32, 'style="color:#E6A85C"')}<h2 style="margin-top:10px">Necesito el micrófono</h2>
      <p class="mute" style="margin:6px 0 20px">Con él escucho ronquidos, movimientos y ruidos para calcular tus fases de sueño. Los audios se quedan solo en tu cel.</p>
      <button class="btn main" id="pm-ok">Permitir micrófono</button>`, sh => { $('#pm-ok', sh).onclick = () => { closeSheet(); N.requestPerm('mic'); }; });
    return;
  }
  if (S.breatheBefore) go('breathe', { then: 'start' });
  else doStart();
}
function doStart() {
  S.lastTags = [...(prepTags || [])]; saveS();
  const cfg = {
    alarm: S.alarmOn ? { on: true, wakeTs: wakeTsFrom(S.wake), win: S.win, set: S.wake } : { on: false },
    aid: S.aidTypes.length ? { types: S.aidTypes.map(t => ({ type: t, vol: S.aidVols[t] ?? .5 })), min: S.aidMin } : null,
    tags: S.lastTags, sens: S.sens, goal: S.goal,
    alarmSound: S.alarmSound, vibrate: S.vibrate, ramp: S.ramp, snooze: S.snooze, saveClips: S.saveClips,
  };
  const r = N.startNight(JSON.stringify(cfg));
  if (r === 'ok') { prepTags = null; go('recording', { fresh: Date.now() }, { reset: true }); }
  else if (r === 'perm') N.requestPerm('mic');
  else toast('No se pudo empezar la grabación');
}

/* =========================================================
   GRABANDO
   ========================================================= */
V.recording = (el, p) => {
  el.innerHTML = `
  <div class="rec-top"><span class="recdot"></span><span id="r-status">Grabando tu sueño</span></div>
  <div id="rec-clock"><div class="t count" id="r-clock">--:--</div>
    <button class="row" id="r-alarm" style="justify-content:center;gap:6px;color:#3E3A60;font-size:14px;margin:12px auto 0;padding:6px 10px">${ic('alarm', 15)}<span></span></button>
    <canvas id="rec-wave" width="480" height="80"></canvas>
    <div class="rec-meta"><span id="r-aid"></span><span>${ic('snore', 15)}<b id="r-snore" class="count">0</b>&nbsp;ronquidos</span></div>
  </div>
  <p class="rec-note" id="r-note">Puedes bloquear el cel y apagar la pantalla. Sigo grabando.</p>
  <button id="hold" aria-label="Mantén presionado para terminar la noche">
    <svg class="r" width="104" height="104"><circle cx="52" cy="52" r="48" fill="none" stroke="#1E1C33" stroke-width="3"/>
      <circle id="hold-ring" cx="52" cy="52" r="48" fill="none" stroke="#8A7FC8" stroke-width="3" stroke-linecap="round" stroke-dasharray="301.6" stroke-dashoffset="301.6" transform="rotate(-90 52 52)"/></svg>
    <span class="lbl">${ic('sun', 20, 'style="margin:0 auto 4px"')}Mantén para<br>despertar</span></button>`;
  const cv = $('#rec-wave'), g = cv.getContext('2d');
  let lv = null, missing = 0;
  const draw = w => {
    g.clearRect(0, 0, 480, 80);
    const n = 60, bw = 480 / n;
    for (let i = 0; i < n; i++) {
      const v = w[w.length - n + i] ?? 0, hh = Math.max(4, v * 70);
      g.fillStyle = '#2E2B4A'; g.fillRect(i * bw + 1.5, 40 - hh / 2, bw - 3, hh);
    }
  };
  const tick = () => {
    const now = new Date();
    $('#r-clock').textContent = fmtTime(now);
    lv = J(N.live(), {});
    if (lv.ringing) { go('alarm', {}, { replace: true }); return; }
    if (!lv.recording) {
      missing++;
      if (missing > 3) { $('#r-status').textContent = 'La grabación se detuvo'; $('#r-note').textContent = 'Mantén presionado el botón para ver lo que se grabó.'; }
      return;
    }
    missing = 0;
    if (lv.micError) { $('#r-status').textContent = 'Revisa el micrófono'; $('#r-note').textContent = 'Otra app puede estar usando el micrófono.'; }
    const a = lv.alarm || {};
    $('#r-alarm span').textContent = a.on && a.wakeTs ? (a.win ? `${fmtTime(a.wakeTs - a.win * 60000)} a ${fmtTime(a.wakeTs)}` : `Alarma ${fmtTime(a.wakeTs)}`) : 'Sin alarma';
    $('#r-snore').textContent = (lv.counts || {}).ronquido || 0;
    const so = lv.sounds || {};
    $('#r-aid').innerHTML = so.playing && so.layers && so.layers.length ? `${ic('rain', 15)}${SOUND_NAME[so.layers[0].type] || 'Sonido'} ${Math.ceil((so.left || 0) / 60000)} min` : '';
    draw(lv.wave || []);
  };
  tick();
  const iv = setInterval(tick, 1000);
  const mv = setInterval(() => { const c = $('#rec-clock'); if (c) { c.style.left = (42 + Math.random() * 16) + '%'; c.style.top = (34 + Math.random() * 16) + '%'; } }, 60000);
  onCleanup(() => { clearInterval(iv); clearInterval(mv); });
  $('#r-alarm').onclick = editAlarmSheet;
  // Mantener presionado
  const hold = $('#hold'), rg = $('#hold-ring'), LEN = 301.6, MS = 1400;
  let t0 = 0, raf = 0;
  const reset = () => { cancelAnimationFrame(raf); t0 = 0; rg.style.strokeDashoffset = LEN; };
  const step = () => { const pr = clamp((Date.now() - t0) / MS); rg.style.strokeDashoffset = LEN * (1 - pr); if (pr >= 1) { reset(); N.vibrate(60); stopFlow(); return; } raf = requestAnimationFrame(step); };
  hold.addEventListener('pointerdown', e => { e.preventDefault(); t0 = Date.now(); N.vibrate(15); raf = requestAnimationFrame(step); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => hold.addEventListener(ev, () => { if (t0) reset(); }));
  if (p.ask === 'stop') confirmSheet('¿Terminar la noche?', 'Se guarda lo grabado y ves tu resultado.', 'Terminar', false, stopFlow);
  if (p.ask === 'alarm') setTimeout(editAlarmSheet, 300);
};
function editAlarmSheet() {
  const lv = J(N.live(), {}); const a = lv.alarm || {};
  let on = !!a.on, win = a.win ?? S.win, wake = a.set || S.wake;
  openSheet(`<div class="between"><h2>Alarma de esta noche</h2><button id="ea-on" class="sw ${on ? 'on' : ''}"></button></div>
    <div style="margin:8px 0">${wheelHtml('ea-wheel')}</div>
    <div class="chips" style="justify-content:center">${[[0, 'Exacta'], [10, '10 min'], [20, '20 min'], [30, '30 min'], [45, '45 min']].map(([v, l]) => `<button class="chip ${win === v ? 'amb' : ''}" data-ew="${v}">${l}</button>`).join('')}</div>
    <button class="btn main" id="ea-ok" style="margin-top:18px">Guardar</button>`, sh => {
    initWheel('ea-wheel', wake, v => { wake = v; });
    $('#ea-on', sh).onclick = e => { on = !on; e.currentTarget.classList.toggle('on', on); };
    $$('[data-ew]', sh).forEach(b => b.onclick = () => { win = +b.dataset.ew; $$('[data-ew]', sh).forEach(x => x.classList.toggle('amb', x === b)); });
    $('#ea-ok', sh).onclick = () => {
      N.setAlarm(JSON.stringify({ on, wakeTs: wakeTsFrom(wake), win, set: wake }));
      closeSheet(); toast(on ? `Alarma cambiada a las ${wake}` : 'Alarma apagada');
    };
  });
}
function stopFlow() {
  const id = N.stopNight();
  if (id) {
    const n = finalize(id);
    if (n && (n.minutes || []).length < 3) toast('Fue una grabación muy corta');
    go('mood', { id }, { reset: true });
  } else go('home', {}, { reset: true });
}

/* =========================================================
   ALARMA
   ========================================================= */
V.alarm = el => {
  const lv0 = J(N.live(), {});
  el.innerHTML = `<div class="sun"></div>
  <div style="position:relative;z-index:2;text-align:center;margin-top:calc(110px + var(--st))">
    <p style="font-size:16px">Buenos días</p>
    <div class="count" style="font-family:var(--serif);font-weight:300;font-size:96px;line-height:1" id="al-t">${fmtTime(Date.now())}</div>
    <p class="row" style="justify-content:center;gap:6px;margin-top:10px;color:#F1E3D0">${ic('sparkles', 16)}<span>${esc(lv0.ringWhy || 'Es tu hora')}</span></p>
  </div>
  <div class="slide" id="al-slide"><div class="knob" id="al-knob">${ic('sun', 26)}</div><span class="txt">Desliza para despertar ${ic('chevR', 16, 'style="display:inline;vertical-align:-3px"')}</span></div>
  <button class="btn" id="al-snooze" style="position:absolute;z-index:3;left:24px;right:24px;bottom:calc(66px + var(--sb));background:rgba(23,26,51,.3)">${ic('clock', 18)}Posponer ${S.snooze} min</button>`;
  const iv = setInterval(() => {
    $('#al-t').textContent = fmtTime(Date.now());
    const lv = J(N.live(), {});
    if (!lv.ringing && lv.recording) go('recording', {}, { replace: true });
  }, 1000);
  onCleanup(() => clearInterval(iv));
  const slide = $('#al-slide'), knob = $('#al-knob');
  let sx = null, max = 0;
  slide.addEventListener('pointerdown', e => { sx = e.clientX; max = slide.clientWidth - 70; knob.style.transition = 'none'; slide.setPointerCapture(e.pointerId); });
  slide.addEventListener('pointermove', e => { if (sx === null) return; const dx = clamp(e.clientX - sx, 0, max); knob.style.transform = `translateX(${dx}px)`; });
  const end = e => {
    if (sx === null) return;
    const dx = clamp(e.clientX - sx, 0, max); sx = null; knob.style.transition = '';
    if (dx > max * .8) { knob.style.transform = `translateX(${max}px)`; N.vibrate(40); wakeUp(); }
    else knob.style.transform = '';
  };
  slide.addEventListener('pointerup', end); slide.addEventListener('pointercancel', end);
  $('#al-snooze').onclick = () => { N.snooze(); toast(`Te despierto en ${S.snooze} minutos`); go('recording', {}, { replace: true }); };
};
function wakeUp() {
  const id = N.stopNight();
  if (id) { finalize(id); go('mood', { id }, { reset: true }); }
  else go('home', {}, { reset: true });
}

/* =========================================================
   ÁNIMO AL DESPERTAR
   ========================================================= */
V.mood = (el, p) => {
  let mood = 0; const morning = new Set();
  el.innerHTML = `
  <div style="margin-top:50px">${ic('sun', 40, 'style="color:#E6A85C"')}</div>
  <h1 style="margin-top:16px">¿Cómo te<br>despertaste?</h1>
  <p class="mute" style="margin-top:8px">Con tu respuesta aprendo qué noches de verdad te hacen descansar.</p>
  <div class="row" style="gap:10px;margin-top:28px" id="m-faces">
    ${[[1, 'frown', 'Cansado', '#D98C8C'], [2, 'meh', 'Normal', '#A89BE0'], [3, 'smile', 'Descansado', '#78B3A6']].map(([v, i, l, c]) => `<button data-m="${v}" data-c="${c}" style="flex:1;border-radius:20px;padding:20px 6px;text-align:center;background:var(--surface);border:1px solid transparent;transition:all .2s">${ic(i, 40, `style="margin:0 auto;color:${c}"`)}<p class="sm" style="margin-top:10px">${l}</p></button>`).join('')}
  </div>
  <h3 style="margin:26px 0 10px">¿Algo más de anoche?</h3>
  <div class="chips" id="m-chips">${MORNING.map(([t, i]) => `<button class="chip" data-t="${t}">${ic(i, 14)}${t}</button>`).join('')}</div>
  <button class="btn main" id="m-go" style="margin-top:34px">Ver mi noche ${ic('chevR', 20)}</button>
  <button class="btn" id="m-skip" style="width:100%;color:var(--mute);margin-top:4px">Saltar</button>`;
  $$('#m-faces button').forEach(b => b.onclick = () => {
    mood = +b.dataset.m; N.vibrate(15);
    $$('#m-faces button').forEach(x => { const on = x === b; x.style.borderColor = on ? x.dataset.c : 'transparent'; x.style.background = on ? 'rgba(255,255,255,.07)' : 'var(--surface)'; x.style.transform = on ? 'scale(1.04)' : ''; });
  });
  $('#m-chips').addEventListener('click', e => { const c = e.target.closest('[data-t]'); if (!c) return; const t = c.dataset.t; morning.has(t) ? morning.delete(t) : morning.add(t); c.classList.toggle('on', morning.has(t)); });
  const done = save => {
    if (save) { const n = getNight(p.id); if (n) { n.mood = mood || null; n.morning = [...morning]; n.summary = n.summary || analyze(n, S.goal); saveNight(n); } }
    go('detail', { id: p.id, fresh: true }, { replace: true });
  };
  $('#m-go').onclick = () => done(true);
  $('#m-skip').onclick = () => done(false);
};
