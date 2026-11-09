const BOOKING_MINUTES = 90;
const TZ_OFFSET_MIN = 360;

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
const calcEnd = (start) => addMinutes(start, BOOKING_MINUTES);

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function parseTime(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(s);
  if (!m) return null;
  const check = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (check.getUTCFullYear() !== +m[1] || check.getUTCMonth() !== +m[2] - 1 || check.getUTCDate() !== +m[3]) return null;

  let d = null;
  if (/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s)) d = new Date(`${s}:00+06:00`);
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(s)) d = new Date(s);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function localParts(date) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MIN * 60000);
  return {
    dateKey: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  };
}

function withinOpeningHours(start, end, openHour, closeHour) {
  const a = localParts(start);
  const b = localParts(end);
  return a.dateKey === b.dateKey && a.minutes >= openHour * 60 && b.minutes <= closeHour * 60;
}

const fmt = (date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Thimphu', dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(new Date(date));

const toInputValue = (date) => new Date(new Date(date).getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 16);

module.exports = { BOOKING_MINUTES, addMinutes, calcEnd, overlaps, parseTime, withinOpeningHours, fmt, toInputValue };
