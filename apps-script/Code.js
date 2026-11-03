// API pro appku Reformer. Appka posílá POST s tělem JSON (Content-Type text/plain,
// aby prohlížeč neposílal předběžný dotaz CORS): { key, action, ...parametry }.
// Klíč je ve Vlastnostech skriptu pod názvem API_KEY, v kódu ani v repozitáři není.

const API_VERSION = 1;

const ACTIONS = {
  ping: () => ({ version: API_VERSION, name: SpreadsheetApp.getActive().getName() }),
  bootstrap: () => ({
    version: API_VERSION,
    exercises: readSheet_('Cviky'),
    routines: readSheet_('Rutiny'),
    body: readSheet_('Tělo'),
    workouts: readSheet_('Tréninky'),
    sets: readSheet_('Série'),
  }),
  saveWorkout: (req) => saveWorkout_(req),
  deleteWorkout: (req) => deleteWorkout_(req),
};

function doGet() {
  return json_({ ok: true, app: 'reformer', version: API_VERSION });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkKey_(req.key);
    const action = ACTIONS[req.action];
    if (!action) throw new Error('Neznámá akce: ' + req.action);
    return json_(Object.assign({ ok: true }, action(req)));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!expected || expected.length < 16) throw new Error('Ve skriptu chybí API_KEY (aspoň 16 znaků)');
  const a = String(key || '');
  let diff = a.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (a.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error('Špatný klíč');
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

function readSheet_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const fields = fieldMap_(sh);
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const out = [];
  values.forEach((row) => {
    if (row.every((v) => v === '')) return;
    const obj = {};
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

function toCell_(key, v) {
  if (v === undefined || v === null || v === '') return '';
  if (DATE_FIELDS[key]) {
    const p = String(v).slice(0, 10).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  if (DATETIME_FIELDS[key]) return new Date(v);
  return v;
}

// Řádek pro zápis: všechny sloupce před Objemem (ten je vzorec a musí být poslední).
function toRow_(sh, obj) {
  const fields = fieldMap_(sh).filter((f) => f.key !== 'volume');
  const width = writeWidth_(sh);
  const row = new Array(width).fill('');
  fields.forEach((f) => { if (f.col < width) row[f.col] = toCell_(f.key, obj[f.key]); });
  return row;
}

function writeWidth_(sh) {
  const h = headerIndex_(sh);
  if (h['Objem'] === undefined) return sh.getLastColumn();
  const others = Object.keys(h).filter((k) => k !== 'Objem').map((k) => h[k]);
  if (others.some((i) => i > h['Objem'])) throw new Error('Sloupec Objem musí být v listu ' + sh.getName() + ' poslední');
  return h['Objem'];
}

function ensureRows_(sh, needed) {
  const free = sh.getMaxRows() - sh.getLastRow();
  if (free < needed) sh.insertRowsAfter(sh.getMaxRows(), needed - free + 100);
}

// ---------- tréninky ----------

// Uloží trénink a jeho série. Dá se volat opakovaně (po každé potvrzené sérii):
// řádky se hledají podle ID, existující se přepíšou, nové přidají a série tréninku,
// které už v appce nejsou, se smažou. Opakované odeslání tedy nic nezdvojí.
function saveWorkout_(req) {
  const w = req.workout;
  if (!w || !w.id) throw new Error('Chybí trénink nebo jeho ID');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    upsertRows_(sheet_('Tréninky'), [w], () => false);
    const sets = {};
    (req.sets || []).forEach((s, i) => {
      if (!s.id) throw new Error('Série ' + (i + 1) + ' nemá ID');
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
  const textCols = ['ČAS'].map((n) => h[n]).filter((i) => i !== undefined && i < width);
  let updated = 0;
  const fresh = [];
  objs.forEach((o) => {
    const row = toRow_(sh, o);
    if (rowOf[o.id]) {
      textCols.forEach((c) => sh.getRange(rowOf[o.id], c + 1).setNumberFormat('@'));
      sh.getRange(rowOf[o.id], 1, 1, width).setValues([row]);
      updated++;
    } else {
      fresh.push(row);
    }
  });
  if (fresh.length) {
    ensureRows_(sh, fresh.length);
    const start = sh.getLastRow() + 1;
    textCols.forEach((c) => sh.getRange(start, c + 1, fresh.length, 1).setNumberFormat('@'));
    sh.getRange(start, 1, fresh.length, width).setValues(fresh);
  }

  const remove = [];
  ids.forEach((id, i) => { if (shouldRemove(id, workouts[i])) remove.push(i + 2); });
  remove.reverse().forEach((r) => sh.deleteRow(r));
  return { updated: updated, added: fresh.length, removed: remove.length };
}

function deleteWorkout_(req) {
  if (!req.id) throw new Error('Chybí ID tréninku');
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
