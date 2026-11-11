// Části Apps Scriptu, které jdou pustit mimo Google: kontrola rutin, převod hodnot do buněk a text vzorců.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { buildModel, validateRoutines } from '../js/model.js';
import { data, ROUTINES_OLD, ROUTINES_NEW, EXERCISES } from './fixtures.mjs';
import { ROUTINES } from './mock/data.mjs';

const dir = new URL('../apps-script/', import.meta.url);
const ctx = vm.createContext({});
['Schema.js', 'Code.js', 'Setup.js', 'Overview.js', 'Routines.js'].forEach((f) => vm.runInContext(readFileSync(new URL(f, dir), 'utf8'), ctx, { filename: f }));
const run = (code, args = {}) => { Object.assign(ctx, args); return JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)); };

const BAD = [
  { row: 2, routine: 'A', order: 1, exercise: 'Neznámý cvik', type: 'warmup', kg: 10, reps: 'max' },
  { row: 3, order: 2, exercise: 'squat (barbell) ', reps: '10+', rest: 'dlouho', count: 'x' },
  { row: 5, exercise: 'Pull Up', reps: 10 },
  { row: 6, order: 4, exercise: 'Bez partií', kg: '1,,5', reps: 10, time: 'abc', km: 'x' },
  { row: 7, order: 4, exercise: 'Plank', time: '1899-12-30T01:00:00.000Z', rest: 0.0625, count: 21 },
  { row: 8, routine: 'B', kg: 5 },
];

test('checkRoutines ve skriptu hlásí totéž co appka', () => {
  [ROUTINES_OLD, ROUTINES_NEW, ROUTINES, BAD, [{ row: 2, order: 1, exercise: 'Pull Up', reps: 5 }]].forEach((rows) => {
    const app = validateRoutines(buildModel(data({ routines: rows })));
    const script = run('routineIssues_(rows, exercises)', { rows, exercises: EXERCISES });
    assert.deepEqual(script, app);
  });
  assert.ok(validateRoutines(buildModel(data({ routines: BAD }))).length >= 10);
});

test('toCell_: čísla, texty, ochrana před vzorcem', () => {
  const cell = (key, v) => run('[toCell_(key, v)]', { key, v })[0];
  assert.equal(cell('kg', '32,5'), 32.5);
  assert.equal(cell('kg', 100), 100);
  assert.equal(cell('kg', null), '');
  assert.throws(() => cell('kg', 'abc'), /není číslo/);
  assert.equal(cell('exerciseNote', '=1+1'), "'=1+1");
  assert.equal(cell('note', '-lehké'), "'-lehké");
  assert.equal(cell('note', '+10'), "'+10");
  assert.equal(cell('note', '@x'), "'@x");
  assert.equal(cell('note', 'běžná poznámka'), 'běžná poznámka');
  assert.equal(cell('routine', 'x'.repeat(300)).length, 200);
  assert.equal(cell('note', 'x'.repeat(3000)).length, 2000);
  assert.equal(cell('time', '0:34'), '0:34');
});

test('sameCell_: datum, číslo a text', () => {
  const same = (a, b) => vm.runInContext('sameCell_(a, b)', Object.assign(ctx, { a, b }));
  assert.equal(same(1, '1'), true);
  assert.equal(same('', null), true);
  assert.equal(same(100, 102.5), false);
  assert.equal(same('=1+1', "'=1+1"), true);
  assert.equal(same(vm.runInContext('new Date(1000)', ctx), vm.runInContext('new Date(1400)', ctx)), true);
  assert.equal(same(vm.runInContext('new Date(1000)', ctx), vm.runInContext('new Date(9000)', ctx)), false);
  assert.equal(same(vm.runInContext('new Date(1000)', ctx), ''), false);
});

// Změna vzorce se nesmí přehlédnout: po úmyslné změně přegeneruj snímek
//   node tools/overview-formulas.mjs > test/snapshots/formulas.json
// a nezapomeň na setup v tabulce (zapíše nové vzorce).
test('vzorce přehledů a Objem odpovídají uloženému snímku', () => {
  const now = JSON.parse(execFileSync('node', [new URL('../tools/overview-formulas.mjs', import.meta.url).pathname], { encoding: 'utf8' }));
  const saved = JSON.parse(readFileSync(new URL('./snapshots/formulas.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(now), ['Poslední trénink', 'Poslední tréninky', 'Tento týden', 'Maxima', 'Objem po týdnech', 'Série!Objem']);
  assert.deepEqual(now, saved);
  Object.entries(now).forEach(([name, f]) => {
    let depth = 0; let quoted = false;
    for (const ch of f) { if (ch === '"') quoted = !quoted; if (quoted) continue; if (ch === '(') depth++; if (ch === ')') depth--; assert.ok(depth >= 0, name); }
    assert.equal(depth, 0, name + ': závorky');
    assert.ok(!/[^"],[^"]*$/.test('') && !f.replace(/"[^"]*"/g, '').includes(','), name + ': čárka mimo text (česká syntaxe chce středníky)');
  });
});
