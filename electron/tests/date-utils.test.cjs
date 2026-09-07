const assert = require('node:assert/strict');
const test = require('node:test');
const {
  enumerateDays,
  limitPeriodRange,
  localDay,
} = require('../store/date-utils.cjs');

test('limitPeriodRange uses local calendar boundaries', () => {
  const sunday = new Date(2026, 7, 9, 23, 30, 0);
  assert.deepEqual(limitPeriodRange('day', sunday), {
    from: '2026-08-09',
    to: '2026-08-09',
    key: '2026-08-09',
  });
  assert.deepEqual(limitPeriodRange('week', sunday), {
    from: '2026-08-03',
    to: '2026-08-09',
    key: '2026-08-03',
  });
  assert.deepEqual(limitPeriodRange('month', sunday), {
    from: '2026-08-01',
    to: '2026-08-31',
    key: '2026-08-01',
  });
});

test('weekly limits reset on Monday and monthly limits handle leap years', () => {
  assert.deepEqual(limitPeriodRange('week', new Date(2026, 7, 10, 0, 1)), {
    from: '2026-08-10',
    to: '2026-08-16',
    key: '2026-08-10',
  });
  assert.deepEqual(limitPeriodRange('month', new Date(2028, 1, 29, 12)), {
    from: '2028-02-01',
    to: '2028-02-29',
    key: '2028-02-01',
  });
});

test('day enumeration remains stable across local daylight-saving changes', () => {
  assert.deepEqual(enumerateDays('2026-03-27', '2026-04-01'), [
    '2026-03-27',
    '2026-03-28',
    '2026-03-29',
    '2026-03-30',
    '2026-03-31',
    '2026-04-01',
  ]);
  assert.equal(localDay(new Date(2026, 2, 29, 23, 59)), '2026-03-29');
});
