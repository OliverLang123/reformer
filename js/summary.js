// Souhrn do Stravy: název, popis a data pro obrázek (šablona design/workout-summary-ember).
// Počítá se z uloženého tréninku v modelu, takže jde udělat i dodatečně pro starší trénink.
// Pravidla: SPEC.md, sekce „Po tréninku: souhrn do Stravy“.

import { fmtNum, fmtInt, fmtTime, fmtDuration, plural } from './util.js';
import { MODE, isTimeMode, exerciseInfo, bestOf, isBetter, setVolume, bodyWeightOn, dumbbellFactor, fmtTimes, fmtBest, groupByExercise } from './model.js';
import { BODY, BODY_VIEWBOX } from './body-map.js';

export const ACCENT = '#FF6A2B';
const MAX_EXERCISES = 4;
const isWarm = (s) => s.type === 'W';
const NON_MUSCLE = { head: 'head', hair: 'head', hands: 'inactive-alt', feet: 'inactive-alt', ankles: 'inactive-alt', knees: 'inactive-alt' };

// Série tréninku po cvicích v pořadí, jak se cvičily
const exercisesOf = (model, sets) => groupByExercise(sets).map((g) => ({ ...g, info: exerciseInfo(model, g.name) }));

// Historie cviku před tímto tréninkem (nejnovější první)
function earlier(model, exercise, w) {
  const at = String(w.start || w.date);
  return (model.history.get(exercise) || []).filter((h) => h.workoutId !== w.id && String(h.start || h.date) < at);
}

const n = (v) => fmtNum(v || 0);

// ---------- popis ----------

function setsText(ex) {
  const mode = ex.info.mode;
  const sets = ex.sets;
  if (mode === MODE.DIST) {
    return sets.map((s) => [s.km !== null ? `${n(s.km)} km` : '', s.time !== null ? fmtTime(s.time) : ''].filter(Boolean).join(' ')).join(', ');
  }
  // čas na stranu: levá/pravá (0:34/0:31)
  if (isTimeMode(mode)) return sets.map(fmtTimes).join(', ');
  if (sets.every((s) => !s.kg)) {
    const reps = sets.map((s) => s.reps || 0);
    // Jedna série bez váhy jen počtem ("12"): "1×12" by vedle "50×10" vypadalo jako 1 kg
    if (reps.length > 1 && reps.every((r) => r === reps[0])) return `${reps.length}×${n(reps[0])}`;
    return reps.map(n).join(', ');
  }
  const plus = mode === MODE.BODY ? '+' : '';
  // dvě jednoručky: 2×20×9 (v KG je váha jedné)
  const two = dumbbellFactor(ex.info) === 2 ? '2×' : '';
  return sets.map((s) => (s.kg ? `${plus}${two}${n(s.kg)}×${n(s.reps)}` : n(s.reps))).join(', ');
}

// ---------- výpočet ----------

