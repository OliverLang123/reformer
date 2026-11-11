import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModel, exerciseInfo, canonicalName, bodyWeightOn, setVolume, routineList, validateRoutines, orderRoutines,
  bestOf, isBetter, previousFor, groupByExercise, setCalc, entryLine, MODE,
} from '../js/model.js';
import { data, ROUTINES_OLD, ROUTINES_NEW } from './fixtures.mjs';

const model = buildModel(data());
const vol = (name, set, bw = 80) => setVolume(set, exerciseInfo(model, name), bw);

test('setVolume: všech šest zápisů a násobek jednoruček', () => {
  assert.equal(vol('Squat (Barbell)', { kg: 100, reps: 10 }), 1000);                    // KG × OPAK.
  assert.equal(vol('Shoulder Press (Dumbbell)', { kg: 32.5, reps: 10 }), 650);          // × 2 jednoručky
  assert.equal(vol('Skullcrusher (Dumbbell)', { kg: 15, reps: 6 }), 90);                // jedna jednoručka
  assert.equal(vol('Bulgarian Split Squat (Dumbbell)', { kg: 20, reps: 9 }), 720);      // 20 × 2 × 9 × 2
  assert.equal(vol('Single Leg Calf Raise', { kg: 10, reps: 12 }), 240);                // 10 × 12 × 2 strany
  assert.equal(vol('Pull Up', { kg: null, reps: 10 }, 80), 800);                        // (80 × 1 + 0) × 10
  assert.equal(vol('Pull Up', { kg: 10, reps: 8 }, 80), 720);                           // (80 + 10) × 8
  assert.equal(vol('Triceps Dip', { kg: 10, reps: 10 }, 80), 820);                      // (80 × 0,9 + 10) × 10
  assert.equal(vol('Leg Raise', { kg: null, reps: 12 }, 80), 0);                        // podíl 0
  assert.equal(vol('Plank', { time: 60 }), 0);
  assert.equal(vol('Side Plank', { time: 34, timeR: 31 }), 0);
  assert.equal(vol('Rowing Machine', { km: 2, time: 552 }), 0);
  assert.equal(vol('Squat (Barbell)', { kg: 100, reps: null }), 0);
});

test('tělesná váha k datu', () => {
  assert.equal(bodyWeightOn(model, '2029-12-01'), 80);   // před prvním měřením první měření
  assert.equal(bodyWeightOn(model, '2030-01-10'), 80);   // v den měření
  assert.equal(bodyWeightOn(model, '2030-02-09'), 80);
  assert.equal(bodyWeightOn(model, '2030-02-10'), 82.5);
  assert.equal(bodyWeightOn(buildModel(data({ body: [] })), '2030-01-01'), 0);
});

test('název cviku bez ohledu na mezery, velikost písmen a diakritiku', () => {
  assert.equal(canonicalName(model, 'Side Plank '), 'Side Plank');
  assert.equal(canonicalName(model, 'squat (barbell)'), 'Squat (Barbell)');
  assert.equal(canonicalName(model, '  Můj nový cvik '), 'Můj nový cvik');
  assert.equal(exerciseInfo(model, 'side plank').mode, MODE.TIME_SIDE);
  assert.equal(exerciseInfo(model, 'Neznámý').mode, MODE.WEIGHT);
});

test('Zápis z listu Cviky se normalizuje', () => {
  const m = buildModel(data({ exercises: [{ name: 'A', mode: ' Na Stranu ' }, { name: 'B', mode: 'nesmysl' }] }));
  assert.equal(exerciseInfo(m, 'A').mode, MODE.SIDE);
  assert.equal(exerciseInfo(m, 'B').mode, MODE.WEIGHT);
});

const shape = (list) => list.map((r) => ({
  name: r.name, week: r.week, note: r.note,
  exercises: r.exercises.map((e) => ({ name: e.name, order: e.order, superset: e.superset, rest: e.rest, sets: e.sets.map((s) => [s.type, s.kg, s.reps && s.reps.text, s.time, s.km]) })),
}));

test('routineList: starý zápis', () => {
  const list = shape(routineList(model));
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Rutina X');
  assert.equal(list[0].week, 'T1');
  assert.equal(list[0].note, 'Poznámka k rutině');
  assert.deepEqual(list[0].exercises.map((e) => [e.name, e.sets.length, e.superset, e.rest]), [
    ['Squat (Barbell)', 4, null, 150], ['Side Plank', 2, '1', 60], ['Leg Raise', 2, '1', 60], ['Pull Up', 1, null, null],
  ]);
  assert.deepEqual(list[0].exercises[0].sets[0], ['W', 50, '10', null, null]);
  assert.deepEqual(list[0].exercises[0].sets[1], ['N', 100, '8-10', null, null]);
  assert.deepEqual(list[0].exercises[1].sets[0], ['N', null, null, 30, null]);
  assert.deepEqual(validateRoutines(model), []);
});

test('routineList: úsporný zápis dá totéž co starý', () => {
  const m = buildModel(data({ routines: ROUTINES_NEW }));
  assert.deepEqual(shape(routineList(m)), shape(routineList(model)));
  assert.deepEqual(validateRoutines(m), []);
});

test('routineList: dvě rutiny, dědění Rutiny, prázdný řádek', () => {
  const m = buildModel(data({ routines: [
    { routine: 'A', order: 1, exercise: 'Squat (Barbell)', kg: 100, reps: 5, count: 2 },
    {},
    { order: 2, exercise: 'Pull Up', reps: 10 },
    { routine: 'B', order: 1, exercise: 'Plank', time: '1:00' },
    { time: '0:45' },
  ] }));
  const list = routineList(m);
  assert.deepEqual(list.map((r) => [r.name, r.exercises.map((e) => [e.name, e.sets.length])]), [
    ['A', [['Squat (Barbell)', 2], ['Pull Up', 1]]], ['B', [['Plank', 2]]],
  ]);
  // Superset a odpočinek se k novému cviku nedědí
  assert.equal(list[0].exercises[1].superset, null);
  assert.equal(list[0].exercises[1].rest, null);
});

