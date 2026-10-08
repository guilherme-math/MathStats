const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getStudyDateKey,
  previousStudyDateKey,
  registerStudyDay,
  getEffectiveStreak,
} = require('../dist/utils/streak');

test('mais de uma resposta no mesmo dia não aumenta a ofensiva', () => {
  const today = getStudyDateKey();
  assert.deepEqual(registerStudyDay(4, today), { streak: 4, lastStudyDate: today, changed: false });
});

test('atividade no dia seguinte aumenta a ofensiva', () => {
  const today = getStudyDateKey();
  const yesterday = previousStudyDateKey(today);
  assert.deepEqual(registerStudyDay(4, yesterday), {
    streak: 5,
    lastStudyDate: today,
    changed: true,
  });
});

test('lacuna reinicia a ofensiva e sequência expirada é exibida como zero', () => {
  assert.equal(registerStudyDay(9, '2020-01-01').streak, 1);
  assert.equal(getEffectiveStreak(9, '2020-01-01'), 0);
});