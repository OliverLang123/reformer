import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, parseRange, parseTime, parseTimeInput, typeTime, typeNum, fmtTime, fmtDuration, pragueDate, nameKey } from '../js/util.js';

test('parseNum', () => {
  assert.equal(parseNum('82,5'), 82.5);
  assert.equal(parseNum('82.5'), 82.5);
  assert.equal(parseNum(' 1 000 '), 1000);
  assert.equal(parseNum(12), 12);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum(null), null);
  assert.equal(parseNum('100,,5'), null);
  assert.equal(parseNum('abc'), null);
});

test('parseRange', () => {
  assert.deepEqual(parseRange('8-10'), { lo: 8, hi: 10, text: '8-10' });
  assert.deepEqual(parseRange(10), { lo: 10, hi: 10, text: '10' });
  assert.equal(parseRange('max'), null);
  assert.equal(parseRange('10+'), null);
  assert.equal(parseRange(''), null);
});

test('parseTime: text, sekundy, buňka času', () => {
  assert.equal(parseTime('1:30'), 90);
  assert.equal(parseTime('0:34'), 34);
  assert.equal(parseTime('90'), 90);
  assert.equal(parseTime(90), 90);
  assert.equal(parseTime('1:05:12'), 3912);
  assert.equal(parseTime(''), null);
  assert.equal(parseTime('abc'), null);
  assert.equal(parseTime('2 min'), null);
  // buňka formátovaná jako čas: "2:00" tabulka čte jako 2 hodiny, myslí se 2 minuty
  assert.equal(parseTime('1899-12-30T01:00:00.000Z'), 120);
  assert.equal(parseTime('1899-12-29T23:02:00.000Z'), 120);
  assert.equal(parseTime('1899-12-29T23:00:34.000Z'), 34);
  assert.equal(parseTime(0.0625), 90); // 1:30:00 jako zlomek dne
  assert.equal(parseTime('2026-01-01T10:00:00.000Z'), null);
});

test('parseTimeInput a typeTime', () => {
  assert.equal(parseTimeInput('130'), 90);
  assert.equal(parseTimeInput('45'), 45);
  assert.equal(parseTimeInput('1:30'), 90);
  assert.equal(parseTimeInput(''), null);
  assert.equal(typeTime('9'), '9');
  assert.equal(typeTime('912'), '9:12');
  assert.equal(typeTime('10512'), '1:05:12');
  assert.equal(typeTime('075'), '75');
  assert.equal(typeTime('0130'), '1:30');
  assert.equal(typeTime('05'), '05');
});

test('typeNum: jen číslice a jedna čárka', () => {
  assert.equal(typeNum('100,,5'), '100,5');
  assert.equal(typeNum('32.5'), '32,5');
  assert.equal(typeNum('1a2'), '12');
  assert.equal(typeNum('1,2,3'), '1,23');
});

test('fmtTime a fmtDuration', () => {
  assert.equal(fmtTime(34), '0:34');
  assert.equal(fmtTime(552), '9:12');
  assert.equal(fmtTime(3912), '1:05:12');
  assert.equal(fmtTime(null), '');
  assert.equal(fmtDuration(42 * 60000), '42 min');
  assert.equal(fmtDuration(88 * 60000), '1:28 h');
});

test('pragueDate nezávisí na pásmu telefonu', () => {
  assert.equal(pragueDate(new Date('2030-03-05T23:30:00+01:00')), '2030-03-05');
  assert.equal(pragueDate(new Date('2030-03-05T23:30:00Z')), '2030-03-06');
  assert.equal(pragueDate(new Date('2030-07-01T22:30:00Z')), '2030-07-02');
});

test('nameKey', () => {
  assert.equal(nameKey(' Side  Plank '), 'side plank');
  assert.equal(nameKey('Tahání Kladky'), 'tahani kladky');
});
