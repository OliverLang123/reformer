// Výpočty nad daty z tabulky: rutiny, MINULE, maxima, objem, tělesná váha.
// Stejná pravidla jako vzorec Objem v listu Série (apps-script/Setup.js).

import { parseNum, parseRange, parseTime, fmtNum, fmtTime, nameKey } from './util.js';

export const TYPE_FROM_SHEET = { 'normální': 'N', 'rozcvička': 'W', 'do selhání': 'F', 'drop': 'D' };
export const TYPE_TO_SHEET = { N: 'normální', W: 'rozcvička', F: 'do selhání', D: 'drop' };

export const MODE = {
  WEIGHT: 'váha × opakování',
  SIDE: 'na stranu',
  BODY: 'vlastní váha',
  TIME: 'čas',
  TIME_SIDE: 'čas na stranu',
  DIST: 'vzdálenost a čas',
};

// Jaká pole má řádek série
export function fieldsFor(mode) {
  switch (mode) {
    case MODE.BODY: return ['kg', 'reps'];
    case MODE.TIME: return ['time'];
    case MODE.TIME_SIDE: return ['time', 'timeR'];
    case MODE.DIST: return ['km', 'time'];
    default: return ['kg', 'reps'];
  }
}

export const isTimeMode = (mode) => mode === MODE.TIME || mode === MODE.TIME_SIDE || mode === MODE.DIST;
export const isTimeField = (f) => f === 'time' || f === 'timeR';
// Cviky měřené stopkami (čas na sérii, u „čas na stranu“ každá strana zvlášť)
export const isWatchMode = (mode) => mode === MODE.TIME || mode === MODE.TIME_SIDE;

// Násobek jednoruček: u Jednoručky = 2 je v KG váha jedné, do výpočtů se počítá dvakrát
export const dumbbellFactor = (ex) => (ex && ex.dumbbells === 2 ? 2 : 1);

