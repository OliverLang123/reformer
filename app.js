import { html, render, Component, useState, useEffect, useMemo, useRef } from './vendor/htm-preact.module.js';
import { fmtNum, fmtInt, fmtTime, fmtDuration, fmtDate, norm, plural, parseTimeInput, typeTime, typeNum, pragueDate } from './js/util.js';
import {
  getConfig, setConfig, getActive, setActive as storeActive, call, loadCachedData, refreshData,
  getQueue, queueStatus, onQueueChange, enqueueSave, enqueueDelete, enqueueExercise, flushQueue, updateCachedExercise,
  dropQueueItem, onStoreError, MIN_API,
} from './js/store.js';
import {
  MODE, buildModel, exerciseInfo, routineList, orderRoutines, previousSession, previousFor,
  fieldsFor, fmtSet, historyBest, isTimeMode, isTimeField, isWatchMode, dumbbellFactor,
  entryLine, setCalc, fmtBest, setVolume, bodyWeightOn, validateRoutines, groupByExercise, canonicalName,
} from './js/model.js';
import * as W from './js/workout.js';
import { buildSummary } from './js/summary.js';
import { renderImage, shareImage, copyText } from './js/strava.js';
import { fileId, mediaUrl, prefetchMedia, uploadVideo, uploadPhoto, photoFromSavedVideo, fmtSize } from './js/media.js';

export const VERSION = '0.7.2';

const LAST_SUMMARY = 'reformer.summary'; // ID tréninku, jehož souhrn je otevřený (přežije nové načtení appky)

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
function useWakeLock(on = true) {
  useEffect(() => {
    if (!on) return undefined;
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
  }, [on]);
}

// ---------- drobné prvky ----------

// Hlášení z míst mimo strom komponent (pilulka, úložiště); App sem dosadí svůj toast
let notifyUser = () => {};

function SyncPill({ qs }) {
  let text = 'Uloženo';
  let cls = 'ok';
  if (qs.failed.length) {
    text = 'Chyba odeslání';
    cls = 'err';
  } else if (qs.pending) {
    text = qs.sending ? 'Odesílám...' : 'Čeká na odeslání';
    cls = 'wait';
  }
  const tap = () => {
    if (qs.failed.length) notifyUser(`${qs.failed[0].label}: ${qs.failed[0].error}`, 6000);
    else if (qs.pending && qs.netError) notifyUser(qs.netError);
    flushQueue();
  };
  return html`<button class=${'pill ' + cls} onClick=${tap}>${text}</button>`;
}

// Varování nahoře: starý skript, špatný klíč, nová verze appky
function Notices({ data, qs, update, onSettings }) {
  const old = data && data.apiVersion !== undefined && data.apiVersion < MIN_API;
  return html`
    ${old && html`<p class="notice">Skript je starší než appka, nasaď ho (skript ${data.apiVersion}, appka potřebuje ${MIN_API}).</p>`}
    ${qs.badKey && html`<p class="notice">Skript odmítá klíč. ${onSettings && html`<button class="link" onClick=${onSettings}>Otevřít Nastavení</button>`}</p>`}
    ${update && html`<p class="notice">Nová verze, načte se po tréninku.</p>`}`;
}

// Text přes víc řádků, výška podle obsahu (název tréninku, poznámky)
function AutoText({ value, onInput, onBlur, cls, placeholder }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return html`<textarea ref=${ref} class=${cls} rows="1" placeholder=${placeholder || ''} value=${value}
    onInput=${onInput} onBlur=${onBlur}></textarea>`;
}

function Sheet({ onClose, children, full }) {
  return html`<div class="overlay" onClick=${onClose}>
    <div class=${'sheet' + (full ? ' full' : '')} onClick=${(e) => e.stopPropagation()}>${children}</div>
  </div>`;
}

function Toast({ text, action, onAction }) {
  if (!text) return null;
  return html`<div class="toast">${text}${action && html` <button class="toast-btn" onClick=${onAction}>${action}</button>`}</div>`;
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
      setMsg(`Spojeno s tabulkou „${r.name}“${r.version < MIN_API ? `, ale skript je starší než appka (verze ${r.version}, potřeba ${MIN_API})` : ''}, stahuji data...`);
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
    <${Notices} data=${data} qs=${qs} />
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
      <p class="muted">Ve frontě k odeslání: ${qs.pending}${qs.netError && qs.pending ? ' · ' + qs.netError : ''}</p>
      ${qs.failed.length > 0 && html`<ul class="failed">
        ${qs.failed.map((f) => html`<li>
          <div><strong>${f.label}</strong><small class="warn">${f.error}</small></div>
          <button class="danger" onClick=${() => {
            if (window.confirm(`Zahodit položku „${f.label}“? Její data v tabulce nebudou.`)) dropQueueItem(f.id);
          }}>Zahodit položku</button>
        </li>`)}
      </ul>`}
      <div class="row-btns">
        <button onClick=${onSaved}>Obnovit data</button>
        <button onClick=${() => flushQueue()}>Odeslat teď</button>
      </div>
    </section>`}
    <p class="muted center">Reformer ${VERSION}${data && data.apiVersion !== undefined ? ` · skript ${data.apiVersion}${data.apiVersion < MIN_API ? ` (potřeba ${MIN_API})` : ''}` : ''}</p>
  </main>`;
}

// ---------- úvodní obrazovka ----------

// Délka a objem tréninku do seznamu Historie
function workoutLine(model, w) {
  const bw = bodyWeightOn(model, String(w.date).slice(0, 10));
  let volume = 0;
  (model.setsBy.get(w.id) || []).forEach((s) => { volume += setVolume(s, exerciseInfo(model, s.exercise), bw); });
  const parts = [];
  if (w.start && w.end) parts.push(fmtDuration(new Date(w.end) - new Date(w.start)));
  if (volume) parts.push(`${fmtInt(volume)} kg`);
  return parts.join(' · ');
}

function HistoryItem({ model, w, onOpen }) {
  const line = workoutLine(model, w);
  return html`<li><button class="history-item" onClick=${() => onOpen(w.id)}>
    <span>${fmtDate(w.date)}</span><span>${w.routine}${line && html`<small>${line}</small>`}</span></button></li>`;
}

