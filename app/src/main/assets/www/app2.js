'use strict';
/* =========================================================
   DETALLE DE LA NOCHE
   ========================================================= */
let playing = null;
function stopClip() { if (playing) { try { playing.a.pause(); } catch (e) {} playing.btn.innerHTML = ic('play', 16); playing.fill.style.width = '0'; playing = null; } }

V.detail = (el, p) => {
  let n = getNight(p.id);
  if (!n) { go('home', {}, { reset: true }); return; }
  if (!n.summary || !n.summary.depth) n = finalize(p.id);
  const s = n.summary, all = nights();
  const clips = J(N.clips(n.id), []);
  const moodTxt = { 1: ['frown', 'Te despertaste cansado', '#D98C8C'], 2: ['meh', 'Te despertaste normal', '#A89BE0'], 3: ['smile', 'Te despertaste descansado', '#78B3A6'] }[n.mood];
  const W = innerWidth - 40 - 22;
  const slept = s.sleepMin || 1, awakeM = Math.max(0, (s.inBed || 0) - (s.sleepMin || 0));
  const tot = awakeM + (s.lightMin || 0) + (s.deepMin || 0) || 1;
  const pA = awakeM / tot * 100, pL = (s.lightMin || 0) / tot * 100, pD = (s.deepMin || 0) / tot * 100;
  const al = n.alarm && n.alarm.rangAt ? `<p class="mute xs" style="margin-top:4px">La alarma sonó a las ${fmtTime(n.alarm.rangAt)}${n.alarm.snoozes ? `, la pospusiste ${n.alarm.snoozes} ${n.alarm.snoozes === 1 ? 'vez' : 'veces'}` : ''}.</p>` : '';
  const counts = Object.entries(s.counts || {}).filter(([k, v]) => v && k !== 'movimiento').map(([k, v]) => `<span class="chip plain">${ic(TYPE_ICON[k], 14, `style="color:${TYPE_COLOR[k]}"`)}${TYPE_LABEL[k]}: ${v}</span>`).join('');
  const tags = (n.tags || []).concat(n.morning || []);
  el.innerHTML = `
  <div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><span class="mute sm">${esc(nightLabel(n.start))}</span><button class="iconbtn" id="d-share">${ic('share', 20)}</button></div>
  <div style="text-align:center;margin-top:4px">${ring(170, s.score, 12, 'calidad')}
    <h2 style="margin-top:6px">${verdict(s, n.nap)}</h2>${n.nap ? `<p class="mute sm">${ic('bed', 14, 'style="display:inline;vertical-align:-2px"')} Siesta de ${fmtDurShort(s.inBed)}</p>` : ''}
    ${moodTxt ? `<p class="mute sm row" style="justify-content:center;gap:6px;margin-top:4px">${ic(moodTxt[0], 15, `style="color:${moodTxt[2]}"`)}${moodTxt[1]}</p>` : ''}${al}
    ${n.recovered ? '<p class="mute xs" style="margin-top:4px">La grabación se interrumpió; esta noche se guardó con lo que alcanzó a grabar.</p>' : ''}
  </div>
  <div class="card" style="margin-top:18px;padding:14px 10px 10px">
    <div class="graphwrap" id="d-graph">${hypSvg(n, W, 200, false)}<div class="cursor" style="height:150px"></div><div class="tip"></div></div>
    <div class="row xs mute" style="gap:14px;margin:8px 4px 0;flex-wrap:wrap"><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:3px;background:#78B3A6"></i>Profundidad</span><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:3px;background:#E6A85C"></i>Ronquidos</span><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:50%;background:#A89BE0"></i>Habla / tos</span>${s.pauses ? '<span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:50%;background:#ECE6D6"></i>Pausas</span>' : ''}</div>
    <p class="mute xs" style="margin:6px 4px 0">Toca la gráfica para ver qué pasaba a cada hora.</p>
  </div>
  ${s.noSleep ? '' : `<div class="sec"><h3>Tus fases</h3>
    <div class="phasebar"><i data-w="${pA}%" style="background:#D98C8C"></i><i data-w="${pL}%" style="background:#A89BE0"></i><i data-w="${pD}%" style="background:#78B3A6"></i></div>
    <div class="between xs" style="margin-top:8px"><span><b style="color:#D98C8C">●</b> Despierto ${fmtDurShort(awakeM)}</span><span><b style="color:#A89BE0">●</b> Ligero ${fmtDurShort(s.lightMin)}</span><span><b style="color:#78B3A6">●</b> Profundo ${fmtDurShort(s.deepMin)}</span></div></div>`}
  <div class="stats sec">
    ${[['moon', s.onsetTs ? fmtTime(s.onsetTs) : '—', 'Te dormiste', '#A89BE0'], ['sun', s.wakeTs ? fmtTime(s.wakeTs) : '—', 'Despertaste', '#E6A85C'],
      ['bed', fmtDurShort(s.sleepMin), `Dormido (meta ${s.goal || S.goal} h)`, '#78B3A6'], ['clock', s.noSleep ? '—' : fmtDurShort(s.latency), 'Para dormirte', '#A89BE0'],
      ['target', Math.round((s.eff || 0) * 100) + '%', 'Eficiencia', '#78B3A6'], ['turn', s.awakenings || 0, 'Despertares', '#D98C8C'],
      ['snore', fmtDurShort(s.snoreMin || 0), `Roncando (${Math.round((s.snorePct || 0) * 100)}%)`, '#E6A85C'], ['volume', s.noise || '—', 'Ruido del cuarto', '#9A97B8']]
      .map(([i, b, l, c]) => `<div class="stat">${ic(i, 20, `style="color:${c};margin-top:2px"`)}<div><b>${b}</b><span>${l}</span></div></div>`).join('')}
  </div>
  ${counts ? `<div class="sec"><h3>Lo que se escuchó</h3><div class="chips">${counts}</div></div>` : ''}
  <div class="sec"><div class="between"><h3>Sonidos de la noche</h3><span class="mute xs">${clips.length} ${clips.length === 1 ? 'audio' : 'audios'}</span></div>
    ${clips.length ? `<div>${clips.map((c, k) => `<div class="clip" data-clip="${esc(c.id)}"><button class="play" style="color:${TYPE_COLOR[c.kind] || '#9A97B8'}">${ic('play', 16)}</button>
      <div style="flex:1;min-width:0"><div class="between"><b class="sm row" style="gap:6px">${ic(TYPE_ICON[c.kind] || 'volume', 15, `style="color:${TYPE_COLOR[c.kind] || '#9A97B8'}"`)}${TYPE_LABEL[c.kind] || 'Sonido'}</b><span class="mute xs">${fmtTime(c.t)}</span></div>
      <div class="wf">${waveBars(55, 22, k * 7 + 3)}<div class="fill">${waveBars(55, 22, k * 7 + 3, TYPE_COLOR[c.kind] || '#ECE6D6')}</div></div></div></div>`).join('')}</div>`
    : `<p class="empty sm" style="margin-top:10px">${S.saveClips ? 'No hubo ronquidos, habla ni tos que guardar esta noche.' : 'Tienes apagado "Guardar audios" en Ajustes.'}</p>`}</div>
  <div id="d-extra"></div>
  <div class="sec"><div class="between"><h3>Notas</h3><button class="chip" id="d-edit">${ic('sliders', 14)}Editar</button></div>
    ${tags.length ? `<div class="chips">${tags.map(t => `<span class="chip on">${ic(tagIcon(t), 14)}${esc(t)}</span>`).join('')}</div>` : '<p class="mute sm">Sin notas para esta noche.</p>'}</div>
  <div class="sec"><h3>Consejos para esta noche</h3>
    ${tipsFor(n, all.filter(x => x.id !== n.id).concat([n]).sort((a, b) => b.start - a.start)).map(t => `<div class="tipcard"><span class="ibox" style="background:rgba(255,255,255,.05);color:${t.c}">${ic(t.i, 20)}</span><div><b class="sm">${t.h}</b><p class="sm mute" style="margin-top:2px">${t.b}</p></div></div>`).join('')}</div>
  <div class="row" style="gap:10px;margin-top:10px"><button class="btn ghost" id="d-share2" style="flex:1;font-size:14px">${ic('share', 18)}Compartir</button><button class="btn danger" id="d-del" style="flex:1;font-size:14px">${ic('trash', 18)}Borrar</button></div>`;
  $('#d-extra').innerHTML = detailExtras(n);
  bindDetailExtras(el, n);
  animateIn(el);
  attachGraphTip($('#d-graph'), n, W);
  $$('.clip', el).forEach(row => {
    const btn = $('.play', row), fill = $('.fill', row);
    btn.onclick = () => {
      if (playing && playing.btn === btn) { stopClip(); return; }
      stopClip();
      const data = N.clipData(row.dataset.clip);
      if (!data) { toast('Este audio ya no está disponible'); return; }
      const a = new Audio(data);
      playing = { a, btn, fill };
      btn.innerHTML = ic('pause', 16);
      a.ontimeupdate = () => { if (a.duration) fill.style.width = (a.currentTime / a.duration * 100) + '%'; };
      a.onended = stopClip;
      a.play().catch(() => { stopClip(); toast('No se pudo reproducir'); });
    };
  });
  onCleanup(stopClip);
  $('#d-share').onclick = $('#d-share2').onclick = () => shareNight(n);
  $('#d-del').onclick = () => confirmSheet('¿Borrar esta noche?', 'Se borran también sus audios. No se puede deshacer.', 'Borrar', true, () => { N.deleteNight(n.id); invalidate(); toast('Noche borrada'); back(); });
  $('#d-edit').onclick = () => {
    const sel = new Set(n.tags || []);
    const allTags = TAGS.map(t => t[0]).concat(S.customTags || []);
    openSheet(`<h2>Notas de la noche</h2><div class="chips" style="margin:14px 0 20px">${allTags.map(t => `<button class="chip ${sel.has(t) ? 'on' : ''}" data-et="${esc(t)}">${ic(tagIcon(t), 14)}${esc(t)}</button>`).join('')}</div><button class="btn main" id="et-ok">Guardar</button>`, sh => {
      sh.addEventListener('click', e => { const c = e.target.closest('[data-et]'); if (!c) return; const t = c.dataset.et; sel.has(t) ? sel.delete(t) : sel.add(t); c.classList.toggle('on', sel.has(t)); });
      $('#et-ok', sh).onclick = () => { n.tags = [...sel]; saveNight(n); closeSheet(); refresh(); };
    });
  };
};

