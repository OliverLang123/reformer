// Vypíše vzorce přehledových listů a vzorec Objem v české syntaxi (středníky), jak je zapíše setup.
// Sloupce bere z pořadí v apps-script/Schema.js, tedy jako v čerstvě založené tabulce.
//   node tools/overview-formulas.mjs > formulas.json

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../apps-script/', import.meta.url);
const ctx = vm.createContext({});
['Schema.js', 'Setup.js', 'Overview.js'].forEach((f) => vm.runInContext(readFileSync(new URL(f, dir), 'utf8'), ctx));
const out = vm.runInContext(`(() => {
  const idx = (sheet) => {
    const o = {};
    SCHEMA[sheet].forEach((c, i) => { o[c[0]] = i; });
    return o;
  };
  const ref = (sheet, header) => {
    const i = idx(sheet)[header];
    if (i === undefined) throw new Error(sheet + ': ' + header);
    const l = columnLetter_(i + 1);
    return "'" + sheet + "'!" + l + '2:' + l;
  };
  const f = overviewFormulas_(ref);
  f['Série!Objem'] = volumeFormulaFor_(idx);
  Object.keys(f).forEach((k) => { f[k] = toSemicolons_(f[k]); });
  return JSON.stringify(f, null, 1);
})()`, ctx);
console.log(out);
