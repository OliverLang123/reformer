// API pro appku Reformer. Appka posílá POST s tělem JSON (Content-Type text/plain,
// aby prohlížeč neposílal předběžný dotaz CORS): { key, action, ...parametry }.
// Klíč je ve Vlastnostech skriptu pod názvem API_KEY, v kódu ani v repozitáři není.

// Zvyšuje se s každou změnou sloupců nebo akcí. Appka má v js/store.js MIN_API a při nižší
// verzi skriptu ukáže varování.
const API_VERSION = 3;

const ACTIONS = {
  ping: () => ({ version: API_VERSION, name: SpreadsheetApp.getActive().getName() }),
  bootstrap: () => bootstrap_(),
  saveWorkout: (req) => saveWorkout_(req),
  deleteWorkout: (req) => deleteWorkout_(req),
  saveExercise: (req) => saveExercise_(req),
  checkRoutines: () => ({ issues: checkRoutines_() }),
  uploadMedia: (req) => uploadMedia_(req),
  getMedia: (req) => getMedia_(req),
  // Jednorázové akce: jen s vlastností skriptu MAINTENANCE=1
  importWorkouts: (req) => { maintenanceOnly_(); return importWorkouts_(req); },
  fixSetKg: (req) => { maintenanceOnly_(); return fixSetKg_(req); },
};

function doGet() {
  return json_({ ok: true, app: 'reformer', version: API_VERSION });
}

