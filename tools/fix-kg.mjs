// Oprava hodnot KG v listu Série podle přesného seznamu (akce fixSetKg ve skriptu).
// Seznam je soubor JSON mimo repozitář (obsahuje osobní váhy):
//   [{ "workout": "<ID tréninku>", "exercise": "<Cvik>", "from": [40, 40, 40], "to": [20, 20, 20] }]
// Bez --write jen zkušební běh: skript zkontroluje počet sérií a současné KG a vypíše změny.
//   node tools/fix-kg.mjs <seznam.json> [--write]
// Adresa skriptu z proměnné REFORMER_URL (nebo se zeptá), klíč se zadává skrytě.

import { readFileSync } from 'node:fs';
import { ask, call } from './lib.mjs';

const fmt = (v) => (v === null || v === undefined || v === '' ? '-' : String(v).replace('.', ','));

async function main() {
  const file = process.argv[2];
  const write = process.argv.includes('--write');
  if (!file) {
    console.log('Použití: node tools/fix-kg.mjs <seznam.json> [--write]');
    process.exit(1);
  }
  const changes = JSON.parse(readFileSync(file, 'utf8'));
  const cfg = { url: process.env.REFORMER_URL || await ask('Adresa skriptu (…/exec): '), key: await ask('Tajný klíč (nezobrazuje se): ', true) };
  const r = await call(cfg, 'fixSetKg', { changes, write });

  console.log(`\n${write ? 'ZÁPIS' : 'Zkušební běh (nic se nezapsalo)'}: ${changes.length} záznamů, ${r.plan.length} sérií\n`);
  let key = '';
  r.plan.forEach((p) => {
    const k = p.workout + ' · ' + p.exercise;
    if (k !== key) { console.log(k); key = k; }
    console.log(`  řádek ${p.row}  ${p.id}  ${p.type.padEnd(10)}  KG ${fmt(p.from)} → ${fmt(p.to)}  (Objem teď ${fmt(p.volume)})`);
  });
  if (r.problems.length) {
    console.log('\nNESEDÍ, nic se nezapsalo:');
    r.problems.forEach((x) => console.log('  ' + x));
    process.exit(2);
  }
  if (r.written) {
    console.log('\nKontrolní čtení po zápisu:');
    r.after.forEach((a, i) => {
      const ok = String(a.kg).replace(',', '.') === String(r.plan[i].to).replace(',', '.');
      console.log(`  ${ok ? 'OK ' : 'CHYBA'} ${a.id}  KG ${fmt(a.kg)}  Objem ${fmt(a.volume)}`);
    });
  } else {
    console.log('\nVše sedí. Zápis: přidej --write');
  }
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
