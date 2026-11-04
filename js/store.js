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
  }
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

export class ApiError extends Error {}

export async function call(action, params = {}, config = getConfig(), timeoutMs = 30000) {
  if (!config || !config.url || !config.key) throw new ApiError('Chybí adresa skriptu nebo klíč');
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
    throw new ApiError('Skript vrátil nečitelnou odpověď (zkontroluj adresu)');
  }
  if (!body.ok) throw new ApiError(body.error || 'Neznámá chyba skriptu');
  return body;
}

// ---------- data z tabulky ----------

export const loadCachedData = () => idbGet('bootstrap');

export async function refreshData() {
  const data = await call('bootstrap', {}, getConfig(), 60000);
  const clean = {
    exercises: data.exercises || [],
    routines: data.routines || [],
    body: data.body || [],
    workouts: data.workouts || [],
    sets: data.sets || [],
    fetchedAt: new Date().toISOString(),
  };
  await idbSet('bootstrap', clean);
  return clean;
}

// Odeslaný trénink (nebo jeho smazání) se zapíše i do dat v telefonu, aby se po odchodu
// z fronty neukazoval starý stav až do dalšího obnovení dat.
let dataVersion = 0;
async function applyToCache(item) {
  const data = await idbGet('bootstrap').catch(() => null);
  if (!data) return;
  const id = item.op === 'delete' ? item.id : item.workout.id;
  data.workouts = (data.workouts || []).filter((w) => String(w.id) !== id);
  data.sets = (data.sets || []).filter((s) => String(s.workout) !== id);
  if (item.op === 'save') {
    data.workouts.push(item.workout);
    item.sets.forEach((s) => data.sets.push({ ...s, workout: id }));
  }
  await idbSet('bootstrap', data);
  dataVersion++;
}

// ---------- fronta k odeslání ----------

const listeners = new Set();
let sending = false;
let lastError = null;

export function getQueue() {
  return lsGet(LS.queue, {});
}

function setQueue(q) {
  lsSet(LS.queue, q);
  notify();
}

export function queueStatus() {
  const n = Object.keys(getQueue()).length;
  return { pending: n, sending, error: lastError, dataVersion };
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  const s = queueStatus();
  listeners.forEach((fn) => fn(s));
}

// Uloží do fronty nejnovější stav tréninku (nebo jeho smazání) a hned zkusí odeslat.
export function enqueueSave(workout, sets) {
  const q = getQueue();
  q[workout.id] = { op: 'save', rev: Date.now() + Math.random(), workout, sets };
  setQueue(q);
  flushQueue();
}

export function enqueueDelete(id) {
  const q = getQueue();
  q[id] = { op: 'delete', rev: Date.now() + Math.random(), id };
  setQueue(q);
  flushQueue();
}

export async function flushQueue() {
  if (sending || !getConfig()) return;
  const first = getQueue();
  if (!Object.keys(first).length) return;
  sending = true;
  notify();
  try {
    for (const id of Object.keys(first)) {
      const item = getQueue()[id];
      if (!item) continue;
      if (item.op === 'delete') await call('deleteWorkout', { id });
      else await call('saveWorkout', { workout: item.workout, sets: item.sets });
      await applyToCache(item).catch(() => {});
      // Mezitím mohl přijít novější stav, ten ve frontě zůstane.
      const q = getQueue();
      if (q[id] && q[id].rev === item.rev) {
        delete q[id];
        setQueue(q);
      }
    }
    lastError = null;
  } catch (e) {
    lastError = e.message;
  } finally {
    sending = false;
    notify();
  }
  if (!lastError && Object.keys(getQueue()).length) flushQueue();
}

addEventListener('online', () => flushQueue());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flushQueue();
});
setInterval(() => {
  if (navigator.onLine) flushQueue();
}, 30000);
