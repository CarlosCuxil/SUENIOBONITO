'use strict';
/* =========================================================
   Sueño — monitor de sueño personal (PWA)
   ========================================================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/* ---------- Ajustes ---------- */
const DEFAULTS = { goal: 8, sens: 'media', alarmOn: true, wake: '06:30', win: 30, aid: 'ninguno', aidMin: 30, aidVol: 0.35, lastTags: [] };
function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('sueno-ajustes') || '{}') }; } catch (e) { return { ...DEFAULTS }; } }
function saveSettings() { try { localStorage.setItem('sueno-ajustes', JSON.stringify(S)); } catch (e) {} }
let S = loadSettings();
const SENS = { baja: 12, media: 9, alta: 6 };
const TAGS = ['Café', 'Alcohol', 'Ejercicio', 'Estrés', 'Cena pesada', 'Siesta', 'Pantallas tarde', 'Trabajé tarde', 'Medicina', 'Enfermo', 'Cuarto caliente', 'Dormí acompañado'];
const TYPE_LABEL = { ronquido: 'Ronquidos', habla: 'Hablar dormido', tos: 'Tos', movimiento: 'Movimientos', ruido: 'Ruidos' };

/* ---------- Base de datos (IndexedDB) ---------- */
const db = (() => {
  let p;
  function open() {
    if (p) return p;
    p = new Promise((res, rej) => {
      const r = indexedDB.open('sueno', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('nights', { keyPath: 'id' });
        d.createObjectStore('clips', { keyPath: 'id' }).createIndex('night', 'nightId');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return p;
  }
  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      const r = fn(t.objectStore(store));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  return {
    put: (s, o) => tx(s, 'readwrite', st => st.put(o)),
    get: (s, k) => tx(s, 'readonly', st => st.get(k)),
    all: s => tx(s, 'readonly', st => st.getAll()),
    del: (s, k) => tx(s, 'readwrite', st => st.delete(k)),
    clear: s => tx(s, 'readwrite', st => st.clear()),
    clipsFor: id => tx('clips', 'readonly', st => st.index('night').getAll(id)),
  };
})();
async function nightsSorted() { return (await db.all('nights')).filter(n => n.status === 'done').sort((a, b) => b.start - a.start); }
async function deleteNight(id) {
  const cl = await db.clipsFor(id);
  for (const c of cl) await db.del('clips', c.id);
  await db.del('nights', id);
}

/* ---------- Utilidades de formato ---------- */
const fmtTime = ts => new Date(ts).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false });
function fmtDur(min) {
  min = Math.round(min);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
function nightLabel(ts) {
  const d = new Date(ts - 6 * 3600e3); // una noche que empieza a la 1 am cuenta para el día anterior
  return d.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'short' });
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600); }
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

/* ---------- Navegación ---------- */
let current = 'v-home';
function show(id) {
  $$('.view').forEach(v => v.classList.toggle('on', v.id === id));
  current = id;
  const tabs = ['v-home', 'v-trends', 'v-settings'];
  $('#nav').classList.toggle('hide', !tabs.includes(id));
  $$('#nav button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === id ? 'true' : 'false'));
  window.scrollTo(0, 0);
  if (id === 'v-home') renderHome();
  if (id === 'v-trends') renderTrends();
  if (id === 'v-settings') renderSettings();
}
$$('#nav button').forEach(b => b.onclick = () => show(b.dataset.tab));
document.addEventListener('click', e => { if (e.target.closest('[data-back]')) { stopAidPreview(); show('v-home'); } });

/* =========================================================
   MOTOR DE AUDIO
   ========================================================= */
let sess = null;                         // noche en curso
const R = {};                            // recursos de audio
let E = null;                            // estado del detector
let M = null;                            // acumulador del minuto

function newDetector() {
  return { base: null, warm: [], above: 0, below: 0, inEv: false, ev: null, lastCand: null, clips: {}, level: -100 };
}

async function openMic() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0;
  const mute = ctx.createGain(); mute.gain.value = 0;
  src.connect(an); an.connect(mute); mute.connect(ctx.destination); // mantiene el grafo activo
  const hz = ctx.sampleRate / an.fftSize;
  const bin = f => Math.min(an.frequencyBinCount - 1, Math.round(f / hz));
  return {
    stream, ctx, an,
    td: new Float32Array(an.fftSize), fd: new Float32Array(an.frequencyBinCount),
    b60: bin(60), b300: bin(300), b500: bin(500), b3k: bin(3000), b8k: bin(8000),
  };
}

// Lee un cuadro de audio: nivel en dB y reparto de energía por bandas
function readFrame(A) {
  A.an.getFloatTimeDomainData(A.td);
  let sum = 0;
  for (let i = 0; i < A.td.length; i++) sum += A.td[i] * A.td[i];
  const db = 20 * Math.log10(Math.sqrt(sum / A.td.length) + 1e-9);
  A.an.getFloatFrequencyData(A.fd);
  let low = 0, voice = 0, tot = 0;
  for (let i = A.b60; i <= A.b8k; i++) {
    const p = Math.pow(10, A.fd[i] / 10);
    tot += p;
    if (i <= A.b500) low += p;
    if (i >= A.b300 && i <= A.b3k) voice += p;
  }
  return { db, lr: tot > 0 ? low / tot : 0, vr: tot > 0 ? voice / tot : 0 };
}

