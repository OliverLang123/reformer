// Založení a údržba tabulky. Spouští se ručně z editoru Apps Script (funkce setup).
// Dá se pustit opakovaně. V datových listech (Cviky, Rutiny, Tréninky, Série, Tělo) nic nepřepíše,
// jen doplní chybějící sloupce a cviky. Přehledové listy a vzorec Objem přepíše, když se jejich
// vzorec liší od aktuální verze (přehledový list se přitom celý vyčistí, jsou v něm jen výsledky).

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('cs_CZ');

  const log = [];
  Object.keys(SCHEMA).concat(FORMULA_SHEETS).forEach((name, i) => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name, i);
      log.push('založen list ' + name);
    }
    if (SCHEMA[name]) ensureHeaders_(sh, SCHEMA[name].map((c) => c[0]), log);
  });

  formatSheets_(ss);
  ensureVolumeFormula_(ss.getSheetByName('Série'), log);
  ensureOverviews_(ss, log);

  const added = seedExercises_(ss.getSheetByName('Cviky'));
  if (added) log.push('přidáno cviků: ' + added);
  protectSheets_(ss, log);

  ['List 1', 'Sheet1', 'List1'].forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
      log.push('smazán prázdný list ' + name);
    }
  });

  if (!PropertiesService.getScriptProperties().getProperty('API_KEY')) {
    log.push('POZOR: chybí API_KEY ve Vlastnostech skriptu (Script Properties)');
  }
  const msg = log.length ? log.join('\n') : 'vše už bylo nastavené';
  Logger.log(msg);
  return msg;
}

function ensureHeaders_(sh, headers, log) {
  const lastCol = sh.getLastColumn();
  const current = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  if (current.every((h) => h === '')) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    log.push('záhlaví ' + sh.getName());
  } else {
    const missing = headers.filter((h) => current.indexOf(h) < 0);
    // Objem (vzorec) musí zůstat poslední, nové sloupce se vloží před něj
    const vol = current.indexOf('Objem');
    const data = missing.filter((h) => h !== 'Objem');
    if (data.length && vol >= 0) {
      sh.insertColumnsBefore(vol + 1, data.length);
      sh.getRange(1, vol + 1, 1, data.length).setValues([data]);
      log.push('doplněné sloupce ' + sh.getName() + ': ' + data.join(', '));
    } else if (missing.length) {
      sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
      log.push('doplněné sloupce ' + sh.getName() + ': ' + missing.join(', '));
    }
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
}

function colRange_(sh, header) {
  const idx = headerIndex_(sh)[header];
  if (idx === undefined) throw new Error('V listu ' + sh.getName() + ' chybí sloupec ' + header);
  return sh.getRange(2, idx + 1, sh.getMaxRows() - 1, 1);
}

function formatSheets_(ss) {
  const tr = ss.getSheetByName('Tréninky');
  colRange_(tr, 'Datum').setNumberFormat('d. M. yyyy');
  colRange_(tr, 'Začátek').setNumberFormat('H:mm');
  colRange_(tr, 'Konec').setNumberFormat('H:mm');

  const se = ss.getSheetByName('Série');
  colRange_(se, 'ČAS').setNumberFormat('@');
  colRange_(se, 'ČAS P').setNumberFormat('@');
  colRange_(se, 'Potvrzeno').setNumberFormat('H:mm:ss');
  colRange_(se, 'Poznámka ke cviku').setNumberFormat('@');
  colRange_(tr, 'Poznámka').setNumberFormat('@');
  colRange_(se, 'Typ').setDataValidation(listRule_(SET_TYPES));

  // V Rutinách se píšou rozsahy (8-10) a časy (2:00), tabulka by z nich jinak udělala datum nebo hodiny.
  const ru = ss.getSheetByName('Rutiny');
  ['KG', 'OPAK.', 'ČAS', 'KM', 'Odpočinek', 'Poznámka', 'Poznámka k rutině'].forEach((h) => colRange_(ru, h).setNumberFormat('@'));
  colRange_(ru, 'Typ').setDataValidation(listRule_(SET_TYPES));

  const cv = ss.getSheetByName('Cviky');
  colRange_(cv, 'Zápis').setDataValidation(listRule_(MODES));
  colRange_(cv, 'Provedení').setWrap(true);

  colRange_(ss.getSheetByName('Tělo'), 'Datum').setNumberFormat('d. M. yyyy');
}

// Ochrana proti přepsání omylem: jen varování, nic neblokuje (skript, konektor i ruční úprava
// projdou). Přehledové listy celé, u datových listů řádek záhlaví.
function protectSheets_(ss, log) {
  const mark = 'Reformer: ';
  let count = 0;
  FORMULA_SHEETS.forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
    sh.protect().setDescription(mark + 'list jen ze vzorce').setWarningOnly(true);
    count++;
  });
  Object.keys(SCHEMA).forEach((name) => {
    const sh = ss.getSheetByName(name);
    const has = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).some((p) => String(p.getDescription()).indexOf(mark) === 0);
    if (has) return;
    sh.getRange('1:1').protect().setDescription(mark + 'záhlaví').setWarningOnly(true);
    count++;
  });
  if (count) log.push('ochrana s varováním: ' + count);
}

