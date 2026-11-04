// Rozpracovaný trénink: založení, úpravy, potvrzení série a podklad pro tabulku.
// Funkce dostanou trénink, vrátí nový (původní se nemění).

import { uid, localDate, parseNum, parseTimeInput, fmtTime } from './util.js';
import {
  TYPE_TO_SHEET, fieldsFor, isTimeMode, exerciseInfo, previousSession, previousFor,
  historyBest, isBetter, setVolume, bodyWeightOn,
} from './model.js';

export const DEFAULT_REST = 120;

const clone = (x) => JSON.parse(JSON.stringify(x));

function newSet(workoutId, type = 'N', target = {}) {
  return {
    id: uid('S').replace('S-', 'S-' + workoutId.slice(-6) + '-'),
    type,
    input: { kg: '', reps: '', time: '', km: '' },
    target,
    done: false,
    confirmedAt: null,
    rir: null,
    pr: false,
  };
}

function newExercise(name, opts = {}) {
  return {
    key: uid('E'),
    name,
    superset: opts.superset || null,
    rest: opts.rest === undefined || opts.rest === null ? DEFAULT_REST : opts.rest,
    routineNote: opts.note || '',
    note: '',
    sets: [],
  };
}

export function createWorkout(routine) {
  const id = uid('W');
  const w = {
    id,
    title: routine ? routine.name : 'Trénink',
    routine: routine ? routine.name : '',
    routineNote: routine ? routine.note : '',
    start: new Date().toISOString(),
    note: '',
    exercises: [],
    restEnd: null,
    restTotal: 0,
    asked3h: false,
  };
  if (routine) {
    routine.exercises.forEach((re) => {
      const ex = newExercise(re.name, re);
      re.sets.forEach((t) => ex.sets.push(newSet(id, t.type, { kg: t.kg, reps: t.reps, time: t.time, km: t.km })));
      if (!ex.sets.length) ex.sets.push(newSet(id));
      w.exercises.push(ex);
    });
  }
  return w;
}

const findEx = (w, key) => w.exercises.find((e) => e.key === key);

export function updateInput(w, exKey, setId, field, value) {
  const n = clone(w);
  const s = findEx(n, exKey).sets.find((x) => x.id === setId);
  s.input[field] = value;
  return n;
}

export function setType(w, exKey, setId, type) {
  const n = clone(w);
  findEx(n, exKey).sets.find((x) => x.id === setId).type = type;
  return n;
}

export function setRir(w, exKey, setId, rir) {
  const n = clone(w);
  findEx(n, exKey).sets.find((x) => x.id === setId).rir = rir;
  return n;
}

// Hodnota pole: co uživatel napsal, jinak šedý cíl z rutiny, jinak MINULE.
export function effective(set, field, prev) {
  const raw = set.input[field];
  if (raw !== '' && raw !== null && raw !== undefined) {
    return field === 'time' ? parseTimeInput(raw) : parseNum(raw);
  }
  const t = set.target || {};
  if (field === 'reps' && t.reps) return t.reps.hi;
  if (t[field] !== undefined && t[field] !== null) return t[field];
  if (prev && prev[field] !== undefined && prev[field] !== null) return prev[field];
  return null;
}

