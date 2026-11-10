// Přehledové listy jen ze vzorců (etapa 4): Poslední trénink, Tento týden, Maxima, Objem po týdnech.
// Každý list má jediný vzorec v buňce A1, který vypíše celou tabulku i se záhlavím.
//
// Vzorce jsou tu v anglické syntaxi (čárky). Pro českou tabulku se převedou na středníky
// funkcí toSemicolons_ (čárky uvnitř textu v uvozovkách zůstanou). Nepoužívají se
// složené závorky ani desetinná čísla, ty se v české syntaxi zapisují jinak.
// Jména parametrů LAMBDA nesmí vypadat jako buňka nebo sloupec (c, r, wk1...).

// Co má být v A1, když vzorec funguje
const OVERVIEW_A1 = {
  'Poslední trénink': 'Datum',
  'Tento týden': 'Od',
  'Maxima': 'Cvik',
  'Objem po týdnech': 'Týden od',
};

// Formáty sloupců (A1 zápis bez řádku, platí od řádku 2)
const OVERVIEW_FORMATS = {
  'Maxima': { E: 'd. M. yyyy' },
  'Objem po týdnech': { A: 'd. M. yyyy', E: '#,##0' },
};

// ref(list, záhlaví) vrátí odkaz na sloupec od 2. řádku, např. 'Série'!C2:C
function overviewFormulas_(ref) {
  const S = (h) => ref('Série', h);
  const T = (h) => ref('Tréninky', h);
  const CV = (h) => ref('Cviky', h);
  const TIME_MODE = (m) => 'OR(' + m + ' = "čas", ' + m + ' = "čas na stranu", ' + m + ' = "vzdálenost a čas")';
  const NOT_TIME = (m) => '(' + m + ' <> "čas") * (' + m + ' <> "čas na stranu") * (' + m + ' <> "vzdálenost a čas")';
  const DAY = (wid) => 'XLOOKUP(' + wid + ', ' + T('ID') + ', ' + T('Datum') + ', "")';
  const NUM = (x) => 'IF(ISNUMBER(' + x + '), ' + x + ', 0)';
  // Násobek jednoruček: 2 u cviků s Jednoručky = 2 (v KG je váha jedné), jinak 1
  const JJ = (ex) => 'IF(XLOOKUP(' + ex + ', ' + CV('Název') + ', ' + CV('Jednoručky') + ', "") & "" = "2", 2, 1)';

  const f = {};

  // Série posledního tréninku (podle začátku, bez něj podle data). Nahoře datum, rutina a poznámka.
  // KG tak, jak je zapsané; ČAS P a Jednoručky jsou na konci, ať se starší sloupce neposunou.
  f['Poslední trénink'] = '=ARRAYFORMULA(LET(' +
    'tid, ' + T('ID') + ', tdate, ' + T('Datum') + ', tstart, ' + T('Začátek') + ', ' +
    'key, IF(tid = "", -1, IF(ISNUMBER(tstart), tstart, IF(ISNUMBER(tdate), tdate, 0))), ' +
    'last, XLOOKUP(MAX(key), key, tid), ' +
    'wid, ' + S('Trénink') + ', mine, wid = last, ' +
    'picked, FILTER(HSTACK(' + ['Cvik', 'Pořadí', 'Superset', 'Typ', 'KG', 'OPAK.', 'ČAS', 'KM', 'V záloze', 'Poznámka ke cviku', 'ČAS P'].map(S).join(', ') +
    ', XLOOKUP(' + S('Cvik') + ', ' + CV('Název') + ', ' + CV('Jednoručky') + ', "") & "", ROW(wid)), mine), ' +
    'sorted, CHOOSECOLS(SORT(picked, 2, TRUE, 13, TRUE), SEQUENCE(1, 12)), ' +
    'vol, SUM(' + NUM(S('Objem')) + ' * mine), ' +
    'working, SUM(mine * (' + S('Typ') + ' <> "rozcvička")), ' +
    'day, XLOOKUP(last, tid, tdate, ""), ' +
    'tbeg, XLOOKUP(last, tid, tstart, ""), ' +
    'tfin, XLOOKUP(last, tid, ' + T('Konec') + ', ""), ' +
    'IFNA(VSTACK(' +
    'HSTACK("Datum", TEXT(day, "d. M. yyyy")), ' +
    'HSTACK("Rutina", XLOOKUP(last, tid, ' + T('Rutina') + ', "") & ""), ' +
    'HSTACK("Začátek", IF(ISNUMBER(tbeg), TEXT(tbeg, "H:mm"), ""), "Konec", IF(ISNUMBER(tfin), TEXT(tfin, "H:mm"), "")), ' +
    'HSTACK("Objem kg", ROUND(vol), "Sérií", SUM(--mine), "Pracovních", working), ' +
    'HSTACK("Poznámka", XLOOKUP(last, tid, ' + T('Poznámka') + ', "") & ""), ' +
    '"", ' +
    'HSTACK("Cvik", "Pořadí", "Superset", "Typ", "KG", "OPAK.", "ČAS", "KM", "V záloze", "Poznámka ke cviku", "ČAS P", "Jednoručky"), ' +
    'sorted), "")))';

  // Souhrn po cvicích za posledních 7 dní (dnes a 6 dní zpět), nahoře součet.
  // Nejtěžší série jako součet KG × J (dvě jednoručky po 20 = 40 kg).
  f['Tento týden'] = '=ARRAYFORMULA(LET(' +
    'wid, ' + S('Trénink') + ', day, ' + DAY('wid') + ', ' +
    'recent, (wid <> "") * ISNUMBER(day) * (day >= TODAY() - 6) * (day <= TODAY()), ' +
    'from, TODAY() - 6, ' +
    'head, HSTACK("Od", TEXT(from, "d. M. yyyy"), "Do", TEXT(TODAY(), "d. M. yyyy")), ' +
    'IF(SUM(recent) = 0, IFNA(VSTACK(head, "Za posledních 7 dní žádný trénink"), ""), LET(' +
    'w, FILTER(wid, recent), e, FILTER(' + S('Cvik') + ', recent), t, FILTER(' + S('Typ') + ', recent), ' +
    'kg, FILTER(' + NUM(S('KG')) + ' * ' + JJ(S('Cvik')) + ', recent), reps, FILTER(' + S('OPAK.') + ', recent), ' +
    'tm, FILTER(' + S('ČAS') + ' & "", recent), km, FILTER(' + S('KM') + ', recent), ' +
    'vol, FILTER(' + NUM(S('Objem')) + ', recent), ' +
    'exs, UNIQUE(e), ' +
    'best, MAP(exs, LAMBDA(x, LET(' +
    'm, XLOOKUP(x, ' + CV('Název') + ', ' + CV('Zápis') + ', "váha × opakování"), ' +
    'IF(' + TIME_MODE('m') + ', ' +
    'IFERROR(TEXTJOIN(", ", TRUE, FILTER(IF(ISNUMBER(km), km & " km ", "") & tm, e = x, t <> "rozcvička")), ""), ' +
    'IFERROR(LET(b, SORT(FILTER(HSTACK(kg, reps), e = x, t <> "rozcvička", ISNUMBER(reps)), 1, FALSE, 2, FALSE), ' +
    'bk, INDEX(b, 1, 1), br, INDEX(b, 1, 2), ' +
    'IF(m = "vlastní váha", IF(bk > 0, "+" & bk & " kg × " & br, br & " opak."), bk & " kg × " & br)), ""))))), ' +
    'IFNA(VSTACK(head, ' +
    'HSTACK("Tréninků", COUNTUNIQUE(w), "Sérií", ROWS(w), "Objem kg", ROUND(SUM(vol))), ' +
    '"", ' +
    'HSTACK("Cvik", "Tréninků", "Sérií", "Nejtěžší série", "Celkem zvednuto"), ' +
    'HSTACK(exs, ' +
    'MAP(exs, LAMBDA(x, COUNTUNIQUE(FILTER(w, e = x)))), ' +
    'MAP(exs, LAMBDA(x, SUM(--(e = x)))), ' +
    'best, ' +
    'MAP(exs, LAMBDA(x, ROUND(SUM((e = x) * vol)))))), "")))))';

  // Maximum každého cviku: největší KG × J (součet obou jednoruček), při shodě víc opakování, datum posledního
  // dosažení (jako detail cviku v appce).
  // Jen pracovní série (bez rozcviček) s vyplněnými opakováními, bez cviků na čas.
  // U vlastní váhy je KG přidaná zátěž, cviky bez váhy tak mají maximum v opakováních.
  f['Maxima'] = '=ARRAYFORMULA(LET(' +
    'ex, ' + S('Cvik') + ', reps, ' + S('OPAK.') + ', ' +
    'mode, XLOOKUP(ex, ' + CV('Název') + ', ' + CV('Zápis') + ', "váha × opakování"), ' +
    'ok, (ex <> "") * (' + S('Typ') + ' <> "rozcvička") * ISNUMBER(reps) * (' + NUM('reps') + ' > 0) * ' + NOT_TIME('mode') + ', ' +
    'data, FILTER(HSTACK(ex, XLOOKUP(ex, ' + CV('Název') + ', ' + CV('Česky') + ', "") & "", ' + NUM(S('KG')) + ' * ' + JJ('ex') + ', reps, ' +
    DAY(S('Trénink')) + ', mode), ok = 1), ' +
    'sorted, SORT(data, 1, TRUE, 3, FALSE, 4, FALSE, 5, FALSE), ' +
    'VSTACK(HSTACK("Cvik", "Česky", "KG", "OPAK.", "Datum", "Zápis"), SORTN(sorted, ROWS(sorted), 2, 1, TRUE))))';

  // Týdny od pondělí, nejnovější nahoře. Objem a Sérií včetně rozcviček, jako v appce.
  f['Objem po týdnech'] = '=ARRAYFORMULA(LET(' +
    'keep, ' + S('Trénink') + ' <> "", ' +
    'w, FILTER(' + S('Trénink') + ', keep), t, FILTER(' + S('Typ') + ', keep), ' +
    'vol, FILTER(' + NUM(S('Objem')) + ', keep), ' +
    'day, ' + DAY('w') + ', ' +
    'wkday, IF(ISNUMBER(day), day - WEEKDAY(day, 2) + 1, ""), ' +
    'weeks, SORT(UNIQUE(FILTER(wkday, wkday <> "")), 1, FALSE), ' +
    'VSTACK(HSTACK("Týden od", "Tréninků", "Sérií", "Pracovních sérií", "Objem kg"), ' +
    'HSTACK(weeks, ' +
    'MAP(weeks, LAMBDA(x, COUNTUNIQUE(FILTER(w, wkday = x)))), ' +
    'MAP(weeks, LAMBDA(x, SUM(--(wkday = x)))), ' +
    'MAP(weeks, LAMBDA(x, SUM((wkday = x) * (t <> "rozcvička")))), ' +
    'MAP(weeks, LAMBDA(x, ROUND(SUM((wkday = x) * vol))))))))';

  return f;
}

