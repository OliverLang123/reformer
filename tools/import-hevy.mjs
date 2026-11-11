// Import historie z exportu Hevy (CSV) do tabulky Reformer.
//
// Zkušební běh (nic neodesílá, nepotřebuje klíč):
//   node tools/import-hevy.mjs ../data/hevy-export-2026-11-03.csv
// Ostré odeslání (zeptá se na adresu skriptu a skrytě na klíč):
//   node tools/import-hevy.mjs ../data/hevy-export-2026-11-03.csv --send
//
// Časy v exportu jsou bez časového pásma, berou se jako pražský čas. ID tréninku je
// hevy-RRRRMMDD-HHMM, takže opakovaný import nic nezdvojí (skript existující ID přeskočí).

import { readFileSync } from 'node:fs';
import { ask, call } from './lib.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TZ = 'Europe/Prague';
const BATCH = 25;
const TYPES = { normal: 'normální', warmup: 'rozcvička', failure: 'do selhání', dropset: 'drop' };
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

// ---------- CSV ----------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, ''));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- čas ----------

// Posun pražského času proti UTC v daném okamžiku (v minutách)
function pragueOffset(utcMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - utcMs) / 60000;
}

// "Nov 2, 2026 at 6:13 PM" -> { iso, date: "2026-11-02", stamp: "20261102-1813" }
function parseHevyTime(s) {
  const m = String(s).trim().match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!m) throw new Error('Neznámý formát času: ' + s);
  const [, mon, d, y, hh, mm, ap] = m;
  let h = +hh % 12;
  if (ap === 'PM') h += 12;
  const wall = Date.UTC(+y, MONTHS[mon] - 1, +d, h, +mm);
  let utc = wall - pragueOffset(wall) * 60000;
  utc = wall - pragueOffset(utc) * 60000;
  const p2 = (n) => String(n).padStart(2, '0');
  return {
    iso: new Date(utc).toISOString(),
    date: `${y}-${p2(MONTHS[mon])}-${p2(d)}`,
    stamp: `${y}${p2(MONTHS[mon])}${p2(d)}-${p2(h)}${p2(mm)}`,
  };
}