export function buildSummary(model, workoutId) {
  const w = model.workouts.find((x) => x.id === workoutId);
  if (!w) return null;
  const sets = model.setsBy.get(w.id) || [];
  const date = String(w.date).slice(0, 10);
  const bw = bodyWeightOn(model, date);
  const exercises = exercisesOf(model, sets);

  let volume = 0;
  let working = 0;
  const points = {};
  exercises.forEach((ex) => {
    ex.volume = 0;
    ex.sets.forEach((s) => { ex.volume += setVolume(s, ex.info, bw); });
    volume += ex.volume;
    const work = ex.sets.filter((s) => !isWarm(s)).length;
    working += work;
    ex.info.primary.forEach((m) => { points[m] = (points[m] || 0) + work; });
    ex.info.secondary.forEach((m) => { points[m] = (points[m] || 0) + work * 0.5; });

    // top, previous, isPR (u cviků na čas se nepočítá)
    if (!isTimeMode(ex.info.mode)) {
      ex.top = bestOf(ex.sets, ex.info.mode);
      const hist = earlier(model, ex.name, w);
      const prevSes = hist.find((h) => bestOf(h.sets, ex.info.mode));
      ex.previous = prevSes ? bestOf(prevSes.sets, ex.info.mode) : null;
      const histBest = bestOf(hist.flatMap((h) => h.sets), ex.info.mode);
      ex.isPR = !!(ex.top && histBest && isBetter(ex.top, histBest, ex.info.mode));
    }
  });

  // Popis (bez názvu, ten se kopíruje zvlášť)
  const lines = [];
  for (let i = 0; i < exercises.length; i++) {
    const group = [exercises[i]];
    while (exercises[i].superset && exercises[i + 1] && exercises[i + 1].superset === exercises[i].superset) group.push(exercises[++i]);
    lines.push(group.map((ex) => `${ex.name}: ${setsText(ex)}`).join(' · '));
  }
  const prs = exercises.filter((ex) => ex.isPR);
  prs.forEach((ex) => lines.push(`Nové maximum: ${ex.name} ${fmtBest(ex.top, ex.info)}`));
  const total = [`Celkem zvednuto: ${fmtInt(volume)} kg`, `${working} ${plural(working, 'série', 'série', 'sérií')}`];
  if (w.start && w.end) total.push(fmtDuration(new Date(w.end) - new Date(w.start)));
  lines.push(total.join(' · '));

  // Obrázek
  const routine = String(w.routine || '').trim();
  const dash = routine.indexOf(' - ');
  let label = 'Silový trénink';
  let title = routine || 'Trénink';
  if (dash > 0) {
    label = routine.slice(0, dash).trim();
    title = routine.slice(dash + 3).replace(/\s*\([^)]*\)\s*$/, '').trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Váha na obrázku jako součet (dvě jednoručky po 20 = 40 kg), stejně jako maximum
  const toImageEx = (ex) => {
    const j = dumbbellFactor(ex.info);
    const out = {
      ...splitName(ex.name),
      top: { weightKg: (ex.top.kg || 0) * j, reps: ex.top.reps || 0 },
      isPR: ex.isPR,
    };
    if (ex.previous) out.previous = { weightKg: (ex.previous.kg || 0) * j, reps: ex.previous.reps || 0 };
    if (ex.info.mode === MODE.BODY) out.bodyweight = true;
    return out;
  };
  const splitName = (name) => {
    const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    return { name: m ? m[1] : name, equipment: m ? m[2] : '' };
  };
  // Cvik na čas nebo vzdálenost pro obrázek: nejdelší čas (na stranu "0:34 / 0:31"), u vzdálenosti první série
  const toTimedEx = (ex) => {
    const withTime = ex.sets.filter((x) => x.time !== null || x.km !== null);
    if (!withTime.length) return null;
    let text;
    if (ex.info.mode === MODE.DIST) {
      const x = withTime[0];
      text = [x.km !== null ? `${n(x.km)} km` : '', x.time !== null ? fmtTime(x.time) : ''].filter(Boolean).join(' ');
    } else {
      const x = withTime.reduce((a, c) => ((c.time || 0) > (a.time || 0) ? c : a));
      text = fmtTimes(x).replace('/', ' / ');
    }
    return { ...splitName(ex.name), timed: true, text, isPR: false };
  };
  const candidates = exercises.filter((ex) => ex.top);
  const chosen = [...candidates]
    .sort((a, b) => b.volume - a.volume || a.order - b.order)
    .slice(0, MAX_EXERCISES)
    .sort((a, b) => a.order - b.order);
  const outsidePr = chosen.some((ex) => ex.isPR) ? null : prs.find((ex) => !chosen.includes(ex) && ex.top);

  const maxPoints = Math.max(0, ...Object.values(points));
  const tone = (slug) => {
    if (NON_MUSCLE[slug]) return NON_MUSCLE[slug];
    const p = points[slug] || 0;
    if (!p || !maxPoints) return 'inactive';
    const r = p / maxPoints;
    return r >= 2 / 3 ? 'primary' : r >= 1 / 3 ? 'secondary' : 'tertiary';
  };
  const figure = (side) => ({
    viewBox: BODY_VIEWBOX[side],
    parts: BODY[side].flatMap(([slug, ds]) => ds.map((d) => ({ d, tone: tone(slug) }))),
  });

  const image = {
    label,
    title,
    date,
    totalVolumeKg: Math.round(volume),
    workingSets: working,
    theme: { accent: ACCENT },
    exercises: chosen.map(toImageEx),
    personalRecord: outsidePr ? toImageEx(outsidePr) : null,
    body: { front: figure('front'), back: figure('back') },
  };
  // Trénink bez vah (jen čas a vzdálenost): cviky na čas v pořadí tréninku, místo objemu počet sérií,
  // místo nejtěžší série délka tréninku. Smíšený trénink se nemění.
  if (!candidates.length) {
    const timedList = exercises.map(toTimedEx).filter(Boolean).slice(0, MAX_EXERCISES);
    if (timedList.length) {
      image.exercises = timedList;
      image.timed = {
        sets: sets.length,
        duration: w.start && w.end ? fmtDuration(new Date(w.end) - new Date(w.start)) : '',
      };
    }
  }

  return {
    name: routine || 'Silový trénink',
    description: lines.join('\n'),
    image,
    fileName: `reformer-${date}.png`,
  };
}
