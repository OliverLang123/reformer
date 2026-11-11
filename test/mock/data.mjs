// Vymyšlená data pro náhradní API (žádná skutečná čísla z tabulky ani z exportu Hevy).
import { EXERCISES, BODY } from '../fixtures.mjs';

const A = 'Silový trénink A - nohy (T1)';
const B = 'Silový trénink B - core (T1)';

export const ROUTINES = [
  { row: 2, routine: A, week: 'T1', routineNote: 'Zkušební rutina A', order: 1, exercise: 'Rowing Machine', type: 'rozcvička', km: 2, time: '9:00', rest: '1:00' },
  { row: 3, order: 2, exercise: 'Squat (Barbell)', type: 'rozcvička', kg: 50, reps: '10', rest: '2:30' },
  { row: 4, kg: 100, reps: '8-10', count: 3 },
  { row: 5, order: 3, exercise: 'Bulgarian Split Squat (Dumbbell)', kg: 20, reps: '9', rest: '2:00', count: 2 },
  { row: 6, order: 4, exercise: 'Single Leg Calf Raise', superset: '1', kg: 10, reps: '12', rest: '1:00', count: 3 },
  { row: 7, order: 5, exercise: 'Leg Raise', superset: '1', reps: '12', rest: '1:00', count: 2 },
  { row: 8, order: 6, exercise: 'Pull Up', reps: '10', count: 2 },
  { row: 9, routine: B, week: 'T1', order: 1, exercise: 'Side Plank ', time: '0:30', rest: '1:00', count: 2 },
  { row: 10, order: 2, exercise: 'squat (barbell)', kg: 60, reps: '10' },
  { row: 11, order: 3, exercise: 'Plank', time: '1:00', count: 2 },
];

// Historie: 12 tréninků po třech dnech, střídá A a B
export function history() {
  const workouts = [];
  const sets = [];
  for (let i = 0; i < 12; i++) {
    const day = new Date(Date.UTC(2030, 1, 1 + i * 3, 16, 0, 0));
    const date = day.toISOString().slice(0, 10);
    const id = `W-${date.replace(/-/g, '')}-1700-mock${String(i).padStart(2, '0')}`;
    const isA = i % 2 === 0;
    workouts.push({ id, date, start: day.toISOString(), end: new Date(day.getTime() + 70 * 60000).toISOString(), routine: isA ? A : B, note: '' });
    let n = 0;
    const add = (exercise, order, type, f) => sets.push({ id: `${id}-${++n}`, workout: id, exercise, order, superset: f.superset || '', type, kg: f.kg ?? '', reps: f.reps ?? '', time: f.time || '', timeR: f.timeR || '', km: f.km ?? '', confirmedAt: new Date(day.getTime() + n * 180000).toISOString() });
    if (isA) {
      add('Rowing Machine', 1, 'rozcvička', { km: 2, time: '9:10' });
      add('Squat (Barbell)', 2, 'rozcvička', { kg: 50, reps: 10 });
      [10, 9, 9].forEach((r) => add('Squat (Barbell)', 2, 'normální', { kg: 90 + i, reps: r }));
      [9, 9].forEach((r) => add('Bulgarian Split Squat (Dumbbell)', 3, 'normální', { kg: 17.5, reps: r }));
      [12, 12].forEach((r) => add('Single Leg Calf Raise', 4, 'normální', { kg: 10, reps: r, superset: '1' }));
      [12, 12].forEach((r) => add('Leg Raise', 5, 'normální', { reps: r, superset: '1' }));
      [9, 8].forEach((r) => add('Pull Up', 6, 'normální', { reps: r }));
    } else {
      add('Side Plank', 1, 'normální', { time: '0:30', timeR: '0:28' });
      add('Squat (Barbell)', 2, 'normální', { kg: 60, reps: 10 });
      add('Plank', 3, 'normální', { time: '1:00' });
    }
  }
  return { workouts, sets };
}

export const mockData = () => ({ exercises: JSON.parse(JSON.stringify(EXERCISES)), routines: ROUTINES, body: BODY, ...history() });
