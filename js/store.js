// Ukládání v telefonu a spojení se skriptem.
// - nastavení (adresa skriptu a klíč), rozpracovaný trénink a fronta: localStorage (malé, synchronní)
// - data z tabulky (bootstrap): IndexedDB (stovky kB)
// Fronta drží pro každý trénink jen poslední stav, odesílá se celý trénink najednou.

const LS = {
  config: 'reformer.config',
  active: 'reformer.active',
  queue: 'reformer.queue',
};

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Uložení v telefonu selhalo', e);
    storeError('Nejde ukládat do telefonu');
  }
}

// Chyby úložiště v telefonu (plné úložiště, soukromý režim) se hlásí appce, nepolykají se
const errorListeners = new Set();
export function onStoreError(fn) {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}
function storeError(text) {
  errorListeners.forEach((fn) => { try { fn(text); } catch { /* hlášení nesmí shodit ukládání */ } });
}

export const getConfig = () => lsGet(LS.config, null);
export const setConfig = (c) => lsSet(LS.config, c);
export const getActive = () => lsGet(LS.active, null);
export const setActive = (w) => lsSet(LS.active, w);

// ---------- IndexedDB ----------

let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('reformer', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function idbGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- API ----------

// kind: 'net' = bez spojení nebo bez odpovědi (zkoušet dál), 'script' = skript odpověděl chybou.
// code: kód chyby ze skriptu (bad_key, bad_request, maintenance, server), u starého skriptu prázdný.
export class ApiError extends Error {
  constructor(message, kind = 'net', code = '') {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

// Nejnižší verze skriptu, se kterou appka umí pracovat (API_VERSION v apps-script/Code.js)
export const MIN_API = 3;

export async function call(action, params = {}, config = getConfig(), timeoutMs = 30000) {
  if (!config || !config.url || !config.key) throw new ApiError('Chybí adresa skriptu nebo klíč', 'script', 'bad_key');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ key: config.key, action }, params)),
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'Skript neodpověděl včas' : 'Bez spojení se skriptem');
  } finally {
    clearTimeout(t);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('Skript vrátil nečitelnou odpověď (zkontroluj adresu)', 'script', 'bad_request');
  }
  if (!body.ok) throw new ApiError(body.error || 'Neznámá chyba skriptu', 'script', body.code || (/klíč/i.test(body.error || '') ? 'bad_key' : ''));
  return body;
}

// ---------- data z tabulky ----------

export const loadCachedData = () => idbGet('bootstrap');

// Zápisy do dat v telefonu jdou jeden po druhém, aby se obnovení dat a zápis odeslaného
// tréninku navzájem nepřepsaly.
let cacheChain = Promise.resolve();
function withCache(fn) {
  const run = cacheChain.then(fn, fn);
  cacheChain = run.catch(() => {});
  return run;
}

// Změna cviku (odkaz na video nebo fotku, nový cvik) rovnou v datech v telefonu
export function updateCachedExercise(name, fields) {
  return withCache(async () => {
    const data = await idbGet('bootstrap');
    if (!data) return null;
    const ex = (data.exercises || []).find((e) => String(e.name) === name);
    if (ex) Object.assign(ex, fields);
    else data.exercises.push({ name, ...fields });
    await idbSet('bootstrap', data);
    return data;
  });
}

// Stažení dat z tabulky. Odpověď se nesmí zapsat, když se během stahování něco odeslalo:
// skript mohl listy přečíst dřív, než zápis doběhl, a starší stav by přepsal novější.
// Proto se nejdřív počká na odeslání fronty a po odpovědi se zkontroluje, že se mezitím nic neposlalo.
export async function refreshData() {
  for (let attempt = 0; attempt < 4; attempt++) {
    await flushQueue();
    const before = dataVersion;
    const data = await call('bootstrap', {}, getConfig(), 60000);
    const clean = {
      exercises: data.exercises || [],
      routines: data.routines || [],
      body: data.body || [],
      workouts: data.workouts || [],
      sets: data.sets || [],
      apiVersion: data.version || 0,
      fetchedAt: new Date().toISOString(),
    };
    if (flushing) await flushing;
    const written = await withCache(async () => {
      if (dataVersion !== before) return false;
      await idbSet('bootstrap', clean);
      return true;
    });
    if (written) return clean;
  }
  throw new ApiError('Data se nepodařilo obnovit, appka právě odesílá. Zkus to za chvíli.');
}