function Home({ model, data, active, qs, update, onStart, onResume, onSettings, onOpen, onHistory, onExercises }) {
  const routines = useMemo(() => (model ? orderRoutines(model, routineList(model)) : []), [model]);
  const issues = useMemo(() => (model ? validateRoutines(model) : []), [model]);
  const [issuesFor, setIssuesFor] = useState(null);
  const recent = model ? model.workouts.slice(0, 5) : [];
  return html`<main>
    <header class="top">
      <h1>Reformer</h1>
      <div class="top-right"><${SyncPill} qs=${qs} /><button class="icon" onClick=${onSettings} aria-label="Nastavení">⚙︎</button></div>
    </header>
    <${Notices} data=${data} qs=${qs} update=${update && !!active} onSettings=${onSettings} />
    ${active && html`<button class="card resume" onClick=${onResume}>
      <strong>Rozpracovaný trénink</strong><span>${active.title} · pokračovat</span>
    </button>`}
    ${!model && html`<p class="muted">Načítám data...</p>`}
    ${routines.map((r, i) => {
      const mine = issues.filter((x) => x.routine === r.name);
      return html`<section class=${'card routine' + (i === 0 ? ' next' : '')}>
      <div class="routine-head">
        <div><h2>${r.name}</h2>${i === 0 && html`<span class="badge">Na řadě</span>`}${r.week && html`<span class="badge plain">Týden ${r.week}</span>`}</div>
      </div>
      ${r.note && html`<p class="muted">${r.note}</p>`}
      ${mine.length > 0 && html`<button class="issues" onClick=${() => setIssuesFor(r.name)}>⚠ ${mine.length} ${plural(mine.length, 'problém', 'problémy', 'problémů')} v listu Rutiny</button>`}
      <ul class="routine-list">
        ${r.exercises.map((e) => html`<li>${e.sets.length}× ${e.name}</li>`)}
      </ul>
      <button class="primary wide" onClick=${() => onStart(r)}>Začít trénink</button>
    </section>`;
    })}
    ${model && !routines.length && html`<p class="muted">V listu Rutiny zatím nic není.</p>`}
    ${model && issues.some((x) => !x.routine) && html`<button class="issues" onClick=${() => setIssuesFor('')}>⚠ Problémy v listu Rutiny mimo rutiny</button>`}
    ${model && html`<div class="row-btns">
      <button onClick=${() => onStart(null)}>Prázdný trénink</button>
      <button onClick=${onExercises}>Cviky</button>
    </div>`}
    ${recent.length > 0 && html`<section class="card">
      <h3>Historie</h3>
      <ul class="history">
        ${recent.map((w) => html`<${HistoryItem} model=${model} w=${w} onOpen=${onOpen} />`)}
      </ul>
      <button class="link small" onClick=${onHistory}>Celá historie (${model.workouts.length})</button>
    </section>`}
    <p class="muted center">${data && data.fetchedAt ? `Data z ${new Date(data.fetchedAt).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' })} · ` : ''}Reformer ${VERSION}</p>
    ${issuesFor !== null && html`<${Sheet} onClose=${() => setIssuesFor(null)}>
      <div class="sheet-head"><strong>Problémy v listu Rutiny</strong><button class="link" onClick=${() => setIssuesFor(null)}>Zavřít</button></div>
      <ul class="issue-list">
        ${issues.filter((x) => x.routine === issuesFor).map((x) => html`<li><b>Řádek ${x.row}</b> ${x.text}</li>`)}
      </ul>
      <p class="muted">Trénink jde začít i tak. Opravu udělá trenér v listu Rutiny, pak dej Obnovit data.</p>
    </${Sheet}>`}
  </main>`;
}

// ---------- trénink ----------

const TYPE_LABEL = { W: 'W', F: 'F', D: 'D' };
const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

const has = (v) => v !== null && v !== undefined;

// Stopky v řádku série (cviky na čas): Start, Start L / Start P, běžící čas se Stop a ×
function WatchCtl({ w, ex, set, info, now, onWatch }) {
  const watch = w.watch;
  const mine = watch && watch.setId === set.id;
  if (mine) {
    const secs = Math.max(0, Math.floor((now - watch.start) / 1000));
    const reached = watch.target && secs >= watch.target;
    return html`<div class=${'watch-ctl running' + (reached ? ' over' : '')}>
      <strong>${watch.side ? watch.side + ' ' : ''}${fmtTime(secs)}</strong>
      ${watch.target ? html`<small>cíl ${fmtTime(watch.target)}</small>` : html`<small></small>`}
      <button class="primary" onClick=${() => onWatch('stop')}>Stop</button>
      <button class="watch-x" onClick=${() => onWatch('cancel')} aria-label="Zastavit bez zápisu">×</button>
    </div>`;
  }
  const side = info.mode === MODE.TIME_SIDE ? (set.watchSide || 'L') : '';
  return html`<div class="watch-ctl">
    <button disabled=${!!watch} onClick=${() => onWatch('start', ex.key, set.id)}>▶ Start${side ? ' ' + (side === 'L' ? 'L' : 'P') : ''}</button>
    ${side === 'R' && set.input.time && html`<small>L ${set.input.time}</small>`}
  </div>`;
}

function SetRow({ w, ex, set, info, prev, bw, now, onUpdate, onConfirm, onType, onWatch, onDelete }) {
  const fields = fieldsFor(info.mode);
  const num = ex.sets.filter((s) => s.type !== 'W').indexOf(set) + 1;
  const placeholder = (f) => {
    const t = set.target || {};
    if (f === 'reps' && t.reps) return t.reps.text;
    let v = has(t[f]) ? t[f] : prev && has(prev[f]) ? prev[f] : null;
    if (f === 'timeR' && !has(v)) v = has(t.time) ? t.time : prev && has(prev.time) ? prev.time : null;
    if (!has(v)) return f === 'kg' && info.mode === MODE.BODY ? '+0' : '';
    return isTimeField(f) ? fmtTime(v) : fmtNum(v);
  };
  const mode = { kg: 'decimal', km: 'decimal', reps: 'numeric', time: 'numeric', timeR: 'numeric' };
  const calc = set.done ? setCalc(W.setValues(set), info, bw) : '';
  const watchable = isWatchMode(info.mode) && !set.done && !w.edit;
  return html`<div class=${'set-row' + (set.done ? ' done' : '')}>
    <button class=${'set-num t-' + set.type} onClick=${onType}>${TYPE_LABEL[set.type] || num}</button>
    <button class="prev" disabled=${!prev} onClick=${() => {
      if (!prev) return;
      onUpdate((cur) => {
        let n = cur;
        fields.forEach((f) => {
          const v = prev[f];
          n = W.updateInput(n, ex.key, set.id, f, !has(v) ? '' : isTimeField(f) ? fmtTime(v) : fmtNum(v));
        });
        return n;
      }, false);
    }}>${prev ? fmtSet(prev, info.mode).replace(/ × /g, '×').replace(' km', 'km') : '-'}</button>
    ${fields.map((f) => html`<input class=${'val f-' + f} type="text" inputmode=${mode[f]} enterkeyhint="done"
      value=${set.input[f] || ''} placeholder=${placeholder(f)}
      onInput=${(e) => {
        const v = isTimeField(f) ? typeTime(e.target.value) : typeNum(e.target.value);
        if (v !== e.target.value) e.target.value = v;
        onUpdate((cur) => W.updateInput(cur, ex.key, set.id, f, v), false);
      }}
      onBlur=${(e) => {
        if (isTimeField(f) && e.target.value) {
          const s = parseTimeInput(e.target.value);
          if (s !== null) onUpdate((cur) => W.updateInput(cur, ex.key, set.id, f, fmtTime(s)), false);
        }
      }} />`)}
    ${fields.length === 1 && html`<span></span>`}
    <button class=${'check' + (set.done ? ' on' : '')} onClick=${onConfirm} aria-label="Potvrdit sérii">${set.pr ? '🏆' : '✓'}</button>
    <button class="del" onClick=${() => onDelete(ex.key, set.id)} aria-label="Smazat sérii">✕</button>
  </div>
  ${watchable && html`<${WatchCtl} w=${w} ex=${ex} set=${set} info=${info} now=${now} onWatch=${onWatch} />`}
  ${calc && html`<div class="set-calc">${calc}</div>`}`;
}

function ExerciseCard({ w, ex, model, now, onUpdate, onMenu, onDetail, onRest, onType, onWatch, onDelete, toast }) {
  const info = exerciseInfo(model, ex.name);
  const photo = useMedia(info.photo);
  const clip = useMedia(info.photo ? null : info.video);
  const prevSes = previousSession(model, ex.name, w.id, w.edit ? w.start : null);
  const fields = fieldsFor(info.mode);
  const bw = bodyWeightOn(model, pragueDate(new Date(w.start)));
  const kgHead = info.mode === MODE.BODY ? '+KG' : dumbbellFactor(info) === 2 ? 'KG (1 ks)' : 'KG';
  const side = info.mode === MODE.TIME_SIDE;
  const head = { kg: kgHead, reps: 'OPAK.', time: side ? 'ČAS L' : 'ČAS', timeR: 'ČAS P', km: 'KM' };
  const done = ex.sets.filter((s) => s.done);
  const total = done.reduce((a, s) => a + setVolume(W.setValues(s), info, bw), 0);
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
        <span class="thumb">${photo ? html`<img src=${photo} alt="" />`
          : clip ? html`<video src=${clip + '#t=0.1'} muted playsinline preload="metadata"></video>`
          : (info.cz || info.name).slice(0, 1).toUpperCase()}</span>
        <span><strong>${ex.name}</strong>${info.cz && html`<small>${info.cz}</small>`}</span>
      </button>
      <button class="icon" onClick=${() => onMenu(ex.key)} aria-label="Menu cviku">⋮</button>
    </div>
    <p class="entry">${entryLine(info, bw)}</p>
    ${ex.superset && html`<span class="ss-tag">Superset ${ex.superset}</span>`}
    ${pinned && html`<p class="pinned">📌 ${pinned}</p>`}
    ${noteOpen && html`<div class="forcoach"><span class="forcoach-icon" aria-hidden="true">💬</span><${AutoText} cls="note" placeholder="Jak to šlo, bolest, technika, co příště…" value=${ex.note}
      onInput=${(e) => onUpdate((cur) => W.patch(cur, (n) => { n.exercises.find((x) => x.key === ex.key).note = e.target.value; }), false)}
      onBlur=${() => onUpdate((cur) => cur, true)} /></div>`}
    <div class="ex-tools">
      <button class="rest-chip" onClick=${() => onRest(ex.key)}>⏱ Odpočinek ${ex.rest ? fmtTime(ex.rest) : 'vypnutý'}</button>
      ${!noteOpen && html`<button class="link small" onClick=${() => setNoteOpen(true)}>+ Pro trenéra</button>`}
    </div>
    <div class=${'set-row head' + (fields.length === 1 ? ' one' : '')}>
      <span>SÉRIE</span><span>MINULE</span>${fields.map((f) => html`<span>${head[f]}</span>`)}${fields.length === 1 && html`<span></span>`}<span>✓</span><span></span>
    </div>
    ${ex.sets.map((s) => html`<${SetRow} key=${s.id} w=${w} ex=${ex} set=${s} info=${info} bw=${bw} now=${now}
      prev=${previousFor(prevSes, s, ex.sets)} onDelete=${onDelete}
      onUpdate=${onUpdate} onConfirm=${() => confirm(s)} onType=${() => onType(ex.key, s.id)} onWatch=${onWatch} />`)}
    <button class="add-set" onClick=${() => onUpdate((cur) => W.addSet(cur, ex.key), false)}>+ Přidat sérii</button>
    ${done.length > 0 && !isTimeMode(info.mode) && html`<p class="ex-total">Cvik celkem: ${fmtInt(total)} kg</p>`}
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

// Běžící stopky velké v dolní liště (stejné místo jako odpočinek). Pípnutí při dosažení cíle,
// jen když je appka otevřená; po odemčení zůstane zvýraznění „Cíl splněn“.
function WatchBar({ w, now, onWatch }) {
  const beeped = useRef(null);
  const watch = w.watch;
  if (!watch) return null;
  const ex = w.exercises.find((e) => e.key === watch.exKey);
  const secs = Math.max(0, Math.floor((Math.max(now, Date.now()) - watch.start) / 1000));
  const reached = !!watch.target && secs >= watch.target;
  if (reached && beeped.current !== watch.start) {
    beeped.current = watch.start;
    if (secs - watch.target < 3) beep();
  }
  const side = watch.side === 'L' ? ' · levá' : watch.side === 'R' ? ' · pravá' : '';
  return html`<div class=${'rest-bar watch-bar' + (reached ? ' over' : '')}>
    <button class="watch-x" onClick=${() => onWatch('cancel')} aria-label="Zastavit bez zápisu">×</button>
    <div class="watch-mid">
      <small>${ex ? ex.name : 'Stopky'}${side}${watch.target ? ' · cíl ' + fmtTime(watch.target) : ''}</small>
      <strong>${fmtTime(secs)}</strong>
      ${reached && html`<small>Cíl splněn</small>`}
    </div>
    <button class="primary" onClick=${() => onWatch('stop')}>Stop</button>
  </div>`;
}

const MODE_OPTIONS = [MODE.WEIGHT, MODE.SIDE, MODE.BODY, MODE.TIME, MODE.TIME_SIDE, MODE.DIST];

// Nový cvik: zapíše se do listu Cviky (offline přes frontu) a jde hned použít
function NewExercise({ name: initial, model, onCreate, onClose }) {
  const [name, setName] = useState(initial);
  const [mode, setMode] = useState(MODE.WEIGHT);
  const [dumbbells, setDumbbells] = useState('');
  const [bw, setBw] = useState('1');
  const [err, setErr] = useState('');
  function submit(e) {
    e.preventDefault();
    const n = name.replace(/\s+/g, ' ').trim();
    if (!n) return setErr('Zadej název');
    if (n.length > 200) return setErr('Název je moc dlouhý');
    if (model.exercises.has(canonicalName(model, n))) return setErr('Cvik s tímto názvem už existuje');
    const ex = { name: n, mode };
    if (dumbbells) ex.dumbbells = Number(dumbbells);
    if (mode === MODE.BODY) {
      const f = Number(String(bw).replace(',', '.'));
      if (!Number.isFinite(f) || f < 0 || f > 1) return setErr('Podíl tělesné váhy je číslo 0 až 1');
      ex.bwFactor = f;
    }
    onCreate(ex);
    return undefined;
  }
  return html`<${Sheet} onClose=${onClose} full>
    <div class="sheet-head"><strong>Nový cvik</strong><button class="link" onClick=${onClose}>Zavřít</button></div>
    <form class="form" onSubmit=${submit}>
      <label>Název<input value=${name} onInput=${(e) => setName(e.target.value)} autocapitalize="words" /></label>
      <label>Zápis
        <select value=${mode} onChange=${(e) => setMode(e.target.value)}>
          ${MODE_OPTIONS.map((m) => html`<option value=${m}>${m}</option>`)}
        </select>
      </label>
      ${!isTimeMode(mode) && html`<label>Jednoručky
        <select value=${dumbbells} onChange=${(e) => setDumbbells(e.target.value)}>
          <option value="">nejde o jednoručky (v KG celková váha)</option>
          <option value="1">1 jednoručka</option>
          <option value="2">2 jednoručky (v KG váha jedné)</option>
        </select>
      </label>`}
      ${mode === MODE.BODY && html`<label>Podíl tělesné váhy (1 = celá, 0 = nepočítat)
        <input inputmode="decimal" value=${bw} onInput=${(e) => setBw(typeNum(e.target.value))} />
      </label>`}
      ${err && html`<p class="warn">${err}</p>`}
      <button class="primary">Založit cvik</button>
      <p class="muted">Cvik se zapíše do listu Cviky. Česky, partie a provedení doplní trenér.</p>
    </form>
  </${Sheet}>`;
}

function ExercisePicker({ model, onPick, onClose, title }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(null);
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
      ${q.trim() && !model.exercises.has(canonicalName(model, q)) && html`<li><button onClick=${() => setCreating(q.trim())}><strong>Nový cvik „${q.trim()}“</strong><small>založit a zapsat do listu Cviky</small></button></li>`}
    </ul>
    ${creating !== null && html`<${NewExercise} name=${creating} model=${model} onClose=${() => setCreating(null)}
      onCreate=${(ex) => { enqueueExercise(ex); setCreating(null); onPick(ex.name); }} />`}
  </${Sheet}>`;
}

// Object URL videa nebo fotky z odkazu v listu Cviky (z telefonu, jinak stáhne)
function useMedia(link) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    const id = fileId(link);
    if (id) mediaUrl(id).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [link]);
  return url;
}