async function shareNight(n) {
  const s = n.summary, W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H; const g = cv.getContext('2d');
  try { await document.fonts.ready; } catch (e) {}
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2C2A63'); bg.addColorStop(.45, '#1B1D45'); bg.addColorStop(1, '#171A33');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${.2 + Math.random() * .6})`; g.beginPath(); g.arc(Math.random() * W, Math.random() * 520, Math.random() < .15 ? 3 : 2, 0, 7); g.fill(); }
  g.fillStyle = '#ECE6D6'; g.font = '500 44px Fraunces'; g.fillText('Sueño', 80, 120);
  g.fillStyle = '#9A97B8'; g.font = '34px Atkinson'; g.fillText(nightLabel(n.start), 80, 175);
  const cx = W / 2, cy = 470, r = 190;
  g.lineWidth = 26; g.lineCap = 'round'; g.strokeStyle = '#2A2F5C'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  const gr = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); gr.addColorStop(0, '#A89BE0'); gr.addColorStop(1, '#78B3A6');
  g.strokeStyle = gr; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.score / 100); g.stroke();
  g.fillStyle = '#ECE6D6'; g.textAlign = 'center'; g.font = '300 150px Fraunces'; g.fillText(s.score + '%', cx, cy + 52);
  g.font = '500 58px Fraunces'; g.fillText(verdict(s), cx, 760);
  g.fillStyle = '#9A97B8'; g.font = '38px Atkinson';
  g.fillText(`${fmtDur(s.sleepMin)} dormido${s.onsetTs ? `, ${fmtTime(s.onsetTs)} a ${fmtTime(s.wakeTs)}` : ''}`, cx, 825);
  const d = s.depth || [], L = d.length, gx = 90, gw = W - 180, gy = 900, gh = 240;
  if (L > 1) {
    g.beginPath(); for (let i = 0; i < L; i++) { const x = gx + i / (L - 1) * gw, y = gy + d[i] * gh; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.lineTo(gx + gw, gy); g.lineTo(gx, gy); g.closePath();
    const fg = g.createLinearGradient(0, gy, 0, gy + gh); fg.addColorStop(0, 'rgba(168,155,224,.05)'); fg.addColorStop(1, 'rgba(120,179,166,.7)'); g.fillStyle = fg; g.fill();
    g.beginPath(); for (let i = 0; i < L; i++) { const x = gx + i / (L - 1) * gw, y = gy + d[i] * gh; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = '#78B3A6'; g.lineWidth = 5; g.stroke();
  }
  g.font = '34px Atkinson'; g.fillStyle = '#ECE6D6';
  const items = [[`${Math.round((s.eff || 0) * 100)}%`, 'eficiencia'], [fmtDurShort(s.deepMin || 0), 'profundo'], [`${Math.round((s.snorePct || 0) * 100)}%`, 'ronquido']];
  items.forEach(([a, b], i) => { const x = 200 + i * 340; g.font = '500 48px Fraunces'; g.fillStyle = '#ECE6D6'; g.fillText(a, x, 1240); g.font = '30px Atkinson'; g.fillStyle = '#9A97B8'; g.fillText(b, x, 1285); });
  N.shareImage(cv.toDataURL('image/png'));
}

/* =========================================================
   ESTADÍSTICAS
   ========================================================= */
let statRange = 'semana';
V.stats = el => {
  const all = nights().filter(n => !n.summary.noSleep);
  const days = { semana: 7, mes: 30, ano: 365 }[statRange];
  const since = Date.now() - days * 86400e3, prevSince = since - days * 86400e3;
  const cur = all.filter(n => n.start >= since), prev = all.filter(n => n.start >= prevSince && n.start < since);
  const head = `<div class="between" style="margin-top:10px"><h1>Estadísticas</h1><button class="iconbtn" id="s-exp" style="color:#9A97B8">${ic('download', 22)}</button></div>
    <div class="seg" style="margin-top:16px">${[['semana', 'Semana'], ['mes', 'Mes'], ['ano', 'Año']].map(([k, l]) => `<button data-r="${k}" class="${statRange === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (cur.length < 1) {
    el.innerHTML = head + `<div class="empty" style="margin-top:24px">${ic('chart', 30, 'style="margin:0 auto 10px;color:#A89BE0"')}Graba algunas noches para ver tus estadísticas.</div>`;
  } else {
    const avg = (l, f) => l.length ? l.reduce((a, n) => a + f(n), 0) / l.length : 0;
    const a = avg(cur, n => n.summary.sleepMin), pa = avg(prev, n => n.summary.sleepMin), delta = prev.length ? a - pa : null;
    const onsets = cur.map(n => n.summary.onsetTs).filter(Boolean), wakes = cur.map(n => n.summary.wakeTs);
    const impacts = [...new Set(all.flatMap(n => n.tags || []))].map(t => tagImpact(all, t)).filter(Boolean).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 6);
    const moods = [1, 2, 3].map(m => { const l = all.filter(n => n.mood === m); return l.length ? { m, q: avg(l, n => n.summary.score), h: avg(l, n => n.summary.sleepMin) / 60, c: l.length } : null; }).filter(Boolean);
    el.innerHTML = head + `
    <div style="margin-top:20px"><p class="mute sm">Promedio dormido</p>
      <div class="row" style="gap:10px;align-items:baseline"><span style="font-family:var(--serif);font-size:40px;font-weight:300">${fmtDurShort(a)}</span>
      ${delta !== null ? `<span class="row sm" style="gap:4px;color:${delta >= 0 ? '#78B3A6' : '#D98C8C'}">${ic(delta >= 0 ? 'trendUp' : 'trendDown', 16)}${delta >= 0 ? '+' : '−'}${fmtDurShort(Math.abs(delta))}</span>` : ''}</div>
      <p class="mute xs">${delta !== null ? `vs. ${statRange === 'semana' ? 'la semana' : statRange === 'mes' ? 'el mes' : 'el año'} anterior` : `${cur.length} ${cur.length === 1 ? 'noche' : 'noches'}`}</p></div>
    <div class="card" style="margin-top:12px;padding:14px 12px 8px">${barChart(cur, innerWidth - 40 - 26, 190)}
      <div class="row xs mute" style="gap:14px;margin-top:6px"><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:3px;background:#78B3A6"></i>Horas</span>${statRange !== 'ano' ? '<span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:50%;background:#A89BE0"></i>Calidad</span>' : ''}<span class="row" style="gap:5px"><i style="width:14px;border-top:2px dashed #E6A85C"></i>Meta ${S.goal} h</span></div></div>
    <div class="stats sec">${[['moon', onsets.length ? fmtClockMin(clockMean(onsets)) : '—', 'Te duermes', '#A89BE0'], ['sun', fmtClockMin(clockMean(wakes)), 'Despiertas', '#E6A85C'],
      ['target', onsets.length > 1 ? `±${Math.round(clockStd(onsets))} min` : '—', 'Regularidad', '#78B3A6'], ['flame', fmtDurShort(debt(all, S.goal)), 'Deuda (7 días)', '#D98C8C'],
      ['chart', Math.round(avg(cur, n => n.summary.score)) + '%', 'Calidad promedio', '#A89BE0'], ['snore', Math.round(avg(cur, n => n.summary.snorePct || 0) * 100) + '%', 'Ronquido', '#E6A85C'],
      ['clock', fmtDurShort(avg(cur, n => n.summary.latency || 0)), 'Para dormirte', '#A89BE0'], ['turn', avg(cur, n => n.summary.awakenings || 0).toFixed(1), 'Despertares', '#D98C8C']]
      .map(([i, b, l, c]) => `<div class="stat">${ic(i, 20, `style="color:${c};margin-top:2px"`)}<div><b>${b}</b><span>${l}</span></div></div>`).join('')}</div>
    <div class="sec"><h3>Qué afecta tu sueño</h3>
      ${impacts.length ? impacts.map(i => `<div class="impact"><div class="between sm"><span class="row" style="gap:8px">${ic(tagIcon(i.tag), 17, 'style="color:#9A97B8"')}${esc(i.tag)} <span class="mute xs">(${i.n})</span></span><b style="color:${i.d >= 0 ? '#78B3A6' : '#D98C8C'}">${i.d >= 0 ? '+' : '−'}${Math.abs(Math.round(i.d))}% calidad</b></div>
        <div class="track"><i data-w="${Math.min(50, Math.abs(i.d) * 2.2)}%" style="${i.d >= 0 ? 'left:50%' : 'right:50%'};background:${i.d >= 0 ? '#78B3A6' : '#D98C8C'}"></i><b></b></div></div>`).join('')
      : '<p class="empty sm">Marca notas antes de dormir (café, ejercicio, estrés…). Con 2 noches por nota verás cuánto te afectan.</p>'}</div>
    ${moods.length ? `<div class="sec"><h3>Cómo te sentiste al despertar</h3>${moods.map(m => `<div class="impact between sm"><span class="row" style="gap:8px">${ic(['', 'frown', 'meh', 'smile'][m.m], 18, `style="color:${['', '#D98C8C', '#A89BE0', '#78B3A6'][m.m]}"`)}${['', 'Cansado', 'Normal', 'Descansado'][m.m]} <span class="mute xs">(${m.c})</span></span><span>${Math.round(m.q)}% y ${m.h.toFixed(1)} h en promedio</span></div>`).join('')}</div>` : ''}
    <div id="s-extra"></div>
    <button class="card sec row" id="s-rep" style="gap:14px;width:100%;text-align:left;background:linear-gradient(135deg,#2A2F5C,#3A2F55)"><span class="ibox" style="background:rgba(230,168,92,.2);color:#E6A85C">${ic('report', 22)}</span><span style="flex:1"><b>Reporte semanal</b><p class="mute sm">Tu semana en un vistazo, con recomendaciones.</p></span>${ic('chevR', 20)}</button>`;
    $('#s-rep').onclick = () => go('report');
    $('#s-extra').innerHTML = statsExtras(all, cur);
    bindStatsExtras(el);
  }
  $$('[data-r]', el).forEach(b => b.onclick = () => { statRange = b.dataset.r; refresh(); });
  $('#s-exp').onclick = exportBackup;
  animateIn(el);
};
function barChart(list, w, h) {
  const pl = 26, pb = 22, top = 12, bot = h - pb, cw = w - pl, maxH = Math.max(10, S.goal + 2);
  const Y = v => bot - v / maxH * (bot - top);
  let cols = [];
  if (statRange === 'ano') {
    const now = new Date();
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const l = list.filter(n => { const x = nightDate(n.start); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); });
      cols.push({ lab: MESES[d.getMonth()][0].toUpperCase(), h: l.length ? l.reduce((a, n) => a + n.summary.sleepMin, 0) / l.length / 60 : 0, q: null });
    }
  } else {
    const days = statRange === 'semana' ? 7 : 30;
    for (let k = days - 1; k >= 0; k--) {
      const d = nightDate(Date.now()); d.setDate(d.getDate() - k);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const l = list.filter(n => nightKey(n.start) === key);
      const best = l.sort((a, b) => b.summary.sleepMin - a.summary.sleepMin)[0];
      cols.push({ lab: days === 7 ? 'DLMMJVS'[d.getDay()] : (k % 5 === 0 ? String(d.getDate()) : ''), h: best ? best.summary.sleepMin / 60 : 0, q: best ? best.summary.score : null, today: k === 0 });
    }
  }
  const slot = cw / cols.length, bw = Math.max(3, Math.min(26, slot * .6));
  let o = `<svg width="${w}" height="${h}">`;
  [0, 4, 8].forEach(v => o += `<text x="0" y="${Y(v) + 4}" fill="#9A97B8" font-size="11" font-family="Fraunces">${v}h</text>`);
  cols.forEach((c, i) => {
    const x = pl + slot * i + (slot - bw) / 2;
    if (c.h > 0) o += `<rect class="bar" style="animation-delay:${i * (statRange === 'semana' ? 60 : 15)}ms" x="${x}" y="${Y(c.h)}" width="${bw}" height="${bot - Y(c.h)}" rx="${Math.min(7, bw / 2)}" fill="${c.h >= S.goal - .5 ? '#78B3A6' : 'rgba(120,179,166,.45)'}"/>`;
    else o += `<rect x="${x}" y="${bot - 3}" width="${bw}" height="3" rx="1.5" fill="#30355F"/>`;
    if (c.lab) o += `<text x="${x + bw / 2}" y="${h - 4}" fill="${c.today ? '#ECE6D6' : '#9A97B8'}" font-size="12" text-anchor="middle" font-family="Atkinson">${c.lab}</text>`;
  });
  o += `<line x1="${pl}" x2="${w}" y1="${Y(S.goal)}" y2="${Y(S.goal)}" stroke="#E6A85C" stroke-dasharray="4 4"/>`;
  if (statRange !== 'ano') {
    const pts = cols.map((c, i) => c.q === null ? null : [pl + slot * i + slot / 2, top + (1 - c.q / 100) * (bot - top)]).filter(Boolean);
    if (pts.length > 1) o += `<path class="fadein" d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="#A89BE0" stroke-width="2"/>`;
    pts.forEach(p => o += `<circle class="fadein" cx="${p[0]}" cy="${p[1]}" r="${statRange === 'semana' ? 3.5 : 2.2}" fill="#A89BE0"/>`);
  }
  return o + '</svg>';
}

