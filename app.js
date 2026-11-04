import { html, render, useState, useEffect, useMemo, useRef } from './vendor/htm-preact.module.js';
import { fmtNum, fmtInt, fmtTime, fmtDuration, fmtDate, norm, plural, parseTimeInput, typeTime } from './js/util.js';
import {
  getConfig, setConfig, getActive, setActive as storeActive, call, loadCachedData, refreshData,
  getQueue, queueStatus, onQueueChange, enqueueSave, enqueueDelete, flushQueue,
} from './js/store.js';
import {
  MODE, buildModel, exerciseInfo, routineList, orderRoutines, previousSession, previousFor,
  fieldsFor, fmtSet, historyBest,
} from './js/model.js';
import * as W from './js/workout.js';
import { buildSummary } from './js/summary.js';
import { renderImage, shareImage, copyText } from './js/strava.js';

export const VERSION = '0.3.1';

// ---------- zvuk, displej, čas ----------

let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* bez zvuku */ }
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });

function beep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [0, 0.3, 0.6].forEach((d) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.5, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
    o.connect(g).connect(audioCtx.destination);
    o.start(t + d);
    o.stop(t + d + 0.22);
  });
}

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Displej během tréninku nezhasne (Screen Wake Lock, obnoví se po návratu do appky)
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let alive = true;
    const get = async () => {
      try {
        if (alive && 'wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch { /* nepodporováno */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) lock.release().catch(() => {});
    };
  }, []);
}

// ---------- drobné prvky ----------

function SyncPill({ qs }) {
  let text = 'Uloženo';
  let cls = 'ok';
  if (qs.pending) {
    text = qs.sending ? 'Odesílám...' : 'Čeká na odeslání';
    cls = 'wait';
  }
  return html`<span class=${'pill ' + cls} title=${qs.error || ''} onClick=${() => flushQueue()}>${text}</span>`;
}

function Sheet({ onClose, children, full }) {
  return html`<div class="overlay" onClick=${onClose}>
    <div class=${'sheet' + (full ? ' full' : '')} onClick=${(e) => e.stopPropagation()}>${children}</div>
  </div>`;
}

function Toast({ text }) {
  return text ? html`<div class="toast">${text}</div>` : null;
}

// ---------- nastavení ----------