// Video (bez zvuku, dokola) nebo fotka cviku a tlačítka pro nahrání
function ExerciseMedia({ info, onMedia }) {
  const video = useMedia(info.video);
  const photo = useMedia(info.photo);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  async function pick(e, kind) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    const size = fmtSize(file.size);
    try {
      const links = kind === 'video' ? await uploadVideo(info.name, file, (step) => setBusy(`${step} (${size})`)) : (setBusy(`Nahrávám fotku (${size})...`), await uploadPhoto(info.name, file));
      const fields = {};
      if (links.video) fields.video = links.video;
      if (links.photo) fields.photo = links.photo;
      await onMedia(info.name, fields);
    } catch (x) {
      setErr(x.message || String(x));
    } finally {
      setBusy('');
    }
  }
  // Video bez fotky (fotka se při nahrání nepovedla): doplnit z videa, jednou za otevření karty
  const tried = useRef(false);
  useEffect(() => {
    if (!video || info.photo || busy || tried.current) return;
    tried.current = true;
    setBusy('Dělám fotku z videa...');
    photoFromSavedVideo(info.name, video)
      .then((links) => onMedia(info.name, links))
      .catch((x) => setErr('Fotka z videa: ' + (x.message || x)))
      .finally(() => setBusy(''));
  }, [video, info.photo]);
  const has = info.video || info.photo;
  return html`<div class="media">
    ${video ? html`<video class="media-view" src=${video} poster=${photo || undefined} autoplay muted loop playsinline></video>`
      : photo ? html`<img class="media-view" src=${photo} alt="" />`
      : has ? html`<div class="media-view empty">Načítám video...</div>` : null}
    <div class="row-btns">
      <label class="btn">${info.video ? 'Nové video' : 'Natočit video'}<input type="file" accept="video/*" hidden disabled=${!!busy} onChange=${(e) => pick(e, 'video')} /></label>
      <label class="btn">${info.photo ? 'Nová fotka' : 'Nahrát fotku'}<input type="file" accept="image/*" hidden disabled=${!!busy} onChange=${(e) => pick(e, 'photo')} /></label>
    </div>
    ${busy && html`<p class="muted">${busy}</p>`}
    ${err && html`<p class="warn">${err}</p>`}
  </div>`;
}