// Actualiza el nivel de fondo y detecta eventos. onEvent recibe cada evento clasificado.
function detect(D, f, now, sensDb, onEvent) {
  D.level = f.db;
  if (D.base === null) {
    D.warm.push(f.db);
    if (D.warm.length >= 30) D.base = median(D.warm);
    return;
  }
  const thr = D.base + sensDb;
  if (!D.inEv) {
    if (f.db < D.base) D.base += 0.1 * (f.db - D.base);
    else if (f.db < thr) D.base += 0.003 * (f.db - D.base);
  }
  if (f.db > thr) { D.above++; D.below = 0; } else { D.below++; D.above = 0; }
  if (!D.inEv && D.above >= 3) { D.inEv = true; D.ev = { start: now - 300, peak: f.db, lr: 0, vr: 0, n: 0 }; }
  if (D.inEv) {
    const ev = D.ev;
    ev.peak = Math.max(ev.peak, f.db); ev.lr += f.lr; ev.vr += f.vr; ev.n++;
    if (D.below >= 5) finishEvent(D, now - 500, onEvent);
    else if (now - ev.start > 30000) finishEvent(D, now, onEvent);
  }
}
function finishEvent(D, end, onEvent) {
  const ev = D.ev; D.inEv = false; D.ev = null;
  if (!ev || !ev.n) return;
  const dur = (end - ev.start) / 1000, lr = ev.lr / ev.n, vr = ev.vr / ev.n, rise = ev.peak - D.base;
  let type;
  if (dur >= 0.3 && dur <= 4 && lr >= 0.55) {
    // Los ronquidos se repiten con cada respiración (cada 1.5–10 s)
    const last = D.lastCand, gap = last ? ev.start - last.t : 0;
    if (last && gap >= 1500 && gap <= 10000) { type = 'ronquido'; if (last.type === 'posible') last.type = 'ronquido'; }
    else type = 'posible';
  } else if (dur >= 0.8 && dur <= 10 && vr >= 0.55 && lr < 0.5) type = 'habla';
  else if (dur < 0.8 && rise >= 18) type = 'tos';
  else if (dur < 3) type = 'movimiento';
  else type = 'ruido';
  const e = { t: ev.start, d: +dur.toFixed(1), p: +rise.toFixed(1), type };
  if (type === 'posible' || type === 'ronquido') D.lastCand = e;
  onEvent(e);
}

/* ---------- Iniciar noche ---------- */
async function startNight() {
  const btn = $('#start');
  btn.disabled = true;
  stopAidPreview();
  try {
    Object.assign(R, await openMic());
  } catch (err) {
    btn.disabled = false;
    toast('Necesito permiso del micrófono para grabar la noche.');
    return;
  }
  S.alarmOn = $('#a-on').checked; S.wake = $('#a-time').value || S.wake; S.win = +$('#a-win').value;
  S.aid = $('#aid').value; S.aidMin = +$('#aid-min').value; S.aidVol = +$('#aid-vol').value;
  S.lastTags = selectedTags();
  saveSettings();

  const start = Date.now();
  let wakeTs = null;
  if (S.alarmOn) {
    const [h, m] = S.wake.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() <= start + 60000) d.setDate(d.getDate() + 1);
    wakeTs = d.getTime();
  }
  sess = {
    id: 'n' + start, start, end: null, status: 'recording',
    minutes: [], events: [], baseline: null, sens: S.sens, goal: S.goal,
    tags: S.lastTags, alarm: S.alarmOn ? { on: true, wakeTs, win: S.win, set: S.wake } : null,
    aid: S.aid !== 'ninguno' ? { type: S.aid, min: S.aidMin } : null, mood: null,
  };
  E = newDetector();
  M = { t0: start, sum: 0, n: 0, peak: -200 };
  R.counts = {};
  R.ringing = false;
  R.lastSave = 0;

  R.tickIv = setInterval(tick, 100);
  R.uiIv = setInterval(nightUI, 1000);
  R.stream.getAudioTracks()[0].addEventListener('ended', () => { $('#nightmsg').textContent = 'El micrófono se desconectó. Mantén presionado para guardar lo grabado.'; });
  if (sess.aid) startAid(S.aid, S.aidVol, S.aidMin);
  await lockScreen();
  try { await document.documentElement.requestFullscreen?.(); } catch (e) {}
  db.put('nights', sess).catch(() => {});
  btn.disabled = false;
  show('v-night');
  nightUI();
}

function tick() {
  if (!sess) return;
  const now = Date.now();
  const f = readFrame(R);
  M.sum += f.db; M.n++; if (f.db > M.peak) M.peak = f.db;
  if (!R.ringing) detect(E, f, now, SENS[sess.sens], onNightEvent);
  while (now - M.t0 >= 60000) flushMinute();
}
function onNightEvent(e) {
  sess.events.push(e);
  R.counts[e.type] = (R.counts[e.type] || 0) + 1;
  maybeClip(e);
}
function flushMinute() {
  const prev = sess.minutes[sess.minutes.length - 1];
  const a = M.n ? M.sum / M.n : (prev ? prev.a : -60);
  sess.minutes.push({ a: +a.toFixed(1), p: +(M.n ? M.peak : a).toFixed(1) });
  M.t0 = sess.start + sess.minutes.length * 60000;
  M.sum = 0; M.n = 0; M.peak = -200;
  sess.baseline = E.base !== null ? +E.base.toFixed(1) : null;
  db.put('nights', sess).catch(() => {});
}

/* ---------- Clips de audio ---------- */
const CLIP_RULES = { ronquido: { max: 15, gap: 8 * 60000, len: 10000 }, habla: { max: 10, gap: 2 * 60000, len: 15000 }, tos: { max: 6, gap: 5 * 60000, len: 10000 }, ruido: { max: 6, gap: 10 * 60000, len: 10000 } };
function maybeClip(e) {
  if (e.type === 'ruido' && e.p < 20) return;
  const r = CLIP_RULES[e.type];
  if (!r || R.recording || !window.MediaRecorder) return;
  const c = E.clips[e.type] || { n: 0, last: 0 };
  if (c.n >= r.max || Date.now() - c.last < r.gap) return;
  c.n++; c.last = Date.now(); E.clips[e.type] = c;
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  let mr;
  try { mr = new MediaRecorder(R.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined); } catch (err) { return; }
  const chunks = [], nightId = sess.id;
  R.recording = true; R.mr = mr;
  mr.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  mr.onstop = () => {
    R.recording = false;
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
    db.put('clips', { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6), nightId, t: e.t, kind: e.type, blob }).catch(() => {});
  };
  mr.start();
  setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, r.len);
}

/* ---------- Pantalla de la noche ---------- */
function nightUI() {
  if (!sess) return;
  const now = Date.now();
  $('#ck').textContent = fmtTime(now);
  const a = sess.alarm;
  let sub = '';
  if (a && a.on) {
    const from = a.wakeTs - a.win * 60000;
    sub = a.win ? `Alarma entre ${fmtTime(from)} y ${fmtTime(a.wakeTs)}` : `Alarma a las ${fmtTime(a.wakeTs)}`;
  } else sub = 'Sin alarma';
  if (R.aid && R.aid.endAt > now) sub += `. Sonido ${Math.ceil((R.aid.endAt - now) / 60000)} min`;
  $('#ck-s').textContent = sub;
  // indicador de nivel discreto
  const lv = E.base === null ? 0 : clamp((E.level - E.base) / 25);
  $('#level').style.background = E.inEv ? '#7A6A3E' : `rgb(${52 + lv * 60},${49 + lv * 50},${79 + lv * 50})`;
  // mover el reloj cada minuto para no marcar la pantalla
  if (now - (R.lastMove || 0) > 60000) {
    R.lastMove = now;
    const c = $('#clock');
    c.style.left = (40 + Math.random() * 20) + '%';
    c.style.top = (28 + Math.random() * 20) + '%';
  }
  alarmCheck(now);
}

