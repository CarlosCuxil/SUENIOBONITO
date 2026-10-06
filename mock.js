'use strict';
/* Simulación del puente nativo para probar la interfaz en un navegador.
   Dentro de la app de Android existe window.Android y esto no se usa. */
(function () {
  if (window.Android) return;
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const nights = () => JSON.parse(LS.get('mock-nights', '{}'));
  const saveAll = o => LS.set('mock-nights', JSON.stringify(o));
  let rng = 7; const r = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280);

  function fakeNight(start, len, opts = {}) {
    const n = { id: 'n' + start, start, end: start + len * 60000, status: 'done', minutes: [], events: [], goal: 8, sens: 'media', tags: opts.tags || [], mood: opts.mood || null, alarm: { on: true, wakeTs: start + len * 60000, win: 30, set: '06:30', rangAt: start + (len - 2) * 60000, snoozes: 0 } };
    for (let i = 0; i < len; i++) n.minutes.push([-55 + r() * 4, -45 + r() * 6]);
    const ev = (m, type, d = 1) => n.events.push({ t: start + m * 60000 + Math.floor(r() * 50000), d, p: 12 + r() * 10, type });
    const lat = opts.lat || 15;
    for (let m = 0; m < lat; m++) { ev(m, 'movimiento'); ev(m, 'movimiento'); }
    for (let m = lat; m < len - 8; m++) { if (r() < 0.035) ev(m, 'movimiento'); if (r() < 0.012) { ev(m, 'movimiento'); ev(m, 'ruido', 4); } }
    const sn = opts.snore || 0.1;
    let m0 = lat + 70;
    while (m0 < len - 20) { if (r() < sn * 3) { const l = 10 + Math.floor(r() * 25); for (let m = m0; m < Math.min(m0 + l, len - 10); m++) { const pz = r() < .15; for (let k = 0; k < 12; k++) { if (pz && k >= 5 && k <= 8) continue; n.events.push({ t: start + m * 60000 + k * 5000, d: 1.2, p: 15, type: 'ronquido' }); } } m0 += l; } m0 += 40; }
    if (opts.talk) ev(lat + 30, 'habla', 2.4);
    if (opts.cough) { ev(lat + 180, 'tos', .4); ev(lat + 181, 'tos', .4); }
    for (let m = len - 6; m < len; m++) { ev(m, 'movimiento'); ev(m, 'movimiento'); }
    if (opts.mattress) n.minutes.forEach((m, i) => { m.push(i < lat || i > len - 6 ? 10 : r() < .06 ? 6 : 0); });
    n.mattress = !!opts.mattress;
    n.caffeine = opts.caf != null ? opts.caf : null;
    n.nudges = opts.nudge ? [start + 200 * 60000, start + 260 * 60000] : [];
    n.events.sort((a, b) => a.t - b.t);
    if (opts.awake) for (let m = opts.awake; m < opts.awake + 5; m++) { ev(m, 'movimiento'); ev(m, 'movimiento'); ev(m, 'ruido', 3); }
    return n;
  }

  function seed() {
    const o = {};
    const now = new Date();
    const tagsets = [['Café', 'Ejercicio'], ['Ejercicio'], ['Café'], [], ['Alcohol'], ['Estrés', 'Café'], ['Ejercicio'], ['Pantallas tarde'], [], ['Alcohol', 'Cena pesada'], ['Ejercicio'], ['Café'], [], ['Ejercicio', 'Café'], ['Estrés'], [], ['Ejercicio'], ['Café'], ['Alcohol'], [], ['Ejercicio']];
    for (let k = 20; k >= 1; k--) {
      if (k === 12) continue;
      const d = new Date(now); d.setDate(d.getDate() - k); d.setHours(22 + (r() < .5 ? 1 : 0), Math.floor(r() * 50), 0, 0);
      const tags = tagsets[k] || [];
      const alc = tags.includes('Alcohol'), caf = tags.includes('Café');
      const len = 380 + Math.floor(r() * 110) - (alc ? 30 : 0);
      const n = fakeNight(d.getTime(), len, { tags, lat: caf ? 30 + Math.floor(r() * 15) : 10 + Math.floor(r() * 10), snore: alc ? .5 : .12, talk: r() < .3, cough: r() < .2, mood: 1 + Math.floor(r() * 3), awake: alc ? 220 : (r() < .3 ? 160 : 0), mattress: k % 2 === 0, caf: caf ? 60 + Math.floor(r() * 40) : 10 + Math.floor(r() * 30), nudge: alc });
      n.weather = { t: 14 + Math.round(r() * 90) / 10, h: 60 + Math.floor(r() * 30), p: 850, rain: r() < .4 ? Math.round(r() * 80) / 10 : 0, city: 'Ciudad de Guatemala' };
      if (k % 4 === 0) n.dream = 'Estaba en un mercado de Antigua y todo era de colores, alguien me regalaba un barrilete gigante.';
      n.summary = analyze(n);
      o[n.id] = n;
    }
    saveAll(o);
  }
  if (location.search.includes('demo') && !LS.get('mock-seeded', '')) { seed(); LS.set('mock-seeded', '1'); LS.set('mock-settings', JSON.stringify({ onboarded: true, alarmOn: true, wake: '06:30', win: 30, goal: 8 })); }

  let rec = null, sounds = { playing: false, layers: [], end: 0 }, test = null;
  const live = () => {
    if (!rec) return JSON.stringify({ recording: false, ringing: false, sounds: soundsState() });
    const now = Date.now();
    const lvl = Math.max(0, Math.sin(now / 700) * .4 + r() * .2);
    rec.wave.push(lvl); if (rec.wave.length > 60) rec.wave.shift();
    if (rec.alarm.on && !rec.ringing && now >= rec.alarm.wakeTs) { rec.ringing = true; rec.ringWhy = 'Es tu hora'; }
    return JSON.stringify({ recording: true, ringing: rec.ringing, ringWhy: rec.ringWhy || '', id: rec.id, start: rec.start, now, level: lvl, counts: rec.counts, wave: rec.wave, alarm: rec.alarm, minutes: Math.floor((now - rec.start) / 60000), sounds: soundsState(), mattress: rec.mattress, moving: r() < .3, nudges: rec.cfg.antiSnore !== 'off' ? 1 : 0, nap: rec.nap, sunrise: !!window.__sunrise });
  };
  function soundsState() { return { playing: sounds.playing, layers: sounds.layers, left: sounds.end ? Math.max(0, sounds.end - Date.now()) : 0 }; }

  window.MockBridge = {
    platform: () => 'web',
    takeRoute: () => { const m = location.hash.match(/route=(\w+)/); return m ? m[1] : ''; },
    getSettings: () => LS.get('mock-settings', '{}'),
    setSettings: j => LS.set('mock-settings', j),
    listNights: () => JSON.stringify(Object.values(nights()).sort((a, b) => b.start - a.start).map(n => { const c = { ...n }; delete c.minutes; delete c.events; return c; })),
    getNight: id => { const n = nights()[id]; return n ? JSON.stringify(n) : ''; },
    saveNight: j => { const o = nights(); const n = JSON.parse(j); o[n.id] = n; saveAll(o); },
    deleteNight: id => { const o = nights(); delete o[id]; saveAll(o); },
    deleteAll: () => saveAll({}),
    clips: id => JSON.stringify(nights()[id] ? [{ id: id + '_1_habla.wav', t: nights()[id].start + 45 * 60000, kind: 'habla' }, { id: id + '_2_ronquido.wav', t: nights()[id].start + 160 * 60000, kind: 'ronquido' }, { id: id + '_3_tos.wav', t: nights()[id].start + 230 * 60000, kind: 'tos' }, { id: id + '_4_ronquido.wav', t: nights()[id].start + 300 * 60000, kind: 'ronquido' }] : []),
    clipData: () => '',
    deleteClip: () => {},
    startNight: cfg => {
      const c = JSON.parse(cfg); const start = Date.now();
      rec = { id: 'n' + start, start, alarm: c.alarm || { on: false }, counts: { ronquido: 0 }, wave: [], ringing: false, cfg: c, mattress: c.mattress, nap: c.nap };
      if (c.aid && c.aid.types && c.aid.types.length) { sounds = { playing: true, layers: c.aid.types, end: Date.now() + c.aid.min * 60000 }; }
      return 'ok';
    },
    stopNight: () => {
      if (!rec) return '';
      const len = Math.max(420, Math.floor((Date.now() - rec.start) / 60000));
      const n = fakeNight(rec.start - (len - Math.floor((Date.now() - rec.start) / 60000)) * 60000, rec.nap ? 30 : len, { tags: rec.cfg.tags, talk: true, cough: true, snore: .2, mattress: rec.mattress, caf: rec.cfg.caffeine, nudge: true, lat: rec.nap ? 5 : 15 });
      n.nap = !!rec.nap;
      n.id = rec.id; n.alarm = { ...rec.alarm, rangAt: Date.now() };
      const o = nights(); o[n.id] = n; saveAll(o); rec = null; sounds.playing = false; return n.id;
    },
    live,
    snooze: () => { if (rec) { rec.ringing = false; rec.alarm.wakeTs = Date.now() + 9 * 60000; rec.alarm.win = 0; } },
    setAlarm: j => { if (rec) rec.alarm = JSON.parse(j); },
    keepScreenOn: () => {},
    playSounds: (j, min) => { sounds = { playing: true, layers: JSON.parse(j), end: min ? Date.now() + min * 60000 : 0 }; },
    setSoundVolume: (t, v) => { const l = sounds.layers.find(x => x.type === t); if (l) l.vol = v; },
    stopSounds: () => { sounds = { playing: false, layers: [], end: 0 }; },
    soundsState: () => JSON.stringify(soundsState()),
    previewAlarm: () => {}, stopPreview: () => {},
    testMic: on => { test = on ? { t0: Date.now() } : null; return 'ok'; },
    testState: () => JSON.stringify(test ? { running: true, ready: Date.now() - test.t0 > 3000, level: Math.abs(Math.sin(Date.now() / 400)) * .6, type: Date.now() - test.t0 > 6000 ? 'posible' : '', dur: 1.1, at: Date.now() } : { running: false }),
    perms: () => LS.get('mock-perms', JSON.stringify({ mic: true, notif: true, exact: true, battery: false, fullscreen: true })),
    requestPerm: () => { setTimeout(() => window.onPerms && window.onPerms(), 300); },
    vibrate: () => {}, speak: () => {}, stopSpeak: () => {},
    toast: m => console.log('toast', m),
    exportBackup: () => 'sueno-respaldo.json',
    importBackup: () => {},
    shareImage: () => {},
    refreshWidget: () => {},
    setBrightness: v => { document.body.style.filter = v < 0 ? '' : `brightness(${0.4 + v * 0.6})`; },
    shakeStart: () => { window.__sh = Date.now(); }, shakeStop: () => {}, shakeCount: () => Math.floor((Date.now() - (window.__sh || Date.now())) / 150),
    printReport: () => {}, rescheduleReminder: () => {}, setChrome: () => {}, appVersion: () => '1.1 (web)',
    alarmSounds: () => JSON.stringify(['amanecer', 'campanas', 'pajaros', 'clasica']),
  };
})();