/* =========================================================
   REPORTE SEMANAL
   ========================================================= */
V.report = el => {
  const all = nights().filter(n => !n.summary.noSleep);
  const wk = all.filter(n => n.start >= Date.now() - 7 * 86400e3);
  const prev = all.filter(n => n.start < Date.now() - 7 * 86400e3 && n.start >= Date.now() - 14 * 86400e3);
  const top = `<div class="top"><button class="iconbtn" data-back>${ic('chevL', 24)}</button><h3>Reporte semanal</h3><span style="width:44px"></span></div>`;
  if (!wk.length) { el.innerHTML = top + '<p class="empty" style="margin-top:20px">Esta semana todavía no tienes noches grabadas.</p>'; return; }
  const avg = (l, f) => l.reduce((a, n) => a + f(n), 0) / l.length;
  const best = [...wk].sort((a, b) => b.summary.score - a.summary.score)[0], worst = [...wk].sort((a, b) => a.summary.score - b.summary.score)[0];
  const a = avg(wk, n => n.summary.sleepMin), q = avg(wk, n => n.summary.score);
  const onsets = wk.map(n => n.summary.onsetTs).filter(Boolean);
  const imp = [...new Set(all.flatMap(n => n.tags || []))].map(t => tagImpact(all, t)).filter(Boolean).sort((x, y) => x.d - y.d);
  const recs = [];
  if (a < (S.goal - .5) * 60) recs.push(['clock', `Dormiste ${fmtDurShort(S.goal * 60 - a)} menos que tu meta cada noche`, S.alarmOn ? `Intenta acostarte a las ${bedtimeFor(S.wake, S.goal)} para despertar a las ${S.wake}.` : 'Intenta adelantar tu hora de dormir 30 minutos.']);
  if (onsets.length > 2 && clockStd(onsets) > 45) recs.push(['target', 'Tu horario cambió bastante', `Te dormiste con una variación de ±${Math.round(clockStd(onsets))} min. Un horario fijo mejora la calidad.`]);
  if (imp.length && imp[0].d < -5) recs.push([tagIcon(imp[0].tag), `${imp[0].tag} te baja la calidad`, `En noches con ${imp[0].tag.toLowerCase()} tu calidad baja ${Math.abs(Math.round(imp[0].d))}% en promedio.`]);
  const pos = imp.filter(i => i.d > 5).pop();
  if (pos) recs.push([tagIcon(pos.tag), `${pos.tag} te ayuda`, `En noches con ${pos.tag.toLowerCase()} tu calidad sube ${Math.round(pos.d)}%. Sigue así.`]);
  if (avg(wk, n => n.summary.snorePct || 0) > .15) recs.push(['snore', 'Roncaste más de lo normal', 'Dormir de lado y evitar alcohol en la noche suele reducirlo.']);
  if (!recs.length) recs.push(['sparkles', 'Semana sólida', 'Duración y calidad estuvieron bien. Mantén tu rutina.']);
  const dq = prev.length ? q - avg(prev, n => n.summary.score) : null;
  el.innerHTML = top + `
  <div class="card" style="text-align:center;margin-top:6px;background:linear-gradient(160deg,#2A2F5C,#10122A)">
    <p class="mute sm">Últimos 7 días, ${wk.length} ${wk.length === 1 ? 'noche' : 'noches'}</p>
    <div style="margin:10px auto 0;width:max-content">${ring(140, Math.round(q), 11, 'promedio')}</div>
    ${dq !== null ? `<p class="sm" style="margin-top:8px;color:${dq >= 0 ? '#78B3A6' : '#D98C8C'}">${dq >= 0 ? '+' : '−'}${Math.abs(Math.round(dq))}% vs. la semana anterior</p>` : ''}
  </div>
  <div class="stats sec">${[['bed', fmtDurShort(a), 'Dormido por noche', '#78B3A6'], ['moon', onsets.length ? fmtClockMin(clockMean(onsets)) : '—', 'Te dormiste', '#A89BE0'],
    ['flame', fmtDurShort(debt(all, S.goal)), 'Deuda de sueño', '#D98C8C'], ['snore', Math.round(avg(wk, n => n.summary.snorePct || 0) * 100) + '%', 'Ronquido', '#E6A85C']]
    .map(([i, b, l, c]) => `<div class="stat">${ic(i, 20, `style="color:${c};margin-top:2px"`)}<div><b>${b}</b><span>${l}</span></div></div>`).join('')}</div>
  <div class="row sec" style="gap:10px">
    ${[[best, 'Mejor noche', '#78B3A6'], [worst, 'Noche más difícil', '#D98C8C']].map(([n, l, c]) => `<button class="tile" data-open="${n.id}"><span class="xs" style="color:${c}">${l}</span><b style="font-family:var(--serif);font-size:24px;font-weight:400">${n.summary.score}%</b><span class="mute xs">${esc(nightLabel(n.start))}</span></button>`).join('')}
  </div>
  <div class="sec"><h3>Para esta semana</h3>${recs.map(([i, h, b]) => `<div class="tipcard"><span class="ibox" style="background:rgba(255,255,255,.05);color:#E6A85C">${ic(i, 20)}</span><div><b class="sm">${h}</b><p class="sm mute" style="margin-top:2px">${b}</p></div></div>`).join('')}</div>`;
  $$('[data-open]', el).forEach(b => b.onclick = () => go('detail', { id: b.dataset.open }));
  animateIn(el);
};