/* ---------- Mantener pantalla encendida ---------- */
async function lockScreen() {
  try { if ('wakeLock' in navigator) R.wl = await navigator.wakeLock.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sess) {
    lockScreen();
    if (R.ctx && R.ctx.state === 'suspended') R.ctx.resume();
  }
});

/* ---------- Mantener presionado para terminar ---------- */
(() => {
  const hold = $('#hold'), ring = $('#hold-ring'), LEN = 276.5, MS = 1500;
  let t0 = 0, raf = 0;
  const step = () => {
    const p = clamp((Date.now() - t0) / MS);
    ring.style.strokeDashoffset = LEN * (1 - p);
    if (p >= 1) { reset(); finishNight(); return; }
    raf = requestAnimationFrame(step);
  };
  const reset = () => { cancelAnimationFrame(raf); t0 = 0; ring.style.strokeDashoffset = LEN; };
  hold.addEventListener('pointerdown', e => { e.preventDefault(); t0 = Date.now(); raf = requestAnimationFrame(step); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => hold.addEventListener(ev, () => { if (t0) reset(); }));
  hold.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finishNight(); } });
})();

/* =========================================================
   DESPERTADOR INTELIGENTE
   ========================================================= */
function alarmCheck(now) {
  const a = sess && sess.alarm;
  if (!a || !a.on || R.ringing) return;
  if (now >= a.wakeTs) return ring('Es tu hora');
  if (a.win && now >= a.wakeTs - a.win * 60000) {
    // sueño ligero = movimientos recientes
    let act = 0;
    for (let i = sess.events.length - 1; i >= 0; i--) {
      const e = sess.events[i];
      if (e.t < now - 3 * 60000) break;
      if (e.type !== 'ronquido' && e.type !== 'posible') act++;
    }
    if (act >= 2) ring('Estabas en sueño ligero');
  }
}
function ring(why) {
  R.ringing = true;
  sess.alarm.rangAt = sess.alarm.rangAt || Date.now();
  stopAid(true);
  $('#al-why').textContent = why;
  $('#al-time').textContent = fmtTime(Date.now());
  show('v-alarm');
  const ctx = R.ctx;
  if (ctx.state === 'suspended') ctx.resume();
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.02, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 90);
  g.connect(ctx.destination);
  R.alarmGain = g;
  const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
  const play = () => {
    const t0 = ctx.currentTime;
    notes.forEach((fq, i) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      const t = t0 + i * 0.32;
      o.type = 'sine'; o.frequency.value = fq;
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.45, t + 0.03);
      e.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      o.connect(e); e.connect(g); o.start(t); o.stop(t + 1.5);
    });
  };
  play();
  R.alarmIv = setInterval(play, 3600);
  if (navigator.vibrate) { navigator.vibrate([500, 300, 500]); R.vibIv = setInterval(() => navigator.vibrate([500, 300, 500]), 4000); }
}
function silenceAlarm() {
  clearInterval(R.alarmIv); clearInterval(R.vibIv);
  if (navigator.vibrate) navigator.vibrate(0);
  if (R.alarmGain) { try { R.alarmGain.gain.cancelScheduledValues(0); R.alarmGain.gain.value = 0; R.alarmGain.disconnect(); } catch (e) {} R.alarmGain = null; }
}
$('#al-stop').onclick = () => finishNight();
$('#al-snooze').onclick = () => {
  silenceAlarm();
  R.ringing = false;
  sess.alarm.wakeTs = Date.now() + 9 * 60000;
  sess.alarm.win = 0;
  sess.alarm.snoozes = (sess.alarm.snoozes || 0) + 1;
  show('v-night');
  nightUI();
};

/* =========================================================
   SONIDOS PARA DORMIR
   ========================================================= */
function noiseBuffer(ctx, kind) {
  const len = ctx.sampleRate * 6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'blanco') d[i] = w * 0.25;
      else if (kind === 'rosa' || kind === 'lluvia') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.06; b6 = w * 0.115926;
        if (kind === 'lluvia' && Math.random() < 0.0006) d[i] += (Math.random() * 2 - 1) * 0.5; // gotas
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } // café y olas
    }
  }
  return buf;
}
function buildAid(ctx, kind, vol) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind); src.loop = true;
  const out = ctx.createGain(); out.gain.value = vol;
  let node = src;
  if (kind === 'lluvia') { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400; node.connect(hp); node = hp; }
  if (kind === 'olas') {
    const lfo = ctx.createOscillator(), depth = ctx.createGain(), swell = ctx.createGain();
    lfo.frequency.value = 0.09; depth.gain.value = 0.45; swell.gain.value = 0.55;
    lfo.connect(depth); depth.connect(swell.gain); lfo.start();
    node.connect(swell); node = swell;
  }
  node.connect(out); out.connect(ctx.destination);
  src.start();
  return { src, out };
}
function startAid(kind, vol, min) {
  const ctx = R.ctx;
  const a = buildAid(ctx, kind, vol);
  const end = ctx.currentTime + min * 60;
  a.out.gain.setValueAtTime(vol, Math.max(ctx.currentTime, end - 120));
  a.out.gain.linearRampToValueAtTime(0.0001, end);
  a.src.stop(end + 1);
  R.aid = { ...a, endAt: Date.now() + min * 60000 };
}
function stopAid(fast) {
  if (!R.aid) return;
  try { R.aid.out.gain.cancelScheduledValues(0); R.aid.out.gain.value = 0; R.aid.src.stop(); } catch (e) {}
  R.aid = null;
}
let preview = null;
function stopAidPreview() {
  if (!preview) return;
  try { preview.a.src.stop(); preview.ctx.close(); } catch (e) {}
  preview = null;
  $('#aid-try').textContent = 'Escuchar';
}
$('#aid-try').onclick = () => {
  if (preview) return stopAidPreview();
  const kind = $('#aid').value;
  if (kind === 'ninguno') return toast('Elige un sonido primero.');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  preview = { ctx, a: buildAid(ctx, kind, +$('#aid-vol').value) };
  $('#aid-try').textContent = 'Detener';
};
$('#aid-vol').oninput = e => { if (preview) preview.a.out.gain.value = +e.target.value; };
$('#aid').onchange = () => { if (preview) { stopAidPreview(); $('#aid-try').click(); } };

