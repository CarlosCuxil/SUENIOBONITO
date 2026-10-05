'use strict';
/* =========================================================
   Funciones pro: misión, anti-ronquido, clima, siesta, cafeína,
   plan, logros, cronotipo, amanecer y reporte PDF
   ========================================================= */
const MISSIONS = { ninguna: 'Ninguna', matematicas: 'Resolver 3 operaciones', agitar: 'Agitar el cel 30 veces' };
const ANTI = { off: 'Apagado', sonido: 'Sonido suave', vibracion: 'Vibración' };
const DEFAULT_CITY = { name: 'Ciudad de Guatemala', lat: 14.6349, lon: -90.5069 };

function missionSheet(done) {
  openSheet(`<h2>Misión para apagar la alarma</h2><p class="mute sm">Para que no la apagues dormido.</p>
    <div class="lst" style="margin-top:8px">${[['ninguna', 'x', 'Ninguna', 'Solo deslizar para despertar'], ['matematicas', 'hash', 'Matemáticas', 'Resuelve 3 operaciones sencillas'], ['agitar', 'vibrate', 'Agitar el cel', 'Agítalo 30 veces']]
      .map(([k, i, l, d]) => `<button class="it" data-mi="${k}">${ic(i, 20, 'style="color:#E6A85C"')}<div style="flex:1"><b class="sm">${l}</b><p class="mute xs">${d}</p></div>${S.mission === k ? `<span style="color:#78B3A6">${ic('check', 20)}</span>` : ''}</button>`).join('')}</div>`, sh => {
    $$('[data-mi]', sh).forEach(b => b.onclick = () => { S.mission = b.dataset.mi; saveS(); closeSheet(); });
  }, done);
}
function antiSnoreSheet(done) {
  openSheet(`<h2>Anti-ronquido</h2><p class="mute sm">Cuando roncas seguido, te da un aviso suave para que cambies de posición sin despertarte. Máximo 3 avisos por episodio.</p>
    <div class="lst" style="margin-top:8px">${[['off', 'x', 'Apagado', ''], ['sonido', 'volume', 'Sonido suave', 'Tres tonos graves y bajitos'], ['vibracion', 'vibrate', 'Vibración', 'Pon el cel debajo de la almohada']]
      .map(([k, i, l, d]) => `<button class="it" data-an="${k}">${ic(i, 20, 'style="color:#E6A85C"')}<div style="flex:1"><b class="sm">${l}</b>${d ? `<p class="mute xs">${d}</p>` : ''}</div>${S.antiSnore === k ? `<span style="color:#78B3A6">${ic('check', 20)}</span>` : ''}</button>`).join('')}</div>
    <p class="sm b" style="margin:16px 0 8px">Intensidad del sonido</p><input type="range" id="an-l" min="0" max="1" step="0.1" value="${S.antiSnoreLevel}">`, sh => {
    $$('[data-an]', sh).forEach(b => b.onclick = () => { S.antiSnore = b.dataset.an; saveS(); closeSheet(); });
    $('#an-l', sh).onchange = e => { S.antiSnoreLevel = +e.target.value; saveS(); };
  }, done);
}

/* ---------- Después de cada noche ---------- */
function afterNight(n) {
  if (!n) return;
  fetchWeather(n).catch(() => {});
  checkBadges();
}
function checkBadges() {
  const list = badgeList(nights(), naps(), S);
  const had = new Set(S.badges || []);
  const fresh = list.filter(b => b.done && !had.has(b.id));
  if (!fresh.length) return;
  S.badges = list.filter(b => b.done).map(b => b.id); saveS();
  setTimeout(() => { toast(`🏆 Logro desbloqueado: ${fresh[0].name}`); N.vibrate(80); }, 1200);
}

