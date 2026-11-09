const { BOOKING_MINUTES, addMinutes, overlaps } = require('../utils/time');

function buildSlots(schedule, confirmedBookings, now = new Date()) {
  const slots = [];
  const end = new Date(schedule.end_time);
  let start = new Date(schedule.start_time);
  while (addMinutes(start, BOOKING_MINUTES) <= end) {
    const slotEnd = addMinutes(start, BOOKING_MINUTES);
    const taken = confirmedBookings.some((b) =>
      overlaps(start, slotEnd, new Date(b.start_time), new Date(b.end_time)));
    slots.push({ start: start.toISOString(), end: slotEnd.toISOString(), available: !taken && start > now });
    start = slotEnd;
  }
  return slots;
}

module.exports = { buildSlots };