/* =========================================================
   DIARIO
   ========================================================= */
let diaryMonth = null, diarySel = null;
V.diary = el => {
  const all = allNights();
  if (!diaryMonth) { const d = nightDate(Date.now()); diaryMonth = [d.getFullYear(), d.getMonth()]; }
  const [y, m] = diaryMonth;
  const byKey = {};
  all.filter(n => !n.nap).forEach(n => { const k = nightKey(n.start); if (!byKey[k] || byKey[k].summary.score < n.summary.score) byKey[k] = n; });
  const monthNights = all.filter(n => { const d = nightDate(n.start); return d.getFullYear() === y && d.getMonth() === m; });
  if (!diarySel || !monthNights.find(n => n.id === diarySel)) diarySel = monthNights[0] ? monthNights[0].id : null;
  const first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7, daysIn = new Date(y, m + 1, 0).getDate();
  const todayKey = nightKey(Date.now());
  let cal = '<div class="cal">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="mute xs">${d}</span>`).join('') + '<span></span>'.repeat(offset);
  for (let d = 1; d <= daysIn; d++) {
    const k = `${y}-${pad2(m + 1)}-${pad2(d)}`, n = byKey[k];
    cal += `<button class="day ${n ? 'has' : ''} ${n && n.id === diarySel ? 'sel' : ''} ${k === todayKey ? 'today' : ''}" ${n ? `data-n="${n.id}"` : ''} style="${n ? `background:${n.summary.noSleep ? '#30355F' : scoreColor(n.summary.score)}` : ''}">${d}</button>`;
  }
  cal += '</div>';
  const sel = all.find(n => n.id === diarySel);
  el.innerHTML = `
  <div class="between" style="margin-top:10px"><h1>Diario</h1><span class="row" style="gap:4px"><button class="iconbtn" id="dy-prev">${ic('chevL', 22)}</button><button class="iconbtn" id="dy-next">${ic('chevR', 22)}</button></span></div>
  <p class="mute" style="margin:2px 0 16px">${cap(MESES[m])} ${y}</p>
  <div class="card">${cal}
    <div class="row xs mute" style="gap:12px;margin-top:14px;justify-content:center;flex-wrap:wrap">${[['#78B3A6', 'Muy buena'], ['rgba(120,179,166,.6)', 'Buena'], ['#A89BE0', 'Regular'], ['#D98C8C', 'Mala']].map(([c, l]) => `<span class="row" style="gap:4px"><i style="width:9px;height:9px;border-radius:50%;background:${c}"></i>${l}</span>`).join('')}</div></div>
  ${sel ? `<button class="card" id="dy-card" style="margin-top:14px;width:100%;text-align:left;display:block">
    <div class="between"><div><p class="mute xs">${esc(nightLabel(sel.start))}</p><p style="font-family:var(--serif);font-size:19px">${sel.summary.noSleep ? 'Sin sueño detectado' : `${fmtDur(sel.summary.sleepMin)}, ${sel.summary.score}%`}</p></div>${ic('chevR', 20)}</div>
    <div style="margin-top:10px">${hypSvg(sel, innerWidth - 40 - 38, 52, true)}</div>
    ${(sel.tags || []).length || sel.mood ? `<div class="chips" style="margin-top:10px">${(sel.tags || []).map(t => `<span class="chip">${ic(tagIcon(t), 13)}${esc(t)}</span>`).join('')}${sel.mood ? `<span class="chip">${ic(['', 'frown', 'meh', 'smile'][sel.mood], 13)}${['', 'Cansado', 'Normal', 'Descansado'][sel.mood]}</span>` : ''}</div>` : ''}
  </button>` : `<p class="empty" style="margin-top:14px">No hay noches grabadas en ${MESES[m]}.</p>`}
  ${monthNights.length > 1 ? `<div class="sec"><h3>Noches del mes</h3><div class="lst">${monthNights.map(n => `<button class="it" data-open="${n.id}"><span style="width:10px;height:10px;border-radius:50%;background:${scoreColor(n.summary.score)}"></span><span style="flex:1"><b class="sm">${n.nap ? 'Siesta, ' : ''}${esc(nightLabel(n.start))}</b><br><span class="mute xs">${fmtTime(n.start)} a ${fmtTime(n.end)}${n.summary.noSleep ? '' : ', ' + fmtDurShort(n.summary.sleepMin)}</span></span><span style="font-family:var(--serif);font-size:20px">${n.summary.score}%</span></button>`).join('')}</div></div>` : ''}`;
  $$('[data-n]', el).forEach(b => b.onclick = () => { diarySel = b.dataset.n; N.vibrate(10); refresh(); });
  $$('[data-open]', el).forEach(b => b.onclick = () => go('detail', { id: b.dataset.open }));
  if (sel) $('#dy-card').onclick = () => go('detail', { id: sel.id });
  $('#dy-prev').onclick = () => { diaryMonth = m === 0 ? [y - 1, 11] : [y, m - 1]; diarySel = null; refresh(); };
  $('#dy-next').onclick = () => { diaryMonth = m === 11 ? [y + 1, 0] : [y, m + 1]; diarySel = null; refresh(); };
  animateIn(el);
};