const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
const mmss = (sec) => (sec === null ? '' : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`);

// ---------- převod ----------

function convert(rows) {
  const groups = new Map();
  rows.forEach((r) => {
    const k = r.start_time;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  const workouts = [];
  const usage = new Map(); // cvik -> co se u něj zapisovalo
  groups.forEach((list) => {
    const first = list[0];
    const start = parseHevyTime(first.start_time);
    const end = first.end_time ? parseHevyTime(first.end_time) : null;
    const id = `hevy-${start.stamp}`;
    const order = new Map();
    const supersets = new Map();
    const sets = list.map((r, i) => {
      if (!order.has(r.exercise_title)) order.set(r.exercise_title, order.size + 1);
      let ss = '';
      if (r.superset_id !== '') {
        if (!supersets.has(r.superset_id)) supersets.set(r.superset_id, String(supersets.size + 1));
        ss = supersets.get(r.superset_id);
      }
      const u = usage.get(r.exercise_title) || { sets: 0, kg: 0, reps: 0, time: 0, km: 0 };
      u.sets++;
      if (num(r.weight_kg)) u.kg++;
      if (num(r.reps)) u.reps++;
      if (num(r.duration_seconds)) u.time++;
      if (num(r.distance_km)) u.km++;
      usage.set(r.exercise_title, u);
      return {
        id: `${id}-${String(i + 1).padStart(3, '0')}`,
        exercise: r.exercise_title,
        order: order.get(r.exercise_title),
        superset: ss,
        type: TYPES[r.set_type] || 'normální',
        kg: num(r.weight_kg),
        reps: num(r.reps),
        time: mmss(num(r.duration_seconds)),
        km: num(r.distance_km),
        rir: null,
        exerciseNote: r.exercise_notes || '',
        confirmedAt: null,
      };
    });
    workouts.push({
      workout: { id, date: start.date, start: start.iso, end: end ? end.iso : null, routine: first.title, note: first.description || '' },
      sets,
    });
  });
  workouts.sort((a, b) => a.workout.start.localeCompare(b.workout.start));
  return { workouts, usage };
}

// Způsob zápisu pro cvik, který v listu Cviky není (podle toho, co se v Hevy zapisovalo)
function guessMode(u) {
  if (u.km) return 'vzdálenost a čas';
  if (u.time && !u.reps) return 'čas';
  if (!u.kg) return 'vlastní váha';
  return 'váha × opakování';
}

function seedExercises() {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'apps-script', 'Seed.js'), 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/name: '([^']+)', cz: '[^']*', mode: '([^']+)'/g)) out.set(m[1], m[2]);
  return out;
}

// ---------- spojení se skriptem ----------

// ---------- hlavní běh ----------

async function main() {
  const file = process.argv[2];
  const send = process.argv.includes('--send');
  if (!file) {
    console.log('Použití: node tools/import-hevy.mjs <export.csv> [--send]');
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const { workouts, usage } = convert(rows);
  const setCount = workouts.reduce((a, w) => a + w.sets.length, 0);

  let cfg = null;
  let knownModes = seedExercises();
  let existingIds = new Set();
  if (send) {
    cfg = { url: process.env.REFORMER_URL || await ask('Adresa skriptu (…/exec): '), key: await ask('Tajný klíč (nezobrazuje se): ', true) };
    const data = await call(cfg, 'bootstrap');
    knownModes = new Map(data.exercises.map((e) => [String(e.name), e.mode]));
    existingIds = new Set(data.workouts.map((w) => String(w.id)));
  }

  const missing = [...usage.keys()].filter((n) => !knownModes.has(n)).sort();
  const newExercises = missing.map((n) => ({ name: n, mode: guessMode(usage.get(n)), bwFactor: 0 }));
  const toSend = workouts.filter((w) => !existingIds.has(w.workout.id));

  console.log(`Export: ${rows.length} řádků, ${workouts.length} tréninků, ${setCount} sérií, ${usage.size} cviků`);
  console.log(`Období: ${workouts[0].workout.date} až ${workouts[workouts.length - 1].workout.date}`);
  console.log(`Cviky ze seznamu 34: ${usage.size - missing.length}, nové do listu Cviky: ${missing.length}`);
  const modes = {};
  newExercises.forEach((e) => { modes[e.mode] = (modes[e.mode] || 0) + 1; });
  console.log('Způsob zápisu nových cviků:', modes);
  const sample = workouts[workouts.length - 1];
  console.log(`Ukázka posledního tréninku: ${sample.workout.id}, začátek ${sample.workout.start}, konec ${sample.workout.end}, ${sample.sets.length} sérií, první série:`, sample.sets[0]);
  const tz = workouts.filter((w) => w.workout.start.endsWith('Z')).length;
  console.log(`Časy převedené z pražského času: ${tz} z ${workouts.length}`);

  if (!send) {
    console.log('\nZkušební běh, nic se neodeslalo. Ostrý import: přidej --send');
    return;
  }

  console.log(`\nV tabulce už je ${workouts.length - toSend.length} z těchto tréninků, odešlu ${toSend.length}.`);
  const total = { workoutsAdded: 0, workoutsSkipped: 0, setsAdded: 0, exercisesAdded: 0 };
  for (let i = 0; i < toSend.length || (i === 0 && newExercises.length); i += BATCH) {
    const batch = toSend.slice(i, i + BATCH);
    const r = await call(cfg, 'importWorkouts', { workouts: batch, exercises: i === 0 ? newExercises : [] });
    Object.keys(total).forEach((k) => { total[k] += r[k] || 0; });
    console.log(`  dávka ${i / BATCH + 1}: +${r.workoutsAdded} tréninků, +${r.setsAdded} sérií${r.exercisesAdded ? `, +${r.exercisesAdded} cviků` : ''}`);
    if (!batch.length) break;
  }
  console.log('Hotovo:', total);
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