// Chyba s kódem pro appku: bad_key, bad_request, maintenance. Ostatní chyby mají kód server.
function fail_(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function doPost(e) {
  try {
    let req;
    try {
      req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (x) {
      throw fail_('bad_request', 'Požadavek není platný JSON');
    }
    checkKey_(req.key);
    const action = ACTIONS[req.action];
    if (!action) throw fail_('bad_request', 'Neznámá akce: ' + req.action);
    return json_(Object.assign({ ok: true }, action(req)));
  } catch (err) {
    return json_({ ok: false, code: (err && err.code) || 'server', error: String(err && err.message || err) });
  }
}

function maintenanceOnly_() {
  if (PropertiesService.getScriptProperties().getProperty('MAINTENANCE') !== '1') {
    throw fail_('maintenance', 'Akce je povolená jen při údržbě (vlastnost skriptu MAINTENANCE=1)');
  }
}

// Čtení všech listů pro appku. Krátký zámek, aby se nečetlo uprostřed zápisu tréninku
// (mazání řádků). Když zámek nejde získat, čte se bez něj jako dřív.
function bootstrap_() {
  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(10000);
  try {
    return {
      version: API_VERSION,
      exercises: readSheet_('Cviky'),
      routines: readSheet_('Rutiny', true),
      body: readSheet_('Tělo'),
      workouts: readSheet_('Tréninky'),
      sets: readSheet_('Série'),
    };
  } finally {
    if (locked) lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!expected || expected.length < 16) throw fail_('server', 'Ve skriptu chybí API_KEY (aspoň 16 znaků)');
  const a = String(key || '');
  let diff = a.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (a.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (diff !== 0) throw fail_('bad_key', 'Špatný klíč');
}

// ---------- čtení a zápis podle záhlaví ----------

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Chybí list ' + name + ', spusť setup');
  return sh;
}

function headerIndex_(sh) {
  const lastCol = sh.getLastColumn();
  const idx = {};
  if (!lastCol) return idx;
  sh.getRange(1, 1, 1, lastCol).getValues()[0].forEach((h, i) => { if (h !== '') idx[String(h)] = i; });
  return idx;
}

function fieldMap_(sh) {
  const h = headerIndex_(sh);
  return SCHEMA[sh.getName()].filter((c) => h[c[0]] !== undefined).map((c) => ({ header: c[0], key: c[1], col: h[c[0]] }));
}

// withRow: přidá číslo řádku v listu (klíč row), podle něj appka hlásí problémy v listu Rutiny
function readSheet_(name, withRow) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const fields = fieldMap_(sh);
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const out = [];
  values.forEach((row, i) => {
    if (row.every((v) => v === '')) return;
    const obj = withRow ? { row: i + 2 } : {};
    fields.forEach((f) => {
      const v = row[f.col];
      if (v === '' || v === null) return;
      if (v instanceof Date) {
        obj[f.key] = DATE_FIELDS[f.key] ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
      } else {
        obj[f.key] = v;
      }
    });
    out.push(obj);
  });
  return out;
}

// Hodnota do buňky. Čísla musí být čísla, texty se zkrátí a text, který by tabulka vzala jako
// vzorec (začíná =, +, - nebo @), dostane apostrof: v buňce pak zůstane přesně to, co uživatel napsal.
function toCell_(key, v) {
  if (v === undefined || v === null || v === '') return '';
  if (DATE_FIELDS[key]) {
    const p = String(v).slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || p.some((x) => !isFinite(x))) throw fail_('bad_request', 'Neplatné datum: ' + v);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  if (DATETIME_FIELDS[key]) {
    const d = new Date(v);
    if (isNaN(d.getTime())) throw fail_('bad_request', 'Neplatný čas: ' + v);
    return d;
  }
  if (NUMBER_FIELDS[key]) {
    const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    if (!isFinite(n)) throw fail_('bad_request', 'Hodnota ' + key + ' není číslo: ' + v);
    return n;
  }
  if (typeof v !== 'string') return v;
  const text = v.slice(0, TEXT_LIMIT[key] || 200);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

// Stejná hodnota v buňce a v novém řádku? Datum s tolerancí 1 s, číslo 1 a text "1" jsou totéž.
function sameCell_(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Math.abs(a.getTime() - b.getTime()) < 1000;
  }
  const text = (x) => String(x === null || x === undefined ? '' : x).replace(/^'/, '');
  return text(a) === text(b);
}

// Záhlaví se přečte jednou, vrácená funkce pak převádí objekty na řádky.
function rowMaker_(sh) {
  const fields = fieldMap_(sh).filter((f) => f.key !== 'volume');
  const width = writeWidth_(sh);
  return (obj) => {
    const row = new Array(width).fill('');
    fields.forEach((f) => { if (f.col < width) row[f.col] = toCell_(f.key, obj[f.key]); });
    return row;
  };
}

function writeWidth_(sh) {
  const h = headerIndex_(sh);
  if (h['Objem'] === undefined) return sh.getLastColumn();
  const others = Object.keys(h).filter((k) => k !== 'Objem').map((k) => h[k]);
  if (others.some((i) => i > h['Objem'])) throw new Error('Sloupec Objem musí být v listu ' + sh.getName() + ' poslední');
  return h['Objem'];
}

// Poslední řádek s hodnotou v prvním sloupci (ID, Název). getLastRow by započítal i prázdné
// výsledky vzorce Objem, a nové řádky by se pak zapisovaly za mezeru.
function lastRow_(sh) {
  const max = sh.getMaxRows();
  const cell = sh.getRange(max, 1);
  if (cell.getValue() !== '') return max;
  return cell.getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
}

function ensureRows_(sh, needed) {
  const free = sh.getMaxRows() - lastRow_(sh);
  if (free < needed) sh.insertRowsAfter(sh.getMaxRows(), needed - free + 100);
}

// ---------- tréninky ----------

// Uloží trénink a jeho série. Dá se volat opakovaně (po každé potvrzené sérii):
// řádky se hledají podle ID, existující se přepíšou, nové přidají a série tréninku,
// které už v appce nejsou, se smažou. Opakované odeslání tedy nic nezdvojí.
function saveWorkout_(req) {
  const w = req.workout;
  if (!w || !w.id) throw fail_('bad_request', 'Chybí trénink nebo jeho ID');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    upsertRows_(sheet_('Tréninky'), [w], () => false);
    const sets = {};
    (req.sets || []).forEach((s, i) => {
      if (!s.id) throw fail_('bad_request', 'Série ' + (i + 1) + ' nemá ID');
      sets[s.id] = Object.assign({}, s, { workout: w.id });
    });
    const res = upsertRows_(sheet_('Série'), Object.keys(sets).map((k) => sets[k]),
      (rowId, rowWorkout) => rowWorkout === w.id && !sets[rowId]);
    return { workoutId: w.id, sets: Object.keys(sets).length, updated: res.updated, added: res.added, removed: res.removed };
  } finally {
    lock.releaseLock();
  }
}

// Zapíše objekty podle ID. shouldRemove(id, workout) určí řádky ke smazání.
function upsertRows_(sh, objs, shouldRemove) {
  const h = headerIndex_(sh);
  const last = sh.getLastRow();
  const ids = last > 1 ? sh.getRange(2, h['ID'] + 1, last - 1, 1).getValues().map((r) => String(r[0])) : [];
  const workouts = last > 1 && h['Trénink'] !== undefined
    ? sh.getRange(2, h['Trénink'] + 1, last - 1, 1).getValues().map((r) => String(r[0])) : [];
  const rowOf = {};
  ids.forEach((id, i) => { if (id) rowOf[id] = i + 2; });

  const width = writeWidth_(sh);
  const textCols = ['ČAS', 'ČAS P'].map((n) => h[n]).filter((i) => i !== undefined && i < width);
  let updated = 0;
  const fresh = [];
  const makeRow = rowMaker_(sh);
  // Existující řádky: přečíst jedním čtením, zapsat jen změněné a souvislé řádky najednou.
  // (Po každé potvrzené sérii přijde celý trénink, většina řádků se nezměnila.)
  const existing = [];
  objs.forEach((o) => {
    const row = makeRow(o);
    if (rowOf[o.id]) existing.push({ at: rowOf[o.id], row: row });
    else fresh.push(row);
  });
  if (existing.length) {
    existing.sort((a, b) => a.at - b.at);
    const lo = existing[0].at;
    const hi = existing[existing.length - 1].at;
    const now = sh.getRange(lo, 1, hi - lo + 1, width).getValues();
    const changed = existing.filter((x) => !x.row.every((v, c) => sameCell_(now[x.at - lo][c], v)));
    let run = [];
    const flush = () => {
      if (!run.length) return;
      sh.getRange(run[0].at, 1, run.length, width).setValues(run.map((x) => x.row));
      run = [];
    };
    changed.forEach((x) => {
      if (run.length && x.at !== run[run.length - 1].at + 1) flush();
      run.push(x);
    });
    flush();
    updated = changed.length;
  }
  if (fresh.length) {
    ensureRows_(sh, fresh.length);
    const start = lastRow_(sh) + 1;
    textCols.forEach((c) => sh.getRange(start, c + 1, fresh.length, 1).setNumberFormat('@'));
    sh.getRange(start, 1, fresh.length, width).setValues(fresh);
  }

  const remove = [];
  ids.forEach((id, i) => { if (shouldRemove(id, workouts[i])) remove.push(i + 2); });
  remove.reverse().forEach((r) => sh.deleteRow(r));
  return { updated: updated, added: fresh.length, removed: remove.length };
}

// Hromadný import historie (tools/import-hevy.mjs). Tréninky, jejichž ID už v tabulce je,
// přeskočí i s jejich sériemi, takže import jde pustit znovu. Chybějící cviky přidá do listu Cviky.
// req: { workouts: [{ workout, sets }], exercises: [{ name, mode, bwFactor }] }
function importWorkouts_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cv = sheet_('Cviky');
    const cvH = headerIndex_(cv);
    const known = {};
    if (cv.getLastRow() > 1) {
      cv.getRange(2, cvH['Název'] + 1, cv.getLastRow() - 1, 1).getValues().forEach((r) => { known[r[0]] = true; });
    }
    const newEx = (req.exercises || []).filter((e) => e.name && !known[e.name]);
    const cvRow = rowMaker_(cv);
    appendRows_(cv, newEx.map((e) => cvRow(e)));

    const tr = sheet_('Tréninky');
    const trH = headerIndex_(tr);
    const existing = {};
    if (tr.getLastRow() > 1) {
      tr.getRange(2, trH['ID'] + 1, tr.getLastRow() - 1, 1).getValues().forEach((r) => { existing[String(r[0])] = true; });
    }
    const fresh = (req.workouts || []).filter((x) => x.workout && x.workout.id && !existing[x.workout.id]);
    const trRow = rowMaker_(tr);
    appendRows_(tr, fresh.map((x) => trRow(x.workout)));

    const se = sheet_('Série');
    const seRow = rowMaker_(se);
    const setRows = [];
    fresh.forEach((x) => (x.sets || []).forEach((s) => setRows.push(seRow(Object.assign({}, s, { workout: x.workout.id })))));
    appendRows_(se, setRows, ['ČAS', 'ČAS P']);

    return {
      workoutsAdded: fresh.length,
      workoutsSkipped: (req.workouts || []).length - fresh.length,
      setsAdded: setRows.length,
      exercisesAdded: newEx.length,
    };
  } finally {
    lock.releaseLock();
  }
}

