// Výpočty nad daty z tabulky: rutiny, MINULE, maxima, objem, tělesná váha.
// Stejná pravidla jako vzorec Objem v listu Série (apps-script/Setup.js).

import { parseNum, parseRange, parseTime, fmtNum, fmtTime } from './util.js';

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
    case MODE.TIME:
    case MODE.TIME_SIDE: return ['time'];
    case MODE.DIST: return ['km', 'time'];
    default: return ['kg', 'reps'];
  }
}

export const isTimeMode = (mode) => mode === MODE.TIME || mode === MODE.TIME_SIDE || mode === MODE.DIST;

function splitList(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function normExercise(e) {
  return {
    name: String(e.name),
    cz: e.cz || '',
    mode: e.mode || MODE.WEIGHT,
    primary: splitList(e.primary),
    secondary: splitList(e.secondary),
    bwFactor: parseNum(e.bwFactor) || 0,
    howto: String(e.howto || '').split('\n').map((x) => x.replace(/^[•\-\s]+/, '').trim()).filter(Boolean),
    coach: e.coach || '',
    video: e.video || '',
    photo: e.photo || '',
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
    km: parseNum(s.km),
    rir: parseNum(s.rir),
    exerciseNote: s.exerciseNote || '',
    confirmedAt: s.confirmedAt || null,
  };
}

// Model z dat tabulky a fronty (neodeslané tréninky mají přednost před tabulkou).
export function buildModel(data, queue = {}) {
  const exercises = new Map();
  (data.exercises || []).forEach((e) => { if (e.name) exercises.set(String(e.name), normExercise(e)); });

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

  return { exercises, workouts: sorted, setsBy, history, body, routines: data.routines || [] };
}

export function exerciseInfo(model, name) {
  return model.exercises.get(name) || normExercise({ name });
}

// Tělesná váha k datu: poslední měření do data, před prvním měřením první měření.
export function bodyWeightOn(model, date) {
  if (!model.body.length) return 0;
  let w = model.body[0].weight;
  model.body.forEach((b) => { if (b.date <= date) w = b.weight; });
  return w;
}

export function setVolume(set, ex, bw) {
  const reps = set.reps || 0;
  const kg = set.kg || 0;
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

export function routineList(model) {
  const byName = new Map();
  model.routines.forEach((r) => {
    const name = String(r.routine || '').trim();
    if (!name || !r.exercise) return;
    if (!byName.has(name)) byName.set(name, { name, week: r.week || '', note: '', exercises: [] });
    const rt = byName.get(name);
    if (r.routineNote && !rt.note) rt.note = String(r.routineNote);
    const order = parseNum(r.order) || rt.exercises.length + 1;
    let ex = rt.exercises.find((e) => e.order === order && e.name === String(r.exercise));
    if (!ex) {
      ex = { name: String(r.exercise), order, superset: r.superset ? String(r.superset) : null, rest: null, note: '', sets: [] };
      rt.exercises.push(ex);
    }
    const rest = parseTime(r.rest);
    if (rest !== null) ex.rest = rest;
    if (r.note && !ex.note) ex.note = String(r.note);
    ex.sets.push({
      type: TYPE_FROM_SHEET[r.type] || 'N',
      kg: parseNum(r.kg),
      reps: parseRange(r.reps),
      time: parseTime(r.time),
      km: parseNum(r.km),
    });
  });
  const list = [...byName.values()];
  list.forEach((rt) => rt.exercises.sort((a, b) => a.order - b.order));
  return list;
}

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
export function previousSession(model, exercise, excludeId) {
  return (model.history.get(exercise) || []).find((h) => h.workoutId !== excludeId) || null;
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
  if (isTimeMode(mode)) return s.time !== null ? fmtTime(s.time) : '';
  if (mode === MODE.BODY) return s.kg ? `+${fmtNum(s.kg)} × ${fmtNum(s.reps)}` : `${fmtNum(s.reps)}`;
  if (s.kg === null && s.reps === null) return '';
  return `${fmtNum(s.kg || 0)} × ${fmtNum(s.reps)}`;
}