/* =========================================================
   TERMINAR NOCHE
   ========================================================= */
let finishing = false;
async function finishNight() {
  if (!sess || finishing) return;
  finishing = true;
  clearInterval(R.tickIv); clearInterval(R.uiIv);
  silenceAlarm(); stopAid(true);
  if (E.inEv) finishEvent(E, Date.now(), onNightEvent);
  if (M.n >= 100) flushMinute();
  if (R.mr && R.mr.state !== 'inactive') { try { R.mr.stop(); } catch (e) {} }
  await new Promise(r => setTimeout(r, 400));
  try { R.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  try { await R.ctx.close(); } catch (e) {}
  try { await R.wl?.release(); } catch (e) {}
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
  sess.end = Date.now();
  sess.status = 'done';
  sess.summary = analyze(sess);
  await db.put('nights', sess);
  const id = sess.id;
  sess = null; R.ringing = false; finishing = false;
  moodFor = id;
  show('v-mood');
}

/* ---------- Ánimo al despertar ---------- */
let moodFor = null;
$$('#v-mood [data-m]').forEach(b => b.onclick = async () => {
  const n = await db.get('nights', moodFor);
  const m = +b.dataset.m;
  if (n && m) { n.mood = m; n.summary = analyze(n); await db.put('nights', n); }
  openDetail(moodFor);
});

/* =========================================================
   ANÁLISIS DE LA NOCHE
   ========================================================= */
function analyze(n) {
  const Mn = n.minutes.length;
  const counts = { ronquido: 0, habla: 0, tos: 0, movimiento: 0, ruido: 0 };
  if (!Mn) return { empty: true, counts, score: 0, inBed: 0, sleepMin: 0 };
  const act = new Array(Mn).fill(0), sn = new Array(Mn).fill(0);
  for (const e of n.events) {
    const i = Math.floor((e.t - n.start) / 60000);
    const ty = e.type === 'posible' ? 'movimiento' : e.type;
    counts[ty]++;
    if (i < 0 || i >= Mn) continue;
    if (ty === 'ronquido') sn[i]++;
    else act[i] += ty === 'movimiento' ? 1 : 1.5;
  }
  const restless = act.map(a => a >= 2);

  // Hora en que te dormiste: 15 min seguidos tranquilos, o el primer ronquido sostenido
  let quiet = -1;
  for (let i = 0; i + 15 <= Mn; i++) {
    let ok = true;
    for (let j = i; j < i + 15; j++) if (restless[j]) { ok = false; break; }
    if (ok) { quiet = i; break; }
  }
  if (quiet < 0 && Mn < 15 && !restless.some(Boolean)) quiet = 0;
  const firstSnore = sn.findIndex(x => x >= 2);
  const cands = [quiet, firstSnore].filter(x => x >= 0);
  const onset = cands.length ? Math.min(...cands) : -1;

  const goal = n.goal || S.goal;
  if (onset < 0) {
    return { empty: false, noSleep: true, counts, inBed: Mn, sleepMin: 0, score: 0, onsetTs: null, wakeTs: n.start + Mn * 60000, depth: new Array(Mn).fill(0), snoreIdx: [], latency: Mn, awakenings: 0, eff: 0, deepMin: 0, lightMin: 0, snoreMin: 0, snorePct: 0, goal };
  }
  let wake = Mn;
  while (wake - 1 > onset && restless[wake - 1]) wake--;

  let awakeMin = 0, awakenings = 0, run = 0;
  for (let i = onset; i < wake; i++) {
    if (restless[i]) run++;
    else { if (run >= 3) { awakenings++; awakeMin += run; } run = 0; }
  }
  if (run >= 3) { awakenings++; awakeMin += run; }

  // Curva de profundidad: movimiento observado + ciclo típico de ~90 min
  const sm = act.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(Mn - 1, i + 2); j++) { s += act[j]; c++; } return s / c; });
  const depth = sm.map((v, i) => {
    if (i < onset || i >= wake) return 0;
    const t = i - onset;
    const data = 1 - clamp(v / 1.5);
    const cyc = 0.5 + 0.5 * Math.cos(2 * Math.PI * (t - 35) / 90);
    const prior = cyc * Math.max(0.35, 1 - t / 600);
    let d = (0.2 + 0.8 * prior) * (0.35 + 0.65 * data);
    if (restless[i]) d = Math.min(d, 0.1);
    return +d.toFixed(2);
  });
  let deepMin = 0, lightMin = 0, snoreMin = 0;
  const snoreIdx = [];
  for (let i = onset; i < wake; i++) {
    if (depth[i] >= 0.6) deepMin++; else if (depth[i] >= 0.15) lightMin++;
    if (sn[i] > 0) { snoreMin++; snoreIdx.push(i); }
  }
  const sleepMin = Math.max(0, wake - onset - awakeMin);
  const inBed = Mn;
  const eff = inBed ? sleepMin / inBed : 0;
  const h = sleepMin / 60;
  const snorePct = sleepMin ? snoreMin / sleepMin : 0;

  const pDur = 35 * clamp(1 - Math.max(0, (goal - 0.5) - h, h - (goal + 1.5)) / 3);
  const pEff = 25 * clamp((eff - 0.65) / 0.27);
  const pLat = 10 * clamp(1 - (onset - 20) / 40);
  const pAwk = 10 * clamp(1 - awakenings / 4);
  const pSn = 10 * clamp(1 - snorePct / 0.35);
  const pDeep = 10 * clamp(sleepMin ? (deepMin / sleepMin) / 0.25 : 0);
  const score = Math.round(pDur + pEff + pLat + pAwk + pSn + pDeep);

  return {
    counts, inBed, sleepMin, score, eff, latency: onset, awakenings, awakeMin, deepMin, lightMin, snoreMin, snorePct, goal,
    onsetTs: n.start + onset * 60000, wakeTs: n.start + wake * 60000, depth, snoreIdx,
    restlessIdx: restless.map((r, i) => r ? i : -1).filter(i => i >= 0),
  };
}
function verdict(s) {
  if (s.noSleep) return 'No se detectó sueño';
  if (s.score >= 80) return 'Dormiste muy bien';
  if (s.score >= 65) return 'Buena noche';
  if (s.score >= 50) return 'Noche regular';
  return 'Noche difícil';
}

