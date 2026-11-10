// Jednorázová oprava hodnot KG v listu Série podle přesného seznamu (tools/fix-kg.mjs).
// Řádky hledá podle Trénink + Cvik. Před zápisem zkontroluje, že sedí počet sérií
// i současné KG (páry teď → nově podle hodnoty); když cokoli nesedí, nezapíše nic a vrátí rozdíly.
// req: { changes: [{ workout, exercise, from: [čísla], to: [čísla] }], write: true|false }
// Záloha: historie verzí Google Sheets.

function fixSetKg_(req) {
  const changes = req.changes || [];
  if (!changes.length) throw new Error('Chybí seznam změn');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_('Série');
    const h = headerIndex_(sh);
    const last = lastRow_(sh);
    const width = sh.getLastColumn();
    const values = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
    const col = (name) => {
      if (h[name] === undefined) throw new Error('V listu Série chybí sloupec ' + name);
      return h[name];
    };
    const cId = col('ID');
    const cW = col('Trénink');
    const cEx = col('Cvik');
    const cKg = col('KG');
    const cType = col('Typ');
    const cVol = h['Objem'];
    const num = (v) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.')));

    const plan = [];
    const problems = [];
    changes.forEach((c) => {
      if (!c.from || !c.to || c.from.length !== c.to.length) {
        problems.push(c.workout + ' / ' + c.exercise + ': from a to musí mít stejnou délku');
        return;
      }
      const rows = [];
      values.forEach((r, i) => {
        if (String(r[cW]) === c.workout && String(r[cEx]) === c.exercise) rows.push({ row: i + 2, r: r });
      });
      // pořadí řádků v listu; páry teď → nově se přiřazují podle hodnoty (na pořadí sérií nezáleží)
      const now = rows.map((x) => x.r[cKg]);
      if (rows.length !== c.from.length) {
        problems.push(c.workout + ' / ' + c.exercise + ': v tabulce ' + rows.length + ' sérií (KG ' + now.join(', ') + '), čekám ' + c.from.length);
        return;
      }
      const free = c.from.map((f, i) => ({ from: f, to: c.to[i], used: false }));
      rows.forEach((x) => {
        const cur = x.r[cKg];
        const pair = free.find((f) => !f.used && f.from === num(cur));
        if (!pair) {
          problems.push(c.workout + ' / ' + c.exercise + ' (' + x.r[cId] + '): v tabulce KG ' + cur + ', v seznamu čekám ' + c.from.join(', '));
          return;
        }
        pair.used = true;
        // Stejný formát jako dosavadní hodnota: číslo zůstane číslem, text textem s desetinnou čárkou
        const out = typeof cur === 'number' ? pair.to : String(pair.to).replace('.', ',');
        plan.push({
          row: x.row, id: String(x.r[cId]), workout: c.workout, exercise: c.exercise,
          type: String(x.r[cType]), from: cur, to: out, volume: cVol === undefined ? null : x.r[cVol],
        });
      });
    });

    if (problems.length || !req.write) return { written: false, problems: problems, plan: plan };

    plan.forEach((p) => sh.getRange(p.row, cKg + 1).setValue(p.to));
    SpreadsheetApp.flush();
    // Kontrolní čtení po zápisu (KG a přepočítaný Objem)
    const after = plan.map((p) => {
      const r = sh.getRange(p.row, 1, 1, width).getValues()[0];
      return { id: String(r[cId]), kg: r[cKg], volume: cVol === undefined ? null : r[cVol] };
    });
    return { written: true, problems: [], plan: plan, after: after };
  } finally {
    lock.releaseLock();
  }
}
