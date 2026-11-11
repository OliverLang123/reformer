// Rozpracovaný trénink: založení, úpravy, potvrzení série a podklad pro tabulku.
// Funkce dostanou trénink, vrátí nový (původní se nemění).

import { uid, pragueDate, parseNum, parseTimeInput, fmtTime } from './util.js';
import {
  TYPE_TO_SHEET, MODE, fieldsFor, isTimeMode, isTimeField, exerciseInfo, previousSession, previousFor, groupByExercise,
  historyBest, isBetter, setVolume, bodyWeightOn,
} from './model.js';

export const DEFAULT_REST = 120;

const clone = (x) => JSON.parse(JSON.stringify(x));

function newSet(workoutId, type = 'N', target = {}) {
  return {
    id: uid('S').replace('S-', 'S-' + workoutId.slice(-6) + '-'),
    type,
    input: { kg: '', reps: '', time: '', timeR: '', km: '' },
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

const has = (v) => v !== undefined && v !== null;

// Hodnota pole: co uživatel napsal, jinak šedý cíl z rutiny, jinak MINULE.
// Pravá strana (timeR) má stejný cíl jako levá (ČAS z rutiny platí pro každou stranu).
export function effective(set, field, prev) {
  const raw = set.input[field];
  if (raw !== '' && raw !== null && raw !== undefined) {
    return isTimeField(field) ? parseTimeInput(raw) : parseNum(raw);
  }
  const t = set.target || {};
  if (field === 'reps' && t.reps) return t.reps.hi;
  if (has(t[field])) return t[field];
  if (field === 'timeR' && has(t.time)) return t.time;
  if (prev && has(prev[field])) return prev[field];
  if (field === 'timeR' && prev && has(prev.time)) return prev.time;
  return null;
}

const INVALID = { kg: 'Neplatná váha', reps: 'Neplatná opakování', time: 'Neplatný čas', timeR: 'Neplatný čas', km: 'Neplatná vzdálenost' };

// Potvrzení série ✓. Vrátí { workout, rest, error }.
export function confirmSet(w, exKey, setId, model) {
  const n = clone(w);
  const ex = findEx(n, exKey);
  const set = ex.sets.find((x) => x.id === setId);
  const info = exerciseInfo(model, ex.name);
  const prevSes = previousSession(model, ex.name, n.id, n.edit ? n.start : null);
  const prev = previousFor(prevSes, set, ex.sets);

  // Neprázdný vstup, který nejde převést na číslo, se nesmí potvrdit jako prázdná hodnota
  const bad = fieldsFor(info.mode).find((f) => {
    const raw = set.input[f];
    return raw !== '' && raw !== null && raw !== undefined && effective(set, f, prev) === null;
  });
  if (bad) return { workout: w, error: INVALID[bad] };

  const values = {};
  fieldsFor(info.mode).forEach((f) => { values[f] = effective(set, f, prev); });
  if (isTimeMode(info.mode)) {
    if (!values.time && !values.km) return { workout: w, error: 'Zadej čas' };
  } else if (!values.reps) {
    return { workout: w, error: 'Zadej opakování' };
  }
  fieldsFor(info.mode).forEach((f) => {
    const v = values[f];
    set.input[f] = v === null ? '' : isTimeField(f) ? fmtTime(v) : String(v).replace('.', ',');
  });
  set.done = true;
  set.watchSide = null;
  // Při úpravě z historie zůstává původní čas potvrzení
  if (!(n.edit && set.confirmedAt)) set.confirmedAt = new Date().toISOString();

  // Jiná váha než cíl: další nepotvrzené série stejného typu ji převezmou jako šedý cíl
  if (!isTimeMode(info.mode) && values.kg !== null) {
    const was = has(set.target && set.target.kg) ? set.target.kg : null;
    if (was !== values.kg) {
      const at = ex.sets.indexOf(set);
      ex.sets.forEach((o, i) => {
        if (i > at && !o.done && o.type === set.type) o.target = { ...(o.target || {}), kg: values.kg };
      });
    }
  }

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

  // Odpočinek: v supersetu až po posledním cviku kola. Když další cviky supersetu už žádnou
  // nepotvrzenou sérii nemají (různý počet sérií), kolo končí tímto cvikem.
  let rest = ex.rest;
  if (ex.superset) {
    const group = n.exercises.filter((e) => e.superset === ex.superset);
    const later = group.slice(group.indexOf(ex) + 1);
    if (later.some((e) => e.sets.some((x) => !x.done))) rest = 0;
  }
  if (rest > 0) {
    n.restTotal = rest;
    n.restEnd = Date.now() + rest * 1000;
  }
  return { workout: n, rest };
}

// ---------- stopky u cviků na čas ----------
// Stav je v tréninku (w.watch), takže přežije zavření appky. Čas se počítá z času startu,
// ne přičítáním, takže sedí i po zamknutí telefonu.
//   w.watch = { exKey, setId, side: 'L' | 'R' | null, start: ms, target: s | null }
// U „čas na stranu“ po Stop levé zůstane v sérii watchSide = 'R' (další Start měří pravou).

export const watchElapsed = (watch, now = Date.now()) => Math.max(0, Math.floor((now - watch.start) / 1000));

export function startWatch(w, exKey, setId, model) {
  const n = clone(w);
  const ex = findEx(n, exKey);
  const set = ex && ex.sets.find((x) => x.id === setId);
  if (!set) return w;
  const info = exerciseInfo(model, ex.name);
  const side = info.mode === MODE.TIME_SIDE ? (set.watchSide || 'L') : null;
  const t = set.target || {};
  n.watch = { exKey, setId, side, start: Date.now(), target: has(t.time) && t.time > 0 ? t.time : null };
  n.restEnd = null; // start stopek ukončí odpočinek
  return n;
}

export function cancelWatch(w) {
  const n = clone(w);
  n.watch = null;
  return n;
}

// Stop: zapíše naměřený čas (celé sekundy dolů). Levá strana přepne sérii na pravou,
// jinak se série potvrdí jako ✓ (odpočinek podle pravidel, v supersetu až po kole).
// Vrátí { workout, rest, error }.
export function stopWatch(w, model, now = Date.now()) {
  const watch = w.watch;
  if (!watch) return { workout: w };
  const n = clone(w);
  n.watch = null;
  const ex = findEx(n, watch.exKey);
  const set = ex && ex.sets.find((x) => x.id === watch.setId);
  if (!set) return { workout: n };
  const secs = watchElapsed(watch, now);
  if (watch.side === 'L') {
    set.input.time = fmtTime(secs);
    set.watchSide = 'R';
    return { workout: n };
  }
  if (watch.side === 'R') set.input.timeR = fmtTime(secs);
  else set.input.time = fmtTime(secs);
  return confirmSet(n, ex.key, set.id, model);
}

export function unconfirmSet(w, exKey, setId) {
  const n = clone(w);
  const s = findEx(n, exKey).sets.find((x) => x.id === setId);
  s.done = false;
  s.watchSide = null;
  s.pr = false;
  if (!n.edit) s.confirmedAt = null; // při úpravě z historie zůstává původní čas potvrzení
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
      const v = last.input[f] !== '' ? (isTimeField(f) ? parseTimeInput(last.input[f]) : parseNum(last.input[f])) : last.target[f];
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
  if (n.watch && n.watch.setId === setId) n.watch = null;
  return n;
}

// Podklad pro Vrátit po smazání: série i s místem, kde byla
export function removedSet(w, exKey, setId) {
  const ex = findEx(w, exKey);
  const index = ex ? ex.sets.findIndex((s) => s.id === setId) : -1;
  return index < 0 ? null : { exKey, index, set: clone(ex.sets[index]) };
}

// Vrátí smazanou sérii na původní místo včetně hodnot a času potvrzení
export function restoreSet(w, removed) {
  const ex = removed && findEx(w, removed.exKey);
  if (!ex || ex.sets.some((s) => s.id === removed.set.id)) return w;
  const n = clone(w);
  findEx(n, removed.exKey).sets.splice(Math.min(removed.index, ex.sets.length), 0, clone(removed.set));
  return n;
}

export function addExercise(w, name) {
  const n = clone(w);
  const ex = newExercise(name);
  ex.sets.push(newSet(n.id));
  n.exercises.push(ex);
  return n;
}

export const hasConfirmed = (w, exKey) => !!(findEx(w, exKey) || { sets: [] }).sets.some((s) => s.done);

// Nahrazení cviku. Když už má potvrzené série, zůstanou původnímu cviku a nový cvik
// se vloží pod něj se zbylými (nepotvrzenými) sériemi.
export function replaceExercise(w, exKey, name) {
  const n = clone(w);
  const i = n.exercises.findIndex((e) => e.key === exKey);
  const ex = n.exercises[i];
  if (n.watch && n.watch.exKey === exKey) n.watch = null;
  const reset = (s) => { s.target = {}; s.pr = false; s.watchSide = null; s.input = { kg: '', reps: '', time: '', timeR: '', km: '' }; };
  if (!ex.sets.some((s) => s.done)) {
    ex.name = name;
    ex.sets.forEach((s) => { s.target = {}; s.pr = false; s.watchSide = null; });
    return n;
  }
  const rest = ex.sets.filter((s) => !s.done);
  ex.sets = ex.sets.filter((s) => s.done);
  const added = newExercise(name, { superset: ex.superset, rest: ex.rest });
  rest.forEach(reset);
  added.sets = rest.length ? rest : [newSet(n.id)];
  n.exercises.splice(i + 1, 0, added);
  return n;
}

// Bloky pro změnu pořadí: cviky jednoho supersetu jdoucí za sebou se posouvají spolu
export function exerciseBlocks(w) {
  const blocks = [];
  w.exercises.forEach((e) => {
    const last = blocks[blocks.length - 1];
    if (last && e.superset && last[0].superset === e.superset) last.push(e);
    else blocks.push([e]);
  });
  return blocks;
}

export function moveExercise(w, exKey, dir) {
  const n = clone(w);
  const blocks = exerciseBlocks(n);
  const i = blocks.findIndex((b) => b.some((e) => e.key === exKey));
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return w;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  n.exercises = blocks.flat();
  return n;
}

export function removeExercise(w, exKey) {
  const n = clone(w);
  n.exercises = n.exercises.filter((e) => e.key !== exKey);
  if (n.watch && n.watch.exKey === exKey) n.watch = null;
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
  const sets = model.setsBy.get(id) || [];
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
  groupByExercise(sets).forEach((g) => {
    const ex = newExercise(g.name, { superset: g.superset });
    ex.note = (g.sets.find((s) => s.exerciseNote) || {}).exerciseNote || '';
    const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    ex.sets = g.sets.map((s) => ({
      id: s.id,
      type: s.type,
      input: {
        kg: num(s.kg), reps: num(s.reps), time: s.time !== null ? fmtTime(s.time) : '',
        timeR: s.timeR !== null && s.timeR !== undefined ? fmtTime(s.timeR) : '', km: num(s.km),
      },
      target: {},
      done: true,
      confirmedAt: s.confirmedAt || null,
      rir: s.rir,
      pr: false,
    }));
    w.exercises.push(ex);
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
    timeR: parseTimeInput(s.input.timeR),
    km: parseNum(s.input.km),
  };
}

export function stats(w, model) {
  const bw = bodyWeightOn(model, pragueDate(new Date(w.start)));
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
        timeR: v.timeR !== null ? fmtTime(v.timeR) : '',
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
      date: pragueDate(new Date(w.start)),
      start: w.start,
      end: end,
      routine: w.title || w.routine || 'Trénink',
      note: w.note || '',
    },
    sets,
  };
}