/* =========================================================
   RELAJARSE
   ========================================================= */
V.relax = el => {
  let st = J(N.soundsState(), {});
  const sel = st.playing && st.layers && st.layers.length ? st.layers.map(l => l.type) : [...S.relaxTypes];
  const vols = { ...S.relaxVols }; (st.layers || []).forEach(l => vols[l.type] = l.vol);
  const render = () => {
    st = J(N.soundsState(), {});
    el.innerHTML = `
    <h1 style="margin-top:10px">Relajarse</h1>
    <button class="card" id="rx-br" style="margin-top:16px;width:100%;text-align:left;background:radial-gradient(120% 120% at 100% 0%,#2E3A5E,#10122A);display:flex;align-items:center;gap:16px">
      <span style="width:92px;height:92px;border-radius:50%;background:radial-gradient(circle,rgba(120,179,166,.55),rgba(120,179,166,.1) 65%,transparent 70%);display:grid;place-items:center;flex:none;animation:breathe 8s ease-in-out infinite"><span style="width:48px;height:48px;border-radius:50%;border:2px solid #78B3A6"></span></span>
      <span><b>Respiración guiada</b><p class="mute sm">4-7-8, en caja o relajante. Baja el ritmo antes de dormir.</p><span class="chip plain" style="margin-top:8px">${ic('play', 12)}Empezar</span></span></button>
    <div class="between" style="margin:22px 0 12px"><h3>Sonidos para dormir</h3><span class="mute xs">Mezcla hasta 3</span></div>
    <div class="sgrid">${SOUNDS.map(([k, l, i]) => `<button class="sbtn ${sel.includes(k) ? 'on' : ''}" data-s="${k}"><div class="sq">${ic(i, 26)}</div><p>${l}</p></button>`).join('')}</div>
    <div class="card" style="margin-top:18px;padding:14px 16px">
      <div class="between"><b class="sm">${st.playing ? 'Sonando ahora' : 'Tu mezcla'}</b><span class="mute xs">${st.playing && st.left ? `Se apaga en ${Math.ceil(st.left / 60000)} min` : ''}</span></div>
      ${sel.length ? sel.map(t => `<div class="row" style="margin-top:14px;gap:10px">${ic((SOUNDS.find(s => s[0] === t) || [])[2] || 'volume', 18, 'style="color:#A89BE0"')}<span class="sm" style="width:84px">${SOUND_NAME[t]}</span><input type="range" min="0.05" max="1" step="0.05" value="${vols[t] ?? .5}" data-v="${t}"></div>`).join('') : '<p class="mute sm" style="margin-top:10px">Elige uno o varios sonidos arriba.</p>'}
      <div class="chips" style="margin-top:16px;justify-content:center">${[[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [0, 'Sin límite']].map(([v, l]) => `<button class="chip ${S.relaxMin === v ? 'amb' : ''}" data-min="${v}">${ic('clock', 13)}${l}</button>`).join('')}</div>
      <button class="bigplay" id="rx-play" aria-label="${st.playing ? 'Pausar' : 'Reproducir'}">${ic(st.playing ? 'pause' : 'play', 22)}</button>
    </div>`;
    $('#rx-br').onclick = () => go('breathe', {});
    $$('[data-s]', el).forEach(b => b.onclick = () => {
      const k = b.dataset.s, i = sel.indexOf(k);
      if (i >= 0) sel.splice(i, 1); else { if (sel.length >= 3) { toast('Puedes mezclar hasta 3 sonidos'); return; } sel.push(k); }
      S.relaxTypes = [...sel]; saveS(); N.vibrate(10);
      if (st.playing) { if (sel.length) play(); else N.stopSounds(); }
      render();
    });
    $$('[data-v]', el).forEach(r => r.oninput = () => { vols[r.dataset.v] = +r.value; S.relaxVols = { ...vols }; N.setSoundVolume(r.dataset.v, +r.value); });
    $$('[data-v]', el).forEach(r => r.onchange = () => saveS());
    $$('[data-min]', el).forEach(b => b.onclick = () => { S.relaxMin = +b.dataset.min; saveS(); if (st.playing) play(); render(); });
    $('#rx-play').onclick = () => { if (st.playing) N.stopSounds(); else if (!sel.length) { toast('Elige un sonido primero'); return; } else play(); setTimeout(render, 150); };
  };
  const play = () => N.playSounds(JSON.stringify(sel.map(t => ({ type: t, vol: vols[t] ?? .5 }))), S.relaxMin);
  render();
  const iv = setInterval(() => { const s2 = J(N.soundsState(), {}); if (s2.playing !== st.playing || (s2.playing && Math.ceil(s2.left / 60000) !== Math.ceil((st.left || 0) / 60000))) render(); }, 3000);
  onCleanup(() => clearInterval(iv));
};

/* Hojas para elegir sonidos */
function soundPickSheet(mode, done) {
  const sel = new Set(S.aidTypes);
  openSheet(`<h2>Sonido para dormir</h2><p class="mute sm" style="margin-bottom:14px">Suena al empezar la noche y se apaga sola. Puedes mezclar hasta 3.</p>
    <div class="sgrid">${SOUNDS.map(([k, l, i]) => `<button class="sbtn ${sel.has(k) ? 'on' : ''}" data-ps="${k}"><div class="sq">${ic(i, 24)}</div><p>${l}</p></button>`).join('')}</div>
    <p class="sm b" style="margin:18px 0 8px">Se apaga en</p>
    <div class="chips">${[15, 30, 45, 60].map(v => `<button class="chip ${S.aidMin === v ? 'amb' : ''}" data-pm="${v}">${v} min</button>`).join('')}</div>
    <div class="row" style="gap:10px;margin-top:20px"><button class="btn ghost" id="ps-try" style="flex:1">${ic('play', 16)}Escuchar</button><button class="btn main" id="ps-ok" style="flex:1;padding:16px">Listo</button></div>
    <button class="btn" id="ps-none" style="width:100%;color:var(--mute);margin-top:6px">Sin sonido</button>`, sh => {
    let trying = false;
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-ps]'); if (!b) return;
      const k = b.dataset.ps;
      if (sel.has(k)) sel.delete(k); else { if (sel.size >= 3) { toast('Puedes mezclar hasta 3 sonidos'); return; } sel.add(k); }
      b.classList.toggle('on', sel.has(k));
      if (trying) N.playSounds(JSON.stringify([...sel].map(t => ({ type: t, vol: S.aidVols[t] ?? .5 }))), 2);
    });
    $$('[data-pm]', sh).forEach(b => b.onclick = () => { S.aidMin = +b.dataset.pm; $$('[data-pm]', sh).forEach(x => x.classList.toggle('amb', x === b)); });
    $('#ps-try', sh).onclick = e => {
      trying = !trying;
      if (trying && sel.size) N.playSounds(JSON.stringify([...sel].map(t => ({ type: t, vol: S.aidVols[t] ?? .5 }))), 2); else { N.stopSounds(); trying = false; }
      e.currentTarget.innerHTML = trying ? ic('pause', 16) + 'Detener' : ic('play', 16) + 'Escuchar';
    };
    const finish = () => { if (trying) N.stopSounds(); S.aidTypes = [...sel]; saveS(); closeSheet(); };
    $('#ps-ok', sh).onclick = finish;
    $('#ps-none', sh).onclick = () => { sel.clear(); finish(); };
  }, () => { N.stopSounds(); done && done(); });
}
function alarmSoundSheet(done) {
  openSheet(`<h2>Sonido de alarma</h2><p class="mute sm" style="margin-bottom:10px">Toca ▶ para escucharlo.</p>
    <div class="lst">${ALARM_SOUNDS.map(([k, l, d]) => `<div class="it"><button class="play" data-pa="${k}" style="color:#A89BE0">${ic('play', 16)}</button><button data-as="${k}" style="flex:1;text-align:left"><b class="sm">${l}</b><p class="mute xs">${d}</p></button>${S.alarmSound === k ? `<span style="color:#78B3A6">${ic('check', 20)}</span>` : ''}</div>`).join('')}</div>`, sh => {
    $$('[data-pa]', sh).forEach(b => b.onclick = () => { N.previewAlarm(b.dataset.pa); N.vibrate(10); });
    $$('[data-as]', sh).forEach(b => b.onclick = () => { S.alarmSound = b.dataset.as; saveS(); closeSheet(); });
  }, () => { N.stopPreview(); done && done(); });
}

/* =========================================================
   RESPIRACIÓN
   ========================================================= */