function ExerciseDetail({ model, name, onClose, onMedia, date }) {
  const info = exerciseInfo(model, name);
  const bw = bodyWeightOn(model, date || pragueDate());
  const best = historyBest(model, name, info.mode, null);
  let bestDate = '';
  if (best) {
    const h = (model.history.get(name) || []).find((x) => x.sets.includes(best));
    bestDate = h ? fmtDate(h.date) : '';
  }
  const [shown, setShown] = useState(5);
  const all = model.history.get(name) || [];
  const sessions = all.slice(0, shown);
  return html`<${Sheet} onClose=${onClose} full>
    <div class="sheet-head"><strong>${info.name}</strong><button class="link" onClick=${onClose}>Zavřít</button></div>
    ${info.cz && html`<p class="muted">${info.cz}</p>`}
    <p class="entry">${entryLine(info, bw)}</p>
    <${ExerciseMedia} info=${info} onMedia=${onMedia} />
    ${info.coach && html`<p class="pinned">📌 ${info.coach}</p>`}
    ${info.howto.length > 0 && html`<h3>Provedení</h3><ul class="howto">${info.howto.map((b) => html`<li>${b}</li>`)}</ul>`}
    ${(info.primary.length > 0 || info.secondary.length > 0) && html`<p class="muted">Partie: ${info.primary.join(', ')}${info.secondary.length ? ' · vedlejší: ' + info.secondary.join(', ') : ''}</p>`}
    ${best && html`<h3>Maximum</h3><p>${fmtBest(best, info)}${bestDate ? ', ' + bestDate : ''}</p>`}
    ${sessions.length > 0 && html`<h3>Historie</h3><ul class="history">
      ${sessions.map((s) => html`<li><span>${fmtDate(s.date)}</span><span>${s.sets.map((x) => fmtSet(x, info.mode)).join(', ')}</span></li>`)}
    </ul>
    ${all.length > shown && html`<button class="link small" onClick=${() => setShown(shown + 20)}>Starší (${all.length - shown})</button>`}`}
    ${!all.length && html`<p class="muted">Cvik zatím nemá žádný trénink.</p>`}
  </${Sheet}>`;
}