/* ---------- Clima ---------- */
async function fetchWeather(n) {
  if (!n || n.weather || !n.end) return;
  if (Date.now() - n.end > 85 * 86400e3) return;
  const c = S.city || DEFAULT_CITY;
  const ymd = ts => new Date(ts).toISOString().slice(0, 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&hourly=temperature_2m,relative_humidity_2m,surface_pressure,precipitation&timezone=GMT&start_date=${ymd(n.start)}&end_date=${ymd(n.end)}`;
  const r = await fetch(url);
  if (!r.ok) return;
  const j = await r.json(), h = j.hourly || {};
  let k = 0, t = 0, hu = 0, pr = 0, rain = 0;
  (h.time || []).forEach((tm, i) => {
    const ts = Date.parse(tm + 'Z');
    if (ts >= n.start - 1800e3 && ts <= n.end + 1800e3) { k++; t += h.temperature_2m[i]; hu += h.relative_humidity_2m[i]; pr += h.surface_pressure[i]; rain += h.precipitation[i] || 0; }
  });
  if (!k) return;
  const n2 = getNight(n.id); if (!n2) return;
  n2.weather = { t: +(t / k).toFixed(1), h: Math.round(hu / k), p: Math.round(pr / k), rain: +rain.toFixed(1), city: c.name };
  saveNight(n2);
  if (current && current.v === 'detail' && current.p.id === n.id) refresh();
}
async function catchUpWeather() {
  const miss = nights().filter(n => !n.weather && Date.now() - n.end < 80 * 86400e3).slice(0, 6);
  for (const n of miss) { try { await fetchWeather(n); } catch (e) { return; } }
}

/* =========================================================
   SIESTA
   ========================================================= */
V.nap = el => {
  let dur = S.napDur || 20, smart = S.napSmart !== false, snd = S.napSound || 'ninguno';
  const render = () => {
    el.innerHTML = `<div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><h3>Siesta</h3><span style="width:44px"></span></div>
    <div style="text-align:center;margin-top:10px">${ic('bed', 40, 'style="margin:0 auto;color:#E6A85C"')}
      <div style="font-family:var(--serif);font-weight:300;font-size:64px;line-height:1.1;margin-top:10px" class="count">${dur} min</div>
      <p class="mute sm">Despiertas a las ${fmtTime(Date.now() + dur * 60000)}</p></div>
    <div class="chips" style="justify-content:center;margin-top:18px">${[10, 20, 30, 45, 60, 90].map(v => `<button class="chip ${dur === v ? 'amb' : ''}" data-d="${v}">${v} min</button>`).join('')}</div>
    <div class="hint" style="margin-top:16px">${ic('bulb', 18, 'style="color:#78B3A6"')}<span>${dur <= 20 ? 'Siesta corta: te recarga sin dejarte atontado.' : dur < 60 ? 'Entre 30 y 45 min puedes despertar algo pesado; el despertar inteligente ayuda.' : 'Una siesta larga completa un ciclo de sueño; mejor antes de las 3 p. m.'}</span></div>
    <div class="lst card" style="margin-top:14px;padding:4px 16px">
      <button class="it" id="n-smart">${ic('alarm', 20, 'style="color:#E6A85C"')}<div style="flex:1"><b class="sm">Despertar inteligente</b><p class="mute xs">Hasta 10 min antes si estás en sueño ligero</p></div><span class="sw ${smart ? 'on' : ''}"></span></button>
    </div>
    <p class="sm b" style="margin:18px 0 8px">Sonido</p>
    <div class="chips">${[['ninguno', 'Ninguno'], ['lluvia', 'Lluvia'], ['olas', 'Olas'], ['ventilador', 'Ventilador'], ['cafe', 'Ruido café']].map(([k, l]) => `<button class="chip ${snd === k ? 'on' : ''}" data-snd="${k}">${l}</button>`).join('')}</div>
    <button class="btn main" id="n-go" style="margin-top:24px">${ic('moon', 22)}Empezar siesta</button>`;
    $$('[data-d]', el).forEach(b => b.onclick = () => { dur = +b.dataset.d; S.napDur = dur; saveS(); render(); });
    $('#n-smart').onclick = () => { smart = !smart; S.napSmart = smart; saveS(); render(); };
    $$('[data-snd]', el).forEach(b => b.onclick = () => { snd = b.dataset.snd; S.napSound = snd; saveS(); render(); });
    $('#n-go').onclick = () => {
      if (!J(N.perms(), {}).mic) { N.requestPerm('mic'); return; }
      const wakeTs = Date.now() + dur * 60000;
      const cfg = {
        nap: true, alarm: { on: true, wakeTs, win: smart && dur >= 20 ? Math.min(10, Math.round(dur / 3)) : 0, set: fmtTime(wakeTs) },
        aid: snd !== 'ninguno' ? { types: [{ type: snd, vol: .45 }], min: dur } : null,
        tags: [], sens: S.sens, goal: S.goal, alarmSound: S.alarmSound, vibrate: S.vibrate, ramp: S.ramp, snooze: S.snooze,
        saveClips: S.saveClips, mattress: S.mattress, antiSnore: 'off', sunrise: false, mission: S.mission,
        caffeine: Math.round(caffeineAt(S.caffeineLog, Date.now())),
      };
      if (N.startNight(JSON.stringify(cfg)) === 'ok') go('recording', {}, { reset: true });
    };
  };
  render();
};

/* =========================================================
   CAFEÍNA
   ========================================================= */
function bedTsTonight() {
  const hhmm = planTonight() || (S.alarmOn ? bedtimeFor(S.wake, S.goal) : '23:00');
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 4 * 3600e3) d.setDate(d.getDate() + 1);
  return d.getTime();
}
V.caffeine = el => {
  S.caffeineLog = (S.caffeineLog || []).filter(d => Date.now() - d.t < 48 * 3600e3);
  const log = S.caffeineLog, now = Date.now(), bed = bedTsTonight();
  const cur = caffeineAt(log, now), atBed = caffeineAt(log, bed);
  const last = lastCoffeeTime(bed, log);
  const W = innerWidth - 40 - 26, H = 170, t0 = now - 3 * 3600e3, t1 = Math.max(bed + 2 * 3600e3, now + 6 * 3600e3);
  let mx = 60; for (let t = t0; t <= t1; t += 900e3) mx = Math.max(mx, caffeineAt(log, t));
  mx *= 1.15;
  const X = t => 30 + (t - t0) / (t1 - t0) * (W - 34), Y = v => 10 + (1 - v / mx) * (H - 34);
  let path = '';
  for (let t = t0; t <= t1; t += 600e3) path += (path ? ' L' : 'M') + X(t).toFixed(1) + ',' + Y(caffeineAt(log, t)).toFixed(1);
  let svg = `<svg width="${W}" height="${H}"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6A85C" stop-opacity=".45"/><stop offset="1" stop-color="#E6A85C" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<line x1="30" x2="${W}" y1="${Y(50)}" y2="${Y(50)}" stroke="#78B3A6" stroke-dasharray="4 4"/><text x="${W - 4}" y="${Y(50) - 5}" text-anchor="end" fill="#78B3A6" font-size="11" font-family="Atkinson">50 mg</text>`;
  svg += `<path class="fadein" d="${path} L${X(t1)},${Y(0)} L${X(t0)},${Y(0)} Z" fill="url(#cg)"/><path class="drawline" d="${path}" fill="none" stroke="#E6A85C" stroke-width="2.4"/>`;
  svg += `<line x1="${X(now)}" x2="${X(now)}" y1="8" y2="${H - 22}" stroke="#ECE6D6" stroke-opacity=".5"/><text x="${X(now)}" y="${H - 6}" text-anchor="middle" fill="#ECE6D6" font-size="11" font-family="Atkinson">ahora</text>`;
  svg += `<line x1="${X(bed)}" x2="${X(bed)}" y1="8" y2="${H - 22}" stroke="#A89BE0" stroke-dasharray="3 3"/><text x="${X(bed)}" y="${H - 6}" text-anchor="middle" fill="#A89BE0" font-size="11" font-family="Atkinson">${ic ? '' : ''}dormir</text>`;
  svg += `<circle cx="${X(bed)}" cy="${Y(atBed)}" r="4.5" fill="#A89BE0"/></svg>`;
  const today = log.filter(d => now - d.t < 24 * 3600e3).sort((a, b) => b.t - a.t);
  el.innerHTML = `<div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><h3>Cafeína</h3><span style="width:44px"></span></div>
  <div class="row" style="gap:18px;margin-top:6px">
    <div style="flex:1"><p class="mute sm">En tu cuerpo ahora</p><p style="font-family:var(--serif);font-weight:300;font-size:46px;line-height:1.05"><span class="countup" data-to="${Math.round(cur)}">0</span><span class="mute" style="font-size:18px"> mg</span></p></div>
    <div style="flex:1"><p class="mute sm">A tu hora de dormir (${fmtTime(bed)})</p><p style="font-family:var(--serif);font-weight:300;font-size:46px;line-height:1.05;color:${atBed < 50 ? '#78B3A6' : '#D98C8C'}">${Math.round(atBed)}<span class="mute" style="font-size:18px"> mg</span></p></div>
  </div>
  <div class="card" style="margin-top:14px;padding:12px">${svg}</div>
  <div class="hint" style="margin-top:12px">${ic('bulb', 18, 'style="color:#78B3A6"')}<span>${atBed >= 50 ? 'Vas a llegar a la cama con bastante cafeína. Hoy mejor ya no tomes más.' : last ? (last > now ? `Si quieres otro café, que sea antes de las <b>${fmtTime(last)}</b>.` : 'Ya pasó tu hora límite para el café de hoy.') : 'Mantente por debajo de 50 mg al dormir.'}</span></div>
  <h3 style="margin:22px 0 10px">Agregar bebida</h3>
  <div class="tools" style="margin-top:0">${CAF.map(([k, l, mg, i]) => `<button class="tool" data-k="${k}"><span class="ibox" style="background:#E6A85C22;color:#E6A85C">${ic(i, 20)}</span><span>${l}</span><span class="mute xs">${mg} mg</span></button>`).join('')}</div>
  <div class="sec"><h3>Últimas 24 horas</h3>${today.length ? `<div class="lst">${today.map((d, i) => `<div class="it">${ic((CAF.find(c => c[0] === d.k) || [0, 0, 0, 'coffee'])[3], 18, 'style="color:#E6A85C"')}<span style="flex:1"><b class="sm">${(CAF.find(c => c[0] === d.k) || [0, 'Bebida'])[1]}</b><br><span class="mute xs">${fmtTime(d.t)}, ${d.mg} mg</span></span><button class="iconbtn" data-del="${d.t}" style="color:#9A97B8">${ic('x', 18)}</button></div>`).join('')}</div>` : '<p class="mute sm">Sin bebidas con cafeína registradas.</p>'}</div>
  <p class="mute xs" style="margin-top:16px">Cálculo aproximado: la cafeína baja a la mitad cada 5 horas.</p>`;
  $$('[data-k]', el).forEach(b => b.onclick = () => {
    const c = CAF.find(x => x[0] === b.dataset.k);
    openSheet(`<h2>${c[1]}</h2><p class="mute sm">¿Cuándo te lo tomaste?</p><div class="chips" style="margin:16px 0">${[[0, 'Ahora'], [30, 'Hace 30 min'], [60, 'Hace 1 h'], [120, 'Hace 2 h'], [180, 'Hace 3 h'], [300, 'Hace 5 h']].map(([m, l]) => `<button class="chip plain" data-ago="${m}">${l}</button>`).join('')}</div>
      <p class="sm b" style="margin-bottom:8px">Cantidad</p><div class="chips">${[[.5, 'Media'], [1, 'Normal'], [2, 'Doble']].map(([f, l]) => `<button class="chip ${f === 1 ? 'on' : ''}" data-f="${f}">${l} (${Math.round(c[2] * f)} mg)</button>`).join('')}</div>`, sh => {
      let f = 1;
      $$('[data-f]', sh).forEach(x => x.onclick = () => { f = +x.dataset.f; $$('[data-f]', sh).forEach(y => y.classList.toggle('on', y === x)); });
      $$('[data-ago]', sh).forEach(x => x.onclick = () => { S.caffeineLog.push({ t: Date.now() - x.dataset.ago * 60000, mg: Math.round(c[2] * f), k: c[0] }); saveS(); closeSheet(); N.vibrate(15); refresh(); });
    });
  });
  $$('[data-del]', el).forEach(b => b.onclick = () => { S.caffeineLog = S.caffeineLog.filter(d => String(d.t) !== b.dataset.del); saveS(); refresh(); });
  animateIn(el);
};

/* =========================================================
   PLAN DE 2 SEMANAS
   ========================================================= */
const cm = hhmm => { const [h, m] = hhmm.split(':').map(Number); let v = h * 60 + m; if (v < 720) v += 1440; return v; };
const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function planInfo(p) {
  const diff = cm(p.from) - cm(p.to), steps = Math.ceil(Math.abs(diff) / p.step);
  return { diff, steps, days: Math.max(1, steps * p.every) };
}
function planTarget(p, i) {
  const { diff } = planInfo(p), sign = Math.sign(diff);
  const k = Math.min(Math.abs(diff), (Math.floor(i / p.every) + 1) * p.step);
  return fmtClockMin(cm(p.from) - sign * k);
}
function planDayIdx(p) { const s = new Date(p.start + 'T12:00:00'), t = new Date(); t.setHours(12, 0, 0, 0); return Math.round((t - s) / 86400e3); }
function planTonight() {
  const p = S.plan; if (!p) return null;
  const i = planDayIdx(p), { days } = planInfo(p);
  if (i >= days + 2) { S.planDone = true; S.plan = null; saveS(); checkBadges(); return null; }
  return planTarget(p, Math.min(i, days - 1));
}
V.plan = el => {
  const p = S.plan;
  const top = `<div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><h3>Plan para dormir</h3><span style="width:44px"></span></div>`;
  if (!p) {
    const recent = nights().filter(n => n.summary.onsetTs).slice(0, 7);
    let from = recent.length >= 3 ? fmtClockMin(Math.round(clockMean(recent.map(n => n.summary.onsetTs)) / 5) * 5) : '00:00';
    let to = S.alarmOn ? bedtimeFor(S.wake, S.goal) : '22:30';
    to = fmtClockMin(Math.round(cm(to) / 5) * 5);
    el.innerHTML = top + `<p class="mute" style="margin-top:4px">Cambiar tu hora de dormir de golpe casi nunca funciona. Este plan la mueve 15 minutos cada 2 días, con recordatorios.</p>
      <div class="card" style="margin-top:16px;text-align:center"><p class="sm b">Hoy me duermo a eso de</p>${wheelHtml('pl-from')}<p class="mute xs">${recent.length >= 3 ? 'Calculado con tus últimas noches' : 'Ajústalo a tu hora real'}</p></div>
      <div class="card" style="margin-top:12px;text-align:center"><p class="sm b">Quiero dormirme a las</p>${wheelHtml('pl-to')}</div>
      <p class="hint" style="margin-top:14px" id="pl-sum"></p>
      <button class="btn main" id="pl-go" style="margin-top:16px">${ic('flag', 20)}Empezar plan</button>`;
    const upd = () => { const i = planInfo({ from, to, step: 15, every: 2 }); $('#pl-sum').innerHTML = `${ic('bulb', 18, 'style="color:#78B3A6"')}<span>${Math.abs(i.diff) < 15 ? 'Ya estás en tu meta.' : `Llegas a tu meta en <b>${i.days} días</b>, moviendo ${Math.abs(i.diff)} min en total.`}</span>`; };
    initWheel('pl-from', from, v => { from = v; upd(); });
    initWheel('pl-to', to, v => { to = v; upd(); });
    upd();
    $('#pl-go').onclick = () => {
      const plan = { start: dayKey(new Date()), from, to, step: 15, every: 2 };
      const { days, diff } = planInfo(plan);
      if (Math.abs(diff) < 15) { toast('Ya estás en tu meta'); return; }
      const times = {};
      for (let i = 0; i < days + 1; i++) { const d = new Date(); d.setDate(d.getDate() + i); times[dayKey(d)] = fmtClockMin(cm(planTarget(plan, Math.min(i, days - 1))) - 30); }
      S.plan = plan; S.planTimes = times; S.reminderOn = true; saveS();
      if (!J(N.perms(), {}).notif) N.requestPerm('notif');
      toast('Plan activado. Te aviso 30 min antes cada noche'); refresh();
    };
    return;
  }
  const info = planInfo(p), idx = planDayIdx(p), all = nights();
  const rows = [];
  for (let i = 0; i < info.days; i++) {
    const d = new Date(p.start + 'T12:00:00'); d.setDate(d.getDate() + i);
    const tgt = planTarget(p, i), n = all.find(x => nightKey(x.start) === dayKey(d));
    let st = '';
    if (n && n.summary.onsetTs) { const dif = clockMin(n.summary.onsetTs) - cm(tgt); st = dif <= 20 ? `<span style="color:#78B3A6">${ic('check', 18)}</span>` : `<span class="xs" style="color:#D98C8C">+${dif} min</span>`; }
    rows.push(`<div class="it" style="${i === idx ? 'background:rgba(168,155,224,.08);border-radius:12px;padding-left:8px;padding-right:8px' : ''}"><span class="mute xs" style="width:62px">${i === idx ? 'Hoy' : `${cap(DIAS[d.getDay()]).slice(0, 3)} ${d.getDate()}`}</span><span style="flex:1;font-family:var(--serif);font-size:18px">${tgt}</span>${st}</div>`);
  }
  const done = rows.length ? Math.min(100, Math.round(clamp(idx / info.days) * 100)) : 0;
  el.innerHTML = top + `<div class="card" style="text-align:center;background:linear-gradient(160deg,#2A2F5C,#10122A)">
    <p class="mute sm">Día ${Math.min(idx + 1, info.days)} de ${info.days}</p>
    <p class="mute sm" style="margin-top:12px">Esta noche, a dormir a las</p>
    <p style="font-family:var(--serif);font-weight:300;font-size:60px;line-height:1.1">${planTonight() || p.to}</p>
    <p class="mute xs">Te aviso a las ${fmtClockMin(cm(planTonight() || p.to) - 30)}</p>
    <div class="phasebar" style="margin-top:16px"><i data-w="${done}%" style="background:#A89BE0"></i></div>
    <p class="mute xs" style="margin-top:6px">De ${p.from} a ${p.to}</p></div>
  <div class="sec"><h3>Tu calendario</h3><div class="lst">${rows.join('')}</div></div>
  <button class="btn danger" id="pl-x" style="width:100%;margin-top:18px">Cancelar plan</button>`;
  $('#pl-x').onclick = () => confirmSheet('¿Cancelar el plan?', 'Se quitan los recordatorios del plan. Tu recordatorio normal sigue igual.', 'Cancelar plan', true, () => { S.plan = null; S.planTimes = {}; saveS(); refresh(); });
  animateIn(el);
};

/* =========================================================
   LOGROS
   ========================================================= */
V.badges = el => {
  const list = badgeList(nights(), naps(), S), got = list.filter(b => b.done).length;
  el.innerHTML = `<div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><h3>Logros</h3><span style="width:44px"></span></div>
  <p class="mute" style="text-align:center">${got} de ${list.length} desbloqueados</p>
  <div class="medals">${list.map((b, i) => `<div class="medal ${b.done ? 'got' : ''}" style="animation-delay:${i * 40}ms">
    <div class="disc">${ic(b.icon, 26)}</div><b class="sm">${b.name}</b><p class="mute xs">${b.desc}</p>
    ${b.done ? '' : `<div class="mini"><i style="width:${b.prog[0] / b.prog[1] * 100}%"></i></div><p class="mute xs">${b.prog[0]} / ${b.prog[1]}</p>`}</div>`).join('')}</div>`;
};

/* =========================================================
   CRONOTIPO
   ========================================================= */
V.chrono = el => {
  const c = chronotype(nights(), S.goal);
  const top = `<div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><h3>Tu cronotipo</h3><span style="width:44px"></span></div>`;
  if (!c) { el.innerHTML = top + `<div class="empty" style="margin-top:20px">${ic('sunrise', 30, 'style="margin:0 auto 10px;color:#A89BE0"')}Necesito al menos 5 noches para saber si eres más de mañana o de noche. Llevas ${nights().length}.</div>`; return; }
  const T = { alondra: ['sun', '#E6A85C', 'Eres madrugador', 'Tu cuerpo prefiere dormir y despertar temprano. Rindes más en la mañana.'], intermedio: ['sunrise', '#78B3A6', 'Eres intermedio', 'Como la mayoría: ni muy de mañana ni muy de noche. Te adaptas bien a horarios normales.'], buho: ['moon', '#A89BE0', 'Eres noctámbulo', 'Tu cuerpo prefiere acostarse y levantarse tarde. Rindes más en la tarde y la noche.'] }[c.type];
  el.innerHTML = top + `<div style="text-align:center;margin-top:6px"><div class="chrono-disc" style="color:${T[1]}">${ic(T[0], 56)}</div>
    <h1 style="margin-top:16px">${T[2]}</h1><p class="mute" style="margin:8px auto 0;max-width:320px">${T[3]}</p></div>
  <div class="stats sec">
    <div class="stat">${ic('moon', 20, 'style="color:#A89BE0;margin-top:2px"')}<div><b>${fmtClockMin(c.bed)}</b><span>Hora ideal para dormir</span></div></div>
    <div class="stat">${ic('sun', 20, 'style="color:#E6A85C;margin-top:2px"')}<div><b>${fmtClockMin(c.wake)}</b><span>Hora ideal para despertar</span></div></div>
    <div class="stat">${ic('clock', 20, 'style="color:#78B3A6;margin-top:2px"')}<div><b>${fmtClockMin(c.mid)}</b><span>Mitad de tu sueño</span></div></div>
    <div class="stat">${ic('zap', 20, `style="color:${c.sjl > 60 ? '#D98C8C' : '#78B3A6'};margin-top:2px"`)}<div><b>${fmtDurShort(c.sjl)}</b><span>Jet lag social</span></div></div>
  </div>
  <div class="tipcard sec"><span class="ibox" style="background:rgba(255,255,255,.05);color:#E6A85C">${ic('bulb', 20)}</span><div><b class="sm">${c.sjl > 60 ? 'Tus fines de semana desajustan tu reloj' : 'Tu horario es parejo'}</b><p class="sm mute" style="margin-top:2px">${c.sjl > 60 ? `Entre semana y fin de semana tu sueño se mueve ${fmtDurShort(c.sjl)}. Es como cambiar de país cada semana; trata de que la diferencia sea menor a 1 hora.` : 'Entre semana y fin de semana duermes casi en el mismo horario. Eso ayuda mucho a tu energía.'}</p></div></div>
  <p class="mute xs" style="margin-top:14px">Calculado con ${c.n} noches (${c.freeN} de viernes o sábado). Se vuelve más exacto con más noches.</p>`;
};

/* =========================================================
   AMANECER EN PANTALLA
   ========================================================= */
V.sunrise = el => {
  el.innerHTML = `<div class="sr-night"></div><div class="sr-dawn" id="sr-dawn"></div><div class="sr-sun" id="sr-sun"></div>
  <div style="position:relative;z-index:3;text-align:center;margin-top:calc(120px + var(--st))">
    <p id="sr-msg" style="color:#F1E3D0">Amaneciendo</p>
    <div class="count" id="sr-t" style="font-family:var(--serif);font-weight:300;font-size:92px;line-height:1"></div></div>
  <button class="btn" id="sr-back" style="position:absolute;z-index:3;left:24px;right:24px;bottom:calc(60px + var(--sb));background:rgba(23,26,51,.35)">${ic('moon', 18)}Seguir durmiendo a oscuras</button>`;
  let a = (J(N.live(), {}).alarm) || {};
  const tick = () => {
    const lv = J(N.live(), {});
    if (lv.ringing) { go('alarm', {}, { replace: true }); return; }
    if (!lv.recording) { N.setBrightness(-1); go('home', {}, { reset: true }); return; }
    a = lv.alarm || a;
    const end = (a.wakeTs || Date.now()) - (a.win || 0) * 60000, start = end - 15 * 60000;
    const pr = clamp((Date.now() - start) / (end - start));
    el.style.setProperty('--p', pr);
    $('#sr-t').textContent = fmtTime(Date.now());
    N.setBrightness(0.02 + 0.98 * Math.pow(pr, 1.6));
  };
  tick();
  const iv = setInterval(tick, 2000);
  onCleanup(() => clearInterval(iv));
  $('#sr-back').onclick = () => { N.setBrightness(-1); go('recording', {}, { replace: true }); };
};

/* =========================================================
   MISIÓN PARA APAGAR LA ALARMA
   ========================================================= */
V.mission = el => {
  const kind = S.mission === 'agitar' ? 'agitar' : 'matematicas';
  const watch = setInterval(() => { const lv = J(N.live(), {}); if (!lv.ringing && lv.recording) go('recording', {}, { replace: true }); }, 1500);
  onCleanup(() => { clearInterval(watch); N.shakeStop(); });
  const snooze = `<button class="btn" id="mi-snz" style="width:100%;margin-top:14px;color:var(--mute)">${ic('clock', 16)}Posponer ${S.snooze} min</button>`;
  if (kind === 'agitar') {
    const GOAL = 30, C = 2 * Math.PI * 88;
    el.innerHTML = `<div style="text-align:center;padding-top:60px"><p class="mute">Misión</p><h1>Agita el cel</h1>
      <div style="position:relative;width:200px;height:200px;margin:34px auto 0" id="mi-box">
      <svg width="200" height="200" style="position:absolute;inset:0"><circle cx="100" cy="100" r="88" fill="none" stroke="#2A2F5C" stroke-width="12"/><circle id="mi-arc" cx="100" cy="100" r="88" fill="none" stroke="#E6A85C" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 100 100)" style="transition:stroke-dashoffset .2s"/></svg>
      <div style="position:absolute;inset:0;display:grid;place-items:center"><div><div class="count" id="mi-n" style="font-family:var(--serif);font-size:56px;line-height:1">0</div><p class="mute sm">de ${GOAL}</p></div></div></div>
      <p class="mute" style="margin-top:26px">Agítalo con fuerza hasta llenar el círculo.</p>${snooze}</div>`;
    N.shakeStart();
    const iv = setInterval(() => {
      const c = Math.min(GOAL, N.shakeCount());
      $('#mi-n').textContent = c; $('#mi-arc').setAttribute('stroke-dashoffset', C * (1 - c / GOAL));
      if (c >= GOAL) { clearInterval(iv); N.shakeStop(); toast('¡Misión cumplida!'); wakeUp(); }
    }, 120);
    onCleanup(() => clearInterval(iv));
  } else {
    const probs = [];
    for (let i = 0; i < 3; i++) {
      const t = i % 3;
      if (t === 0) { const a = 12 + Math.floor(Math.random() * 70), b = 11 + Math.floor(Math.random() * 60); probs.push([`${a} + ${b}`, a + b]); }
      else if (t === 1) { const a = 3 + Math.floor(Math.random() * 7), b = 6 + Math.floor(Math.random() * 14); probs.push([`${a} × ${b}`, a * b]); }
      else { const a = 50 + Math.floor(Math.random() * 49), b = 11 + Math.floor(Math.random() * 38); probs.push([`${a} − ${b}`, a - b]); }
    }
    let k = 0, val = '';
    const render = () => {
      el.innerHTML = `<div style="text-align:center;padding-top:40px"><p class="mute">Misión ${k + 1} de 3</p>
        <div id="mi-q" style="font-family:var(--serif);font-size:48px;margin-top:18px">${probs[k][0]}</div>
        <div id="mi-v" class="count" style="height:64px;margin:14px auto 0;width:200px;border-bottom:2px solid var(--line);font-family:var(--serif);font-size:44px">${val || '&nbsp;'}</div></div>
        <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(x => `<button data-key="${x}" class="${x === 'ok' ? 'ok' : ''}">${x === 'del' ? ic('chevL', 22) : x === 'ok' ? ic('check', 24) : x}</button>`).join('')}</div>${snooze}`;
      $$('[data-key]', el).forEach(b => b.onclick = () => {
        const x = b.dataset.key; N.vibrate(8);
        if (x === 'del') val = val.slice(0, -1);
        else if (x === 'ok') {
          if (+val === probs[k][1] && val !== '') { k++; val = ''; if (k >= 3) { toast('¡Misión cumplida!'); wakeUp(); return; } }
          else { N.vibrate(200); $('#mi-v').classList.add('wrong'); setTimeout(() => { val = ''; render(); }, 450); return; }
        } else if (val.length < 4) val += x;
        render();
      });
      $('#mi-snz').onclick = snoozeNow;
    };
    render();
    return;
  }
  $('#mi-snz').onclick = snoozeNow;
};
function snoozeNow() { N.snooze(); N.shakeStop(); toast(`Te despierto en ${S.snooze} minutos`); go('recording', {}, { replace: true }); }

/* =========================================================
   EXTRAS EN DETALLE, ESTADÍSTICAS Y AJUSTES
   ========================================================= */
function detailExtras(n) {
  const s = n.summary, out = [];
  const chips = [];
  if (n.weather) chips.push(`${ic('thermo', 14, 'style="color:#E6A85C"')}${n.weather.t} °C`, `${ic('droplet', 14, 'style="color:#78B3A6"')}${n.weather.h}% humedad`, `${ic('cloud', 14, 'style="color:#A89BE0"')}${n.weather.rain > 0.2 ? n.weather.rain + ' mm de lluvia' : 'Sin lluvia'}`);
  if (n.caffeine != null) chips.push(`${ic('coffee', 14, `style="color:${n.caffeine >= 50 ? '#D98C8C' : '#78B3A6'}"`)}${Math.round(n.caffeine)} mg de cafeína al dormir`);
  if (n.mattress) chips.push(`${ic('bed', 14, 'style="color:#78B3A6"')}Medido con modo colchón`);
  if (chips.length) out.push(`<div class="sec"><h3>Contexto de la noche${n.weather ? ` <span class="mute xs">(${esc(n.weather.city)})</span>` : ''}</h3><div class="chips">${chips.map(c => `<span class="chip plain">${c}</span>`).join('')}</div></div>`);
  if (!s.noSleep && (s.snoreMin > 0 || s.pauses)) {
    const lvl = s.pph >= 15 ? ['Muchas', '#D98C8C'] : s.pph >= 5 ? ['Algunas', '#E6A85C'] : ['Pocas', '#78B3A6'];
    out.push(`<div class="sec"><h3>Respiración</h3><div class="card row" style="gap:14px"><span class="ibox" style="background:${lvl[1]}22;color:${lvl[1]};width:48px;height:48px">${ic('lungs', 24)}</span>
      <div style="flex:1"><b>${s.pauses} ${s.pauses === 1 ? 'posible pausa' : 'posibles pausas'}</b><p class="mute sm">${lvl[0]}: ${s.pph.toFixed(1)} por hora de sueño</p>
      <p class="mute xs" style="margin-top:6px">Silencios de 10 a 60 segundos en medio de ronquidos. No es un diagnóstico médico.</p></div></div>
      ${s.nudges ? `<div class="hint" style="margin-top:10px">${ic('snore', 18, 'style="color:#78B3A6"')}<span>El anti-ronquido te avisó ${s.nudges} ${s.nudges === 1 ? 'vez' : 'veces'} y dejaste de roncar en ${s.nudgeOk}.</span></div>` : ''}</div>`);
  }
  out.push(`<div class="sec"><div class="between"><h3>Tu sueño</h3><button class="chip" id="d-dream">${ic(n.dream ? 'sliders' : 'plus', 14)}${n.dream ? 'Editar' : 'Agregar'}</button></div>
    ${n.dream ? `<p class="card" style="font-family:var(--serif);font-size:16px;line-height:1.5;font-style:italic">${esc(n.dream)}</p>` : '<p class="mute sm">¿Recuerdas qué soñaste? Anótalo aquí.</p>'}</div>`);
  return out.join('');
}
function bindDetailExtras(el, n) {
  const b = $('#d-dream', el); if (!b) return;
  b.onclick = () => openSheet(`<h2>¿Qué soñaste?</h2><textarea id="dr-t" rows="6" style="width:100%;margin-top:12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;color:var(--paper);font:inherit;resize:none;outline:none;-webkit-user-select:text;user-select:text">${esc(n.dream || '')}</textarea><button class="btn main" id="dr-ok" style="margin-top:14px">Guardar</button>`, sh => {
    $('#dr-ok', sh).onclick = () => { const x = getNight(n.id); x.dream = $('#dr-t', sh).value.trim(); saveNight(x); closeSheet(); checkBadges(); refresh(); };
  });
}
function statsExtras(all, cur) {
  const out = [], avg = (l, f) => l.reduce((a, n) => a + f(n), 0) / l.length;
  const c = chronotype(all, S.goal);
  const ct = c ? { alondra: ['sun', 'Madrugador'], intermedio: ['sunrise', 'Intermedio'], buho: ['moon', 'Noctámbulo'] }[c.type] : null;
  out.push(`<button class="card sec row" id="sx-chrono" style="gap:14px;width:100%;text-align:left"><span class="ibox" style="background:rgba(168,155,224,.18);color:#A89BE0">${ic(ct ? ct[0] : 'sunrise', 22)}</span><span style="flex:1"><b>Tu cronotipo${ct ? ': ' + ct[1] : ''}</b><p class="mute sm">${c ? `Horario ideal ${fmtClockMin(c.bed)} a ${fmtClockMin(c.wake)}` : 'Disponible con 5 noches'}</p></span>${ic('chevR', 20)}</button>`);
  const wn = all.filter(n => n.weather);
  if (wn.length >= 3) {
    const b = [['Fresco (menos de 17 °C)', n => n.weather.t < 17], ['Templado (17 a 21 °C)', n => n.weather.t >= 17 && n.weather.t <= 21], ['Caluroso (más de 21 °C)', n => n.weather.t > 21], ['Con lluvia', n => n.weather.rain > .5], ['Sin lluvia', n => n.weather.rain <= .5]]
      .map(([l, f]) => { const x = wn.filter(f); return x.length >= 2 ? `<div class="impact between sm"><span>${l} <span class="mute xs">(${x.length})</span></span><span>${Math.round(avg(x, n => n.summary.score))}% calidad</span></div>` : ''; }).join('');
    if (b) out.push(`<div class="sec"><h3>${ic('cloud', 18, 'style="display:inline;vertical-align:-3px;color:#A89BE0"')} Clima y tu sueño</h3>${b}</div>`);
  }
  const cn = all.filter(n => n.caffeine != null), lo = cn.filter(n => n.caffeine < 50), hi = cn.filter(n => n.caffeine >= 50);
  if (lo.length >= 2 && hi.length >= 2) out.push(`<div class="sec"><h3>${ic('coffee', 18, 'style="display:inline;vertical-align:-3px;color:#E6A85C"')} Cafeína al dormir</h3>
    <div class="impact between sm"><span>Menos de 50 mg <span class="mute xs">(${lo.length})</span></span><span>${Math.round(avg(lo, n => n.summary.score))}% y ${fmtDurShort(avg(lo, n => n.summary.latency || 0))} para dormirte</span></div>
    <div class="impact between sm"><span>50 mg o más <span class="mute xs">(${hi.length})</span></span><span>${Math.round(avg(hi, n => n.summary.score))}% y ${fmtDurShort(avg(hi, n => n.summary.latency || 0))} para dormirte</span></div></div>`);
  const sn = cur.filter(n => n.summary.snoreMin > 0);
  if (sn.length) out.push(`<div class="sec"><h3>${ic('lungs', 18, 'style="display:inline;vertical-align:-3px;color:#78B3A6"')} Respiración</h3><div class="impact between sm"><span>Posibles pausas por hora</span><b>${avg(sn, n => n.summary.pph || 0).toFixed(1)}</b></div>
    <p class="mute xs" style="margin-top:8px">Si pasa de 5 por hora varias noches y te despiertas cansado, vale la pena ver a un médico.</p></div>`);
  out.push(`<button class="btn ghost sec" id="sx-pdf" style="width:100%">${ic('report', 18)}Reporte para el médico (PDF)</button>`);
  return out.join('');
}
function bindStatsExtras(el) {
  $('#sx-chrono', el).onclick = () => go('chrono');
  $('#sx-pdf', el).onclick = doctorPdf;
}
function settingsExtras() {
  const set = (id, i, t, s, right, c = '#9A97B8') => `<button class="it" id="${id}">${ic(i, 20, `style="color:${c}"`)}<div style="flex:1"><b class="sm">${t}</b>${s ? `<p class="mute xs">${s}</p>` : ''}</div>${right}</button>`;
  const sw = on => `<span class="sw ${on ? 'on' : ''}"></span>`, chev = ic('chevR', 18);
  return `<p class="grouplabel">Opciones de la noche</p><div class="card lst" style="padding:2px 16px">
    ${set('sx-mat', 'bed', 'Modo colchón', 'Mide movimientos con el cel sobre la cama', sw(S.mattress), '#78B3A6')}
    ${set('sx-sun', 'sunrise', 'Amanecer en pantalla', '15 min antes de la alarma', sw(S.sunrise), '#E6A85C')}
    ${set('sx-mis', 'hash', 'Misión para apagar la alarma', MISSIONS[S.mission], chev, '#E6A85C')}
    ${set('sx-anti', 'snore', 'Anti-ronquido', ANTI[S.antiSnore], chev, '#E6A85C')}</div>
  <p class="grouplabel">Más</p><div class="card lst" style="padding:2px 16px">
    ${set('sx-city', 'pin', 'Ciudad para el clima', (S.city || DEFAULT_CITY).name, chev, '#A89BE0')}
    ${set('sx-plan', 'flag', 'Plan para dormir', S.plan ? `Activo, meta ${S.plan.to}` : 'Cambia tu horario poco a poco', chev, '#A89BE0')}
    ${set('sx-caf', 'coffee', 'Cafeína', 'Registra tus bebidas', chev, '#E6A85C')}
    ${set('sx-bad', 'trophy', 'Logros', `${(S.badges || []).length} desbloqueados`, chev, '#E6A85C')}</div>`;
}
function bindSettingsExtras(el) {
  $('#sx-mat', el).onclick = () => { S.mattress = !S.mattress; saveS(); refresh(); };
  $('#sx-sun', el).onclick = () => { S.sunrise = !S.sunrise; saveS(); refresh(); };
  $('#sx-mis', el).onclick = () => missionSheet(refresh);
  $('#sx-anti', el).onclick = () => antiSnoreSheet(refresh);
  $('#sx-plan', el).onclick = () => go('plan');
  $('#sx-caf', el).onclick = () => go('caffeine');
  $('#sx-bad', el).onclick = () => go('badges');
  $('#sx-city', el).onclick = () => openSheet(`<h2>Ciudad para el clima</h2><p class="mute sm">Para relacionar tu sueño con el clima de cada noche.</p>
    <div class="row" style="gap:8px;margin-top:14px"><input id="cy-q" placeholder="Busca tu ciudad" style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;outline:none"><button class="btn soft" id="cy-go" style="padding:13px 16px">${ic('chevR', 18)}</button></div>
    <div class="lst" id="cy-r" style="margin-top:8px"><button class="it" data-c='${JSON.stringify(DEFAULT_CITY)}'>${ic('pin', 18, 'style="color:#A89BE0"')}<span style="flex:1"><b class="sm">Ciudad de Guatemala</b><br><span class="mute xs">Predeterminada</span></span></button></div>`, sh => {
    const bind = () => $$('[data-c]', sh).forEach(b => b.onclick = () => { S.city = JSON.parse(b.dataset.c); saveS(); closeSheet(); toast(`Clima de ${S.city.name}`); refresh(); });
    bind();
    const search = async () => {
      const q = $('#cy-q', sh).value.trim(); if (!q) return;
      $('#cy-r', sh).innerHTML = '<p class="mute sm" style="padding:12px 0">Buscando…</p>';
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es`);
        const j = await r.json();
        $('#cy-r', sh).innerHTML = (j.results || []).map(x => `<button class="it" data-c='${esc(JSON.stringify({ name: x.name, lat: x.latitude, lon: x.longitude }))}'>${ic('pin', 18, 'style="color:#A89BE0"')}<span style="flex:1"><b class="sm">${esc(x.name)}</b><br><span class="mute xs">${esc([x.admin1, x.country].filter(Boolean).join(', '))}</span></span></button>`).join('') || '<p class="mute sm" style="padding:12px 0">No encontré esa ciudad.</p>';
        bind();
      } catch (e) { $('#cy-r', sh).innerHTML = '<p class="mute sm" style="padding:12px 0">Sin conexión a internet.</p>'; }
    };
    $('#cy-go', sh).onclick = search;
    $('#cy-q', sh).onkeydown = e => { if (e.key === 'Enter') search(); };
  });
}

/* =========================================================
   REPORTE PARA EL MÉDICO (PDF)
   ========================================================= */
function doctorPdf() {
  const list = nights().filter(n => n.start >= Date.now() - 30 * 86400e3 && !n.summary.noSleep).sort((a, b) => a.start - b.start);
  if (!list.length) { toast('Necesitas noches de los últimos 30 días'); return; }
  const full = list.map(n => getNight(n.id) || n);
  const avg = f => full.reduce((a, n) => a + f(n), 0) / full.length;
  const onsets = full.map(n => n.summary.onsetTs).filter(Boolean);
  const row = n => { const s = n.summary; return `<tr><td>${esc(nightLabel(n.start))}</td><td>${s.onsetTs ? fmtTime(s.onsetTs) : '—'}</td><td>${fmtTime(s.wakeTs)}</td><td>${fmtDurShort(s.sleepMin)}</td><td>${s.latency} min</td><td>${s.awakenings}</td><td>${Math.round(s.snorePct * 100)}%</td><td>${s.pauses || 0}</td><td>${s.score}%</td><td>${esc((n.tags || []).join(', '))}</td></tr>`; };
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    body{font-family:Georgia,serif;color:#171A33;margin:28px;font-size:12px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 8px}
    .mute{color:#666}table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:10.5px}th,td{border-bottom:1px solid #ddd;padding:5px 4px;text-align:left}th{background:#f2f0ea}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-family:Arial,sans-serif}.box{border:1px solid #ddd;border-radius:8px;padding:10px}.box b{display:block;font-size:17px;font-family:Georgia,serif}
    .note{background:#f7f3ea;border-radius:8px;padding:10px;font-family:Arial,sans-serif;margin-top:14px}</style></head><body>
    <h1>Reporte de sueño</h1><p class="mute">Generado por la app Sueño el ${new Date().toLocaleDateString('es-GT')}. Del ${esc(nightLabel(full[0].start))} al ${esc(nightLabel(full[full.length - 1].start))} (${full.length} noches).</p>
    <h2>Resumen</h2><div class="grid">
      <div class="box"><b>${fmtDurShort(avg(n => n.summary.sleepMin))}</b>Dormido por noche</div>
      <div class="box"><b>${onsets.length ? fmtClockMin(clockMean(onsets)) : '—'}</b>Hora promedio de dormir</div>
      <div class="box"><b>${onsets.length > 1 ? '±' + Math.round(clockStd(onsets)) + ' min' : '—'}</b>Variación del horario</div>
      <div class="box"><b>${Math.round(avg(n => n.summary.latency || 0))} min</b>Para quedarse dormido</div>
      <div class="box"><b>${avg(n => n.summary.awakenings || 0).toFixed(1)}</b>Despertares por noche</div>
      <div class="box"><b>${Math.round(avg(n => n.summary.snorePct || 0) * 100)}%</b>Tiempo roncando</div>
      <div class="box"><b>${avg(n => n.summary.pph || 0).toFixed(1)}</b>Posibles pausas por hora</div>
      <div class="box"><b>${Math.round(avg(n => n.summary.eff || 0) * 100)}%</b>Eficiencia del sueño</div></div>
    <h2>Noche por noche</h2><table><tr><th>Noche</th><th>Se durmió</th><th>Despertó</th><th>Dormido</th><th>Latencia</th><th>Despert.</th><th>Ronquido</th><th>Pausas</th><th>Calidad</th><th>Notas</th></tr>${full.map(row).join('')}</table>
    <div class="note"><b>Cómo se mide:</b> el celular graba el sonido de la habitación (y el movimiento si se usó modo colchón). Las fases, ronquidos y "posibles pausas" (silencios de 10 a 60 s entre ronquidos) son estimaciones, no un estudio de sueño clínico.</div>
    </body></html>`;
  if (window.Android) N.printReport(html);
  else { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } }
  toast('Elige "Guardar como PDF" para guardarlo');
}

/* =========================================================
   ARRANQUE
   ========================================================= */
(function boot() {
  buildNav();
  const lv = J(N.live(), {});
  try { recover(lv); } catch (e) {}
  if (!S.onboarded) go('onboard', {}, { reset: true });
  else if (lv.ringing) go('alarm', {}, { reset: true });
  else if (lv.recording) go('recording', {}, { reset: true });
  else go('home', {}, { reset: true });
  setTimeout(catchUpWeather, 2500);
  setTimeout(checkBadges, 3000);
  const r = N.takeRoute();
  if (r && S.onboarded) routeTo(r);
})();