/* ---------- Consejos ---------- */
function tipsFor(n, history) {
  const s = n.summary, t = [], tags = n.tags || [];
  if (s.noSleep) return [{ h: 'No hubo suficiente silencio para detectar sueño', b: 'Revisa que el cel esté cerca y prueba bajar la sensibilidad en Ajustes si tu cuarto tiene ruido constante.' }];
  const h = s.sleepMin / 60, goal = s.goal || S.goal;
  if (h < goal - 0.75) {
    const wakeClock = new Date(s.wakeTs);
    const bed = new Date(wakeClock.getTime() - (goal * 60 + 15) * 60000);
    t.push({ h: `Te faltaron ${fmtDur((goal - h) * 60)} para tu meta`, b: `Si te levantas a la misma hora, intenta acostarte cerca de las ${fmtTime(bed)}. Contamos 15 min para quedarte dormido.` });
  }
  if (s.latency > 30) t.push({ h: `Tardaste ${fmtDur(s.latency)} en dormirte`, b: 'Deja el celular y las pantallas 30–60 min antes, baja las luces y si no te duermes en 20 min, levántate un rato y vuelve con sueño.' + (tags.includes('Café') ? ' Anotaste café: su efecto dura 6–8 horas.' : '') });
  if (s.snorePct > 0.15) t.push({ h: `Roncaste ${Math.round(s.snorePct * 100)}% de la noche`, b: 'Dormir de lado suele reducirlo; también ayuda evitar alcohol y cenas pesadas antes de dormir y mantener la nariz despejada.' + (tags.includes('Alcohol') ? ' Anotaste alcohol, que relaja la garganta y aumenta los ronquidos.' : '') });
  if (s.snorePct > 0.3 && history.filter(x => x.summary && x.summary.snorePct > 0.3).length >= 4) t.push({ h: 'Ronquidos fuertes varias noches', b: 'Si además te despiertas cansado o con dolor de cabeza, vale la pena comentarlo con un médico; a veces es apnea del sueño.' });
  if (s.awakenings >= 3 || (s.eff < 0.8 && s.inBed > 120)) t.push({ h: `Te despertaste ${s.awakenings} ${s.awakenings === 1 ? 'vez' : 'veces'}`, b: 'Un cuarto fresco (18–21 °C), oscuro y sin ruido ayuda a no interrumpir el sueño. Evita líquidos en la última hora.' + (tags.includes('Cuarto caliente') ? ' Anotaste que el cuarto estaba caliente.' : '') });
  if (s.counts.ruido >= 8) t.push({ h: 'Hubo bastante ruido', b: 'Prueba un sonido para dormir (ruido café o lluvia) o tapones para tapar los ruidos de afuera.' });
  if (s.counts.habla >= 2) t.push({ h: 'Hablaste dormido', b: 'Es común y casi siempre inofensivo; aumenta con estrés y falta de sueño. Escucha los audios abajo.' });
  if (s.counts.tos >= 6) t.push({ h: 'Tosiste varias veces', b: 'Si se repite varias noches, revisa alergias, polvo o aire seco en el cuarto.' });
  const recent = history.filter(x => x.summary && x.summary.onsetTs).slice(0, 7);
  if (recent.length >= 4) {
    const sd = clockStd(recent.map(x => x.summary.onsetTs));
    if (sd > 60) t.push({ h: 'Tu hora de dormir varía mucho', b: `Esta semana cambió ±${Math.round(sd)} min. Acostarte y levantarte a la misma hora, también el fin de semana, mejora la calidad.` });
  }
  if (s.deepMin && s.sleepMin && s.deepMin / s.sleepMin < 0.15 && s.sleepMin > 240) t.push({ h: 'Poco sueño profundo estimado', b: 'El ejercicio durante el día y no tomar alcohol en la noche suelen aumentar el sueño profundo.' });
  if (!t.length) t.push({ h: 'Buen trabajo', b: 'Duración, continuidad y tiempo para dormirte estuvieron bien. Mantén el mismo horario.' });
  return t;
}
function clockMin(ts) { const d = new Date(ts); let m = d.getHours() * 60 + d.getMinutes(); if (m < 12 * 60) m += 1440; return m; } // relativo al mediodía
function clockStd(arr) { const v = arr.map(clockMin); const mean = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length); }
function fmtClockMin(m) { m = Math.round(m) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

/* =========================================================
   GRÁFICAS
   ========================================================= */
function setupCanvas(cv, h) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.parentElement.clientWidth;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  return { g, w, h };
}
function drawNight(cv, n, compact) {
  const s = n.summary, depth = s.depth || [], Mn = depth.length;
  const H = compact ? 90 : 210;
  const { g, w, h } = setupCanvas(cv, H);
  const padL = compact ? 0 : 64, padB = compact ? 4 : 24, snoreH = compact ? 0 : 12;
  const top = 6, bottom = h - padB - snoreH - 4, cw = w - padL - 4;
  const css = getComputedStyle(document.documentElement);
  const col = k => css.getPropertyValue(k).trim();
  if (!compact) {
    g.font = '12px ' + col('--sans'); g.fillStyle = col('--mute'); g.textBaseline = 'middle';
    [['Despierto', 0.06], ['Ligero', 0.38], ['Profundo', 0.82]].forEach(([l, y]) => g.fillText(l, 0, top + y * (bottom - top)));
    g.strokeStyle = 'rgba(154,151,184,.14)'; g.lineWidth = 1;
    [0.15, 0.6].forEach(y => { const yy = Math.round(top + y * (bottom - top)) + .5; g.beginPath(); g.moveTo(padL, yy); g.lineTo(w, yy); g.stroke(); });
  }
  if (!Mn) return;
  const X = i => padL + (Mn === 1 ? cw / 2 : (i / (Mn - 1)) * cw);
  const Y = d => top + d * (bottom - top);
  // área
  const grad = g.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, 'rgba(168,155,224,.05)'); grad.addColorStop(1, 'rgba(120,179,166,.55)');
  g.beginPath(); g.moveTo(X(0), top);
  for (let i = 0; i < Mn; i++) {
    if (i === 0) g.lineTo(X(0), Y(depth[0]));
    else { const xm = (X(i - 1) + X(i)) / 2; g.bezierCurveTo(xm, Y(depth[i - 1]), xm, Y(depth[i]), X(i), Y(depth[i])); }
  }
  g.lineTo(X(Mn - 1), top); g.closePath(); g.fillStyle = grad; g.fill();
  // línea
  g.beginPath();
  for (let i = 0; i < Mn; i++) {
    if (i === 0) g.moveTo(X(0), Y(depth[0]));
    else { const xm = (X(i - 1) + X(i)) / 2; g.bezierCurveTo(xm, Y(depth[i - 1]), xm, Y(depth[i]), X(i), Y(depth[i])); }
  }
  g.strokeStyle = col('--teal'); g.lineWidth = compact ? 1.5 : 2; g.stroke();
  if (compact) return;
  // ronquidos
  g.fillStyle = col('--amber');
  const bw = Math.max(1.5, cw / Mn);
  (s.snoreIdx || []).forEach(i => g.fillRect(X(i) - bw / 2, bottom + 6, bw, snoreH - 2));
  // horas
  g.fillStyle = col('--mute'); g.font = '11px ' + col('--sans'); g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  const first = new Date(n.start); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
  const step = Mn > 600 ? 2 : 1;
  for (let t = first.getTime(); t < n.start + Mn * 60000; t += step * 3600e3) {
    const i = (t - n.start) / 60000;
    g.fillText(new Date(t).getHours() + 'h', X(i), h - 4);
  }
  g.textAlign = 'start';
}