function Settings({ data, qs, onSaved, onBack }) {
  const cfg = getConfig() || {};
  const [url, setUrl] = useState(cfg.url || '');
  const [key, setKey] = useState(cfg.key || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save(e) {
    e.preventDefault();
    const c = { url: url.trim(), key: key.trim() };
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(c.url)) {
      setMsg('Adresa má tvar https://script.google.com/macros/s/.../exec');
      return;
    }
    setBusy(true);
    setMsg('Ověřuji...');
    try {
      const r = await call('ping', {}, c);
      setConfig(c);
      setMsg(`Spojeno s tabulkou „${r.name}“, stahuji data...`);
      await onSaved();
    } catch (err) {
      setMsg('Nejde to: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return html`<main>
    <header class="top">
      ${onBack ? html`<button class="link" onClick=${onBack}>Zpět</button>` : html`<span></span>`}
      <h1 class="small">Nastavení</h1>
      <span></span>
    </header>
    <form class="card form" onSubmit=${save}>
      <label>Adresa skriptu
        <input type="url" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </label>
      <label>Tajný klíč
        <input type="password" value=${key} onInput=${(e) => setKey(e.target.value)} autocomplete="off" autocapitalize="off" spellcheck="false" />
      </label>
      <button class="primary" disabled=${busy}>Uložit a ověřit</button>
      ${msg && html`<p class="muted">${msg}</p>`}
    </form>
    ${data && html`<section class="card">
      <p>V telefonu: ${data.exercises.length} cviků, ${data.workouts.length} tréninků, ${data.sets.length} sérií.</p>
      <p class="muted">Staženo ${new Date(data.fetchedAt).toLocaleString('cs-CZ')}</p>
      <p class="muted">Ve frontě k odeslání: ${qs.pending}${qs.error ? ' · chyba: ' + qs.error : ''}</p>
      <div class="row-btns">
        <button onClick=${onSaved}>Obnovit data</button>
        <button onClick=${() => flushQueue()}>Odeslat teď</button>
      </div>
    </section>`}
    <p class="muted center">Reformer ${VERSION}</p>
  </main>`;
}

// ---------- úvodní obrazovka ----------

function Home({ model, active, qs, onStart, onResume, onSettings, onOpen }) {
  const routines = useMemo(() => (model ? orderRoutines(model, routineList(model)) : []), [model]);
  const recent = model ? model.workouts.slice(0, 5) : [];
  return html`<main>
    <header class="top">
      <h1>Reformer</h1>
      <div class="top-right"><${SyncPill} qs=${qs} /><button class="icon" onClick=${onSettings} aria-label="Nastavení">⚙︎</button></div>
    </header>
    ${active && html`<button class="card resume" onClick=${onResume}>
      <strong>Rozpracovaný trénink</strong><span>${active.title} · pokračovat</span>
    </button>`}
    ${!model && html`<p class="muted">Načítám data...</p>`}
    ${routines.map((r, i) => html`<section class=${'card routine' + (i === 0 ? ' next' : '')}>
      <div class="routine-head">
        <div><h2>${r.name}</h2>${i === 0 && html`<span class="badge">Na řadě</span>`}</div>
      </div>
      ${r.note && html`<p class="muted">${r.note}</p>`}
      <ul class="routine-list">
        ${r.exercises.map((e) => html`<li>${e.sets.length}× ${e.name}</li>`)}
      </ul>
      <button class="primary wide" onClick=${() => onStart(r)}>Začít trénink</button>
    </section>`)}
    ${model && !routines.length && html`<p class="muted">V listu Rutiny zatím nic není.</p>`}
    ${model && html`<button class="wide" onClick=${() => onStart(null)}>Prázdný trénink</button>`}
    ${recent.length > 0 && html`<section class="card">
      <h3>Historie</h3>
      <ul class="history">
        ${recent.map((w) => html`<li><button class="history-item" onClick=${() => onOpen(w.id)}>
          <span>${fmtDate(w.date)}</span><span>${w.routine}</span></button></li>`)}
      </ul>
    </section>`}
  </main>`;
}

// ---------- trénink ----------

const TYPE_LABEL = { W: 'W', F: 'F', D: 'D' };
const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

function SetRow({ w, ex, set, idx, info, prev, onUpdate, onConfirm, onType }) {
  const fields = fieldsFor(info.mode);
  const num = ex.sets.filter((s) => s.type !== 'W').indexOf(set) + 1;
  const placeholder = (f) => {
    const t = set.target || {};
    if (f === 'reps' && t.reps) return t.reps.text;
    const v = t[f] !== undefined && t[f] !== null ? t[f] : prev ? prev[f] : null;
    if (v === null || v === undefined) return f === 'kg' && info.mode === MODE.BODY ? '+0' : '';
    return f === 'time' ? fmtTime(v) : fmtNum(v);
  };
  const mode = { kg: 'decimal', km: 'decimal', reps: 'numeric', time: 'numeric' };
  return html`<div class=${'set-row' + (set.done ? ' done' : '')}>
    <button class=${'set-num t-' + set.type} onClick=${onType}>${TYPE_LABEL[set.type] || num}</button>
    <button class="prev" disabled=${!prev} onClick=${() => {
      if (!prev) return;
      onUpdate((cur) => {
        let n = cur;
        fields.forEach((f) => {
          const v = prev[f];
          n = W.updateInput(n, ex.key, set.id, f, v === null || v === undefined ? '' : f === 'time' ? fmtTime(v) : fmtNum(v));
        });
        return n;
      }, false);
    }}>${prev ? fmtSet(prev, info.mode).replace(/ × /g, '×').replace(' km', 'km') : '-'}</button>
    ${fields.map((f) => html`<input class=${'val f-' + f} type="text" inputmode=${mode[f]} enterkeyhint="done"
      value=${set.input[f]} placeholder=${placeholder(f)}
      onInput=${(e) => onUpdate((cur) => W.updateInput(cur, ex.key, set.id, f, f === 'time' ? typeTime(e.target.value) : e.target.value), false)}
      onBlur=${(e) => {
        if (f === 'time' && e.target.value) {
          const s = parseTimeInput(e.target.value);
          if (s !== null) onUpdate((cur) => W.updateInput(cur, ex.key, set.id, f, fmtTime(s)), false);
        }
      }} />`)}
    ${fields.length === 1 && html`<span></span>`}
    <button class=${'check' + (set.done ? ' on' : '')} onClick=${onConfirm} aria-label="Potvrdit sérii">${set.pr ? '🏆' : '✓'}</button>
    <button class="del" onClick=${() => onUpdate((cur) => W.deleteSet(cur, ex.key, set.id), set.done)} aria-label="Smazat sérii">✕</button>
  </div>`;
}

function ExerciseCard({ w, ex, model, onUpdate, onMenu, onDetail, onRest, onType, toast }) {
  const info = exerciseInfo(model, ex.name);
  const prevSes = previousSession(model, ex.name, w.id);
  const fields = fieldsFor(info.mode);
  const head = { kg: info.mode === MODE.BODY ? '+KG' : 'KG', reps: 'OPAK.', time: 'ČAS', km: 'KM' };
  const pinned = [info.coach, ex.routineNote].filter(Boolean).join(' · ');
  const [noteOpen, setNoteOpen] = useState(!!ex.note);

  function confirm(set) {
    if (set.done) {
      onUpdate((cur) => W.unconfirmSet(cur, ex.key, set.id), true);
      return;
    }
    unlockAudio();
    onUpdate((cur) => {
      const r = W.confirmSet(cur, ex.key, set.id, model);
      if (r.error) toast(r.error);
      return r.workout;
    }, true);
  }

  return html`<section class=${'card exercise' + (ex.superset ? ' superset' : '')} data-ss=${ex.superset || ''}>
    <div class="ex-head">
      <button class="ex-title" onClick=${() => onDetail(ex.name)}>
        <span class="thumb">${(info.cz || info.name).slice(0, 1).toUpperCase()}</span>
        <span><strong>${ex.name}</strong>${info.cz && html`<small>${info.cz}</small>`}</span>
      </button>
      <button class="icon" onClick=${() => onMenu(ex.key)} aria-label="Menu cviku">⋮</button>
    </div>
    ${ex.superset && html`<span class="ss-tag">Superset ${ex.superset}</span>`}
    ${pinned && html`<p class="pinned">📌 ${pinned}</p>`}
    ${noteOpen && html`<textarea class="note" rows="1" placeholder="Poznámka ke cviku" value=${ex.note}
      onInput=${(e) => onUpdate((cur) => W.patch(cur, (n) => { n.exercises.find((x) => x.key === ex.key).note = e.target.value; }), false)}
      onBlur=${() => onUpdate((cur) => cur, true)}></textarea>`}
    <div class="ex-tools">
      <button class="rest-chip" onClick=${() => onRest(ex.key)}>⏱ Odpočinek ${ex.rest ? fmtTime(ex.rest) : 'vypnutý'}</button>
      ${!noteOpen && html`<button class="link small" onClick=${() => setNoteOpen(true)}>+ Poznámka</button>`}
    </div>
    <div class=${'set-row head' + (fields.length === 1 ? ' one' : '')}>
      <span>SÉRIE</span><span>MINULE</span>${fields.map((f) => html`<span>${head[f]}</span>`)}${fields.length === 1 && html`<span></span>`}<span>✓</span><span></span>
    </div>
    ${ex.sets.map((s, i) => html`<${SetRow} key=${s.id} w=${w} ex=${ex} set=${s} idx=${i} info=${info}
      prev=${previousFor(prevSes, s, ex.sets)}
      onUpdate=${onUpdate} onConfirm=${() => confirm(s)} onType=${() => onType(ex.key, s.id)} />`)}
    <button class="add-set" onClick=${() => onUpdate((cur) => W.addSet(cur, ex.key), false)}>+ Přidat sérii</button>
  </section>`;
}

function RestBar({ w, onUpdate, now }) {
  const beeped = useRef(null);
  const stale = w.restEnd && w.restEnd - now < -15000;
  useEffect(() => {
    if (stale) onUpdate((cur) => W.patch(cur, (n) => { n.restEnd = null; }), false);
  }, [stale]);
  if (!w.restEnd) return null;
  const left = Math.min(w.restTotal || Infinity, Math.ceil((w.restEnd - Math.max(now, Date.now())) / 1000));
  if (left <= 0 && beeped.current !== w.restEnd) {
    beeped.current = w.restEnd;
    if (left > -3) beep();
  }

  const over = left <= 0;
  const pct = w.restTotal ? Math.max(0, Math.min(100, (left / w.restTotal) * 100)) : 0;
  const shift = (d) => onUpdate((cur) => W.patch(cur, (n) => { n.restEnd = Math.max(Date.now(), n.restEnd) + d * 1000; n.restTotal = Math.max(n.restTotal, Math.ceil((n.restEnd - Date.now()) / 1000)); }), false);
  return html`<div class=${'rest-bar' + (over ? ' over' : '')}>
    <div class="rest-progress" style=${'width:' + pct + '%'}></div>
    <button onClick=${() => shift(-15)}>-15 s</button>
    <strong>${over ? 'Odpočinek skončil' : fmtTime(left)}</strong>
    <button onClick=${() => shift(15)}>+15 s</button>
    <button class="primary" onClick=${() => onUpdate((cur) => W.patch(cur, (n) => { n.restEnd = null; }), false)}>${over ? 'OK' : 'Přeskočit'}</button>
  </div>`;
}

function ExercisePicker({ model, onPick, onClose, title }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const all = [...model.exercises.values()];
    const nq = norm(q.trim());
    return all
      .filter((e) => !nq || norm(e.name + ' ' + e.cz).includes(nq))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }, [q, model]);
  return html`<${Sheet} onClose=${onClose} full>
    <div class="sheet-head"><strong>${title}</strong><button class="link" onClick=${onClose}>Zavřít</button></div>
    <input class="search" type="search" placeholder="Hledat cvik" value=${q} onInput=${(e) => setQ(e.target.value)} autofocus />
    <ul class="pick-list">
      ${list.map((e) => html`<li><button onClick=${() => onPick(e.name)}><strong>${e.name}</strong>${e.cz && html`<small>${e.cz}</small>`}</button></li>`)}
      ${q.trim() && !list.some((e) => norm(e.name) === norm(q.trim())) && html`<li><button onClick=${() => onPick(q.trim())}><strong>Nový cvik „${q.trim()}“</strong><small>doplň ho pak do listu Cviky</small></button></li>`}
    </ul>
  </${Sheet}>`;
}

function ExerciseDetail({ model, name, onClose }) {
  const info = exerciseInfo(model, name);
  const best = historyBest(model, name, info.mode, null);
  let bestDate = '';
  if (best) {
    const h = (model.history.get(name) || []).find((x) => x.sets.includes(best));
    bestDate = h ? fmtDate(h.date) : '';
  }
  const sessions = (model.history.get(name) || []).slice(0, 5);
  return html`<${Sheet} onClose=${onClose} full>
    <div class="sheet-head"><strong>${info.name}</strong><button class="link" onClick=${onClose}>Zavřít</button></div>
    ${info.cz && html`<p class="muted">${info.cz}</p>`}
    ${info.coach && html`<p class="pinned">📌 ${info.coach}</p>`}
    ${info.howto.length > 0 && html`<h3>Provedení</h3><ul class="howto">${info.howto.map((b) => html`<li>${b}</li>`)}</ul>`}
    ${(info.primary.length > 0 || info.secondary.length > 0) && html`<p class="muted">Partie: ${info.primary.join(', ')}${info.secondary.length ? ' · vedlejší: ' + info.secondary.join(', ') : ''}</p>`}
    ${best && html`<h3>Maximum</h3><p>${fmtSet(best, info.mode)}${bestDate ? ', ' + bestDate : ''}</p>`}
    ${sessions.length > 0 && html`<h3>Historie</h3><ul class="history">
      ${sessions.map((s) => html`<li><span>${fmtDate(s.date)}</span><span>${s.sets.map((x) => fmtSet(x, info.mode)).join(', ')}</span></li>`)}
    </ul>`}
  </${Sheet}>`;
}

function Workout({ model, w, qs, onUpdate, onFinish, onDiscard, onHome }) {
  useWakeLock();
  const now = useNow(1000);
  const st = W.stats(w, model);
  const [picker, setPicker] = useState(null);
  const [menu, setMenu] = useState(null);
  const [detail, setDetail] = useState(null);
  const [typeFor, setTypeFor] = useState(null);
  const [restFor, setRestFor] = useState(null);
  const [toastText, setToastText] = useState('');
  const toast = (t) => { setToastText(t); setTimeout(() => setToastText(''), 2000); };

  // Zapomenutý trénink: po 3 hodinách se zeptá jednou
  useEffect(() => {
    if (w.asked3h || now - new Date(w.start).getTime() < 3 * 3600 * 1000) return;
    const done = window.confirm('Trénink běží přes 3 hodiny. Skončil jsi?');
    onUpdate((cur) => W.patch(cur, (n) => { n.asked3h = true; }), false);
    if (done) onFinish();
  }, [Math.floor(now / 60000)]);

  const menuEx = menu && w.exercises.find((e) => e.key === menu);
  const typeSet = typeFor && w.exercises.find((e) => e.key === typeFor.exKey)?.sets.find((s) => s.id === typeFor.setId);

  return html`<main class="workout">
    <header class="wbar">
      <button class="link" onClick=${onHome}>Úvod</button>
      <div class="wmid">
        <div class="wstats">
          <span><small>Délka</small>${fmtTime(Math.floor((now - new Date(w.start).getTime()) / 1000))}</span>
          <span><small>Objem</small>${fmtInt(st.volume)} kg</span>
          <span><small>Série</small>${st.sets}</span>
        </div>
        <${SyncPill} qs=${qs} />
      </div>
      <button class="primary" onClick=${onFinish}>Dokončit</button>
    </header>
    <div class="wtitle">
      <input class="title-input" value=${w.title} onInput=${(e) => onUpdate((cur) => W.patch(cur, (n) => { n.title = e.target.value; }), false)} />
    </div>
    ${w.routineNote && html`<p class="pinned">📌 ${w.routineNote}</p>`}
    ${w.exercises.map((ex) => html`<${ExerciseCard} key=${ex.key} w=${w} ex=${ex} model=${model}
      onUpdate=${onUpdate} onMenu=${setMenu} onDetail=${setDetail} onRest=${setRestFor}
      onType=${(exKey, setId) => setTypeFor({ exKey, setId })} toast=${toast} />`)}
    <button class="wide" onClick=${() => setPicker({ mode: 'add' })}>+ Přidat cvik</button>
    <button class="wide danger" onClick=${onDiscard}>Zahodit trénink</button>
    <div class="spacer"></div>

    <${RestBar} w=${w} onUpdate=${onUpdate} now=${now} />
    <${Toast} text=${toastText} />

    ${picker && html`<${ExercisePicker} model=${model} title=${picker.mode === 'add' ? 'Přidat cvik' : 'Nahradit cvik'}
      onClose=${() => setPicker(null)}
      onPick=${(name) => {
        onUpdate((cur) => (picker.mode === 'add' ? W.addExercise(cur, name) : W.replaceExercise(cur, picker.key, name)), true);
        setPicker(null);
      }} />`}
    ${detail && html`<${ExerciseDetail} model=${model} name=${detail} onClose=${() => setDetail(null)} />`}
    ${menuEx && html`<${Sheet} onClose=${() => setMenu(null)}>
      <div class="sheet-head"><strong>${menuEx.name}</strong></div>
      <div class="menu">
        <button onClick=${() => { setPicker({ mode: 'replace', key: menuEx.key }); setMenu(null); }}>Nahradit cvik</button>
        <button onClick=${() => { onUpdate((cur) => W.moveExercise(cur, menuEx.key, -1), true); setMenu(null); }}>Posunout nahoru</button>
        <button onClick=${() => { onUpdate((cur) => W.moveExercise(cur, menuEx.key, 1), true); setMenu(null); }}>Posunout dolů</button>
        <button onClick=${() => { onUpdate((cur) => W.toggleSuperset(cur, menuEx.key), true); setMenu(null); }}>${menuEx.superset ? 'Odebrat ze supersetu' : 'Superset s dalším cvikem'}</button>
        <button class="danger" onClick=${() => {
          if (window.confirm('Odebrat cvik i s jeho sériemi?')) onUpdate((cur) => W.removeExercise(cur, menuEx.key), true);
          setMenu(null);
        }}>Odebrat cvik</button>
      </div>
    </${Sheet}>`}
    ${restFor && html`<${Sheet} onClose=${() => setRestFor(null)}>
      <div class="sheet-head"><strong>Odpočinek</strong></div>
      <div class="grid-btns">
        ${REST_OPTIONS.map((r) => html`<button class=${w.exercises.find((e) => e.key === restFor)?.rest === r ? 'primary' : ''}
          onClick=${() => { onUpdate((cur) => W.patch(cur, (n) => { n.exercises.find((e) => e.key === restFor).rest = r; }), false); setRestFor(null); }}>${r ? fmtTime(r) : 'vypnutý'}</button>`)}
      </div>
    </${Sheet}>`}
    ${typeSet && html`<${Sheet} onClose=${() => setTypeFor(null)}>
      <div class="sheet-head"><strong>Série</strong></div>
      <div class="grid-btns">
        ${[['W', 'Rozcvička'], ['N', 'Normální'], ['F', 'Do selhání'], ['D', 'Drop']].map(([t, label]) => html`<button class=${typeSet.type === t ? 'primary' : ''}
          onClick=${() => { onUpdate((cur) => W.setType(cur, typeFor.exKey, typeFor.setId, t), typeSet.done); setTypeFor(null); }}>${label}</button>`)}
      </div>
      <p class="muted">Opakování v záloze</p>
      <div class="grid-btns five">
        ${[0, 1, 2, 3, 4].map((r) => html`<button class=${typeSet.rir === r ? 'primary' : ''}
          onClick=${() => onUpdate((cur) => W.setRir(cur, typeFor.exKey, typeFor.setId, typeSet.rir === r ? null : r), typeSet.done)}>${r}</button>`)}
      </div>
      <button class="wide danger" onClick=${() => { onUpdate((cur) => W.deleteSet(cur, typeFor.exKey, typeFor.setId), typeSet.done); setTypeFor(null); }}>Smazat sérii</button>
    </${Sheet}>`}
  </main>`;
}

// ---------- dokončení ----------

function Finish({ model, w, onSave, onBack, onDiscard }) {
  const st = W.stats(w, model);
  const open = w.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.done && (s.input.reps || s.input.time || s.input.kg)).length, 0);
  const [note, setNote] = useState(w.note || '');
  const duration = Date.now() - new Date(w.start).getTime();
  return html`<main>
    <header class="top"><button class="link" onClick=${onBack}>Zpět</button><h1 class="small">Dokončit trénink</h1><span></span></header>
    <section class="card">
      <h2>${w.title}</h2>
      <div class="sum-grid">
        <div><small>Délka</small><strong>${fmtDuration(duration)}</strong></div>
        <div><small>Objem</small><strong>${fmtInt(st.volume)} kg</strong></div>
        <div><small>Série</small><strong>${st.sets}</strong></div>
      </div>
      ${st.prs.length > 0 && html`<h3>Nová maxima</h3><ul class="prs">${st.prs.map((p) => html`<li>🏆 ${p.exercise} ${fmtSet(p, p.mode)}</li>`)}</ul>`}
      ${open > 0 && html`<p class="warn">${open} ${plural(open, 'nepotvrzená série se neuloží', 'nepotvrzené série se neuloží', 'nepotvrzených sérií se neuloží')}.</p>`}
      <label class="form">Poznámka k tréninku
        <textarea rows="3" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
      </label>
    </section>
    ${st.sets > 0
      ? html`<button class="primary wide" onClick=${() => onSave(note)}>Uložit trénink</button>`
      : html`<p class="muted center">Trénink nemá žádnou potvrzenou sérii.</p><button class="wide danger" onClick=${onDiscard}>Zahodit trénink</button>`}
  </main>`;
}

// Souhrn do Stravy: název, popis a obrázek ke zkopírování (appka se Stravou nekomunikuje)
function StravaCard({ s, toast }) {
  const [img, setImg] = useState({ blob: null, url: null, error: null });
  const key = JSON.stringify(s.image);
  useEffect(() => {
    let alive = true;
    let url = null;
    setImg({ blob: null, url: null, error: null });
    renderImage(s.image)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImg({ blob, url, error: null });
      })
      .catch((e) => { if (alive) setImg({ blob: null, url: null, error: e.message }); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [key]);

  const copy = async (text, what) => toast((await copyText(text)) ? `${what} zkopírován` : 'Kopírování se nepovedlo');
  async function save() {
    const r = await shareImage(img.blob, s.fileName);
    if (r === 'downloaded') toast('Obrázek stažen');
  }
  return html`<section class="card strava">
    <h3>Souhrn do Stravy</h3>
    <div class="strava-img">
      ${img.url ? html`<img src=${img.url} alt="Obrázek tréninku pro Stravu" />`
        : html`<p class="muted center">${img.error ? 'Obrázek: ' + img.error : 'Kreslím obrázek...'}</p>`}
    </div>
    <div class="strava-actions">
      <button onClick=${() => copy(s.name, 'Název')}>Kopírovat název</button>
      <button onClick=${() => copy(s.description, 'Popis')}>Kopírovat popis</button>
      <button class="primary" disabled=${!img.blob} onClick=${save}>Uložit obrázek</button>
    </div>
    <p class="strava-name">${s.name}</p>
    <pre class="strava-desc">${s.description}</pre>
  </section>`;
}

function Summary({ s, onDone, toast }) {
  return html`<main>
    <header class="top"><span></span><h1 class="small">Hotovo</h1><span></span></header>
    <section class="card">
      <h2>${s.title}</h2>
      <div class="sum-grid">
        <div><small>Délka</small><strong>${fmtDuration(s.duration)}</strong></div>
        <div><small>Objem</small><strong>${fmtInt(s.volume)} kg</strong></div>
        <div><small>Série</small><strong>${s.sets}</strong></div>
      </div>
      ${s.prs.length > 0 && html`<h3>Nová maxima</h3><ul class="prs">${s.prs.map((p) => html`<li>🏆 ${p.exercise} ${fmtSet(p, p.mode)}</li>`)}</ul>`}
      <p class="muted">Trénink se ukládá do tabulky na pozadí.</p>
    </section>
    ${s.strava && html`<${StravaCard} s=${s.strava} toast=${toast} />`}
    <button class="primary wide" onClick=${onDone}>Zpět na úvod</button>
  </main>`;
}

// Souhrn staršího tréninku z historie
function WorkoutSummary({ model, id, onBack, toast }) {
  const s = useMemo(() => buildSummary(model, id), [model, id]);
  return html`<main>
    <header class="top"><button class="link" onClick=${onBack}>Zpět</button><h1 class="small">Trénink</h1><span></span></header>
    ${s ? html`<${StravaCard} s=${s} toast=${toast} />` : html`<p class="muted center">Trénink už v datech není.</p>`}
  </main>`;
}

// ---------- appka ----------

function App() {
  const [data, setData] = useState(null);
  const [queue, setQueueState] = useState(getQueue());
  const [qs, setQs] = useState(queueStatus());
  const [active, setActiveState] = useState(getActive());
  const [view, setView] = useState(getConfig() ? (getActive() ? 'workout' : 'home') : 'settings');
  const [summary, setSummary] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [toastText, setToastText] = useState('');
  const toast = (t) => { setToastText(t); setTimeout(() => setToastText(''), 3000); };

  useEffect(() => onQueueChange((s) => { setQs(s); setQueueState(getQueue()); }), []);

  async function refresh() {
    try {
      setData(await refreshData());
    } catch (e) {
      toast('Data z tabulky: ' + e.message);
    }
  }

  useEffect(() => {
    (async () => {
      const cached = await loadCachedData().catch(() => null);
      if (cached) setData(cached);
      if (getConfig()) {
        flushQueue();
        if (navigator.onLine || !cached) refresh();
      }
    })();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }, []);

  const model = useMemo(() => (data ? buildModel(data, queue) : null), [data, queue]);

  // Každá změna se hned uloží v telefonu, potvrzené série se pošlou do tabulky.
  // Změna je funkce nad aktuálním tréninkem (ne nad kopií z dřívějšího vykreslení).
  const activeRef = useRef(active);
  function setActive(w) {
    activeRef.current = w;
    storeActive(w);
    setActiveState(w);
  }

  function update(change, sync) {
    let w = typeof change === 'function' ? change(activeRef.current) : change;
    if (!w) return;
    if (sync && w.exercises.some((e) => e.sets.some((s) => s.done))) w = { ...w, synced: true };
    setActive(w);
    if (sync && w.synced) {
      const snap = W.snapshot(w);
      enqueueSave(snap.workout, snap.sets);
    }
  }

  function start(routine) {
    if (active) {
      toast('Nejdřív dokonči rozpracovaný trénink');
      setView('workout');
      return;
    }
    update(W.createWorkout(routine), false);
    setView('workout');
  }

  function discard() {
    if (!window.confirm('Zahodit celý trénink? Série se smažou i z tabulky.')) return;
    if (activeRef.current.synced) enqueueDelete(activeRef.current.id);
    setActive(null);
    setView('home');
  }

  function save(note) {
    const w = { ...activeRef.current, note };
    const end = new Date().toISOString();
    const st = W.stats(w, model);
    const snap = W.snapshot(w, end);
    enqueueSave(snap.workout, snap.sets);
    // Souhrn do Stravy hned z uloženého stavu (trénink z fronty po odeslání na chvíli z modelu zmizí)
    let strava = null;
    try {
      strava = buildSummary(buildModel(data, { ...getQueue(), [snap.workout.id]: { op: 'save', workout: snap.workout, sets: snap.sets } }), snap.workout.id);
    } catch (e) {
      toast('Souhrn do Stravy: ' + e.message);
    }
    setSummary({ title: w.title, duration: Date.now() - new Date(w.start).getTime(), ...st, strava });
    setActive(null);
    setView('summary');
  }

  let screen;
  if (view === 'settings' || !getConfig()) {
    screen = html`<${Settings} data=${data} qs=${qs}
      onBack=${getConfig() ? () => setView(active ? 'workout' : 'home') : null}
      onSaved=${async () => { await refresh(); setView(active ? 'workout' : 'home'); }} />`;
  } else if (!model) {
    screen = html`<main><p class="muted center">Načítám data z tabulky...</p></main>`;
  } else if (view === 'workout' && active) {
    screen = html`<${Workout} model=${model} w=${active} qs=${qs} onUpdate=${update}
      onFinish=${() => setView('finish')} onDiscard=${discard} onHome=${() => setView('home')} />`;
  } else if (view === 'finish' && active) {
    screen = html`<${Finish} model=${model} w=${active} onSave=${save} onBack=${() => setView('workout')} onDiscard=${discard} />`;
  } else if (view === 'summary' && summary) {
    screen = html`<${Summary} s=${summary} toast=${toast} onDone=${() => { setSummary(null); setView('home'); refresh(); }} />`;
  } else if (view === 'past' && openId) {
    screen = html`<${WorkoutSummary} model=${model} id=${openId} toast=${toast} onBack=${() => setView('home')} />`;
  } else {
    screen = html`<${Home} model=${model} active=${active} qs=${qs} onStart=${start}
      onResume=${() => setView('workout')} onSettings=${() => setView('settings')}
      onOpen=${(id) => { setOpenId(id); setView('past'); }} />`;
  }
  return html`${screen}<${Toast} text=${toastText} />`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