const TECH = {
  '478': { name: '4-7-8', phases: [['in', 4, 'Inhala', 'Por la nariz, despacio'], ['hold', 7, 'Sostén', 'Mantén el aire'], ['out', 8, 'Exhala', 'Por la boca, suave']] },
  caja: { name: 'Caja', phases: [['in', 4, 'Inhala', 'Llena tus pulmones'], ['hold', 4, 'Sostén', 'Quédate quieto'], ['out', 4, 'Exhala', 'Suelta todo el aire'], ['hold', 4, 'Sostén', 'Pausa vacía']] },
  relajante: { name: 'Relajante', phases: [['in', 4, 'Inhala', 'Por la nariz'], ['out', 6, 'Exhala', 'Más largo que la inhalación']] },
};
V.breathe = (el, p) => {
  const CYCLES = 8;
  let timers = [], running = false, cycle = 0;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  onCleanup(() => { clear(); N.stopSpeak(); });
  el.innerHTML = `
  <div class="top"><button class="iconbtn" id="b-x">${ic('x', 24)}</button><span class="mute sm count" id="b-cyc">Prepárate</span><span style="width:44px"></span></div>
  <div class="seg" id="b-tech">${Object.entries(TECH).map(([k, t]) => `<button data-t="${k}" class="${S.breathTech === k ? 'on' : ''}">${t.name}</button>`).join('')}</div>
  <div class="orb"><div class="halo"></div><div class="ringo"></div><div class="core" id="b-core"><div><div class="n count" id="b-n">·</div><div class="w" id="b-w"></div></div></div></div>
  <p style="text-align:center;margin-top:36px;font-family:var(--serif);font-size:20px" id="b-tip">Ponte cómodo</p>
  <p class="mute sm" style="text-align:center;margin-top:6px" id="b-sub">Empezamos en un momento</p>
  <div class="row" style="justify-content:center;gap:12px;margin-top:30px">
    <button class="chip ${S.breathVib ? 'on' : ''}" id="b-vib">${ic('vibrate', 14)}Vibración</button>
    <button class="chip ${S.breathVoice ? 'on' : ''}" id="b-voice">${ic('volume', 14)}Voz guía</button></div>
  <div id="b-end" style="display:none;text-align:center;margin-top:20px"></div>`;
  const core = $('#b-core');
  const run = () => {
    clear(); running = true; cycle = 0;
    const T = TECH[S.breathTech];
    core.style.transitionDuration = '1.2s'; core.style.transform = 'scale(.55)';
    $('#b-end').style.display = 'none';
    let t = 1500;
    for (let c = 0; c < CYCLES; c++) {
      T.phases.forEach(([kind, secs, word, tip]) => {
        timers.push(setTimeout(() => {
          cycle = c + 1;
          $('#b-cyc').textContent = `Ciclo ${cycle} de ${CYCLES}`;
          $('#b-w').textContent = word; $('#b-tip').textContent = tip; $('#b-sub').textContent = T.name;
          core.style.transitionDuration = secs + 's';
          if (kind === 'in') core.style.transform = 'scale(1)';
          if (kind === 'out') core.style.transform = 'scale(.55)';
          if (S.breathVib) N.vibrate(kind === 'hold' ? 20 : 45);
          if (S.breathVoice) N.speak(word);
          for (let k = 0; k < secs; k++) timers.push(setTimeout(() => { $('#b-n').textContent = secs - k; }, k * 1000));
        }, t));
        t += secs * 1000;
      });
    }
    timers.push(setTimeout(finish, t));
  };
  const finish = () => {
    running = false;
    S.breathCount = (S.breathCount || 0) + 1; saveS(); checkBadges();
    $('#b-cyc').textContent = 'Listo'; $('#b-w').textContent = ''; $('#b-n').textContent = '✓';
    $('#b-tip').textContent = 'Bien hecho'; $('#b-sub').textContent = 'Tu cuerpo está más tranquilo';
    if (S.breathVoice) N.speak('Bien hecho');
    const end = $('#b-end'); end.style.display = 'block';
    end.innerHTML = p.then === 'start' ? `<button class="btn main" id="b-go">${ic('moon', 22)}Empezar a dormir</button>` : `<button class="btn soft" id="b-again" style="margin:0 auto">${ic('turn', 18)}Repetir</button>`;
    if (p.then === 'start') $('#b-go').onclick = doStart; else $('#b-again').onclick = run;
  };
  $('#b-x').onclick = () => { if (p.then === 'start') { clear(); doStart(); } else back(); };
  if (p.then === 'start') $('#b-x').innerHTML = `<span class="xs" style="color:var(--mute)">Saltar</span>`;
  $$('#b-tech button').forEach(b => b.onclick = () => { S.breathTech = b.dataset.t; saveS(); $$('#b-tech button').forEach(x => x.classList.toggle('on', x === b)); run(); });
  $('#b-vib').onclick = e => { S.breathVib = !S.breathVib; saveS(); e.currentTarget.classList.toggle('on', S.breathVib); };
  $('#b-voice').onclick = e => { S.breathVoice = !S.breathVoice; saveS(); e.currentTarget.classList.toggle('on', S.breathVoice); if (!S.breathVoice) N.stopSpeak(); };
  run();
};

/* =========================================================
   AJUSTES
   ========================================================= */