function drawTrend(cv, nights, goal) {
  const { g, w, h } = setupCanvas(cv, 200);
  const css = getComputedStyle(document.documentElement), col = k => css.getPropertyValue(k).trim();
  const list = [...nights].reverse(), N = list.length;
  if (!N) return;
  const padL = 28, padB = 22, top = 10, bottom = h - padB, cw = w - padL - 6;
  const maxH = Math.max(10, goal + 2);
  const Y = hrs => bottom - (hrs / maxH) * (bottom - top);
  g.font = '11px ' + col('--sans'); g.fillStyle = col('--mute');
  [0, 4, 8].concat(maxH > 10 ? [12] : []).forEach(v => { if (v <= maxH) g.fillText(v + 'h', 0, Y(v) + 4); });
  const slot = cw / N, bw = Math.max(3, Math.min(26, slot * 0.6));
  list.forEach((n, i) => {
    const hrs = n.summary.sleepMin / 60, x = padL + slot * i + (slot - bw) / 2;
    g.fillStyle = hrs >= goal - 0.5 ? col('--teal') : 'rgba(120,179,166,.45)';
    const y = Y(hrs);
    g.beginPath(); g.roundRect ? g.roundRect(x, y, bw, bottom - y, [4, 4, 0, 0]) : g.rect(x, y, bw, bottom - y); g.fill();
    if (N <= 10) { g.fillStyle = col('--mute'); g.textAlign = 'center'; g.fillText(new Date(n.start - 6 * 3600e3).toLocaleDateString('es-GT', { weekday: 'narrow' }), x + bw / 2, h - 5); g.textAlign = 'start'; }
  });
  // meta
  g.setLineDash([4, 4]); g.strokeStyle = col('--amber'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(padL, Y(goal) + .5); g.lineTo(w, Y(goal) + .5); g.stroke(); g.setLineDash([]);
  // calidad
  g.strokeStyle = col('--lav'); g.lineWidth = 2; g.beginPath();
  list.forEach((n, i) => { const x = padL + slot * i + slot / 2, y = top + (1 - n.summary.score / 100) * (bottom - top); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = col('--lav');
  list.forEach((n, i) => { const x = padL + slot * i + slot / 2, y = top + (1 - n.summary.score / 100) * (bottom - top); g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); });
}

/* =========================================================
   PANTALLAS
   ========================================================= */
async function renderHome() {
  const hr = new Date().getHours();
  $('#greet').textContent = hr < 5 ? 'Buenas noches' : hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nights = await nightsSorted();
  const last = nights[0];
  const sub = $('#greet-sub'), box = $('#last'), list = $('#hist');
  if (!nights.length) {
    sub.textContent = 'Graba tu primera noche para ver cómo duermes.';
    box.innerHTML = '';
    list.innerHTML = '<li class="empty">Aquí aparecerán tus noches.</li>';
    return;
  }
  const wk = nights.slice(0, 7);
  sub.textContent = `Esta semana dormiste ${fmtDur(wk.reduce((a, n) => a + n.summary.sleepMin, 0) / wk.length)} en promedio.`;
  const s = last.summary;
  box.innerHTML = `<button class="lastnight" style="width:100%;text-align:left;color:inherit;display:block" data-open="${last.id}">
      <div class="row"><div><p class="muted small">${cap(nightLabel(last.start))}</p><p class="verdict">${verdict(s)}</p>
      <p class="muted small">${s.noSleep ? '' : fmtDur(s.sleepMin) + ' dormido'}</p></div>
      <div class="score">${s.score}<small>%</small></div></div>
      <canvas class="chart" id="mini" style="margin-top:14px"></canvas></button>`;
  drawNight($('#mini'), last, true);
  list.innerHTML = nights.map(n => `<li><button data-open="${n.id}"><span><b>${cap(nightLabel(n.start))}</b><br><span class="muted small">${fmtTime(n.start)} a ${fmtTime(n.end)}${n.summary.noSleep ? '' : '. ' + fmtDur(n.summary.sleepMin)}</span></span><span class="q">${n.summary.score}%</span></button></li>`).join('');
}
document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openDetail(b.dataset.open); });

