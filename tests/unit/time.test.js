const { calcEnd, overlaps, parseTime, withinOpeningHours } = require('../../utils/time');
const { buildSlots } = require('../../services/slots');

describe('booking duration', () => {
  test('end time is exactly 90 minutes after start', () => {
    const start = new Date('2026-12-01T04:00:00Z');
    expect(calcEnd(start) - start).toBe(90 * 60 * 1000);
  });
});

describe('interval overlap (half-open)', () => {
  const t = (h, m = 0) => new Date(Date.UTC(2026, 11, 1, h, m));
  test('overlapping intervals', () => expect(overlaps(t(10), t(11, 30), t(11), t(12, 30))).toBe(true));
  test('identical intervals', () => expect(overlaps(t(10), t(11, 30), t(10), t(11, 30))).toBe(true));
  test('adjacent intervals do not overlap', () => expect(overlaps(t(10), t(11, 30), t(11, 30), t(13))).toBe(false));
  test('separate intervals', () => expect(overlaps(t(8), t(9, 30), t(12), t(13, 30))).toBe(false));
});

describe('parseTime', () => {
  test('local input is treated as Bhutan time (UTC+6)', () => {
    expect(parseTime('2026-12-01T10:00').toISOString()).toBe('2026-12-01T04:00:00.000Z');
  });
  test('ISO with Z is accepted', () => expect(parseTime('2026-12-01T04:00:00.000Z')).toBeInstanceOf(Date));
  test('garbage and impossible dates are rejected', () => {
    expect(parseTime('tomorrow')).toBeNull();
    expect(parseTime('2026-02-31T10:00')).toBeNull();
    expect(parseTime('2026-12-01T25:00')).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
});

describe('opening hours', () => {
  const p = parseTime;
  test('inside hours', () => expect(withinOpeningHours(p('2026-12-01T09:00'), p('2026-12-01T10:30'), 6, 21)).toBe(true));
  test('starts too early', () => expect(withinOpeningHours(p('2026-12-01T05:00'), p('2026-12-01T06:30'), 6, 21)).toBe(false));
  test('ends too late', () => expect(withinOpeningHours(p('2026-12-01T20:00'), p('2026-12-01T21:30'), 6, 21)).toBe(false));
  test('ends exactly at closing time', () => expect(withinOpeningHours(p('2026-12-01T19:30'), p('2026-12-01T21:00'), 6, 21)).toBe(true));
});

describe('buildSlots', () => {
  const schedule = { start_time: '2099-01-01T04:00:00Z', end_time: '2099-01-01T08:30:00Z' }; // 4.5 h = 3 slots
  test('splits into 90-minute slots', () => expect(buildSlots(schedule, [])).toHaveLength(3));
  test('drops a leftover partial slot', () => {
    expect(buildSlots({ ...schedule, end_time: '2099-01-01T08:00:00Z' }, [])).toHaveLength(2);
  });
  test('marks an overlapping booking as unavailable and leaves others free', () => {
    const slots = buildSlots(schedule, [{ start_time: '2099-01-01T05:30:00Z', end_time: '2099-01-01T07:00:00Z' }]);
    expect(slots.map((s) => s.available)).toEqual([true, false, true]);
  });
  test('slots that already started are unavailable', () => {
    const past = { start_time: '2000-01-01T04:00:00Z', end_time: '2000-01-01T07:00:00Z' };
    expect(buildSlots(past, []).every((s) => !s.available)).toBe(true);
  });
});