function appendRows_(sh, rows, textHeaders) {
  if (!rows.length) return;
  ensureRows_(sh, rows.length);
  const start = lastRow_(sh) + 1;
  const h = headerIndex_(sh);
  (textHeaders || []).forEach((name) => {
    if (h[name] !== undefined) sh.getRange(start, h[name] + 1, rows.length, 1).setNumberFormat('@');
  });
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function deleteWorkout_(req) {
  if (!req.id) throw fail_('bad_request', 'Chybí ID tréninku');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sets = upsertRows_(sheet_('Série'), [], (id, workout) => workout === req.id);
    const tr = upsertRows_(sheet_('Tréninky'), [], (id) => id === req.id);
    return { removedSets: sets.removed, removedWorkouts: tr.removed };
  } finally {
    lock.releaseLock();
  }
}

// ---------- cviky ----------

// Nový cvik z appky do listu Cviky. Když cvik se stejným názvem už existuje (bez ohledu na
// velikost písmen a mezery navíc), nic nepřepíše a vrátí ten stávající.
// req: { exercise: { name, mode, dumbbells, bwFactor } }
function saveExercise_(req) {
  const e = req.exercise || {};
  const name = String(e.name || '').replace(/\s+/g, ' ').trim();
  if (!name) throw fail_('bad_request', 'Chybí název cviku');
  if (name.length > 200) throw fail_('bad_request', 'Název cviku je delší než 200 znaků');
  const mode = e.mode ? String(e.mode) : MODES[0];
  if (MODES.indexOf(mode) < 0) throw fail_('bad_request', 'Neznámý Zápis: ' + mode);
  const dumbbells = e.dumbbells === undefined || e.dumbbells === null || e.dumbbells === '' ? '' : Number(e.dumbbells);
  if (dumbbells !== '' && dumbbells !== 1 && dumbbells !== 2) throw fail_('bad_request', 'Jednoručky jsou 1, 2 nebo prázdné');
  const bw = e.bwFactor === undefined || e.bwFactor === null || e.bwFactor === '' ? '' : Number(e.bwFactor);
  if (bw !== '' && !(bw >= 0 && bw <= 1)) throw fail_('bad_request', 'Podíl tělesné váhy je číslo 0 až 1');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const key = (x) => String(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const found = readSheet_('Cviky').filter((x) => key(x.name) === key(name))[0];
    if (found) return { exercise: found, added: false };
    const sh = sheet_('Cviky');
    const obj = { name: name, mode: mode, dumbbells: dumbbells, bwFactor: bw };
    appendRows_(sh, [rowMaker_(sh)(obj)]);
    const clean = { name: name, mode: mode };
    if (dumbbells !== '') clean.dumbbells = dumbbells;
    if (bw !== '') clean.bwFactor = bw;
    return { exercise: clean, added: true };
  } finally {
    lock.releaseLock();
  }
}