V.settings = el => {
  const pm = J(N.perms(), {});
  const set = (id, i, t, s, right, c = '#9A97B8') => `<button class="it" id="${id}">${ic(i, 20, `style="color:${c}"`)}<div style="flex:1"><b class="sm">${t}</b>${s ? `<p class="mute xs">${s}</p>` : ''}</div>${right}</button>`;
  const sw = on => `<span class="sw ${on ? 'on' : ''}"></span>`, chev = ic('chevR', 18);
  const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const daysTxt = S.reminderDays.length === 7 ? 'Todos los días' : S.reminderDays.length ? [1, 2, 3, 4, 5, 6, 0].filter(d => S.reminderDays.includes(d)).map(d => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d]).join(', ') : 'Ningún día';
  const perm = (k, t, sub) => `<button class="it" data-perm="${k}">${ic(pm[k] ? 'shield' : 'battery', 20, `style="color:${pm[k] ? '#78B3A6' : '#E6A85C'}"`)}<div style="flex:1"><b class="sm">${t}</b>${!pm[k] ? `<p class="mute xs">${sub}</p>` : ''}</div>${pm[k] ? `<span style="color:#78B3A6">${ic('check', 20)}</span>` : '<span class="badge">Activar</span>'}</button>`;
  el.innerHTML = `
  <h1 style="margin-top:10px">Ajustes</h1>
  <p class="grouplabel">Sueño</p>
  <div class="card lst" style="padding:2px 16px">
    ${set('st-goal', 'target', 'Meta de sueño', 'Para tu calificación y sugerencias', `<b>${S.goal} h</b>`, '#78B3A6')}
    ${set('st-rem', 'bell', 'Recordatorio para acostarte', S.reminderOn ? `Te avisa a las ${S.reminderTime}` : 'Apagado', sw(S.reminderOn), '#E6A85C')}
    ${S.reminderOn ? set('st-remt', 'clock', 'Hora del recordatorio', S.reminderTime, chev) + set('st-remd', 'calendar', 'Días del recordatorio', daysTxt, chev) : ''}
  </div>
  <p class="grouplabel">Alarma</p>
  <div class="card lst" style="padding:2px 16px">
    ${set('st-asnd', 'music', 'Sonido', (ALARM_SOUNDS.find(a => a[0] === S.alarmSound) || ALARM_SOUNDS[0])[1], chev, '#A89BE0')}
    ${set('st-vib', 'vibrate', 'Vibración', '', sw(S.vibrate), '#A89BE0')}
    ${set('st-ramp', 'sun', 'Subir volumen poco a poco', 'En minuto y medio', sw(S.ramp), '#A89BE0')}
    ${set('st-snz', 'clock', 'Posponer', `${S.snooze} minutos`, chev, '#A89BE0')}
  </div>
  <p class="grouplabel">Grabación</p>
  <div class="card lst" style="padding:2px 16px">
    ${set('st-sens', 'mic', 'Sensibilidad', { baja: 'Baja, para cuartos con ruido', media: 'Media', alta: 'Alta, para cuartos muy silenciosos' }[S.sens], chev)}
    ${set('st-clips', 'snore', 'Guardar audios', 'Ronquidos, habla y tos', sw(S.saveClips))}
    ${set('st-clean', 'trash', 'Borrar audios viejos', S.cleanDays ? `Después de ${S.cleanDays} días` : 'Nunca', chev)}
    ${set('st-test', 'sliders', 'Probar micrófono', 'Revisa que detecte bien', chev)}
  </div>
  <p class="grouplabel">Permisos</p>
  <div class="card lst" style="padding:2px 16px">
    ${perm('mic', 'Micrófono', 'Necesario para grabar la noche')}
    ${perm('notif', 'Notificaciones', 'Para la alarma y el recordatorio')}
    ${perm('exact', 'Alarmas exactas', 'Para que la alarma suene a tiempo')}
    ${perm('fullscreen', 'Alarma en pantalla completa', 'Para verla con el cel bloqueado')}
    ${perm('battery', 'Sin límite de batería', 'Recomendado para que Android no corte la grabación')}
  </div>
  ${settingsExtras()}
  <p class="grouplabel">Tus datos</p>
  <div class="card lst" style="padding:2px 16px">
    ${set('st-pdf', 'report', 'Reporte para el médico', 'PDF con tus últimos 30 días', chev)}
    ${set('st-exp', 'download', 'Exportar respaldo', 'Noches y notas en un archivo en Descargas', chev)}
    ${set('st-imp', 'upload', 'Importar respaldo', '', chev)}
    ${set('st-del', 'trash', 'Borrar todo', '', chev, '#D98C8C')}
  </div>
  <p class="grouplabel">Acerca de</p>
  <div class="card lst" style="padding:2px 16px">
    <a class="it" href="https://carloscuxil.github.io/SUENIOBONITO/privacidad.html" style="color:inherit;text-decoration:none">${ic('shield', 20, 'style="color:#78B3A6"')}<div style="flex:1"><b class="sm">Política de privacidad</b><p class="mute xs">Qué datos usa la app y dónde se guardan</p></div>${chev}</a>
    <div class="it">${ic('moon', 20, 'style="color:#A89BE0"')}<div style="flex:1"><b class="sm">Sueño</b><p class="mute xs">Versión ${esc((N.appVersion && N.appVersion()) || 'web')}</p></div></div>
  </div>
  <p class="mute xs" style="text-align:center;margin-top:22px;line-height:1.6">Todo se guarda solo en este celular.<br>Las fases se estiman por sonido; no es un estudio médico.</p>`;
  const tog = (id, key, after) => $('#' + id).onclick = () => { S[key] = !S[key]; saveS(); N.vibrate(10); after ? after() : $('.sw', $('#' + id)).classList.toggle('on', S[key]); };
  tog('st-vib', 'vibrate'); tog('st-ramp', 'ramp'); tog('st-clips', 'saveClips');
  tog('st-rem', 'reminderOn', () => { refresh(); if (S.reminderOn && !pm.notif) N.requestPerm('notif'); toast(S.reminderOn ? `Te aviso a las ${S.reminderTime}` : 'Recordatorio apagado'); });
  $('#st-goal').onclick = () => {
    let g = S.goal;
    openSheet(`<h2>Meta de sueño</h2><p class="mute sm">La mayoría de adultos necesita entre 7 y 9 horas.</p>
      <div class="row" style="justify-content:center;gap:26px;margin:26px 0"><button class="iconbtn" id="g-m" style="background:var(--surface);width:56px;height:56px">${ic('chevD', 24)}</button>
      <span style="font-family:var(--serif);font-size:56px;font-weight:300;min-width:130px;text-align:center" id="g-v" class="count">${g} h</span>
      <button class="iconbtn" id="g-p" style="background:var(--surface);width:56px;height:56px">${ic('chevU', 24)}</button></div>
      <button class="btn main" id="g-ok">Guardar</button>`, sh => {
      const u = () => $('#g-v', sh).textContent = g + ' h';
      $('#g-m', sh).onclick = () => { g = Math.max(5, g - .5); u(); N.vibrate(8); };
      $('#g-p', sh).onclick = () => { g = Math.min(11, g + .5); u(); N.vibrate(8); };
      $('#g-ok', sh).onclick = () => { S.goal = g; saveS(); closeSheet(); refresh(); };
    });
  };
  if (S.reminderOn) {
    $('#st-remt').onclick = () => {
      let v = S.reminderTime;
      openSheet(`<h2>Hora del recordatorio</h2><div style="margin:10px 0 16px">${wheelHtml('rm-wheel')}</div>
        ${S.alarmOn ? `<p class="hint">${ic('bulb', 18, 'style="color:#78B3A6"')}<span>Para tu meta, te conviene acostarte a las ${bedtimeFor(S.wake, S.goal)}. Un aviso 30 min antes funciona bien.</span></p>` : ''}
        <button class="btn main" id="rm-ok" style="margin-top:16px">Guardar</button>`, sh => {
        initWheel('rm-wheel', v, x => v = x);
        $('#rm-ok', sh).onclick = () => { S.reminderTime = v; saveS(); closeSheet(); refresh(); };
      });
    };
    $('#st-remd').onclick = () => {
      const sel = new Set(S.reminderDays);
      openSheet(`<h2>Días del recordatorio</h2><div class="row" style="gap:8px;justify-content:center;margin:20px 0">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="day ${sel.has(d) ? 'has' : ''}" data-d="${d}" style="width:42px;background:${sel.has(d) ? 'var(--amber)' : 'var(--surface)'};color:${sel.has(d) ? 'var(--ink)' : 'var(--paper)'}">${dayNames[d]}</button>`).join('')}</div>
        <button class="btn main" id="rd-ok">Guardar</button>`, sh => {
        $$('[data-d]', sh).forEach(b => b.onclick = () => { const d = +b.dataset.d; sel.has(d) ? sel.delete(d) : sel.add(d); b.style.background = sel.has(d) ? 'var(--amber)' : 'var(--surface)'; b.style.color = sel.has(d) ? 'var(--ink)' : 'var(--paper)'; });
        $('#rd-ok', sh).onclick = () => { S.reminderDays = [...sel]; saveS(); closeSheet(); refresh(); };
      });
    };
  }
  $('#st-asnd').onclick = () => alarmSoundSheet(refresh);
  const pick = (title, sub, opts, cur, onPick) => openSheet(`<h2>${title}</h2>${sub ? `<p class="mute sm">${sub}</p>` : ''}<div class="lst" style="margin-top:8px">${opts.map(([v, l, d]) => `<button class="it" data-o="${v}"><div style="flex:1"><b class="sm">${l}</b>${d ? `<p class="mute xs">${d}</p>` : ''}</div>${String(cur) === String(v) ? `<span style="color:#78B3A6">${ic('check', 20)}</span>` : ''}</button>`).join('')}</div>`, sh => {
    $$('[data-o]', sh).forEach(b => b.onclick = () => { onPick(b.dataset.o); saveS(); closeSheet(); refresh(); });
  });
  $('#st-snz').onclick = () => pick('Posponer', '', [[5, '5 minutos'], [9, '9 minutos'], [10, '10 minutos'], [15, '15 minutos']], S.snooze, v => S.snooze = +v);
  $('#st-sens').onclick = () => pick('Sensibilidad', 'Qué tan fuerte debe ser un sonido para contarlo.', [['baja', 'Baja', 'Para cuartos con ventilador o ruido de calle'], ['media', 'Media', 'Funciona bien en la mayoría de cuartos'], ['alta', 'Alta', 'Para cuartos muy silenciosos']], S.sens, v => S.sens = v);
  $('#st-clean').onclick = () => pick('Borrar audios viejos', 'Los audios ocupan espacio; las noches se quedan.', [[7, 'Después de 7 días'], [30, 'Después de 30 días'], [90, 'Después de 90 días'], [0, 'Nunca']], S.cleanDays, v => S.cleanDays = +v);
  $('#st-test').onclick = micTestSheet;
  $$('[data-perm]', el).forEach(b => b.onclick = () => { if (pm[b.dataset.perm]) return; if (b.dataset.perm === 'battery') toast('Busca "Sueño" en la lista y elige "Sin restricciones"'); N.requestPerm(b.dataset.perm); });
  $('#st-exp').onclick = exportBackup;
  $('#st-pdf').onclick = doctorPdf;
  bindSettingsExtras(el);
  $('#st-imp').onclick = () => N.importBackup();
  $('#st-del').onclick = () => confirmSheet('¿Borrar todo?', 'Se borran todas tus noches y audios de este celular. No se puede deshacer.', 'Borrar todo', true, () => { N.deleteAll(); invalidate(); toast('Datos borrados'); refresh(); });
};
function micTestSheet() {
  const r = N.testMic(true, S.sens);
  if (r === 'perm') { N.requestPerm('mic'); return; }
  openSheet(`<h2>Probar micrófono</h2><p class="mute sm">Quédate en silencio 3 segundos y luego ronca, habla o tose cerca del cel.</p>
    <div class="meter"><i id="mt-m"></i></div><p class="sm" style="margin-top:12px;min-height:40px" id="mt-o">Calibrando…</p>
    <button class="btn soft" id="mt-x" style="width:100%;margin-top:10px">Terminar prueba</button>`, sh => {
    let lastAt = 0;
    const iv = setInterval(() => {
      const t = J(N.testState(), {});
      $('#mt-m', sh).style.width = (t.level || 0) * 100 + '%';
      if (t.error) $('#mt-o', sh).textContent = 'No pude abrir el micrófono. Cierra otras apps que lo usen.';
      else if (t.ready && t.at && t.at !== lastAt && t.type) {
        lastAt = t.at;
        $('#mt-o', sh).innerHTML = `Detectado: <b>${t.type === 'posible' ? 'sonido corto' : TYPE_LABEL[t.type] || t.type}</b>, ${t.dur} s${t.type === 'posible' ? '<br><span class="mute xs">Si se repite cada pocos segundos lo cuento como ronquido.</span>' : ''}`;
      } else if (t.ready && !lastAt) $('#mt-o', sh).textContent = 'Listo. Haz un sonido.';
    }, 150);
    sh._iv = iv;
    $('#mt-x', sh).onclick = closeSheet;
  }, () => { clearInterval($('#sheet')._iv); N.testMic(false, S.sens); });
}
function exportBackup() {
  const list = J(N.listNights(), []);
  const full = list.map(n => getNight(n.id)).filter(Boolean);
  const name = N.exportBackup(JSON.stringify({ app: 'sueno', v: 2, at: Date.now(), settings: S, nights: full }));
  toast(name ? 'Respaldo guardado en Descargas' : 'No se pudo exportar');
}
window.onImport = text => {
  if (!text) { toast('No pude leer el archivo'); return; }
  const d = J(text, null);
  if (!d || d.app !== 'sueno' || !Array.isArray(d.nights)) { toast('Ese archivo no es un respaldo de Sueño'); return; }
  let c = 0;
  for (const n of d.nights) { if (n && n.id && n.start) { if (!n.summary) n.summary = analyze(n, S.goal); N.saveNight(JSON.stringify(n)); c++; } }
  invalidate(); toast(`Importé ${c} ${c === 1 ? 'noche' : 'noches'}`); refresh();
};

/* =========================================================
   BIENVENIDA
   ========================================================= */
let obStep = 0;
V.onboard = el => {
  const pm = J(N.perms(), {});
  const dots = `<div class="dots">${[0, 1, 2].map(i => `<i class="${i === obStep ? 'on' : ''}"></i>`).join('')}</div>`;
  if (obStep === 0) {
    el.innerHTML = `<div class="sky" style="height:520px">${stars(60, 500)}</div>
    <div class="rel" style="text-align:center;padding-top:110px">
      <div style="width:150px;height:150px;margin:0 auto;position:relative">${MOON.replace('class="moon"', 'class="moon" style="position:static;width:150px;height:150px"')}</div>
      <h1 style="margin-top:40px;font-size:36px">Duerme mejor,<br>noche a noche</h1>
      <p class="mute" style="margin:14px auto 0;max-width:300px">Mide tus fases de sueño, ronquidos y despertares, y te despierta en el mejor momento.</p>
      ${dots}<button class="btn main" id="ob-n" style="margin-top:20px">Siguiente</button></div>`;
  } else if (obStep === 1) {
    el.innerHTML = `<div style="padding-top:60px"><h1>Así funciona</h1>
      ${[['bed', '#78B3A6', 'Pon el cel en tu mesa de noche', 'Cerca de tu cabeza y conectado al cargador.'], ['lock', '#A89BE0', 'Bloquéalo y duerme', 'La app sigue grabando con la pantalla apagada.'], ['alarm', '#E6A85C', 'Despierta en sueño ligero', 'La alarma inteligente busca el mejor momento dentro de tu ventana.'], ['chart', '#78B3A6', 'Revisa tu noche', 'Calificación, fases, ronquidos, audios y consejos.']]
      .map(([i, c, h, b]) => `<div class="row" style="align-items:flex-start;gap:14px;margin-top:24px"><span class="ibox" style="background:var(--surface);color:${c};width:46px;height:46px;border-radius:14px">${ic(i, 22)}</span><div><b>${h}</b><p class="mute sm" style="margin-top:2px">${b}</p></div></div>`).join('')}
      ${dots}<button class="btn main" id="ob-n" style="margin-top:16px">Siguiente</button></div>`;
  } else {
    const prow = (k, i, h, b, req) => `<div class="row" style="gap:14px;padding:14px 0;border-bottom:1px solid var(--line)"><span class="ibox" style="background:var(--surface);color:${pm[k] ? '#78B3A6' : '#E6A85C'}">${ic(pm[k] ? 'check' : i, 20)}</span><div style="flex:1"><b class="sm">${h}${req ? '' : ' <span class="mute xs">(recomendado)</span>'}</b><p class="mute xs">${b}</p></div>${pm[k] ? '' : `<button class="badge" data-p="${k}">Permitir</button>`}</div>`;
    el.innerHTML = `<div style="padding-top:60px"><h1>Permisos</h1><p class="mute" style="margin-top:8px">Todo se queda en tu celular. Nada se sube a internet.</p>
      <div style="margin-top:16px">${prow('mic', 'mic', 'Micrófono', 'Para escuchar ronquidos y movimientos', true)}${prow('notif', 'bell', 'Notificaciones', 'Para la alarma y el recordatorio', true)}${prow('battery', 'battery', 'Sin límite de batería', 'Para que Android no corte la grabación', false)}</div>
      ${dots}<button class="btn main" id="ob-n" style="margin-top:16px" ${pm.mic ? '' : 'disabled'}>Empezar</button>
      ${pm.mic ? '' : '<p class="mute xs" style="text-align:center;margin-top:10px">Permite el micrófono para continuar.</p>'}</div>`;
    $$('[data-p]', el).forEach(b => b.onclick = () => { if (b.dataset.p === 'battery') toast('Busca "Sueño" en la lista y elige "Sin restricciones"'); N.requestPerm(b.dataset.p); });
  }
  $('#ob-n').onclick = () => {
    if (obStep < 2) { obStep++; show('onboard', {}); return; }
    S.onboarded = true; saveS(); go('home', {}, { reset: true });
  };
};

/* =========================================================
   ARRANQUE Y EVENTOS DEL SISTEMA
   ========================================================= */
function recover(live) {
  const open = J(N.listNights(), []).filter(n => n.status === 'recording' && !(live.recording && live.id === n.id));
  for (const n of open) {
    const full = getNight(n.id);
    if (!full || (full.minutes || []).length < 5) { N.deleteNight(n.id); continue; }
    finalize(n.id, { recovered: true });
  }
}
function routeTo(r) {
  if (!r) return;
  const lv = J(N.live(), {});
  if (r === 'sunrise') { if (lv.ringing) go('alarm', {}, { reset: true }); else if (lv.recording) go('sunrise', {}, { reset: true }); return; }
  if (r === 'alarm') { if (lv.ringing) go('alarm', {}, { reset: true }); else if (lv.recording) go('recording', {}, { reset: true }); return; }
  if (r === 'stop' || r === 'alarmedit' || r === 'recording') { if (lv.recording) go('recording', { ask: r === 'stop' ? 'stop' : r === 'alarmedit' ? 'alarm' : '' }, { reset: true }); return; }
  if (lv.recording) { go('recording', {}, { reset: true }); return; }
  if (r === 'prepare') go('prepare', {}, { reset: true });
  else if (r === 'relax') go('relax', {}, { reset: true });
  else if (r === 'last') { const l = nights()[0]; if (l) go('detail', { id: l.id }, { reset: true }); }
  else if (r === 'home') go('home', {}, { reset: true });
}
window.onRoute = routeTo;
window.onBack = () => back();
window.onPerms = () => { if (current && ['onboard', 'settings'].includes(current.v)) refresh(); };
window.onResumeApp = () => {
  invalidate();
  const lv = J(N.live(), {});
  if (lv.ringing && !['alarm', 'mission'].includes(current.v)) { go('alarm', {}, { reset: true }); return; }
  if (lv.recording && !['recording', 'alarm', 'mission', 'sunrise'].includes(current.v)) { go('recording', {}, { reset: true }); return; }
  if (current && ['home', 'settings', 'stats', 'diary'].includes(current.v)) refresh();
};