function splitList(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

// Zápis z listu Cviky bez ohledu na velikost písmen a mezery navíc (stejně jako vzorce v tabulce)
const MODE_BY_KEY = new Map(Object.values(MODE).map((m) => [nameKey(m), m]));
export const normMode = (v) => MODE_BY_KEY.get(nameKey(v)) || MODE.WEIGHT;

function normExercise(e) {
  return {
    name: String(e.name).trim(),
    cz: e.cz || '',
    mode: normMode(e.mode),
    primary: splitList(e.primary),
    secondary: splitList(e.secondary),
    bwFactor: parseNum(e.bwFactor) || 0,
    howto: String(e.howto || '').split('\n').map((x) => x.replace(/^[•\-\s]+/, '').trim()).filter(Boolean),
    coach: e.coach || '',
    video: e.video || '',
    photo: e.photo || '',
    dumbbells: [1, 2].includes(parseNum(e.dumbbells)) ? parseNum(e.dumbbells) : null,
  };
}

export function normSet(s) {
  return {
    id: String(s.id),
    workout: String(s.workout),
    exercise: String(s.exercise),
    order: parseNum(s.order) || 0,
    superset: s.superset === undefined || s.superset === '' || s.superset === null ? null : String(s.superset),
    type: TYPE_FROM_SHEET[s.type] || s.type || 'N',
    kg: parseNum(s.kg),
    reps: parseNum(s.reps),
    time: parseTime(s.time),
    timeR: parseTime(s.timeR),
    km: parseNum(s.km),
    rir: parseNum(s.rir),
    exerciseNote: s.exerciseNote || '',
    confirmedAt: s.confirmedAt || null,
  };
}

// Model z dat tabulky a fronty (neodeslané tréninky mají přednost před tabulkou).
export function buildModel(data, queue = {}) {
  const exercises = new Map();
  const exerciseKeys = new Map(); // název bez diakritiky a velikosti písmen -> přesný název z listu Cviky
  (data.exercises || []).forEach((e) => {
    if (!e.name || !String(e.name).trim()) return;
    const ex = normExercise(e);
    exercises.set(ex.name, ex);
    if (!exerciseKeys.has(nameKey(ex.name))) exerciseKeys.set(nameKey(ex.name), ex.name);
  });

  const workouts = new Map();
  (data.workouts || []).forEach((w) => { if (w.id) workouts.set(String(w.id), { ...w, id: String(w.id) }); });
  const setsBy = new Map();
  (data.sets || []).forEach((s) => {
    if (!s.id || !s.workout) return;
    const n = normSet(s);
    if (!setsBy.has(n.workout)) setsBy.set(n.workout, []);
    setsBy.get(n.workout).push(n);
  });

  Object.keys(queue).forEach((id) => {
    const item = queue[id];
    if (item.op === 'exercise') {
      // Nový cvik založený v appce, ještě neodeslaný: k použití hned
      const ex = normExercise(item.exercise);
      if (!exerciseKeys.has(nameKey(ex.name))) {
        exercises.set(ex.name, ex);
        exerciseKeys.set(nameKey(ex.name), ex.name);
      }
      return;
    }
    if (item.op === 'delete') {
      workouts.delete(id);
      setsBy.delete(id);
    } else {
      workouts.set(id, { ...item.workout });
      setsBy.set(id, item.sets.map(normSet));
    }
  });

  // Historie po cvicích, nejnovější první
  const sorted = [...workouts.values()].sort((a, b) => String(b.start || b.date).localeCompare(String(a.start || a.date)));
  const history = new Map();
  sorted.forEach((w) => {
    const byEx = new Map();
    (setsBy.get(w.id) || []).forEach((s) => {
      if (!byEx.has(s.exercise)) byEx.set(s.exercise, []);
      byEx.get(s.exercise).push(s);
    });
    byEx.forEach((sets, ex) => {
      if (!history.has(ex)) history.set(ex, []);
      history.get(ex).push({ workoutId: w.id, date: w.date, start: w.start, sets });
    });
  });

  const body = (data.body || [])
    .map((b) => ({ date: String(b.date).slice(0, 10), weight: parseNum(b.weight) }))
    .filter((b) => b.weight)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { exercises, exerciseKeys, workouts: sorted, setsBy, history, body, routines: data.routines || [] };
}

// Přesný název cviku z listu Cviky; hledá bez ohledu na velikost písmen, mezery navíc a diakritiku.
// Neznámý cvik vrátí oříznutý název.
export function canonicalName(model, name) {
  const n = String(name === null || name === undefined ? '' : name).replace(/\s+/g, ' ').trim();
  if (model.exercises.has(n)) return n;
  return (model.exerciseKeys && model.exerciseKeys.get(nameKey(n))) || n;
}

export const knownExercise = (model, name) => model.exercises.has(canonicalName(model, name));

export function exerciseInfo(model, name) {
  return model.exercises.get(canonicalName(model, name)) || normExercise({ name });
}

// Série tréninku po cvicích v pořadí tréninku. Stejný cvik podruhé (jiné Pořadí) je zvlášť.
export function groupByExercise(sets) {
  const groups = [];
  const byKey = new Map();
  [...sets].sort((a, b) => a.order - b.order).forEach((s) => {
    const key = s.order + '|' + s.exercise;
    if (!byKey.has(key)) {
      const g = { key, name: s.exercise, order: s.order, superset: s.superset || null, sets: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).sets.push(s);
  });
  return groups;
}

// Tělesná váha k datu: poslední měření do data, před prvním měřením první měření.
export function bodyWeightOn(model, date) {
  if (!model.body.length) return 0;
  let w = model.body[0].weight;
  model.body.forEach((b) => { if (b.date <= date) w = b.weight; });
  return w;
}

// Objem série, stejně jako vzorec Objem v listu Série: KG × J × OPAK., na stranu × 2,
// u vlastní váhy (tělesná váha × podíl + KG × J) × OPAK.
export function setVolume(set, ex, bw) {
  const reps = set.reps || 0;
  const kg = (set.kg || 0) * dumbbellFactor(ex);
  switch (ex.mode) {
    case MODE.SIDE: return kg * reps * 2;
    case MODE.BODY: return (bw * ex.bwFactor + kg) * reps;
    case MODE.TIME:
    case MODE.TIME_SIDE:
    case MODE.DIST: return 0;
    default: return kg * reps;
  }
}

// ---------- rutiny ----------
// List Rutiny, úsporný zápis (starý zápis s vyplněnými všemi buňkami platí dál):
// - prázdná Rutina, Týden a Poznámka k rutině = stejné jako řádek výš
// - prázdný Cvik = další série stejného cviku jako řádek výš; Pořadí, Superset, Odpočinek a Poznámka
//   se pak berou z toho cviku. U řádku s vyplněným Cvikem je Pořadí povinné.
// - Sérií = N znamená N stejných sérií (prázdné = 1)
// - KG, OPAK., ČAS a KM se nedědí, prázdná hodnota má význam

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const MAX_COUNT = 20;

// Projde list Rutiny a vrátí rutiny i seznam problémů (číslo řádku listu, když ho skript poslal).
function parseRoutines(model) {
  const byName = new Map();
  const issues = [];
  let rt = null;
  let ex = null;
  let first = true;
  model.routines.forEach((r, i) => {
    const row = parseNum(r.row) || i + 2;
    const issue = (text) => issues.push({ row, routine: rt ? rt.name : '', text });
    const rowHasData = ['routine', 'exercise', 'order', 'type', 'kg', 'reps', 'time', 'km', 'rest', 'count'].some((k) => filled(r[k]));
    if (!rowHasData) return;

    if (filled(r.routine)) {
      const name = String(r.routine).trim();
      if (!byName.has(name)) byName.set(name, { name, week: '', note: '', exercises: [] });
      if (!rt || rt.name !== name) ex = null;
      rt = byName.get(name);
    } else if (first) {
      issue('První řádek nemá vyplněnou Rutinu');
    }
    first = false;
    if (!rt) return;
    if (filled(r.week) && !rt.week) rt.week = String(r.week).trim();
    if (filled(r.routineNote) && !rt.note) rt.note = String(r.routineNote);

    if (filled(r.exercise)) {
      const raw = String(r.exercise);
      const name = canonicalName(model, raw);
      let order = parseNum(r.order);
      if (order === null) {
        issue(`Cvik ${name} nemá Pořadí`);
        order = rt.exercises.reduce((m, e) => Math.max(m, e.order), 0) + 1;
      }
      ex = rt.exercises.find((e) => e.order === order && e.name === name);
      if (!ex) {
        const clash = rt.exercises.find((e) => e.order === order);
        if (clash && clash.superset === null) issue(`Pořadí ${fmtNum(order)} mají dva cviky: ${clash.name} a ${name}`);
        ex = { name, order, superset: filled(r.superset) ? String(r.superset).trim() : null, rest: null, note: '', sets: [] };
        rt.exercises.push(ex);
        const info = model.exercises.get(name);
        if (!info) issue(`Cvik ${name} není v listu Cviky`);
        else if (!info.primary.length) issue(`Cvik ${name} nemá v listu Cviky partie (chybí pak ve svalové mapě)`);
      }
    } else if (!ex) {
      issue('Řádek nemá Cvik a nad ním žádný cvik není');
      return;
    }

    if (filled(r.rest)) {
      const rest = parseTime(r.rest);
      if (rest === null) issue(`Nečitelný Odpočinek „${r.rest}“`);
      else ex.rest = rest;
    }
    if (filled(r.note) && !ex.note) ex.note = String(r.note);

    let type = 'N';
    if (filled(r.type)) {
      type = TYPE_FROM_SHEET[nameKeyType(r.type)];
      if (!type) {
        issue(`Neznámý Typ „${r.type}“ (bere se jako normální)`);
        type = 'N';
      }
    }
    const reps = parseRange(r.reps);
    if (filled(r.reps) && !reps) issue(`Nečitelná OPAK. „${r.reps}“`);
    const time = parseTime(r.time);
    if (filled(r.time) && time === null) issue(`Nečitelný ČAS „${r.time}“`);
    const kg = parseNum(r.kg);
    if (filled(r.kg) && kg === null) issue(`Nečitelná KG „${r.kg}“`);
    const km = parseNum(r.km);
    if (filled(r.km) && km === null) issue(`Nečitelné KM „${r.km}“`);

    let count = 1;
    if (filled(r.count)) {
      const c = parseNum(r.count);
      if (c === null || !Number.isInteger(c) || c < 1 || c > MAX_COUNT) issue(`Nečitelné Sérií „${r.count}“ (celé číslo 1 až ${MAX_COUNT})`);
      else count = c;
    }
    for (let k = 0; k < count; k++) ex.sets.push({ type, kg, reps, time, km });
  });
  const list = [...byName.values()];
  list.forEach((x) => x.exercises.sort((a, b) => a.order - b.order));
  return { list, issues };
}

const nameKeyType = (v) => String(v).trim().toLowerCase();

export const routineList = (model) => parseRoutines(model).list;

// Problémy v listu Rutiny: [{ row, routine, text }]. Trénink jde začít i s nimi.
export const validateRoutines = (model) => parseRoutines(model).issues;

const letterOf = (name) => {
  const m = String(name || '').match(/tr[ée]nink\s+([A-Z])\b/i);
  return m ? m[1].toUpperCase() : null;
};

// Rutina, která je na řadě: po A je B, po B je C, po C je A (podle posledního tréninku).
export function orderRoutines(model, list) {
  if (!list.length) return list;
  const letters = list.map((r) => letterOf(r.name)).filter(Boolean).sort();
  const last = model.workouts.map((w) => letterOf(w.routine)).find(Boolean);
  let nextIdx = 0;
  if (last && letters.length) {
    const i = letters.indexOf(last);
    const next = i >= 0 ? letters[(i + 1) % letters.length] : letters[0];
    nextIdx = Math.max(0, list.findIndex((r) => letterOf(r.name) === next));
  }
  return [list[nextIdx], ...list.filter((_, i) => i !== nextIdx)];
}

// ---------- MINULE a maxima ----------

const isWarm = (s) => s.type === 'W';

// Poslední trénink s tímto cvikem (mimo aktuální)
// before: jen tréninky začaté dřív (úprava staršího tréninku z historie)
export function previousSession(model, exercise, excludeId, before = null) {
  return (model.history.get(exercise) || []).find((h) => h.workoutId !== excludeId
    && (!before || String(h.start || h.date) < String(before))) || null;
}

// MINULE pro sérii: stejná pozice mezi rozcvičkami, resp. mezi pracovními sériemi.
// Když minulý trénink rozcvičky označené nemá (historie z Hevy), páruje se podle pořadí všech sérií.
export function previousFor(prevSession, set, sets) {
  if (!prevSession) return null;
  if (!prevSession.sets.some(isWarm)) return prevSession.sets[sets.indexOf(set)] || null;
  const warm = isWarm(set);
  const idx = sets.filter((s) => isWarm(s) === warm).indexOf(set);
  const pool = prevSession.sets.filter((s) => isWarm(s) === warm);
  return pool[idx] || null;
}

// Je série a lepší než b? Váha, při shodě opakování. U cviků na čas se maxima nepočítají.
export function isBetter(a, b, mode) {
  if (isTimeMode(mode)) return false;
  if (!b) return true;
  const ak = a.kg || 0;
  const bk = b.kg || 0;
  if (ak !== bk) return ak > bk;
  return (a.reps || 0) > (b.reps || 0);
}

export function bestOf(sets, mode) {
  let best = null;
  sets.forEach((s) => {
    if (isWarm(s) || !s.reps) return;
    if (!best || isBetter(s, best, mode)) best = s;
  });
  return best;
}

// Maximum z historie mimo aktuální trénink
export function historyBest(model, exercise, mode, excludeId) {
  const all = [];
  (model.history.get(exercise) || []).forEach((h) => { if (h.workoutId !== excludeId) all.push(...h.sets); });
  return bestOf(all, mode);
}

export function fmtSet(s, mode) {
  if (!s) return '';
  if (mode === MODE.DIST) return [s.km !== null ? `${fmtNum(s.km)} km` : '', s.time !== null ? fmtTime(s.time) : ''].filter(Boolean).join(' ');
  if (isTimeMode(mode)) return fmtTimes(s);
  if (mode === MODE.BODY) return s.kg ? `+${fmtNum(s.kg)} × ${fmtNum(s.reps)}` : `${fmtNum(s.reps)}`;
  if (s.kg === null && s.reps === null) return '';
  return `${fmtNum(s.kg || 0)} × ${fmtNum(s.reps)}`;
}

// Čas série u „čas na stranu“: levá/pravá (0:34/0:31), jinak jen čas
export function fmtTimes(s) {
  if (!s || s.time === null || s.time === undefined) return '';
  return s.timeR !== null && s.timeR !== undefined ? `${fmtTime(s.time)}/${fmtTime(s.timeR)}` : fmtTime(s.time);
}

// Maximum a nové maximum: váha jako součet, u dvou jednoruček s rozpisem: 40 kg (2 × 20) × 9
export function fmtBest(s, ex) {
  if (!s) return '';
  if (ex.mode === MODE.BODY) {
    if (!s.kg) return `vlastní váha × ${fmtNum(s.reps)}`;
    const j = dumbbellFactor(ex);
    return j === 2 ? `+${fmtNum(s.kg * 2)} kg (2 × ${fmtNum(s.kg)}) × ${fmtNum(s.reps)}` : `+${fmtNum(s.kg)} kg × ${fmtNum(s.reps)}`;
  }
  const kg = s.kg || 0;
  if (dumbbellFactor(ex) === 2 && kg) return `${fmtNum(kg * 2)} kg (2 × ${fmtNum(kg)}) × ${fmtNum(s.reps)}`;
  return `${fmtNum(kg)} kg × ${fmtNum(s.reps)}`;
}

// Řádek Zápis na kartě cviku: co se píše do KG a jak se série počítá do celkem zvednuto
export function entryLine(ex, bw) {
  switch (ex.mode) {
    case MODE.TIME_SIDE: return 'Čas, každá strana zvlášť · do součtu se nepočítá';
    case MODE.TIME: return 'Čas · do součtu se nepočítá';
    case MODE.DIST: return 'Vzdálenost a čas · do součtu se nepočítá';
    case MODE.BODY: {
      const extra = dumbbellFactor(ex) === 2 ? 'přidaná zátěž (váha jedné jednoručky × 2)' : 'přidaná zátěž';
      if (!ex.bwFactor) return `Jen ${extra}, tělesná váha se nepočítá`;
      return `Tělesná váha ${fmtNum(bw)} kg × ${fmtNum(ex.bwFactor)} + ${extra}`;
    }
    default: {
      const j = ex.dumbbells;
      const base = j === 2 ? 'Váha jedné jednoručky' : j === 1 ? 'Váha jednoručky' : 'Celková váha';
      const parts = [];
      if (j === 2) parts.push('× 2 jednoručky');
      if (ex.mode === MODE.SIDE) parts.push('× 2 strany');
      return parts.length ? `${base} · do součtu ${parts.join(' ')}` : base;
    }
  }
}

// Výpočet pod potvrzenou sérií: „20 × 2 × 9 × 2 = 720 kg“, „(80 × 1 + 0) × 10 = 800 kg“.
// U cviků na čas nic (do součtu se nepočítají).
export function setCalc(set, ex, bw) {
  if (isTimeMode(ex.mode) || !set || !set.reps) return '';
  const j = dumbbellFactor(ex);
  const kg = set.kg || 0;
  const vol = fmtNum(setVolume(set, ex, bw));
  if (ex.mode === MODE.BODY) {
    const load = j === 2 ? `${fmtNum(kg)} × 2` : fmtNum(kg);
    return `(${fmtNum(bw)} × ${fmtNum(ex.bwFactor)} + ${load}) × ${fmtNum(set.reps)} = ${vol} kg`;
  }
  const parts = [fmtNum(kg)];
  if (j === 2) parts.push('2');
  parts.push(fmtNum(set.reps));
  if (ex.mode === MODE.SIDE) parts.push('2');
  return `${parts.join(' × ')} = ${vol} kg`;
}