function listRule_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build();
}

// Objem jedné série: KG × J × OPAK., u cviků na stranu × 2, u vlastní váhy
// (tělesná váha × podíl + KG × J) × OPAK. J = 2 u cviků s Jednoručky = 2 (v KG je váha
// jedné jednoručky), jinak 1. Tělesná váha je poslední měření z listu Tělo do data
// tréninku, před prvním měřením platí první měření. Stejná pravidla má setVolume v js/model.js.
// KG a podíl se berou přes VALUE, takže číslo zapsané jako text ("32,5") se počítá stejně jako v appce.
function volumeFormula_(ss) {
  return volumeFormulaFor_((sheet) => headerIndex_(ss.getSheetByName(sheet)));
}

// headers(list) vrátí { záhlaví: index sloupce od 0 }
function volumeFormulaFor_(headers) {
  const cache = {};
  const letterOf = (sheet, header) => {
    if (!cache[sheet]) cache[sheet] = headers(sheet);
    const i = cache[sheet][header];
    if (i === undefined) throw new Error('V listu ' + sheet + ' chybí sloupec ' + header);
    return columnLetter_(i + 1);
  };
  // Odkaz na celý sloupec podle záhlaví, např. 'Tělo'!$B$2:$B
  const col = (sheet, header) => {
    const letter = letterOf(sheet, header);
    return "'" + sheet + "'!$" + letter + '$2:$' + letter;
  };
  const cvName = col('Cviky', 'Název');
  const bodyDate = col('Tělo', 'Datum');
  const bodyKg = col('Tělo', 'Váha');
  // Počítá jen po poslední řádek s ID, jinak by prázdné výsledky zabraly celý list
  // a nové série by se přidávaly až za ně. Jména parametrů LAMBDA nesmí být R ani C.
  const se = (h) => {
    const letter = letterOf('Série', h);
    // INDEX(...; 2):INDEX(...; last) místo B2:..., aby vzorec přežil smazání řádku 2
    const whole = "'Série'!" + letter + ':' + letter;
    return 'INDEX(' + whole + ', 2):INDEX(' + whole + ', last)';
  };
  const idCol = letterOf('Série', 'ID');
  return '={"Objem"; LET(last, MAX(2, IFNA(XMATCH("?*", \'Série\'!' + idCol + ':' + idCol + ', 2, -1), 2)), MAP(' +
    ['Trénink', 'Cvik', 'KG', 'OPAK.'].map(se).join(', ') +
    ', LAMBDA(wid, ex, kg, reps, IF(OR(wid = "", ex = "", reps = ""), "", LET(' +
    'mode, XLOOKUP(ex, ' + cvName + ', ' + col('Cviky', 'Zápis') + ', "váha × opakování"), ' +
    'share, IFERROR(VALUE(XLOOKUP(ex, ' + cvName + ', ' + col('Cviky', 'Podíl tělesné váhy') + ', 0)), 0), ' +
    'kgn, IFERROR(VALUE(kg), 0), ' +
    'jj, IF(XLOOKUP(ex, ' + cvName + ', ' + col('Cviky', 'Jednoručky') + ', "") & "" = "2", 2, 1), ' +
    'day, XLOOKUP(wid, ' + col('Tréninky', 'ID') + ', ' + col('Tréninky', 'Datum') + ', 0), ' +
    'body, IF(share = 0, 0, XLOOKUP(day, ' + bodyDate + ', ' + bodyKg + ', ' +
    'XLOOKUP(MIN(' + bodyDate + '), ' + bodyDate + ', ' + bodyKg + ', 0), -1)), ' +
    'IFS(mode = "na stranu", kgn * jj * reps * 2, ' +
    'mode = "vlastní váha", (body * share + kgn * jj) * reps, ' +
    'OR(mode = "čas", mode = "čas na stranu", mode = "vzdálenost a čas"), 0, ' +
    'TRUE, kgn * jj * reps))))))}';
}

// Stejný vzorec bez ohledu na mezery a oddělovač (čárka / středník)
function sameFormula_(a, b) {
  const norm = (f) => String(f || '').replace(/;/g, ',').replace(/\s+/g, '').toUpperCase();
  return norm(a) === norm(b);
}

// Vzorec se zapíše, když chybí, hlásí chybu nebo je jiný než aktuální verze (třeba bez
// násobku Jednoručky). Česká tabulka může chtít středníky místo čárek, proto se při
// chybě zkusí ještě varianta se středníky.
function ensureVolumeFormula_(sh, log) {
  const idx = headerIndex_(sh)['Objem'];
  const cell = sh.getRange(1, idx + 1);
  const formula = volumeFormula_(sh.getParent());
  if (cell.getDisplayValue() === 'Objem' && sameFormula_(cell.getFormula(), formula)) return;
  cell.setFormula(formula);
  SpreadsheetApp.flush();
  if (cell.getDisplayValue() !== 'Objem') {
    cell.setFormula(formula.replace(/,/g, ';'));
    SpreadsheetApp.flush();
  }
  log.push('vzorec Objem v listu Série: ' + cell.getDisplayValue());
}