test('validateRoutines: problémy s číslem řádku', () => {
  const m = buildModel(data({ routines: [
    { row: 2, routine: 'A', order: 1, exercise: 'Neznámý cvik', type: 'warmup', kg: 10, reps: 'max' },
    { row: 3, order: 2, exercise: 'squat (barbell) ', reps: '10+', rest: 'dlouho', count: 'x' },
    { row: 5, exercise: 'Pull Up', reps: 10 },
    { row: 6, order: 4, exercise: 'Bez partií', kg: 10, reps: 10, time: 'abc' },
  ] }));
  const texts = validateRoutines(m).map((i) => `${i.row}: ${i.text}`);
  assert.deepEqual(texts, [
    '2: Cvik Neznámý cvik není v listu Cviky',
    '2: Neznámý Typ „warmup“ (bere se jako normální)',
    '2: Nečitelná OPAK. „max“',
    '3: Nečitelný Odpočinek „dlouho“',
    '3: Nečitelná OPAK. „10+“',
    '3: Nečitelné Sérií „x“ (celé číslo 1 až 20)',
    '5: Cvik Pull Up nemá Pořadí',
    '6: Cvik Bez partií nemá v listu Cviky partie (chybí pak ve svalové mapě)',
    '6: Nečitelný ČAS „abc“',
  ]);
  assert.equal(routineList(m)[0].exercises[1].name, 'Squat (Barbell)');
  const first = buildModel(data({ routines: [{ row: 2, order: 1, exercise: 'Pull Up', reps: 5 }] }));
  assert.equal(validateRoutines(first)[0].text, 'První řádek nemá vyplněnou Rutinu');
});

test('orderRoutines: po A je B, po C je A', () => {
  const list = [{ name: 'Silový trénink A' }, { name: 'Silový trénink B' }, { name: 'Silový trénink C' }];
  const m = (routine) => ({ workouts: routine ? [{ routine }] : [] });
  assert.equal(orderRoutines(m('Silový trénink A - nohy'), list)[0].name, 'Silový trénink B');
  assert.equal(orderRoutines(m('Silový trénink C'), list)[0].name, 'Silový trénink A');
  assert.equal(orderRoutines(m(null), list)[0].name, 'Silový trénink A');
});

test('bestOf a isBetter', () => {
  const sets = [{ type: 'W', kg: 200, reps: 5 }, { type: 'N', kg: 100, reps: 8 }, { type: 'N', kg: 100, reps: 10 }, { type: 'N', kg: 90, reps: 15 }];
  assert.deepEqual(bestOf(sets, MODE.WEIGHT), sets[2]);
  assert.equal(isBetter({ kg: 100, reps: 10 }, { kg: 100, reps: 9 }, MODE.WEIGHT), true);
  assert.equal(isBetter({ kg: 100, reps: 9 }, { kg: 100, reps: 9 }, MODE.WEIGHT), false);
  assert.equal(isBetter({ kg: 102.5, reps: 1 }, { kg: 100, reps: 9 }, MODE.WEIGHT), true);
  assert.equal(isBetter({ time: 90 }, { time: 60 }, MODE.TIME), false);
});

test('previousFor: s rozcvičkami i bez', () => {
  const W = (kg) => ({ type: 'W', kg }); const N = (kg) => ({ type: 'N', kg });
  const now = [W(50), N(100), N(100)];
  const prevWarm = { sets: [W(40), W(60), N(95), N(97.5)] };
  assert.equal(previousFor(prevWarm, now[0], now).kg, 40);
  assert.equal(previousFor(prevWarm, now[1], now).kg, 95);
  assert.equal(previousFor(prevWarm, now[2], now).kg, 97.5);
  const prevPlain = { sets: [N(40), N(95), N(97.5)] };
  assert.equal(previousFor(prevPlain, now[0], now).kg, 40);
  assert.equal(previousFor(prevPlain, now[2], now).kg, 97.5);
  assert.equal(previousFor(null, now[0], now), null);
});

test('groupByExercise: pořadí tréninku, stejný cvik dvakrát zvlášť', () => {
  const g = groupByExercise([
    { exercise: 'B', order: 2 }, { exercise: 'A', order: 1 }, { exercise: 'A', order: 3 }, { exercise: 'A', order: 1 },
  ]);
  assert.deepEqual(g.map((x) => [x.name, x.order, x.sets.length]), [['A', 1, 2], ['B', 2, 1], ['A', 3, 1]]);
});

test('setCalc a entryLine', () => {
  const ex = (n) => exerciseInfo(model, n);
  assert.equal(setCalc({ kg: 20, reps: 9 }, ex('Bulgarian Split Squat (Dumbbell)'), 80), '20 × 2 × 9 × 2 = 720 kg');
  assert.equal(setCalc({ kg: null, reps: 10 }, ex('Pull Up'), 80), '(80 × 1 + 0) × 10 = 800 kg');
  assert.equal(setCalc({ time: 30 }, ex('Plank'), 80), '');
  assert.equal(entryLine(ex('Bulgarian Split Squat (Dumbbell)'), 80), 'Váha jedné jednoručky · do součtu × 2 jednoručky × 2 strany');
  assert.equal(entryLine(ex('Squat (Barbell)'), 80), 'Celková váha');
});
