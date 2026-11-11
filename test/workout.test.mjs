import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, routineList } from '../js/model.js';
import * as W from '../js/workout.js';
import { data } from './fixtures.mjs';

const model = buildModel(data());
const start = () => W.createWorkout(routineList(model)[0]);
const exOf = (w, name) => w.exercises.find((e) => e.name === name);
const confirm = (w, name, i) => { const e = exOf(w, name); return W.confirmSet(w, e.key, e.sets[i].id, model); };
const type = (w, name, i, field, v) => { const e = exOf(w, name); return W.updateInput(w, e.key, e.sets[i].id, field, v); };

test('confirmSet: převezme cíl z rutiny a horní číslo rozsahu', () => {
  let { workout: w, rest, error } = confirm(start(), 'Squat (Barbell)', 1);
  assert.equal(error, undefined);
  const s = exOf(w, 'Squat (Barbell)').sets[1];
  assert.equal(s.done, true);
  assert.deepEqual([s.input.kg, s.input.reps], ['100', '10']);
  assert.equal(rest, 150);
  assert.ok(w.restEnd > Date.now());
});

test('confirmSet: neplatné číslo se nepotvrdí', () => {
  const w0 = type(start(), 'Squat (Barbell)', 1, 'kg', '100,,5');
  const r = confirm(w0, 'Squat (Barbell)', 1);
  assert.equal(r.error, 'Neplatná váha');
  assert.equal(exOf(r.workout, 'Squat (Barbell)').sets[1].done, false);
  assert.equal(confirm(type(start(), 'Squat (Barbell)', 1, 'reps', '1,,0'), 'Squat (Barbell)', 1).error, 'Neplatná opakování');
  assert.equal(confirm(type(start(), 'Pull Up', 0, 'reps', ''), 'Pull Up', 0).error, undefined);
});

test('confirmSet: bez opakování a bez času hlásí chybu', () => {
  const w = W.addExercise(start(), 'Skullcrusher (Dumbbell)');
  assert.equal(confirm(w, 'Skullcrusher (Dumbbell)', 0).error, 'Zadej opakování');
  const w2 = W.addExercise(start(), 'Plank');
  assert.equal(confirm(w2, 'Plank', 0).error, 'Zadej čas');
});

test('další série převezmou skutečnou váhu, jen stejný typ a jen nepotvrzené', () => {
  let w = type(start(), 'Squat (Barbell)', 1, 'kg', '102,5');
  w = confirm(w, 'Squat (Barbell)', 1).workout;
  const sets = exOf(w, 'Squat (Barbell)').sets;
  assert.equal(sets[0].target.kg, 50);        // rozcvička se nemění
  assert.equal(sets[2].target.kg, 102.5);
  assert.equal(sets[3].target.kg, 102.5);
  assert.equal(sets[2].target.reps.text, '8-10'); // opakování zůstávají
  // potvrzení rozcvičky s jinou vahou pracovní série nemění
  let v = type(start(), 'Squat (Barbell)', 0, 'kg', '60');
  v = confirm(v, 'Squat (Barbell)', 0).workout;
  assert.equal(exOf(v, 'Squat (Barbell)').sets[1].target.kg, 100);
  // potvrzení beze změny váhy nic nepřepisuje
  const u = confirm(start(), 'Squat (Barbell)', 1).workout;
  assert.equal(exOf(u, 'Squat (Barbell)').sets[2].target.kg, 100);
});

test('superset: odpočinek až po posledním cviku kola', () => {
  let w = start();
  let r = confirm(w, 'Side Plank', 0);
  assert.equal(r.rest, 0);
  r = confirm(r.workout, 'Leg Raise', 0);
  assert.equal(r.rest, 60);
});

test('superset s různým počtem sérií: série navíc spustí odpočinek', () => {
  let w = start();
  const sp = exOf(w, 'Side Plank');
  w = W.addSet(w, sp.key); // Side Plank 3 série, Leg Raise 2
  w = confirm(w, 'Side Plank', 0).workout;
  w = confirm(w, 'Leg Raise', 0).workout;
  w = confirm(w, 'Side Plank', 1).workout;
  w = confirm(w, 'Leg Raise', 1).workout;
  assert.equal(confirm(w, 'Side Plank', 2).rest, 60);
});

test('stopky: levá, pravá, potvrzení', () => {
  let w = start();
  const sp = exOf(w, 'Side Plank');
  const id = sp.sets[0].id;
  w = W.startWatch(w, sp.key, id, model);
  assert.equal(w.watch.side, 'L');
  assert.equal(w.watch.target, 30);
  let r = W.stopWatch(w, model, w.watch.start + 34900);
  assert.equal(exOf(r.workout, 'Side Plank').sets[0].input.time, '0:34');
  assert.equal(exOf(r.workout, 'Side Plank').sets[0].done, false);
  w = W.startWatch(r.workout, sp.key, id, model);
  assert.equal(w.watch.side, 'R');
  r = W.stopWatch(w, model, w.watch.start + 31000);
  const s = exOf(r.workout, 'Side Plank').sets[0];
  assert.deepEqual([s.input.time, s.input.timeR, s.done], ['0:34', '0:31', true]);
  assert.equal(r.rest, 0); // superset, čeká na Leg Raise
});