let clipUrls = [];
async function openDetail(id) {
  clipUrls.forEach(u => URL.revokeObjectURL(u)); clipUrls = [];
  const n = await db.get('nights', id);
  if (!n) return show('v-home');
  if (!n.summary || !n.summary.depth) { n.summary = analyze(n); await db.put('nights', n); }
  const s = n.summary, history = await nightsSorted();
  const clips = (await db.clipsFor(id)).sort((a, b) => a.t - b.t);
  const moodTxt = ['', '😩 Cansado', '😐 Normal', '😊 Descansado'][n.mood || 0];
  const cnt = Object.entries(s.counts).filter(([, v]) => v).map(([k, v]) => `<span>${TYPE_LABEL[k]}: ${v}</span>`).join('');
  const al = n.alarm && n.alarm.rangAt ? `<p class="muted small" style="margin-top:6px">Alarma sonó a las ${fmtTime(n.alarm.rangAt)}${n.alarm.snoozes ? `, pospuesta ${n.alarm.snoozes} ${n.alarm.snoozes === 1 ? 'vez' : 'veces'}` : ''}.</p>` : '';
  const el = $('#detail');
  el.innerHTML = `
    <div class="topbar"><button class="link" data-back>← Inicio</button></div>
    <p class="muted">${cap(nightLabel(n.start))}</p>
    <div class="hero"><div class="score">${s.score}<small>%</small></div><p class="verdict">${verdict(s)}</p>${moodTxt ? `<p class="muted small">Te despertaste: ${moodTxt}</p>` : ''}${al}
    ${n.recovered ? '<p class="muted small">Esta noche se cerró sola porque la app se interrumpió.</p>' : ''}</div>
    <div class="graph"><canvas class="chart" id="big"></canvas>
      <div class="legend"><span><i style="background:var(--teal)"></i>Profundidad estimada</span><span><i style="background:var(--amber)"></i>Ronquidos</span></div></div>
    <div class="stats">
      <div><b>${s.onsetTs ? fmtTime(s.onsetTs) : '—'}</b><span>Te dormiste</span></div>
      <div><b>${s.wakeTs ? fmtTime(s.wakeTs) : '—'}</b><span>Despertaste</span></div>
      <div><b>${fmtDur(s.sleepMin)}</b><span>Dormido (meta ${s.goal || S.goal} h)</span></div>
      <div><b>${fmtDur(s.inBed)}</b><span>En cama</span></div>
      <div><b>${s.noSleep ? '—' : fmtDur(s.latency)}</b><span>Para quedarte dormido</span></div>
      <div><b>${Math.round((s.eff || 0) * 100)}%</b><span>Eficiencia</span></div>
      <div><b>${fmtDur(s.deepMin || 0)}</b><span>Sueño profundo</span></div>
      <div><b>${fmtDur(s.lightMin || 0)}</b><span>Sueño ligero</span></div>
      <div><b>${fmtDur(s.snoreMin || 0)}</b><span>Roncando (${Math.round((s.snorePct || 0) * 100)}%)</span></div>
      <div><b>${s.awakenings || 0}</b><span>Despertares</span></div>
    </div>
    ${cnt ? `<h3>Lo que se escuchó</h3><div class="counts">${cnt}</div>` : ''}
    ${(n.tags || []).length ? `<div class="section"><h3>Notas</h3><div class="chips">${n.tags.map(t => `<span class="chip" aria-pressed="true">${t}</span>`).join('')}</div></div>` : ''}
    <div class="section"><h2>Consejos</h2><ul class="tips">${tipsFor(n, history).map(t => `<li><b>${t.h}</b>${t.b}</li>`).join('')}</ul></div>
    <div class="section"><h2>Audios de la noche</h2>
      ${clips.length ? `<ul class="clips">${clips.map(c => { const u = URL.createObjectURL(c.blob); clipUrls.push(u); return `<li><b>${TYPE_LABEL[c.kind] || 'Sonido'}</b> <span class="muted small">${fmtTime(c.t)}</span><audio controls preload="none" src="${u}"></audio></li>`; }).join('')}</ul>`
      : '<p class="empty">No se guardaron audios. Se graban automáticamente cuando hay ronquidos, hablas dormido, toses o hay ruidos fuertes.</p>'}
    </div>
    <div class="section"><button class="btn btn-danger" id="del-night">Borrar esta noche</button></div>`;
  show('v-detail');
  requestAnimationFrame(() => drawNight($('#big'), n, false));
  $('#del-night').onclick = async () => {
    if (!confirm('¿Borrar esta noche y sus audios?')) return;
    await deleteNight(id); toast('Noche borrada'); show('v-home');
  };
}

/* ---------- Tendencias ---------- */
let trendRange = 7;
$$('.seg button').forEach(b => b.onclick = () => {
  trendRange = +b.dataset.r;
  $$('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  renderTrends();
});
async function renderTrends() {
  const all = (await nightsSorted()).filter(n => !n.summary.noSleep);
  const nights = trendRange ? all.slice(0, trendRange) : all;
  const el = $('#trends');
  if (nights.length < 2) { el.innerHTML = '<p class="empty">Necesitas al menos 2 noches grabadas para ver tendencias.</p>'; return; }
  const avg = f => nights.reduce((a, n) => a + f(n), 0) / nights.length;
  const onsets = nights.filter(n => n.summary.onsetTs).map(n => n.summary.onsetTs);
  const wakes = nights.map(n => n.summary.wakeTs);
  const meanClock = arr => arr.map(clockMin).reduce((a, b) => a + b, 0) / arr.length;
  const sd = onsets.length >= 2 ? clockStd(onsets) : 0;
  const goal = S.goal;
  const debt = nights.reduce((a, n) => a + Math.max(0, goal * 60 - n.summary.sleepMin), 0);

  // Impacto de las notas
  const base = avg(n => n.summary.score);
  const impact = [];
  const tagSet = [...new Set(nights.flatMap(n => n.tags || []))];
  for (const t of tagSet) {
    const w = nights.filter(n => (n.tags || []).includes(t)), wo = nights.filter(n => !(n.tags || []).includes(t));
    if (w.length < 2 || wo.length < 1) continue;
    const a = w.reduce((x, n) => x + n.summary.score, 0) / w.length, b = wo.reduce((x, n) => x + n.summary.score, 0) / wo.length;
    impact.push({ t, d: a - b, n: w.length });
  }
  impact.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  // Ánimo
  const moods = [1, 2, 3].map(m => { const l = nights.filter(n => n.mood === m); return l.length ? { m, q: l.reduce((a, n) => a + n.summary.score, 0) / l.length, h: l.reduce((a, n) => a + n.summary.sleepMin, 0) / l.length / 60, c: l.length } : null; }).filter(Boolean);

  el.innerHTML = `
    <div class="graph"><canvas class="chart" id="trend"></canvas>
      <div class="legend"><span><i style="background:var(--teal)"></i>Horas dormidas</span><span><i style="background:var(--lav)"></i>Calidad</span><span><i style="background:var(--amber)"></i>Meta ${goal} h</span></div></div>
    <div class="stats">
      <div><b>${fmtDur(avg(n => n.summary.sleepMin))}</b><span>Dormido en promedio</span></div>
      <div><b>${Math.round(base)}%</b><span>Calidad promedio</span></div>
      <div><b>${onsets.length ? fmtClockMin(meanClock(onsets)) : '—'}</b><span>Te duermes en promedio</span></div>
      <div><b>${fmtClockMin(meanClock(wakes))}</b><span>Despiertas en promedio</span></div>
      <div><b>±${Math.round(sd)} min</b><span>Regularidad del horario</span></div>
      <div><b>${fmtDur(debt)}</b><span>Deuda de sueño acumulada</span></div>
      <div><b>${Math.round(avg(n => n.summary.snorePct || 0) * 100)}%</b><span>Ronquido promedio</span></div>
      <div><b>${avg(n => n.summary.awakenings || 0).toFixed(1)}</b><span>Despertares por noche</span></div>
    </div>
    <div class="section"><h2>Qué afecta tu sueño</h2>
      ${impact.length ? `<ul class="impact">${impact.map(i => `<li><span>${i.t} <span class="muted small">(${i.n} noches)</span></span><span class="${i.d >= 0 ? 'up' : 'down'}">${i.d >= 0 ? '+' : '−'}${Math.abs(Math.round(i.d))}% calidad</span></li>`).join('')}</ul>`
      : '<p class="empty">Marca notas antes de dormir (café, ejercicio, estrés…). Con 2 noches por nota verás cómo te afectan.</p>'}
    </div>
    ${moods.length ? `<div class="section"><h2>Cómo te sentiste</h2><ul class="impact">${moods.map(m => `<li><span>${['', '😩 Cansado', '😐 Normal', '😊 Descansado'][m.m]} <span class="muted small">(${m.c})</span></span><span>${Math.round(m.q)}%, ${m.h.toFixed(1)} h</span></li>`).join('')}</ul></div>` : ''}
    <p class="muted small" style="margin-top:20px">Una deuda de sueño grande no se paga en una sola noche; mejor 30–60 min extra varios días seguidos.</p>`;
  requestAnimationFrame(() => drawTrend($('#trend'), nights, goal));
}

/* ---------- Preparar la noche ---------- */
function selectedTags() { return $$('#tags .chip').filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.textContent); }
function renderSetup() {
  $('#a-on').checked = S.alarmOn; $('#a-time').value = S.wake; $('#a-win').value = String(S.win);
  $('#aid').value = S.aid; $('#aid-min').value = String(S.aidMin); $('#aid-vol').value = S.aidVol;
  $('#tags').innerHTML = TAGS.map(t => `<button class="chip" type="button" aria-pressed="false">${t}</button>`).join('');
  $('#a-opts').style.opacity = S.alarmOn ? 1 : .4;
  updateBedHint();
}
function updateBedHint() {
  const on = $('#a-on').checked, el = $('#bed-hint');
  if (!on) { el.textContent = `Tu meta es dormir ${S.goal} horas.`; return; }
  const [h, m] = ($('#a-time').value || S.wake).split(':').map(Number);
  const total = h * 60 + m - S.goal * 60 - 15;
  el.textContent = `Para dormir ${S.goal} h y despertar a las ${$('#a-time').value}, lo ideal es acostarte a las ${fmtClockMin((total + 2880) % 1440)}.`;
}
$('#tags').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); });
$('#a-on').onchange = () => { $('#a-opts').style.opacity = $('#a-on').checked ? 1 : .4; updateBedHint(); };
$('#a-time').oninput = updateBedHint;
$('#go-setup').onclick = () => { renderSetup(); show('v-setup'); };
$('#start').onclick = startNight;