// Odeslaný trénink (nebo jeho smazání, nový cvik) se zapíše i do dat v telefonu, aby se po odchodu
// z fronty neukazoval starý stav až do dalšího obnovení dat.
let dataVersion = 0;
function applyToCache(item, result) {
  return withCache(async () => {
    dataVersion++;
    const data = await idbGet('bootstrap').catch(() => null);
    if (!data) return;
    if (item.op === 'exercise') {
      const saved = (result && result.exercise) || item.exercise;
      data.exercises = data.exercises || [];
      const i = data.exercises.findIndex((e) => String(e.name) === String(saved.name) || String(e.name) === String(item.exercise.name));
      if (i >= 0) data.exercises[i] = { ...data.exercises[i], ...saved };
      else data.exercises.push(saved);
    } else {
      const id = item.op === 'delete' ? item.id : item.workout.id;
      data.workouts = (data.workouts || []).filter((w) => String(w.id) !== id);
      data.sets = (data.sets || []).filter((s) => String(s.workout) !== id);
      if (item.op === 'save') {
        data.workouts.push(item.workout);
        item.sets.forEach((s) => data.sets.push({ ...s, workout: id }));
      }
    }
    await idbSet('bootstrap', data);
  });
}

// ---------- fronta k odeslání ----------
// Položka na trénink (poslední stav nebo smazání) a na nový cvik (klíč „ex:Název“).
// Chyba spojení: odesílání se přeruší a zkusí později. Chyba skriptu u jedné položky: položka se
// přeskočí, ostatní se odešlou, a zkouší se znovu při dalším běhu, dokud ji uživatel nezahodí.

const listeners = new Set();
let sending = false;
let flushing = null;
let netError = null;
const failed = {}; // id -> { rev, error, code }

export function getQueue() {
  return lsGet(LS.queue, {});
}

function setQueue(q) {
  lsSet(LS.queue, q);
  notify();
}

function itemLabel(id, item) {
  if (item.op === 'exercise') return `Nový cvik ${item.exercise.name}`;
  if (item.op === 'delete') return `Smazání tréninku ${id}`;
  return `${item.workout.routine || 'Trénink'} ${String(item.workout.date || '').split('-').reverse().map(Number).join('. ')}`;
}

export function queueStatus() {
  const q = getQueue();
  const ids = Object.keys(q);
  const bad = ids.filter((id) => failed[id]).map((id) => ({ id, label: itemLabel(id, q[id]), error: failed[id].error, code: failed[id].code }));
  return {
    pending: ids.length,
    sending,
    failed: bad,
    netError,
    error: bad.length ? bad[0].error : netError,
    badKey: bad.some((b) => b.code === 'bad_key'),
    dataVersion,
  };
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  const s = queueStatus();
  listeners.forEach((fn) => fn(s));
}

function put(id, item) {
  const q = getQueue();
  q[id] = { ...item, rev: Date.now() + Math.random() };
  delete failed[id];
  setQueue(q);
  flushQueue();
}

// Uloží do fronty nejnovější stav tréninku (nebo jeho smazání) a hned zkusí odeslat.
export const enqueueSave = (workout, sets) => put(workout.id, { op: 'save', workout, sets });
export const enqueueDelete = (id) => put(id, { op: 'delete', id });
// Nový cvik: do listu Cviky se zapíše před tréninkem, který ho používá
export const enqueueExercise = (exercise) => put('ex:' + exercise.name, { op: 'exercise', exercise });

// Zahodí položku, kterou skript trvale odmítá. Její data v tabulce nebudou.
export function dropQueueItem(id) {
  const q = getQueue();
  delete q[id];
  delete failed[id];
  setQueue(q);
}

function send(id, item) {
  if (item.op === 'exercise') return call('saveExercise', { exercise: item.exercise });
  if (item.op === 'delete') return call('deleteWorkout', { id });
  return call('saveWorkout', { workout: item.workout, sets: item.sets });
}

// Pořadí: nové cviky první, pak podle času zařazení
const order = (q) => Object.keys(q).sort((a, b) => (q[a].op === 'exercise' ? 0 : 1) - (q[b].op === 'exercise' ? 0 : 1) || q[a].rev - q[b].rev);

export function flushQueue() {
  if (flushing) return flushing;
  if (!getConfig() || !Object.keys(getQueue()).length) return Promise.resolve();
  flushing = runFlush().finally(() => { flushing = null; });
  return flushing;
}

async function runFlush() {
  sending = true;
  notify();
  const tried = {};
  try {
    for (;;) {
      const q = getQueue();
      const id = order(q).find((k) => tried[k] !== q[k].rev);
      if (!id) break;
      const item = q[id];
      tried[id] = item.rev;
      try {
        const result = await send(id, item);
        netError = null;
        delete failed[id];
        await applyToCache(item, result).catch(() => storeError('Odeslaný trénink se nepodařilo zapsat do telefonu'));
        // Mezitím mohl přijít novější stav, ten ve frontě zůstane.
        const now = getQueue();
        if (now[id] && now[id].rev === item.rev) {
          delete now[id];
          setQueue(now);
        }
      } catch (e) {
        if (e.kind !== 'script') {
          netError = e.message;
          break;
        }
        netError = null;
        failed[id] = { rev: item.rev, error: e.message, code: e.code };
        notify();
      }
    }
  } finally {
    sending = false;
    notify();
  }
}

addEventListener('online', () => flushQueue());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flushQueue();
});
setInterval(() => {
  if (navigator.onLine) flushQueue();
}, 30000);