function Workout({ model, w, qs, update, onUpdate, onFinish, onDiscard, onHome, onMedia }) {
  useWakeLock(!w.edit);
  const now = useNow(1000);
  const st = W.stats(w, model);
  const [picker, setPicker] = useState(null);
  const [menu, setMenu] = useState(null);
  const [detail, setDetail] = useState(null);
  const [typeFor, setTypeFor] = useState(null);
  const [restFor, setRestFor] = useState(null);
  const [toastText, setToastText] = useState('');
  const toast = (t) => { setToastText(t); setTimeout(() => setToastText(''), 2000); };
  const [reorder, setReorder] = useState(false);
  const [noteOpen, setNoteOpen] = useState(!!w.note);
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);

  // Smazání série: vždy s dotazem. Po smazání potvrzené série jde 5 s vrátit.
  function deleteSet(exKey, setId) {
    const ex = w.exercises.find((e) => e.key === exKey);
    const set = ex && ex.sets.find((x) => x.id === setId);
    if (!set) return false;
    if (!window.confirm(set.done ? 'Smazat potvrzenou sérii?' : 'Smazat sérii?')) return false;
    const removed = W.removedSet(w, exKey, setId);
    onUpdate((cur) => W.deleteSet(cur, exKey, setId), set.done);
    if (set.done && removed) {
      clearTimeout(undoTimer.current);
      setUndo(removed);
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
    }
    return true;
  }
  function undoDelete() {
    clearTimeout(undoTimer.current);
    const removed = undo;
    setUndo(null);
    if (removed) onUpdate((cur) => W.restoreSet(cur, removed), true);
  }

  // Zapomenutý trénink: po 3 hodinách se zeptá jednou
  useEffect(() => {
    if (w.edit || w.asked3h || now - new Date(w.start).getTime() < 3 * 3600 * 1000) return;
    const done = window.confirm('Trénink běží přes 3 hodiny. Skončil jsi?');
    onUpdate((cur) => W.patch(cur, (n) => { n.asked3h = true; }), false);
    if (done) onFinish();
  }, [Math.floor(now / 60000)]);

  // Stopky: start (ukončí odpočinek), stop (zapíše čas, případně potvrdí sérii), × bez zápisu
  function onWatch(action, exKey, setId) {
    if (action === 'start') {
      unlockAudio();
      onUpdate((cur) => W.startWatch(cur, exKey, setId, model), false);
    } else if (action === 'stop') {
      onUpdate((cur) => {
        const r = W.stopWatch(cur, model);
        if (r.error) toast(r.error);
        return r.workout;
      }, true);
    } else {
      onUpdate((cur) => W.cancelWatch(cur), false);
    }
  }

  const menuEx = menu && w.exercises.find((e) => e.key === menu);
  const typeSet = typeFor && w.exercises.find((e) => e.key === typeFor.exKey)?.sets.find((s) => s.id === typeFor.setId);

  // Obal přes celou obrazovku: dokument se nescrolluje, scrolluje jen <main> mezi lištami (viz styles.css .wshell)
  return html`<div class="wshell">
    <header class="wbar">
      <button class="link" onClick=${onHome}>${w.edit ? 'Zrušit' : 'Úvod'}</button>
      <div class="wmid">
        <div class="wstats">
          <span><small>Délka</small>${w.edit ? (w.end ? fmtDuration(new Date(w.end) - new Date(w.start)) : '-')
            : fmtTime(Math.floor((now - new Date(w.start).getTime()) / 1000))}</span>
          <span><small>Objem</small>${fmtInt(st.volume)} kg</span>
          <span><small>Série</small>${st.sets}</span>
        </div>
        ${w.edit ? html`<span class="pill">Úprava ${fmtDate(w.start)}</span>` : update && !qs.failed.length ? html`<span class="pill wait">Nová verze, načte se po tréninku</span>` : html`<${SyncPill} qs=${qs} />`}
      </div>
      <button class="primary" onClick=${onFinish}>${w.edit ? 'Uložit' : 'Dokončit'}</button>
    </header>
    <main class="workout">
    <div class="wtitle">
      <${AutoText} cls="title-input" value=${w.title} onInput=${(e) => onUpdate((cur) => W.patch(cur, (n) => { n.title = e.target.value.replace(/\n/g, ' '); }), false)} />
    </div>
    ${w.routineNote && html`<p class="pinned">📌 ${w.routineNote}</p>`}
    ${noteOpen
      ? html`<div class="forcoach wnote"><span class="forcoach-icon" aria-hidden="true">💬</span><${AutoText} cls="note" placeholder="Poznámka k tréninku pro trenéra" value=${w.note || ''}
          onInput=${(e) => onUpdate((cur) => W.patch(cur, (n) => { n.note = e.target.value; }), false)} /></div>`
      : html`<button class="link small" onClick=${() => setNoteOpen(true)}>+ Poznámka k tréninku pro trenéra</button>`}
    ${w.exercises.map((ex) => html`<${ExerciseCard} key=${ex.key} w=${w} ex=${ex} model=${model} now=${now}
      onUpdate=${onUpdate} onMenu=${setMenu} onDetail=${setDetail} onRest=${setRestFor} onWatch=${onWatch} onDelete=${deleteSet}
      onType=${(exKey, setId) => setTypeFor({ exKey, setId })} toast=${toast} />`)}
    <button class="wide" onClick=${() => setPicker({ mode: 'add' })}>+ Přidat cvik</button>
    ${!w.edit && html`<button class="wide danger" onClick=${onDiscard}>Zahodit trénink</button>`}
    </main>

    ${!w.edit && (w.watch ? html`<${WatchBar} w=${w} now=${now} onWatch=${onWatch} />` : html`<${RestBar} w=${w} onUpdate=${onUpdate} now=${now} />`)}
    <${Toast} text=${toastText || (undo ? 'Série smazána' : '')} action=${!toastText && undo ? 'Vrátit' : ''} onAction=${undoDelete} />

    ${picker && html`<${ExercisePicker} model=${model} title=${picker.mode === 'add' ? 'Přidat cvik' : picker.remaining ? 'Nahradit zbývající série' : 'Nahradit cvik'}
      onClose=${() => setPicker(null)}
      onPick=${(name) => {
        onUpdate((cur) => (picker.mode === 'add' ? W.addExercise(cur, name) : W.replaceExercise(cur, picker.key, name)), true);
        setPicker(null);
      }} />`}
    ${reorder && html`<${Sheet} onClose=${() => setReorder(false)}>
      <div class="sheet-head"><strong>Změnit pořadí</strong><button class="link" onClick=${() => setReorder(false)}>Hotovo</button></div>
      <ul class="reorder">
        ${W.exerciseBlocks(w).map((block, i, all) => html`<li key=${block[0].key}>
          <span>${block.map((e) => html`<div>${e.name}</div>`)}${block.length > 1 && html`<small class="ss-tag">Superset ${block[0].superset}</small>`}</span>
          <button disabled=${i === 0} aria-label="Nahoru" onClick=${() => onUpdate((cur) => W.moveExercise(cur, block[0].key, -1), true)}>▲</button>
          <button disabled=${i === all.length - 1} aria-label="Dolů" onClick=${() => onUpdate((cur) => W.moveExercise(cur, block[0].key, 1), true)}>▼</button>
        </li>`)}
      </ul>
    </${Sheet}>`}
    ${detail && html`<${ExerciseDetail} model=${model} name=${detail} date=${pragueDate(new Date(w.start))} onMedia=${onMedia} onClose=${() => setDetail(null)} />`}
    ${menuEx && html`<${Sheet} onClose=${() => setMenu(null)}>
      <div class="sheet-head"><strong>${menuEx.name}</strong></div>
      <div class="menu">
        <button onClick=${() => {
          const confirmed = W.hasConfirmed(w, menuEx.key);
          setMenu(null);
          if (confirmed && !window.confirm('Cvik už má potvrzené série. Ty zůstanou původnímu cviku a nový cvik dostane jen zbývající série. Pokračovat?')) return;
          setPicker({ mode: 'replace', key: menuEx.key, remaining: confirmed });
        }}>${W.hasConfirmed(w, menuEx.key) ? 'Nahradit jen zbývající série' : 'Nahradit cvik'}</button>
        <button onClick=${() => { setReorder(true); setMenu(null); }}>Změnit pořadí</button>
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
      <button class="wide danger" onClick=${() => { if (deleteSet(typeFor.exKey, typeFor.setId)) setTypeFor(null); }}>Smazat sérii</button>
    </${Sheet}>`}
  </div>`;
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
      ${st.prs.length > 0 && html`<h3>Nová maxima</h3><ul class="prs">${st.prs.map((p) => html`<li>🏆 ${p.exercise} ${fmtBest(p, exerciseInfo(model, p.exercise))}</li>`)}</ul>`}
      ${open > 0 && html`<p class="warn">${open} ${plural(open, 'nepotvrzená série se neuloží', 'nepotvrzené série se neuloží', 'nepotvrzených sérií se neuloží')}.</p>`}
      <label class="form">💬 Poznámka k tréninku pro trenéra
        <textarea class="forcoach-field" rows="3" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
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