/* ---------- Ajustes ---------- */
function renderSettings() { $('#s-goal').value = S.goal; $('#s-sens').value = S.sens; }
$('#s-goal').onchange = e => { const v = clamp(+e.target.value || 8, 5, 11); S.goal = v; e.target.value = v; saveSettings(); toast('Meta guardada'); };
$('#s-sens').onchange = e => { S.sens = e.target.value; saveSettings(); toast('Sensibilidad guardada'); };

let test = null;
$('#test-btn').onclick = async () => {
  if (test) { stopTest(); return; }
  try { test = await openMic(); } catch (e) { toast('Necesito permiso del micrófono.'); return; }
  test.D = newDetector();
  $('#test-btn').textContent = 'Detener prueba';
  $('#test-out').textContent = 'Calibrando, quédate en silencio 3 segundos…';
  test.iv = setInterval(() => {
    const f = readFrame(test);
    detect(test.D, f, Date.now(), SENS[S.sens], e => {
      const ty = e.type === 'posible' ? 'Sonido corto (si se repite cada pocos segundos será ronquido)' : TYPE_LABEL[e.type];
      $('#test-out').textContent = `Detectado: ${ty}, ${e.d} s`;
    });
    if (test.D.base !== null) {
      $('#meter').style.width = clamp((f.db - test.D.base) / 30) * 100 + '%';
      if ($('#test-out').textContent.startsWith('Calibrando')) $('#test-out').textContent = 'Listo. Haz un sonido.';
    }
  }, 100);
};
function stopTest() {
  if (!test) return;
  clearInterval(test.iv);
  test.stream.getTracks().forEach(t => t.stop());
  test.ctx.close();
  test = null;
  $('#test-btn').textContent = 'Empezar prueba';
  $('#meter').style.width = '0';
}
$$('#nav button').forEach(b => b.addEventListener('click', stopTest));

$('#exp').onclick = async () => {
  const nights = await db.all('nights');
  const blob = new Blob([JSON.stringify({ app: 'sueno', v: 1, settings: S, nights }, null, 0)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sueno-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Respaldo exportado (sin audios)');
};
$('#imp').onclick = () => $('#imp-file').click();
$('#imp-file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'sueno' || !Array.isArray(data.nights)) throw new Error();
    for (const n of data.nights) await db.put('nights', n);
    toast(`Importadas ${data.nights.length} noches`);
  } catch (err) { toast('Ese archivo no es un respaldo de Sueño.'); }
  e.target.value = '';
};
$('#wipe').onclick = async () => {
  if (!confirm('¿Borrar todas las noches y audios? No se puede deshacer.')) return;
  await db.clear('nights'); await db.clear('clips'); toast('Datos borrados');
};

/* ---------- Recuperar noches interrumpidas ---------- */
async function recover() {
  const open = (await db.all('nights')).filter(n => n.status === 'recording');
  for (const n of open) {
    if (n.minutes.length < 5) { await deleteNight(n.id); continue; }
    n.end = n.start + n.minutes.length * 60000;
    n.status = 'done'; n.recovered = true;
    n.summary = analyze(n);
    await db.put('nights', n);
  }
}

/* ---------- Avisar si se intenta salir grabando ---------- */
window.addEventListener('beforeunload', e => { if (sess) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Arranque ---------- */
(async () => {
  if (!navigator.mediaDevices || !window.indexedDB) toast('Este navegador no es compatible. Usa Chrome en Android.');
  try { await recover(); } catch (e) {}
  renderHome();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
let lastW = innerWidth;
window.addEventListener('resize', () => { if (Math.abs(innerWidth - lastW) < 20) return; lastW = innerWidth; if (current === 'v-home') renderHome(); });