function seedExercises_(sh) {
  const h = headerIndex_(sh);
  const existing = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, h['Název'] + 1, sh.getLastRow() - 1, 1).getValues().forEach((r) => { existing[r[0]] = true; });
  }
  const makeRow = rowMaker_(sh);
  const rows = SEED_EXERCISES.filter((e) => !existing[e.name]).map((e) => makeRow(e));
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Ověření bez appky: uloží zkušební trénink, zkontroluje objem a zase ho smaže.
function selfTest() {
  const id = 'TEST-selftest';
  const now = new Date();
  const res = saveWorkout_({
    workout: { id: id, date: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'), start: now.toISOString(), end: now.toISOString(), routine: 'Test', note: 'zkušební trénink, smaže se' },
    sets: [
      { id: id + '-1', exercise: 'Squat (Barbell)', order: 1, type: 'normální', kg: 100, reps: 10, confirmedAt: now.toISOString(), exerciseNote: '=1+1' },
      { id: id + '-2', exercise: 'Bulgarian Split Squat (Dumbbell)', order: 2, type: 'normální', kg: 20, reps: 10, confirmedAt: now.toISOString() },
      { id: id + '-3', exercise: 'Pull Up', order: 3, type: 'normální', reps: 10, confirmedAt: now.toISOString() },
      { id: id + '-4', exercise: 'Rowing Machine', order: 4, type: 'normální', km: 2, time: '9:12', confirmedAt: now.toISOString() },
    ],
  });
  SpreadsheetApp.flush();
  const first = readSheet_('Série').filter((s) => s.workout === id);
  const noteBack = first.length ? first[0].exerciseNote : undefined;
  // Stejné série znovu, dřep s jinou váhou: řádky se mají přepsat, ne přidat.
  const res2 = saveWorkout_({
    workout: { id: id, date: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'), start: now.toISOString(), routine: 'Test' },
    sets: [
      { id: id + '-1', exercise: 'Squat (Barbell)', order: 1, type: 'normální', kg: 105, reps: 10 },
      { id: id + '-2', exercise: 'Bulgarian Split Squat (Dumbbell)', order: 2, type: 'normální', kg: 20, reps: 10 },
      { id: id + '-3', exercise: 'Pull Up', order: 3, type: 'normální', reps: 10 },
      { id: id + '-4', exercise: 'Rowing Machine', order: 4, type: 'normální', km: 2, time: '9:12' },
    ],
  });
  // Bez vesla a se zdvojenou sérií: veslo se má smazat, duplicita se nesmí zapsat.
  const res3 = saveWorkout_({
    workout: { id: id, date: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'), start: now.toISOString(), routine: 'Test' },
    sets: [
      { id: id + '-1', exercise: 'Squat (Barbell)', order: 1, type: 'normální', kg: 105, reps: 10 },
      { id: id + '-1', exercise: 'Squat (Barbell)', order: 1, type: 'normální', kg: 105, reps: 10 },
      { id: id + '-2', exercise: 'Bulgarian Split Squat (Dumbbell)', order: 2, type: 'normální', kg: 20, reps: 10 },
      { id: id + '-3', exercise: 'Pull Up', order: 3, type: 'normální', reps: 10 },
    ],
  });
  SpreadsheetApp.flush();
  const data = readSheet_('Série').filter((s) => s.workout === id);
  const vol = (rows) => rows.map((s) => s.exercise + ' ' + (s.volume === undefined ? 'prázdné' : s.volume) + (s.time ? ' čas ' + s.time : '')).join(', ');
  const check = (cond) => (cond ? 'OK' : 'CHYBA');
  const out = [
    check(res.added === 4) + ' první uložení: ' + JSON.stringify(res),
    check(noteBack === '=1+1') + ' poznámka „=1+1“ zůstala textem: ' + noteBack,
    check(res2.updated === 1 && res2.added === 0 && res2.removed === 0) + ' přepsání (zapíše se jen změněný řádek): ' + JSON.stringify(res2),
    check(res3.updated === 0 && res3.added === 0 && res3.removed === 1) + ' bez vesla a s duplicitou: ' + JSON.stringify(res3),
    check(data.length === 3) + ' řádků v Sérii: ' + data.length + ' (mají být 3)',
    'objemy po prvním uložení: ' + vol(first) + ' (čekám 1000, 800 = 20 × 2 jednoručky × 10 × 2 strany, tělesná váha × 10, prázdné a čas 9:12)',
    'objemy na konci: ' + vol(data) + ' (čekám 1050, 800, tělesná váha × 10)',
  ];
  deleteWorkout_({ id: id });
  out.push('zkušební trénink smazán, v Sérii zbylo řádků: ' + readSheet_('Série').filter((s) => s.workout === id).length);
  Logger.log(out.join('\n'));
  return out.join('\n');
}
