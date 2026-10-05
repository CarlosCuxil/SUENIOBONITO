'use strict';
/* Análisis de la noche: fases, calificación, consejos */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const pad2 = n => String(n).padStart(2, '0');
const fmtTime = ts => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
function fmtDur(min) { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${pad2(m)} min` : `${m} min`; }
function fmtDurShort(min) { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${pad2(m)}` : `${m} min`; }
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function nightDate(ts) { return new Date(ts - 6 * 3600e3); } // una noche que empieza a la 1 a. m. cuenta para el día anterior
function nightKey(ts) { const d = nightDate(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function nightLabel(ts) { const d = nightDate(ts); return `${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}`; }
function clockMin(ts) { const d = new Date(ts); let m = d.getHours() * 60 + d.getMinutes(); if (m < 12 * 60) m += 1440; return m; }
function clockMean(arr) { return arr.map(clockMin).reduce((a, b) => a + b, 0) / arr.length; }
function clockStd(arr) { const v = arr.map(clockMin); const mean = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length); }
function fmtClockMin(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; }

const TYPE_LABEL = { ronquido: 'Ronquidos', habla: 'Hablaste dormido', tos: 'Tos', movimiento: 'Movimientos', ruido: 'Ruidos' };
const TYPE_ICON = { ronquido: 'snore', habla: 'talk', tos: 'cough', movimiento: 'turn', ruido: 'volume' };
const TYPE_COLOR = { ronquido: '#E6A85C', habla: '#A89BE0', tos: '#D98C8C', movimiento: '#9A97B8', ruido: '#9A97B8' };

function analyze(n, defGoal = 8) {
  const Mn = (n.minutes || []).length;
  const counts = { ronquido: 0, habla: 0, tos: 0, movimiento: 0, ruido: 0 };
  const goal = n.goal || defGoal;
  if (!Mn) return { empty: true, noSleep: true, counts, score: 0, inBed: 0, sleepMin: 0, goal, depth: [], marks: [] };
  const act = new Array(Mn).fill(0), sn = new Array(Mn).fill(0);
  const marks = [];
  // Modo colchón: segundos con movimiento en cada minuto
  n.minutes.forEach((m, i) => { if (Array.isArray(m) && m.length > 2 && m[2] > 0) act[i] += Math.min(3, m[2] / 4); });
  for (const e of n.events || []) {
    const i = Math.floor((e.t - n.start) / 60000);
    const ty = e.type === 'posible' ? 'movimiento' : e.type;
    counts[ty] = (counts[ty] || 0) + 1;
    if (i < 0 || i >= Mn) continue;
    if (ty === 'ronquido') sn[i]++;
    else act[i] += ty === 'movimiento' ? 1 : 1.5;
    if (ty === 'habla' || ty === 'tos') marks.push({ i, type: ty });
  }
  const restless = act.map(a => a >= 2);
  const QW = n.nap ? 5 : 15;
  let quiet = -1;
  for (let i = 0; i + QW <= Mn; i++) {
    let ok = true;
    for (let j = i; j < i + QW; j++) if (restless[j]) { ok = false; break; }
    if (ok) { quiet = i; break; }
  }
  if (quiet < 0 && Mn < QW && !restless.some(Boolean)) quiet = 0;
  // Posibles pausas: silencio de 10 a 60 s en medio de ronquidos seguidos
  const sev = (n.events || []).filter(e => e.type === 'ronquido').sort((a, b) => a.t - b.t);
  const pauseIdx = [];
  for (let k = 2; k < sev.length - 1; k++) {
    const gap = sev[k].t - sev[k - 1].t;
    if (gap >= 10000 && gap <= 60000 && sev[k - 1].t - sev[k - 2].t < 9000 && sev[k + 1].t - sev[k].t < 9000) {
      const i = Math.floor((sev[k - 1].t - n.start) / 60000);
      if (i >= 0 && i < Mn) { pauseIdx.push(i); marks.push({ i, type: 'pausa' }); }
    }
  }
  // Anti-ronquido: ¿dejaste de roncar después del aviso?
  const nudges = n.nudges || [];
  const nudgeOk = nudges.filter(t => !sev.some(e => e.t > t + 5000 && e.t < t + 120000)).length;
  const firstSnore = sn.findIndex(x => x >= 2);
  const cands = [quiet, firstSnore].filter(x => x >= 0);
  const onset = cands.length ? Math.min(...cands) : -1;
  const hourly = Mn / 60 || 1;
  const noise = counts.ruido / hourly < 1 ? 'Tranquilo' : counts.ruido / hourly < 4 ? 'Algo de ruido' : 'Ruidoso';
  if (onset < 0) {
    return { noSleep: true, counts, inBed: Mn, sleepMin: 0, score: 0, onsetTs: null, wakeTs: n.start + Mn * 60000, depth: new Array(Mn).fill(0), snoreIdx: [], marks, latency: Mn, awakenings: 0, awakeMin: Mn, eff: 0, deepMin: 0, lightMin: 0, snoreMin: 0, snorePct: 0, goal, noise, pauses: 0, pph: 0, pauseIdx: [], nudges: nudges.length, nudgeOk };
  }
  let wake = Mn;
  while (wake - 1 > onset && restless[wake - 1]) wake--;
  let awakeMin = 0, awakenings = 0, run = 0;
  for (let i = onset; i < wake; i++) {
    if (restless[i]) run++;
    else { if (run >= 3) { awakenings++; awakeMin += run; } run = 0; }
  }
  if (run >= 3) { awakenings++; awakeMin += run; }
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
  const inBed = Mn, eff = inBed ? sleepMin / inBed : 0, h = sleepMin / 60;
  const snorePct = sleepMin ? snoreMin / sleepMin : 0;
  const pDur = (n.nap ? 0 : 35) * clamp(1 - Math.max(0, (goal - 0.5) - h, h - (goal + 1.5)) / 3);
  const pEff = 25 * clamp((eff - 0.65) / 0.27);
  const pLat = 10 * clamp(1 - (onset - 20) / 40);
  const pAwk = 10 * clamp(1 - awakenings / 4);
  const pSn = 10 * clamp(1 - snorePct / 0.35);
  const pDeep = 10 * clamp(sleepMin ? (deepMin / sleepMin) / 0.25 : 0);
  let score = Math.round(pDur + pEff + pLat + pAwk + pSn + pDeep);
  if (n.nap) score = Math.round(score / 65 * 100);
  return {
    counts, inBed, sleepMin, score, eff, latency: onset, awakenings, awakeMin: inBed - sleepMin, deepMin, lightMin, snoreMin, snorePct, goal, noise,
    onsetTs: n.start + onset * 60000, wakeTs: n.start + wake * 60000, depth, snoreIdx, marks,
    pauses: pauseIdx.length, pph: sleepMin ? pauseIdx.length / (sleepMin / 60) : 0, pauseIdx, nudges: nudges.length, nudgeOk,
  };
}

function verdict(s, nap) {
  if (!s || s.noSleep) return 'No se detectó sueño';
  if (nap) return s.score >= 70 ? 'Buena siesta' : 'Siesta ligera';
  if (s.score >= 80) return 'Dormiste muy bien';
  if (s.score >= 65) return 'Buena noche';
  if (s.score >= 50) return 'Noche regular';
  return 'Noche difícil';
}
function scoreColor(v) { return v >= 85 ? '#78B3A6' : v >= 70 ? 'rgba(120,179,166,.6)' : v >= 55 ? '#A89BE0' : '#D98C8C'; }
function phaseAt(d) { return d >= 0.6 ? 'Sueño profundo' : d >= 0.15 ? 'Sueño ligero' : 'Despierto'; }

/* Diferencia de una nota sobre la calidad y el tiempo para dormirte */
function tagImpact(nights, tag) {
  const w = nights.filter(n => (n.tags || []).includes(tag)), wo = nights.filter(n => !(n.tags || []).includes(tag));
  if (w.length < 2 || wo.length < 1) return null;
  const avg = (l, f) => l.reduce((a, n) => a + f(n), 0) / l.length;
  return {
    tag, n: w.length,
    d: avg(w, n => n.summary.score) - avg(wo, n => n.summary.score),
    lat: avg(w, n => n.summary.latency || 0) - avg(wo, n => n.summary.latency || 0),
    snore: avg(w, n => n.summary.snorePct || 0) - avg(wo, n => n.summary.snorePct || 0),
  };
}

function tipsFor(n, history) {
  const s = n.summary, t = [], tags = n.tags || [];
  const good = history.filter(x => x.summary && !x.summary.noSleep);
  if (s.noSleep) return [{ i: 'mic', c: '#A89BE0', h: 'No hubo suficiente silencio para detectar sueño', b: 'Revisa que el cel esté cerca de tu cabeza. Si tu cuarto tiene ruido constante, baja la sensibilidad en Ajustes.' }];
  if (n.nap) {
    const m = s.inBed;
    return [m <= 30 ? { i: 'sparkles', c: '#78B3A6', h: 'Siesta corta, bien hecho', b: 'Hasta 30 minutos recarga energía sin dejarte atontado ni quitarte el sueño de la noche.' }
      : { i: 'clock', c: '#A89BE0', h: 'Siesta larga', b: 'Las siestas de más de 30 minutos pueden dejarte pesado y hacer que te cueste dormir en la noche. Mejor antes de las 3 p. m.' }];
  }
  const h = s.sleepMin / 60, goal = s.goal || 8;
  if (h < goal - 0.75) {
    const bed = new Date(s.wakeTs - (goal * 60 + 15) * 60000);
    t.push({ i: 'clock', c: '#A89BE0', h: `Te faltaron ${fmtDur((goal - h) * 60)} para tu meta`, b: `Si te levantas a la misma hora, intenta acostarte cerca de las ${fmtTime(bed)}.` });
  }
  if (s.latency > 30) {
    const coffee = tagImpact(good, 'Café');
    let extra = '';
    if (tags.includes('Café') && coffee && coffee.lat > 5) extra = ` En noches con café tardas ${Math.round(coffee.lat)} min más en dormirte.`;
    else if (tags.includes('Café')) extra = ' Anotaste café: su efecto dura 6 a 8 horas.';
    t.push({ i: 'coffee', c: '#A89BE0', h: `Tardaste ${fmtDur(s.latency)} en dormirte`, b: 'Deja las pantallas 30 a 60 min antes y baja las luces. Si no te duermes en 20 min, levántate un rato.' + extra });
  }
  if (s.snorePct > 0.1) t.push({ i: 'wine', c: '#E6A85C', h: `Roncaste ${Math.round(s.snorePct * 100)}% de la noche`, b: 'Dormir de lado suele reducirlo. También ayuda evitar alcohol y cenas pesadas antes de dormir.' + (tags.includes('Alcohol') ? ' Anotaste alcohol, que relaja la garganta y aumenta los ronquidos.' : '') });
  if (s.snorePct > 0.3 && good.filter(x => x.summary.snorePct > 0.3).length >= 4) t.push({ i: 'shield', c: '#D98C8C', h: 'Ronquidos fuertes varias noches', b: 'Si además te despiertas cansado o con dolor de cabeza, coméntalo con un médico; a veces es apnea del sueño.' });
  if (s.pph >= 5 && s.pauses >= 5) t.push({ i: 'lungs', c: '#D98C8C', h: `${s.pauses} posibles pausas al respirar`, b: 'Hubo silencios largos en medio de tus ronquidos. No es un diagnóstico, pero si pasa varias noches y te despiertas cansado, coméntalo con un médico.' });
  if (n.caffeine >= 50) t.push({ i: 'coffee', c: '#E6A85C', h: `Te acostaste con ${Math.round(n.caffeine)} mg de cafeína`, b: 'Más de 50 mg al dormir suele hacer el sueño más ligero. Revisa en Cafeína a qué hora te conviene el último café.' });
  if (s.awakenings >= 3) t.push({ i: 'turn', c: '#D98C8C', h: `Te despertaste ${s.awakenings} veces`, b: 'Un cuarto fresco, oscuro y sin ruido ayuda a no interrumpir el sueño. Evita líquidos en la última hora.' });
  if (s.counts.ruido >= 8) t.push({ i: 'rain', c: '#A89BE0', h: 'Hubo bastante ruido', b: 'Prueba un sonido para dormir como lluvia o ventilador para tapar los ruidos de afuera.' });
  if (s.counts.habla >= 2) t.push({ i: 'talk', c: '#A89BE0', h: 'Hablaste dormido', b: 'Es común y casi siempre inofensivo; aumenta con estrés y falta de sueño. Escucha los audios abajo.' });
  if (s.counts.tos >= 6) t.push({ i: 'cough', c: '#D98C8C', h: 'Tosiste varias veces', b: 'Si se repite, revisa alergias, polvo o aire seco en el cuarto.' });
  const recent = good.filter(x => x.summary.onsetTs).slice(0, 7);
  if (recent.length >= 4) {
    const sd = clockStd(recent.map(x => x.summary.onsetTs));
    if (sd > 60) t.push({ i: 'target', c: '#78B3A6', h: 'Tu hora de dormir varía mucho', b: `Esta semana cambió ±${Math.round(sd)} min. Acostarte a la misma hora mejora la calidad.` });
    else if (sd < 30) t.push({ i: 'flag', c: '#78B3A6', h: 'Vas muy bien con tu horario', b: `Te has dormido casi a la misma hora en tus últimas ${recent.length} noches.` });
  }
  if (s.sleepMin > 240 && s.deepMin / s.sleepMin < 0.15) t.push({ i: 'dumbbell', c: '#78B3A6', h: 'Poco sueño profundo estimado', b: 'Hacer ejercicio de día y no tomar alcohol en la noche suele aumentar el sueño profundo.' });
  if (!t.length) t.push({ i: 'sparkles', c: '#78B3A6', h: 'Buen trabajo', b: 'Duración, continuidad y tiempo para dormirte estuvieron bien. Mantén el mismo horario.' });
  return t.slice(0, 5);
}

/* Noches seguidas grabadas */
function streak(nights) {
  const keys = new Set(nights.map(n => nightKey(n.start)));
  let d = nightDate(Date.now()); let c = 0;
  const k = x => `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  if (!keys.has(k(d))) d.setDate(d.getDate() - 1);
  while (keys.has(k(d))) { c++; d.setDate(d.getDate() - 1); }
  return c;
}
function debt(nights, goal) {
  const since = Date.now() - 7 * 86400e3;
  return nights.filter(n => n.start >= since && !n.summary.noSleep).reduce((a, n) => a + Math.max(0, goal * 60 - n.summary.sleepMin), 0);
}

/* ---------- Cafeína ---------- */
const CAF = [['cafe', 'Café', 95, 'coffee'], ['espresso', 'Espresso', 63, 'coffee'], ['te', 'Té', 40, 'leaf'], ['cola', 'Refresco de cola', 35, 'cup'], ['energetica', 'Bebida energética', 80, 'zap'], ['chocolate', 'Chocolate', 20, 'cup']];
const HALF = 5 * 3600e3;
function caffeineAt(log, ts) { return (log || []).reduce((a, d) => d.t <= ts ? a + d.mg * Math.pow(.5, (ts - d.t) / HALF) : a, 0); }
function lastCoffeeTime(bedTs, log, mg = 95, limit = 50) {
  // A qué hora tomar el último café para llegar a la cama con menos de "limit"
  const base = caffeineAt(log, bedTs);
  const room = limit - base;
  if (room <= 0) return null;
  const hrs = 5 * Math.log2(mg / room);
  return bedTs - Math.max(0, hrs) * 3600e3;
}

/* ---------- Cronotipo ---------- */
function midSleep(n) { const o = clockMin(n.summary.onsetTs); let w = clockMin(n.summary.wakeTs); if (w < o) w += 1440; return (o + w) / 2; }
function chronotype(list, goal) {
  const ok = list.filter(n => !n.nap && n.summary.onsetTs && !n.summary.noSleep);
  if (ok.length < 5) return null;
  const avg = l => l.reduce((a, n) => a + midSleep(n), 0) / l.length;
  const free = ok.filter(n => [5, 6].includes(nightDate(n.start).getDay()));
  const work = ok.filter(n => ![5, 6].includes(nightDate(n.start).getDay()));
  const all = avg(ok), msf = free.length ? avg(free) : all, msw = work.length ? avg(work) : all;
  const mid = (msf - 1440 + 1440) % 1440;
  const type = mid < 180 ? 'alondra' : mid < 270 ? 'intermedio' : 'buho';
  return { type, mid: msf, midWork: msw, sjl: Math.abs(msf - msw), freeN: free.length, workN: work.length, bed: msf - goal * 30, wake: msf + goal * 30, n: ok.length };
}

/* ---------- Logros ---------- */
function maxStreak(list) {
  const keys = [...new Set(list.map(n => nightKey(n.start)))].sort();
  let best = 0, cur = 0, prev = null;
  for (const k of keys) {
    const d = new Date(k + 'T12:00:00');
    if (prev && (d - prev) / 86400e3 < 1.5) cur++; else cur = 1;
    best = Math.max(best, cur); prev = d;
  }
  return best;
}
function goalStreak(list, goal) {
  const ok = new Set(list.filter(n => n.summary.sleepMin >= goal * 60 - 30).map(n => nightKey(n.start)));
  return maxStreak(list.filter(n => ok.has(nightKey(n.start))));
}
function badgeList(list, naps, S) {
  const good = list.filter(n => !n.summary.noSleep);
  const ms = maxStreak(list);
  const P = (cur, goal) => [Math.min(cur, goal), goal];
  return [
    { id: 'primera', name: 'Primera noche', desc: 'Graba tu primera noche', icon: 'moon', prog: P(list.length, 1) },
    { id: 'racha3', name: 'Constante', desc: '3 noches seguidas', icon: 'flame', prog: P(ms, 3) },
    { id: 'racha7', name: 'Semana completa', desc: '7 noches seguidas', icon: 'flame', prog: P(ms, 7) },
    { id: 'racha30', name: 'Imparable', desc: '30 noches seguidas', icon: 'trophy', prog: P(ms, 30) },
    { id: 'meta5', name: 'En la meta', desc: 'Cumple tu meta de horas 5 noches', icon: 'target', prog: P(good.filter(n => n.summary.sleepMin >= S.goal * 60 - 30).length, 5) },
    { id: 'semanaperfecta', name: 'Semana perfecta', desc: '7 noches seguidas cumpliendo tu meta', icon: 'sparkles', prog: P(goalStreak(good, S.goal), 7) },
    { id: 'calidad90', name: 'Sueño de oro', desc: 'Una noche con 90% o más', icon: 'medal', prog: P(good.some(n => n.summary.score >= 90) ? 1 : 0, 1) },
    { id: 'madrugador', name: 'Madrugador', desc: 'Despierta antes de las 6:00 cinco veces', icon: 'sun', prog: P(good.filter(n => new Date(n.summary.wakeTs).getHours() < 6).length, 5) },
    { id: 'silencio', name: 'Silencioso', desc: '3 noches casi sin ronquidos', icon: 'volume', prog: P(good.filter(n => n.summary.sleepMin > 240 && n.summary.snorePct < .05).length, 3) },
    { id: 'zen', name: 'Zen', desc: '10 sesiones de respiración', icon: 'lungs', prog: P(S.breathCount || 0, 10) },
    { id: 'cafeina', name: 'Café a tiempo', desc: '5 noches con menos de 50 mg de cafeína al dormir', icon: 'coffee', prog: P(good.filter(n => n.caffeine != null && n.caffeine < 50).length, 5) },
    { id: 'siesta', name: 'Rey de la siesta', desc: '5 siestas grabadas', icon: 'bed', prog: P(naps.length, 5) },
    { id: 'soñador', name: 'Soñador', desc: 'Anota 5 sueños', icon: 'book', prog: P(list.concat(naps).filter(n => n.dream && n.dream.trim()).length, 5) },
    { id: 'plan', name: 'Horario nuevo', desc: 'Termina un plan de 2 semanas', icon: 'flag', prog: P(S.planDone ? 1 : 0, 1) },
  ].map(b => ({ ...b, done: b.prog[0] >= b.prog[1] }));
}