// Potvrzení série ✓. Vrátí { workout, rest, error }.
export function confirmSet(w, exKey, setId, model) {
  const n = clone(w);
  const ex = findEx(n, exKey);
  const set = ex.sets.find((x) => x.id === setId);
  const info = exerciseInfo(model, ex.name);
  const prevSes = previousSession(model, ex.name, n.id, n.edit ? n.start : null);
  const prev = previousFor(prevSes, set, ex.sets);

  const values = {};
  fieldsFor(info.mode).forEach((f) => { values[f] = effective(set, f, prev); });
  if (isTimeMode(info.mode)) {
    if (!values.time && !values.km) return { workout: w, error: 'Zadej čas' };
  } else if (!values.reps) {
    return { workout: w, error: 'Zadej opakování' };
  }
  fieldsFor(info.mode).forEach((f) => {
    const v = values[f];
    set.input[f] = v === null ? '' : f === 'time' ? fmtTime(v) : String(v).replace('.', ',');
  });
  set.done = true;
  set.confirmedAt = new Date().toISOString();

  // Nové maximum: lepší než celá historie i dřívější série tohoto tréninku. První záznam se nepočítá.
  set.pr = false;
  if (set.type !== 'W' && !isTimeMode(info.mode)) {
    const cand = { kg: values.kg || 0, reps: values.reps || 0 };
    let best = historyBest(model, ex.name, info.mode, n.id);
    if (best) {
      n.exercises.forEach((e) => {
        if (e.name !== ex.name) return;
        e.sets.forEach((s) => {
          if (s === set || !s.done || s.type === 'W') return;
          const o = setValues(s);
          if (isBetter(o, best, info.mode)) best = o;
        });
      });
      set.pr = isBetter(cand, best, info.mode);
    }
  }

  // Odpočinek: v supersetu až po posledním cviku kola.
  let rest = ex.rest;
  if (ex.superset) {
    const group = n.exercises.filter((e) => e.superset === ex.superset);
    if (group[group.length - 1].key !== ex.key) rest = 0;
  }
  if (rest > 0) {
    n.restTotal = rest;
    n.restEnd = Date.now() + rest * 1000;
  }
  return { workout: n, rest };
}

export function unconfirmSet(w, exKey, setId) {
  const n = clone(w);
  const s = findEx(n, exKey).sets.find((x) => x.id === setId);
  s.done = false;
  s.pr = false;
  s.confirmedAt = null;
  return n;
}

// Nová série převezme hodnoty poslední série jako šedý cíl.
export function addSet(w, exKey) {
  const n = clone(w);
  const ex = findEx(n, exKey);
  const last = ex.sets[ex.sets.length - 1];
  const target = {};
  if (last) {
    ['kg', 'time', 'km'].forEach((f) => {
      const v = last.input[f] !== '' ? (f === 'time' ? parseTimeInput(last.input[f]) : parseNum(last.input[f])) : last.target[f];
      if (v !== null && v !== undefined) target[f] = v;
    });
    const r = last.input.reps !== '' ? parseNum(last.input.reps) : null;
    if (r !== null) target.reps = { lo: r, hi: r, text: String(r) };
    else if (last.target.reps) target.reps = last.target.reps;
  }
  ex.sets.push(newSet(n.id, last && last.type === 'W' ? 'N' : last ? last.type : 'N', target));
  return n;
}

export function deleteSet(w, exKey, setId) {
  const n = clone(w);
  const ex = findEx(n, exKey);
  ex.sets = ex.sets.filter((s) => s.id !== setId);
  return n;
}

export function addExercise(w, name) {
  const n = clone(w);
  const ex = newExercise(name);
  ex.sets.push(newSet(n.id));
  n.exercises.push(ex);
  return n;
}

export function replaceExercise(w, exKey, name) {
  const n = clone(w);
  const ex = findEx(n, exKey);
  ex.name = name;
  ex.sets.forEach((s) => { s.target = {}; s.pr = false; });
  return n;
}

export function moveExercise(w, exKey, dir) {
  const n = clone(w);
  const i = n.exercises.findIndex((e) => e.key === exKey);
  const j = i + dir;
  if (j < 0 || j >= n.exercises.length) return w;
  [n.exercises[i], n.exercises[j]] = [n.exercises[j], n.exercises[i]];
  return n;
}

export function removeExercise(w, exKey) {
  const n = clone(w);
  n.exercises = n.exercises.filter((e) => e.key !== exKey);
  return n;
}

