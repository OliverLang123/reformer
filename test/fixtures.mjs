// Vymyšlená data pro testy (žádná skutečná čísla z tabulky).
export const EXERCISES = [
  { name: 'Squat (Barbell)', mode: 'váha × opakování', primary: 'stehna', secondary: 'hýždě' },
  { name: 'Shoulder Press (Dumbbell)', mode: 'váha × opakování', primary: 'ramena', dumbbells: 2 },
  { name: 'Skullcrusher (Dumbbell)', mode: 'váha × opakování', primary: 'triceps', dumbbells: 1 },
  { name: 'Bulgarian Split Squat (Dumbbell)', mode: 'na stranu', primary: 'stehna', dumbbells: 2 },
  { name: 'Single Leg Calf Raise', mode: 'na stranu', primary: 'lýtka', dumbbells: 1 },
  { name: 'Pull Up', mode: 'vlastní váha', primary: 'záda', bwFactor: 1 },
  { name: 'Triceps Dip', mode: 'vlastní váha', primary: 'triceps', bwFactor: '0,9' },
  { name: 'Plank', mode: 'čas', primary: 'břicho' },
  { name: 'Side Plank', mode: 'čas na stranu', primary: 'břicho' },
  { name: 'Rowing Machine', mode: 'vzdálenost a čas', primary: 'záda' },
  { name: 'Leg Raise', mode: 'vlastní váha', primary: 'břicho', bwFactor: 0 },
  { name: 'Bez partií', mode: 'váha × opakování' },
];

export const BODY = [
  { date: '2030-01-10', weight: 80 },
  { date: '2030-02-10', weight: '82,5' },
];

const R = 'Rutina X';
// Starý zápis: každá série řádek, všechno vyplněné
export const ROUTINES_OLD = [
  { routine: R, week: 'T1', routineNote: 'Poznámka k rutině', order: 1, exercise: 'Squat (Barbell)', type: 'rozcvička', kg: 50, reps: '10', rest: '2:30' },
  { routine: R, week: 'T1', order: 1, exercise: 'Squat (Barbell)', type: 'normální', kg: 100, reps: '8-10', rest: '2:30' },
  { routine: R, week: 'T1', order: 1, exercise: 'Squat (Barbell)', type: 'normální', kg: 100, reps: '8-10', rest: '2:30' },
  { routine: R, week: 'T1', order: 1, exercise: 'Squat (Barbell)', type: 'normální', kg: 100, reps: '8-10', rest: '2:30' },
  { routine: R, week: 'T1', order: 2, exercise: 'Side Plank', superset: '1', type: 'normální', time: '0:30', rest: '1:00' },
  { routine: R, week: 'T1', order: 2, exercise: 'Side Plank', superset: '1', type: 'normální', time: '0:30', rest: '1:00' },
  { routine: R, week: 'T1', order: 3, exercise: 'Leg Raise', superset: '1', type: 'normální', reps: '12', rest: '1:00' },
  { routine: R, week: 'T1', order: 3, exercise: 'Leg Raise', superset: '1', type: 'normální', reps: '12', rest: '1:00' },
  { routine: R, week: 'T1', order: 4, exercise: 'Pull Up', type: 'normální', reps: '10' },
];
// Tatáž rutina úsporně
export const ROUTINES_NEW = [
  { routine: R, week: 'T1', routineNote: 'Poznámka k rutině', order: 1, exercise: 'Squat (Barbell)', type: 'rozcvička', kg: 50, reps: '10', rest: '2:30' },
  { kg: 100, reps: '8-10', count: 3 },
  { order: 2, exercise: 'Side Plank', superset: '1', time: '0:30', rest: '1:00', count: 2 },
  { order: 3, exercise: 'Leg Raise', superset: '1', reps: '12', rest: '1:00', count: 2 },
  { order: 4, exercise: 'Pull Up', reps: '10' },
];

export const data = (extra = {}) => ({ exercises: EXERCISES, body: BODY, routines: ROUTINES_OLD, workouts: [], sets: [], ...extra });