function Summary({ s, model, onDone, toast }) {
  return html`<main>
    <header class="top"><span></span><h1 class="small">Hotovo</h1><span></span></header>
    <section class="card">
      <h2>${s.title}</h2>
      <div class="sum-grid">
        <div><small>Délka</small><strong>${fmtDuration(s.duration)}</strong></div>
        <div><small>Objem</small><strong>${fmtInt(s.volume)} kg</strong></div>
        <div><small>Série</small><strong>${s.sets}</strong></div>
      </div>
      ${s.prs.length > 0 && html`<h3>Nová maxima</h3><ul class="prs">${s.prs.map((p) => html`<li>🏆 ${p.exercise} ${fmtBest(p, exerciseInfo(model, p.exercise))}</li>`)}</ul>`}
      <p class="muted">Trénink se ukládá do tabulky na pozadí.</p>
    </section>
    ${s.strava && html`<${StravaCard} s=${s.strava} toast=${toast} />`}
    <button class="primary wide" onClick=${onDone}>Zpět na úvod</button>
  </main>`;
}

function Exercises({ model, onBack, onMedia }) {
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const list = useMemo(() => {
    const nq = norm(q.trim());
    return [...model.exercises.values()]
      .filter((e) => !nq || norm(e.name + ' ' + e.cz).includes(nq))
      .map((e) => {
        const h = model.history.get(e.name) || [];
        return { ...e, count: h.length, last: h.length ? h[0].date : '' };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }, [q, model]);
  return html`<main>
    <header class="top"><button class="link" onClick=${onBack}>Zpět</button><h1 class="small">Cviky</h1><span></span></header>
    <input class="search" type="search" placeholder="Hledat cvik" value=${q} onInput=${(e) => setQ(e.target.value)} />
    <ul class="pick-list">
      ${list.map((e) => html`<li><button onClick=${() => setDetail(e.name)}>
        <strong>${e.name}</strong>
        <small>${[e.cz, e.count ? `${e.count}× · naposledy ${fmtDate(e.last)}` : 'zatím necvičeno'].filter(Boolean).join(' · ')}</small>
      </button></li>`)}
    </ul>
    ${detail && html`<${ExerciseDetail} model=${model} name=${detail} onMedia=${onMedia} onClose=${() => setDetail(null)} />`}
  </main>`;
}

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

function History({ model, onOpen, onBack }) {
  const groups = useMemo(() => {
    const out = [];
    model.workouts.forEach((w) => {
      const [y, m] = String(w.date).split('-').map(Number);
      const label = `${MONTHS[m - 1]} ${y}`;
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(w);
    });
    return out;
  }, [model]);
  return html`<main>
    <header class="top"><button class="link" onClick=${onBack}>Zpět</button><h1 class="small">Historie</h1><span></span></header>
    ${groups.map((g) => html`<section class="card">
      <h3>${g.label}</h3>
      <ul class="history">
        ${g.items.map((w) => html`<${HistoryItem} model=${model} w=${w} onOpen=${onOpen} />`)}
      </ul>
    </section>`)}
    ${!groups.length && html`<p class="muted center">Zatím žádný trénink.</p>`}
  </main>`;
}

// Detail tréninku z historie: série, úprava, smazání a souhrn do Stravy
function PastWorkout({ model, id, onBack, onEdit, onDelete, toast }) {
  const w = model.workouts.find((x) => x.id === id);
  const s = useMemo(() => (w ? buildSummary(model, id) : null), [model, id]);
  if (!w) {
    return html`<main><header class="top"><button class="link" onClick=${onBack}>Zpět</button><h1 class="small">Trénink</h1><span></span></header>
      <p class="muted center">Trénink už v datech není.</p></main>`;
  }
  const sets = model.setsBy.get(id) || [];
  const groups = groupByExercise(sets).map((g) => ({ ...g, note: (g.sets.find((x) => x.exerciseNote) || {}).exerciseNote || '' }));
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' }) : '');
  const typeTag = { W: 'W', F: 'F', D: 'D' };
  const bw = bodyWeightOn(model, String(w.date).slice(0, 10));
  return html`<main>
    <header class="top"><button class="link" onClick=${onBack}>Zpět</button><h1 class="small">Trénink</h1><span></span></header>
    <section class="card">
      <h2>${w.routine}</h2>
      <p class="muted">${fmtDate(w.date)}${w.start ? ' · ' + time(w.start) : ''}${w.end ? ' - ' + time(w.end) : ''}</p>
      ${s && html`<div class="sum-grid">
        <div><small>Délka</small><strong>${w.start && w.end ? fmtDuration(new Date(w.end) - new Date(w.start)) : '-'}</strong></div>
        <div><small>Objem</small><strong>${fmtInt(s.image.totalVolumeKg)} kg</strong></div>
        <div><small>Série</small><strong>${sets.length}</strong></div>
      </div>`}
      ${w.note && html`<p class="forcoach-text">💬 ${w.note}</p>`}
      ${groups.map((g) => {
        const info = exerciseInfo(model, g.name);
        return html`<div class="past-ex">
          <strong>${g.name}</strong>${g.superset && html` <span class="ss-tag">Superset ${g.superset}</span>`}
          ${g.note && html`<small class="muted">💬 ${g.note}</small>`}
          <ol>${g.sets.map((x) => {
            const calc = setCalc(x, info, bw);
            return html`<li>${typeTag[x.type] && html`<b class="tag">${typeTag[x.type]}</b> `}${fmtSet(x, info.mode)}${x.rir !== null ? ` · ${x.rir} v záloze` : ''}
              ${calc && html`<div class="set-calc">${calc}</div>`}</li>`;
          })}</ol>
          ${!isTimeMode(info.mode) && html`<p class="ex-total">Cvik celkem: ${fmtInt(g.sets.reduce((a, x) => a + setVolume(x, info, bw), 0))} kg</p>`}
        </div>`;
      })}
      <div class="row-btns">
        <button onClick=${onEdit}>Upravit</button>
        <button class="danger" onClick=${onDelete}>Smazat</button>
      </div>
    </section>
    ${s && html`<${StravaCard} s=${s} toast=${toast} />`}
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
  const [backTo, setBackTo] = useState('home');
  const [editing, setEditingState] = useState(null);
  const editRef = useRef(null);
  const setEditing = (w) => { editRef.current = w; setEditingState(w); };
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef(null);
  const toast = (t, ms = 3000) => { clearTimeout(toastTimer.current); setToastText(t); toastTimer.current = setTimeout(() => setToastText(''), ms); };
  notifyUser = toast;
  const [update, setUpdate] = useState(false); // stažená nová verze appky čeká na načtení

  useEffect(() => onQueueChange((s) => { setQs(s); setQueueState(getQueue()); }), []);
  useEffect(() => onStoreError((text) => toast(text, 6000)), []);
  // První chyba skriptu u položky fronty se ohlásí hned, dál ji drží červená pilulka
  const failedCount = useRef(0);
  useEffect(() => {
    if (qs.failed.length > failedCount.current) toast(`Chyba odeslání: ${qs.failed[qs.failed.length - 1].error}`, 6000);
    failedCount.current = qs.failed.length;
  }, [qs.failed.length]);

  // Nová verze appky: mimo trénink se načte hned, během tréninku až po uložení
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const had = !!navigator.serviceWorker.controller;
    const onChange = () => {
      if (!had) return; // první instalace, není co načítat znovu
      if (activeRef.current || editRef.current) setUpdate(true);
      else window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  // Po odeslání z fronty se data v telefonu doplní, načíst je znovu
  useEffect(() => {
    if (qs.dataVersion) loadCachedData().then((d) => { if (d) setData(d); }).catch(() => {});
  }, [qs.dataVersion]);

  async function onMedia(name, fields) {
    const d = await updateCachedExercise(name, fields);
    if (d) setData({ ...d });
    toast('Uloženo do Drive');
  }

  async function refresh() {
    try {
      const d = await refreshData();
      setData(d);
      prefetchMedia(d.exercises || []).then((r) => { if (r === 'low') toast('V telefonu je málo místa, videa a fotky cviků se nestahují', 6000); });
    } catch (e) {
      toast('Data z tabulky: ' + e.message);
      // Špatný klíč: rovnou do Nastavení (rozpracovaný trénink se neopouští)
      if (e.code === 'bad_key' && !activeRef.current && !editRef.current) setView('settings');
    }
  }

  useEffect(() => {
    (async () => {
      const cached = await loadCachedData().catch(() => null);
      if (cached) setData(cached);
      if (getConfig()) {
        if (navigator.onLine || !cached) refresh(); // před stažením odešle frontu
        else flushQueue();
      }
    })();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }, []);

  const model = useMemo(() => (data ? buildModel(data, queue) : null), [data, queue]);

  // Souhrn po uložení přežije nové načtení appky (iPhone ji po přepnutí do Stravy může načíst znovu)
  useEffect(() => {
    if (!model || summary || view !== 'home') return;
    let id = null;
    try { id = localStorage.getItem(LAST_SUMMARY); } catch { /* bez úložiště */ }
    if (!id) return;
    const w = model.workouts.find((x) => x.id === id);
    if (!w) return;
    let strava = null;
    try { strava = buildSummary(model, id); } catch { /* souhrn bez Stravy */ }
    setSummary({
      title: w.routine || 'Trénink',
      duration: w.start && w.end ? new Date(w.end) - new Date(w.start) : 0,
      volume: strava ? strava.image.totalVolumeKg : 0,
      sets: (model.setsBy.get(id) || []).length,
      prs: [],
      strava,
    });
    setView('summary');
  }, [model]);
  const closeSummary = () => {
    try { localStorage.removeItem(LAST_SUMMARY); } catch { /* bez úložiště */ }
    setSummary(null);
    setView('home');
    refresh();
  };

  // Každá změna se hned uloží v telefonu, potvrzené série se pošlou do tabulky.
  // Změna je funkce nad aktuálním tréninkem (ne nad kopií z dřívějšího vykreslení).
  const activeRef = useRef(active);
  function setActive(w) {
    activeRef.current = w;
    storeActive(w);
    setActiveState(w);
  }

  function change(fn, sync) {
    let w = typeof fn === 'function' ? fn(activeRef.current) : fn;
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
    change(W.createWorkout(routine), false);
    setView('workout');
  }

  function discard() {
    if (!window.confirm('Zahodit celý trénink? Série se smažou i z tabulky.')) return;
    if (activeRef.current.synced) enqueueDelete(activeRef.current.id);
    setActive(null);
    setView('home');
    if (update) setTimeout(() => window.location.reload(), 300);
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
    try { localStorage.setItem(LAST_SUMMARY, snap.workout.id); } catch { /* bez úložiště */ }
    setActive(null);
    setView('summary');
    // Čekající nová verze appky: načíst teď, souhrn se po načtení otevře znovu
    if (update) setTimeout(() => window.location.reload(), 300);
  }

  // Úprava tréninku z historie: změny jen v paměti, do tabulky až po Uložit
  function startEdit(id) {
    const w = W.fromSaved(model, id);
    if (!w) return;
    setEditing(w);
    setView('edit');
  }
  function updateEdit(change) {
    const w = typeof change === 'function' ? change(editRef.current) : change;
    if (w) setEditing({ ...w, restEnd: null });
  }
  function saveEdit() {
    const w = editRef.current;
    if (!w.exercises.some((e) => e.sets.some((s) => s.done))) {
      toast('Trénink nemá žádnou potvrzenou sérii. Smaž ho v detailu.');
      return;
    }
    const snap = W.snapshot(w, w.end);
    enqueueSave(snap.workout, snap.sets);
    setEditing(null);
    setView('past');
    toast('Změny uloženy');
    if (update && !activeRef.current) setTimeout(() => window.location.reload(), 300);
  }
  function cancelEdit() {
    if (!window.confirm('Zahodit změny v tréninku?')) return;
    setEditing(null);
    setView('past');
    if (update && !activeRef.current) setTimeout(() => window.location.reload(), 300);
  }
  function deletePast(id) {
    if (!window.confirm('Smazat trénink i se všemi sériemi? V tabulce se smaže taky.')) return;
    enqueueDelete(id);
    setView(backTo);
    toast('Trénink smazán');
  }
  const openPast = (id, from) => { setOpenId(id); setBackTo(from); setView('past'); };

  let screen;
  if (view === 'settings' || !getConfig()) {
    screen = html`<${Settings} data=${data} qs=${qs}
      onBack=${getConfig() ? () => setView(active ? 'workout' : 'home') : null}
      onSaved=${async () => { await refresh(); setView(active ? 'workout' : 'home'); }} />`;
  } else if (!model) {
    screen = html`<main><p class="muted center">Načítám data z tabulky...</p></main>`;
  } else if (view === 'workout' && active) {
    screen = html`<${Workout} model=${model} w=${active} qs=${qs} update=${update} onUpdate=${change} onMedia=${onMedia}
      onFinish=${() => setView('finish')} onDiscard=${discard} onHome=${() => setView('home')} />`;
  } else if (view === 'finish' && active) {
    screen = html`<${Finish} model=${model} w=${active} onSave=${save} onBack=${() => setView('workout')} onDiscard=${discard} />`;
  } else if (view === 'summary' && summary) {
    screen = html`<${Summary} s=${summary} model=${model} toast=${toast} onDone=${closeSummary} />`;
  } else if (view === 'edit' && editing) {
    screen = html`<${Workout} model=${model} w=${editing} qs=${qs} onUpdate=${updateEdit} onMedia=${onMedia}
      onFinish=${saveEdit} onDiscard=${cancelEdit} onHome=${cancelEdit} />`;
  } else if (view === 'exercises') {
    screen = html`<${Exercises} model=${model} onMedia=${onMedia} onBack=${() => setView('home')} />`;
  } else if (view === 'history') {
    screen = html`<${History} model=${model} onOpen=${(id) => openPast(id, 'history')} onBack=${() => setView('home')} />`;
  } else if (view === 'past' && openId) {
    screen = html`<${PastWorkout} model=${model} id=${openId} toast=${toast} onBack=${() => setView(backTo)}
      onEdit=${() => startEdit(openId)} onDelete=${() => deletePast(openId)} />`;
  } else {
    screen = html`<${Home} model=${model} data=${data} active=${active} qs=${qs} update=${update} onStart=${start}
      onResume=${() => setView('workout')} onSettings=${() => setView('settings')}
      onOpen=${(id) => openPast(id, 'home')} onHistory=${() => setView('history')}
      onExercises=${() => setView('exercises')} />`;
  }
  return html`${screen}<${Toast} text=${toastText} />`;
}

// Chyba při vykreslení nebo nezachycená chyba: karta s textem a tlačítkem, ne prázdná obrazovka.
// Rozpracovaný trénink je v telefonu uložený a po načtení se otevře znovu.
function ErrorCard({ error }) {
  return html`<main>
    <section class="card">
      <h2>Něco se pokazilo</h2>
      <p class="muted">Rozpracovaný trénink je uložený v telefonu, po načtení bude zpátky.</p>
      <pre class="strava-desc">${String((error && (error.stack || error.message)) || error).slice(0, 600)}</pre>
      <button class="primary wide" onClick=${() => window.location.reload()}>Načíst znovu</button>
    </section>
  </main>`;
}

class Boundary extends Component {
  constructor() {
    super();
    this.state = { error: null };
  }
  componentDidCatch(error) {
    this.setState({ error });
  }
  componentDidMount() {
    // Chyby mimo vykreslení (obsluha ťuknutí, sliby) se jen ohlásí, appka běží dál
    this.onError = (e) => notifyUser('Chyba: ' + ((e.error && e.error.message) || e.message || 'neznámá'), 6000);
    this.onReject = (e) => notifyUser('Chyba: ' + ((e.reason && e.reason.message) || e.reason || 'neznámá'), 6000);
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onReject);
  }
  componentWillUnmount() {
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onReject);
  }
  render() {
    return this.state.error ? html`<${ErrorCard} error=${this.state.error} />` : html`<${App} />`;
  }
}

render(html`<${Boundary} />`, document.getElementById('app'));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