// Čárky mimo text v uvozovkách na středníky (česká syntaxe vzorců)
function toSemicolons_(formula) {
  let out = '';
  let quoted = false;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '"') quoted = !quoted;
    out += !quoted && ch === ',' ? ';' : ch;
  }
  return out;
}

// Odkaz na sloupec podle záhlaví v tabulce
function sheetRef_(ss) {
  const cache = {};
  return (sheet, header) => {
    if (!cache[sheet]) cache[sheet] = headerIndex_(ss.getSheetByName(sheet));
    const i = cache[sheet][header];
    if (i === undefined) throw new Error('V listu ' + sheet + ' chybí sloupec ' + header);
    const letter = columnLetter_(i + 1);
    return "'" + sheet + "'!" + letter + '2:' + letter;
  };
}

// Zapíše vzorec do A1, když chybí, nedává očekávané záhlaví nebo je jiný než aktuální verze. Nic jiného v listu nepřepíše,
// jen při novém zápisu list vyčistí (jsou v něm jen výsledky vzorce).
function ensureOverviews_(ss, log) {
  const formulas = overviewFormulas_(sheetRef_(ss));
  Object.keys(formulas).forEach((name) => {
    const sh = ss.getSheetByName(name);
    const cell = sh.getRange('A1');
    if (cell.getDisplayValue() === OVERVIEW_A1[name] && sameFormula_(cell.getFormula(), formulas[name])) return;
    sh.clear();
    cell.setFormula(formulas[name]);
    SpreadsheetApp.flush();
    if (cell.getDisplayValue() !== OVERVIEW_A1[name]) {
      cell.setFormula(toSemicolons_(formulas[name]));
      SpreadsheetApp.flush();
    }
    if (name === 'Maxima' || name === 'Objem po týdnech') {
      sh.setFrozenRows(1);
      sh.getRange('1:1').setFontWeight('bold');
    }
    const fmt = OVERVIEW_FORMATS[name] || {};
    Object.keys(fmt).forEach((col) => sh.getRange(col + '2:' + col).setNumberFormat(fmt[col]));
    log.push('přehled ' + name + ': ' + cell.getDisplayValue());
  });
}
