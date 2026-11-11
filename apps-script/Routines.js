// Kontrola listu Rutiny: stejná pravidla a stejné texty jako validateRoutines v js/model.js
// (shodu hlídá test/script.test.mjs). Jde pustit z editoru (checkRoutines) i přes API (akce checkRoutines).
//
// Úsporný zápis listu Rutiny:
// - prázdná Rutina, Týden a Poznámka k rutině = stejné jako řádek výš
// - prázdný Cvik = další série stejného cviku jako řádek výš (Pořadí, Superset, Odpočinek a Poznámka z něj)
// - u řádku s vyplněným Cvikem je Pořadí povinné
// - Sérií = N stejných sérií (prázdné = 1); KG, OPAK., ČAS a KM se nedědí

const ROUTINE_MAX_COUNT = 20;

function checkRoutines() {
  const issues = checkRoutines_();
  const msg = issues.length
    ? issues.map((i) => 'řádek ' + i.row + (i.routine ? ' (' + i.routine + ')' : '') + ': ' + i.text).join('\n')
    : 'list Rutiny je v pořádku';
  Logger.log(msg);
  return msg;
}

function checkRoutines_() {
  return routineIssues_(readSheet_('Rutiny', true), readSheet_('Cviky'));
}

function routineKey_(s) {
  return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function routineNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

// Čas m:ss, sekundy, zlomek dne nebo datum z roku 1899 (buňka formátovaná jako čas)
function routineTimeOk_(v) {
  if (typeof v === 'number') return isFinite(v) && v >= 0;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const secs = Math.round((Date.parse(s) - Date.UTC(1899, 11, 29, 23, 0, 0)) / 1000);
    return secs >= 0 && secs < 86400;
  }
  return /^\d+(:\d{1,2}){0,2}$/.test(s);
}

function routineRangeOk_(v) {
  return /^(\d+(?:[.,]\d+)?)(?:[-–](\d+(?:[.,]\d+)?))?$/.test(String(v).replace(/\s/g, ''));
}

function routineFmt_(n) {
  return String(n).replace('.', ',');
}

// rows: řádky listu Rutiny (s klíčem row), exercises: řádky listu Cviky
function routineIssues_(rows, exercises) {
  const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const known = {};
  (exercises || []).forEach((e) => {
    if (!filled(e.name)) return;
    const k = routineKey_(e.name);
    if (!known[k]) known[k] = { name: String(e.name).trim(), parts: filled(e.primary) };
  });
  const types = {};
  SET_TYPES.forEach((t) => { types[t] = true; });

  const issues = [];
  const routines = {};
  let rt = null;
  let ex = null;
  let first = true;
  (rows || []).forEach((r, i) => {
    const row = routineNum_(r.row) || i + 2;
    const issue = (text) => issues.push({ row: row, routine: rt ? rt.name : '', text: text });
    const hasData = ['routine', 'exercise', 'order', 'type', 'kg', 'reps', 'time', 'km', 'rest', 'count'].some((k) => filled(r[k]));
    if (!hasData) return;

    if (filled(r.routine)) {
      const name = String(r.routine).trim();
      if (!routines[name]) routines[name] = { name: name, exercises: [] };
      if (!rt || rt.name !== name) ex = null;
      rt = routines[name];
    } else if (first) {
      issue('První řádek nemá vyplněnou Rutinu');
    }
    first = false;
    if (!rt) return;

    if (filled(r.exercise)) {
      const raw = String(r.exercise).replace(/\s+/g, ' ').trim();
      const info = known[routineKey_(raw)];
      const name = info ? info.name : raw;
      let order = routineNum_(r.order);
      if (order === null) {
        issue('Cvik ' + name + ' nemá Pořadí');
        order = rt.exercises.reduce((m, e) => Math.max(m, e.order), 0) + 1;
      }
      ex = rt.exercises.filter((e) => e.order === order && e.name === name)[0];
      if (!ex) {
        const clash = rt.exercises.filter((e) => e.order === order)[0];
        if (clash && clash.superset === null) issue('Pořadí ' + routineFmt_(order) + ' mají dva cviky: ' + clash.name + ' a ' + name);
        ex = { name: name, order: order, superset: filled(r.superset) ? String(r.superset).trim() : null };
        rt.exercises.push(ex);
        if (!info) issue('Cvik ' + name + ' není v listu Cviky');
        else if (!info.parts) issue('Cvik ' + name + ' nemá v listu Cviky partie (chybí pak ve svalové mapě)');
      }
    } else if (!ex) {
      issue('Řádek nemá Cvik a nad ním žádný cvik není');
      return;
    }

    if (filled(r.rest) && !routineTimeOk_(r.rest)) issue('Nečitelný Odpočinek „' + r.rest + '“');
    if (filled(r.type) && !types[String(r.type).trim().toLowerCase()]) issue('Neznámý Typ „' + r.type + '“ (bere se jako normální)');
    if (filled(r.reps) && !routineRangeOk_(r.reps)) issue('Nečitelná OPAK. „' + r.reps + '“');
    if (filled(r.time) && !routineTimeOk_(r.time)) issue('Nečitelný ČAS „' + r.time + '“');
    if (filled(r.kg) && routineNum_(r.kg) === null) issue('Nečitelná KG „' + r.kg + '“');
    if (filled(r.km) && routineNum_(r.km) === null) issue('Nečitelné KM „' + r.km + '“');
    if (filled(r.count)) {
      const c = routineNum_(r.count);
      if (c === null || Math.floor(c) !== c || c < 1 || c > ROUTINE_MAX_COUNT) issue('Nečitelné Sérií „' + r.count + '“ (celé číslo 1 až ' + ROUTINE_MAX_COUNT + ')');
    }
  });
  return issues;
}