// Superset s následujícím cvikem, nebo zrušení supersetu
export function toggleSuperset(w, exKey) {
  const n = clone(w);
  const i = n.exercises.findIndex((e) => e.key === exKey);
  const ex = n.exercises[i];
  if (ex.superset) {
    const id = ex.superset;
    ex.superset = null;
    const rest = n.exercises.filter((e) => e.superset === id);
    if (rest.length === 1) rest[0].superset = null;
    return n;
  }
  const next = n.exercises[i + 1];
  if (!next) return w;
  const used = n.exercises.map((e) => parseInt(e.superset, 10)).filter((x) => !Number.isNaN(x));
  const id = next.superset || String((used.length ? Math.max(...used) : 0) + 1);
  ex.superset = id;
  next.superset = id;
  return n;
}

// Uložený trénink z historie jako upravitelný trénink (série potvrzené, stejná ID)
export function fromSaved(model, id) {
  const saved = model.workouts.find((x) => x.id === id);
  if (!saved) return null;
  const sets = [...(model.setsBy.get(id) || [])].sort((a, b) => a.order - b.order);
  const w = {
    id,
    title: saved.routine || 'Trénink',
    routine: saved.routine || '',
    routineNote: '',
    start: saved.start || `${saved.date}T12:00:00`,
    end: saved.end || null,
    note: saved.note || '',
    exercises: [],
    restEnd: null,
    restTotal: 0,
    asked3h: true,
    edit: true,
  };
  const byKey = new Map();
  sets.forEach((s) => {
    const key = s.order + '|' + s.exercise;
    if (!byKey.has(key)) {
      const ex = newExercise(s.exercise, { superset: s.superset });
      ex.note = s.exerciseNote || '';
      byKey.set(key, ex);
      w.exercises.push(ex);
    }
    const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    byKey.get(key).sets.push({
      id: s.id,
      type: s.type,
      input: { kg: num(s.kg), reps: num(s.reps), time: s.time !== null ? fmtTime(s.time) : '', km: num(s.km) },
      target: {},
      done: true,
      confirmedAt: s.confirmedAt || null,
      rir: s.rir,
      pr: false,
    });
  });
  return w;
}

export function patch(w, fn) {
  const n = clone(w);
  fn(n);
  return n;
}

export function setValues(s) {
  return {
    kg: parseNum(s.input.kg),
    reps: parseNum(s.input.reps),
    time: parseTimeInput(s.input.time),
    km: parseNum(s.input.km),
  };
}

export function stats(w, model) {
  const bw = bodyWeightOn(model, localDate(new Date(w.start)));
  let volume = 0;
  let sets = 0;
  let working = 0;
  const prs = [];
  w.exercises.forEach((ex) => {
    const info = exerciseInfo(model, ex.name);
    ex.sets.forEach((s) => {
      if (!s.done) return;
      sets++;
      if (s.type !== 'W') working++;
      volume += setVolume(setValues(s), info, bw);
      if (s.pr) prs.push({ exercise: ex.name, mode: info.mode, ...setValues(s) });
    });
  });
  // U každého cviku jen nejlepší nové maximum
  const bestPr = new Map();
  prs.forEach((p) => {
    const cur = bestPr.get(p.exercise);
    if (!cur || isBetter(p, cur, p.mode)) bestPr.set(p.exercise, p);
  });
  return { volume, sets, working, prs: [...bestPr.values()] };
}

// Podklad pro saveWorkout: jen potvrzené série, v pořadí cviků.
export function snapshot(w, end = null) {
  const sets = [];
  w.exercises.forEach((ex, i) => {
    ex.sets.forEach((s) => {
      if (!s.done) return;
      const v = setValues(s);
      sets.push({
        id: s.id,
        exercise: ex.name,
        order: i + 1,
        superset: ex.superset || '',
        type: TYPE_TO_SHEET[s.type],
        kg: v.kg,
        reps: v.reps,
        time: v.time !== null ? fmtTime(v.time) : '',
        km: v.km,
        rir: s.rir,
        exerciseNote: ex.note || '',
        confirmedAt: s.confirmedAt,
      });
    });
  });
  return {
    workout: {
      id: w.id,
      date: localDate(new Date(w.start)),
      start: w.start,
      end: end,
      routine: w.title || w.routine || 'Trénink',
      note: w.note || '',
    },
    sets,
  };
}