test('replaceExercise: bez potvrzených sérií jen přejmenuje', () => {
  const w0 = start();
  const w = W.replaceExercise(w0, exOf(w0, 'Pull Up').key, 'Triceps Dip');
  assert.deepEqual(w.exercises.map((e) => e.name), ['Squat (Barbell)', 'Side Plank', 'Leg Raise', 'Triceps Dip']);
});

test('replaceExercise: potvrzené série zůstanou původnímu cviku', () => {
  let w = confirm(start(), 'Squat (Barbell)', 0).workout;
  w = confirm(w, 'Squat (Barbell)', 1).workout;
  w = W.replaceExercise(w, exOf(w, 'Squat (Barbell)').key, 'Skullcrusher (Dumbbell)');
  assert.deepEqual(w.exercises.slice(0, 2).map((e) => [e.name, e.sets.length, e.sets.every((s) => s.done)]), [
    ['Squat (Barbell)', 2, true], ['Skullcrusher (Dumbbell)', 2, false],
  ]);
  const snap = W.snapshot(w);
  assert.deepEqual(snap.sets.map((s) => [s.exercise, s.kg, s.reps]), [['Squat (Barbell)', 50, 10], ['Squat (Barbell)', 100, 10]]);
});

test('smazání a vrácení série', () => {
  let w = confirm(start(), 'Squat (Barbell)', 1).workout;
  const ex = exOf(w, 'Squat (Barbell)');
  const removed = W.removedSet(w, ex.key, ex.sets[1].id);
  const del = W.deleteSet(w, ex.key, ex.sets[1].id);
  assert.equal(exOf(del, 'Squat (Barbell)').sets.length, 3);
  const back = W.restoreSet(del, removed);
  assert.deepEqual(exOf(back, 'Squat (Barbell)').sets, ex.sets);
  assert.equal(W.restoreSet(back, removed), back); // podruhé nic
});

test('moveExercise: superset se posouvá celý', () => {
  const w0 = start();
  const w = W.moveExercise(w0, exOf(w0, 'Pull Up').key, -1);
  assert.deepEqual(w.exercises.map((e) => e.name), ['Squat (Barbell)', 'Pull Up', 'Side Plank', 'Leg Raise']);
  const v = W.moveExercise(w0, exOf(w0, 'Leg Raise').key, -1);
  assert.deepEqual(v.exercises.map((e) => e.name), ['Side Plank', 'Leg Raise', 'Squat (Barbell)', 'Pull Up']);
  assert.equal(W.moveExercise(w0, exOf(w0, 'Squat (Barbell)').key, -1), w0);
});

test('snapshot a fromSaved tam a zpět, úprava zachová čas potvrzení', () => {
  let w = start();
  w = confirm(w, 'Squat (Barbell)', 0).workout;
  w = type(w, 'Squat (Barbell)', 1, 'kg', '102,5');
  w = confirm(w, 'Squat (Barbell)', 1).workout;
  w = type(w, 'Side Plank', 0, 'time', '0:34');
  w = type(w, 'Side Plank', 0, 'timeR', '0:31');
  w = confirm(w, 'Side Plank', 0).workout;
  w = confirm(w, 'Pull Up', 0).workout;
  const snap = W.snapshot(w, '2030-03-05T18:00:00.000Z');
  assert.equal(snap.sets.length, 4);
  assert.deepEqual(snap.sets.map((s) => [s.exercise, s.order, s.type, s.kg, s.reps, s.time, s.timeR]), [
    ['Squat (Barbell)', 1, 'rozcvička', 50, 10, '', ''],
    ['Squat (Barbell)', 1, 'normální', 102.5, 10, '', ''],
    ['Side Plank', 2, 'normální', null, null, '0:34', '0:31'],
    ['Pull Up', 4, 'normální', null, 10, '', ''],
  ]);
  const m2 = buildModel(data({ workouts: [snap.workout], sets: snap.sets.map((s) => ({ ...s, workout: snap.workout.id })) }));
  const saved = W.fromSaved(m2, snap.workout.id);
  assert.equal(saved.edit, true);
  const again = W.snapshot(saved, snap.workout.end);
  assert.deepEqual(again.sets.map((s) => ({ ...s, order: 0 })), snap.sets.map((s) => ({ ...s, order: 0 })));
  // odpotvrzení a nové potvrzení při úpravě nechá původní čas
  const e = exOf(saved, 'Pull Up');
  const at = e.sets[0].confirmedAt;
  let ed = W.unconfirmSet(saved, e.key, e.sets[0].id);
  ed = W.confirmSet(ed, e.key, e.sets[0].id, m2).workout;
  assert.equal(exOf(ed, 'Pull Up').sets[0].confirmedAt, at);
});

test('snapshot: datum v pásmu Europe/Prague', () => {
  const w = { ...start(), start: '2030-03-05T23:30:00.000Z' };
  assert.equal(W.snapshot(w).workout.date, '2030-03-06');
});
