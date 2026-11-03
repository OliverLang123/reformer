// Založení a údržba tabulky. Spouští se ručně z editoru Apps Script (funkce setup).
// Dá se pustit opakovaně: nic nepřepíše, jen doplní, co chybí.

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
  FORMULA_SHEETS.forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (sh.getLastRow() === 0) sh.getRange('A1').setValue('Přehled ze vzorců, doplní se v etapě 4.');
  });

  const added = seedExercises_(ss.getSheetByName('Cviky'));
  if (added) log.push('přidáno cviků: ' + added);

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
    if (missing.length) {
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
  colRange_(se, 'Potvrzeno').setNumberFormat('H:mm:ss');
  colRange_(se, 'Typ').setDataValidation(listRule_(SET_TYPES));

  // V Rutinách se píšou rozsahy (8-10) a časy (2:00), tabulka by z nich jinak udělala datum nebo hodiny.
  const ru = ss.getSheetByName('Rutiny');
  ['KG', 'OPAK.', 'ČAS', 'KM', 'Odpočinek'].forEach((h) => colRange_(ru, h).setNumberFormat('@'));
  colRange_(ru, 'Typ').setDataValidation(listRule_(SET_TYPES));

  const cv = ss.getSheetByName('Cviky');
  colRange_(cv, 'Zápis').setDataValidation(listRule_(MODES));
  colRange_(cv, 'Provedení').setWrap(true);

  colRange_(ss.getSheetByName('Tělo'), 'Datum').setNumberFormat('d. M. yyyy');
}

function listRule_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build();
}

// Objem jedné série: KG × OPAK., u cviků na stranu × 2, u vlastní váhy
// (tělesná váha × podíl + přidaná zátěž) × OPAK. Tělesná váha je poslední měření
// z listu Tělo do data tréninku, před prvním měřením platí první měření.
function volumeFormula_(ss) {
  // Odkaz na celý sloupec podle záhlaví, např. 'Tělo'!$B$2:$B
  const col = (sheet, header) => {
    const letter = columnLetter_(headerIndex_(ss.getSheetByName(sheet))[header] + 1);
    return "'" + sheet + "'!$" + letter + '$2:$' + letter;
  };
  const cvName = col('Cviky', 'Název');
  const bodyDate = col('Tělo', 'Datum');
  const bodyKg = col('Tělo', 'Váha');
  // Počítá jen po poslední řádek s ID, jinak by prázdné výsledky zabraly celý list
  // a nové série by se přidávaly až za ně. Jména parametrů LAMBDA nesmí být R ani C.
  const se = (h) => {
    const letter = columnLetter_(headerIndex_(ss.getSheetByName('Série'))[h] + 1);
    return "'Série'!" + letter + '2:INDEX(\'Série\'!' + letter + ':' + letter + ', last)';
  };
  const idCol = columnLetter_(headerIndex_(ss.getSheetByName('Série'))['ID'] + 1);
  return '={"Objem"; LET(last, MAX(2, IFNA(XMATCH("?*", \'Série\'!' + idCol + ':' + idCol + ', 2, -1), 2)), MAP(' +
    ['Trénink', 'Cvik', 'KG', 'OPAK.'].map(se).join(', ') +
    ', LAMBDA(wid, ex, kg, reps, IF(OR(wid = "", ex = "", reps = ""), "", LET(' +
    'mode, XLOOKUP(ex, ' + cvName + ', ' + col('Cviky', 'Zápis') + ', "váha × opakování"), ' +
    'share, N(XLOOKUP(ex, ' + cvName + ', ' + col('Cviky', 'Podíl tělesné váhy') + ', 0)), ' +
    'day, XLOOKUP(wid, ' + col('Tréninky', 'ID') + ', ' + col('Tréninky', 'Datum') + ', 0), ' +
    'body, IF(share = 0, 0, XLOOKUP(day, ' + bodyDate + ', ' + bodyKg + ', ' +
    'XLOOKUP(MIN(' + bodyDate + '), ' + bodyDate + ', ' + bodyKg + ', 0), -1)), ' +
    'IFS(mode = "na stranu", N(kg) * reps * 2, ' +
    'mode = "vlastní váha", (body * share + N(kg)) * reps, ' +
    'OR(mode = "čas", mode = "čas na stranu", mode = "vzdálenost a čas"), 0, ' +
    'TRUE, N(kg) * reps))))))}';
}

// Vzorec se zapíše, když chybí nebo hlásí chybu. Česká tabulka může chtít středníky
// místo čárek, proto se při chybě zkusí ještě varianta se středníky.
function ensureVolumeFormula_(sh, log) {
  const idx = headerIndex_(sh)['Objem'];
  const cell = sh.getRange(1, idx + 1);
  if (cell.getFormula() && cell.getDisplayValue() === 'Objem') return;
  const formula = volumeFormula_(sh.getParent());
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
  const rows = SEED_EXERCISES.filter((e) => !existing[e.name]).map((e) => toRow_(sh, e));
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
      { id: id + '-1', exercise: 'Squat (Barbell)', order: 1, type: 'normální', kg: 100, reps: 10, confirmedAt: now.toISOString() },
      { id: id + '-2', exercise: 'Bulgarian Split Squat (Dumbbell)', order: 2, type: 'normální', kg: 40, reps: 10, confirmedAt: now.toISOString() },
      { id: id + '-3', exercise: 'Pull Up', order: 3, type: 'normální', reps: 10, confirmedAt: now.toISOString() },
      { id: id + '-4', exercise: 'Rowing Machine', order: 4, type: 'normální', km: 2, time: '9:12', confirmedAt: now.toISOString() },
    ],
  });
  saveWorkout_({ workout: { id: id, date: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'), start: now.toISOString(), routine: 'Test' }, sets: [] }); // opakované uložení bez sérií je smaže
  const res2 = saveWorkout_({
    workout: { id: id, date: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'), start: now.toISOString(), routine: 'Test' },
    sets: [
      { id: id + '-1', exercise: 'Squat (Barbell)', order: 1, type: 'normální', kg: 100, reps: 10 },
      { id: id + '-1', exercise: 'Squat (Barbell)', order: 1, type: 'normální', kg: 100, reps: 10 },
      { id: id + '-2', exercise: 'Bulgarian Split Squat (Dumbbell)', order: 2, type: 'normální', kg: 40, reps: 10 },
      { id: id + '-3', exercise: 'Pull Up', order: 3, type: 'normální', reps: 10 },
      { id: id + '-4', exercise: 'Rowing Machine', order: 4, type: 'normální', km: 2, time: '9:12' },
    ],
  });
  SpreadsheetApp.flush();
  const data = readSheet_('Série').filter((s) => s.workout === id);
  const ok = data.length === 4;
  const out = [
    'první uložení: ' + JSON.stringify(res),
    'druhé uložení: ' + JSON.stringify(res2),
    'řádků v Sérii: ' + data.length + (ok ? ' (správně 4, duplicita se nezapsala)' : ' (CHYBA, mají být 4)'),
    'objemy: ' + data.map((s) => s.exercise + ' ' + s.volume + (s.time ? ' čas ' + s.time : '')).join(', '),
    'čekám: dřep 1000, bulharský 800, shyby tělesná váha × 10, veslo 0 a čas 9:12',
  ];
  deleteWorkout_({ id: id });
  out.push('zkušební trénink smazán, v Sérii zbylo řádků: ' + readSheet_('Série').filter((s) => s.workout === id).length);
  Logger.log(out.join('\n'));
  return out.join('\n');
}
